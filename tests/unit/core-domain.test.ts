import { describe, expect, it } from "vitest";
import {
  type ArtifactRecord,
  type Change,
  type CoreEvent,
  type Handoff,
  type MemoryRecord,
  type Project,
  type SearchIndex,
  type TaskProgress,
  createMemoryWriter,
  evaluateFreshness,
  recoverContext
} from "../../src/index.js";

const now = new Date("2026-07-05T00:00:00.000Z");

class FixedClock {
  now() {
    return now;
  }
}

class SequenceIds {
  private next = 0;

  generate(prefix: string) {
    this.next += 1;
    return `${prefix}-${this.next}`;
  }
}

class FakeSearch implements SearchIndex {
  indexed: Array<{ sourceType: string; sourceId: string }> = [];

  async upsert(entry: { sourceType: string; sourceId: string }) {
    this.indexed.push(entry);
  }
}

class FakeRepo {
  projects: Project[] = [];
  changes: Change[] = [];
  records: MemoryRecord[] = [];
  handoffs: Handoff[] = [];
  artifacts: ArtifactRecord[] = [];
  tasks: TaskProgress[] = [];
  events: CoreEvent[] = [];

  async saveMemoryRecord(record: MemoryRecord) {
    this.records.push(record);
  }

  async saveProject(project: Project) {
    this.projects.push(project);
  }

  async saveChange(change: Change) {
    this.changes.push(change);
  }

  async saveHandoff(handoff: Handoff) {
    this.handoffs.push(handoff);
  }

  async saveArtifact(artifact: ArtifactRecord) {
    this.artifacts.push(artifact);
  }

  async saveTaskProgress(progress: TaskProgress) {
    this.tasks.push(progress);
  }

  async appendEvent(event: CoreEvent) {
    this.events.push(event);
  }

  async getProjectByKey(key: string) {
    return this.projects.find((project) => project.key === key);
  }

  async getProjectById(id: string) {
    return this.projects.find((project) => project.id === id);
  }

  async getChangeById(id: string) {
    return this.changes.find((change) => change.id === id);
  }

  async getChangeByProjectAndKey(projectId: string, key: string) {
    return this.changes.find((change) => change.projectId === projectId && change.key === key);
  }

  async listChanges(projectId: string) {
    return this.changes.filter((change) => change.projectId === projectId);
  }

  async getContextBundle(projectId: string, changeId: string) {
    return {
      memories: this.records.filter((record) => record.projectId === projectId && record.changeId === changeId),
      handoffs: this.handoffs.filter((handoff) => handoff.projectId === projectId && handoff.changeId === changeId),
      artifacts: this.artifacts.filter((artifact) => artifact.projectId === projectId && artifact.changeId === changeId),
      taskProgress: this.tasks.filter((task) => task.projectId === projectId && task.changeId === changeId),
      events: this.events.filter((event) => event.projectId === projectId && event.changeId === changeId)
    };
  }
}

describe("freshness", () => {
  it("uses default review windows and explicit artifact staleness", () => {
    expect(evaluateFreshness("decision", { createdAt: now, updatedAt: now }, now).reviewAfter?.toISOString()).toBe(
      "2027-01-01T00:00:00.000Z"
    );
    expect(evaluateFreshness("observation", { createdAt: now, updatedAt: now }, new Date("2026-10-04T00:00:00.000Z")).stale).toBe(true);
    expect(evaluateFreshness("artifact", { createdAt: now, updatedAt: now }, new Date("2030-01-01T00:00:00.000Z")).stale).toBe(false);
    expect(evaluateFreshness("artifact", { createdAt: now, updatedAt: now, state: "stale" }, now).confirmBeforeRelying).toBe(true);
  });
});

describe("core write contracts", () => {
  it("persists durable records, appends audit events, and indexes searchable sources", async () => {
    const repo = new FakeRepo();
    const search = new FakeSearch();
    const writer = createMemoryWriter(repo, search, new FixedClock(), new SequenceIds());

    await writer.recordObservation({ projectId: "project-1", changeId: "change-1", title: "Found pattern", content: "Keep core pure" });
    const decision = await writer.recordDecision({ projectId: "project-1", changeId: "change-1", title: "Use SQLite", content: "Use SQLite", rationale: "Local-first" });
    await writer.recordHandoff({ projectId: "project-1", changeId: "change-1", content: "Resume at Phase 2" });
    await writer.recordArtifact({ projectId: "project-1", changeId: "change-1", kind: "design", title: "Design", path: "openspec/design.md" });
    await writer.recordTaskProgress({ projectId: "project-1", changeId: "change-1", taskKey: "2.4", status: "completed", notes: "Done" });

    expect(decision.record.freshness.reviewAfter?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(repo.records.map((record) => record.kind)).toEqual(["observation", "decision"]);
    expect(repo.handoffs).toHaveLength(1);
    expect(repo.artifacts).toHaveLength(1);
    expect(repo.tasks).toHaveLength(1);
    expect(repo.events.map((event) => event.type)).toEqual(["observation.recorded", "decision.recorded", "handoff.recorded", "artifact.recorded", "task_progress.recorded"]);
    expect(search.indexed.map((entry) => entry.sourceType)).toEqual(["memory_record", "memory_record", "handoff", "artifact", "task_progress"]);
  });
});

describe("context recovery", () => {
  it("prefers the stored active change and treats events as audit, not authority", async () => {
    const repo = new FakeRepo();
    repo.projects.push({ id: "project-1", key: "pegasus", activeChangeId: "change-active", lifecycle: { createdAt: now, updatedAt: now } });
    repo.changes.push(
      { id: "change-active", projectId: "project-1", key: "active", title: "Active", lastTouchedAt: now, isActive: true, lifecycle: { createdAt: now, updatedAt: now } },
      { id: "change-newer", projectId: "project-1", key: "newer", title: "Newer", lastTouchedAt: new Date("2026-07-06T00:00:00.000Z"), lifecycle: { createdAt: now, updatedAt: now } }
    );
    repo.records.push({ id: "decision-1", projectId: "project-1", changeId: "change-active", kind: "decision", title: "Keep core pure", content: "No SDK imports", scope: "change", lifecycle: { createdAt: now, updatedAt: now } });
    repo.events.push({ id: "event-1", projectId: "project-1", changeId: "change-active", type: "decision.recorded", subjectType: "memory_record", subjectId: "missing", payload: { content: "Use SDK in core" }, createdAt: now });

    const recovered = await recoverContext(repo, new FixedClock(), { projectKey: "pegasus" });

    expect(recovered.status).toBe("selected");
    expect(recovered.change?.id).toBe("change-active");
    expect(recovered.context?.memories.map((record) => record.content)).toEqual(["No SDK imports"]);
    expect(recovered.context?.events).toHaveLength(1);
  });

  it("returns concise ambiguity candidates when ranking has no material score gap", async () => {
    const repo = new FakeRepo();
    repo.projects.push({ id: "project-1", key: "pegasus", lifecycle: { createdAt: now, updatedAt: now } });
    repo.changes.push(
      { id: "change-a", projectId: "project-1", key: "a", title: "A", phase: "apply", lastTouchedAt: now, lifecycle: { createdAt: now, updatedAt: now } },
      { id: "change-b", projectId: "project-1", key: "b", title: "B", phase: "apply", lastTouchedAt: now, lifecycle: { createdAt: now, updatedAt: now } }
    );

    const recovered = await recoverContext(repo, new FixedClock(), { projectKey: "pegasus" });

    expect(recovered.status).toBe("ambiguous");
    expect(recovered.candidates).toEqual([
      expect.objectContaining({ key: "a", reason: expect.stringContaining("score") }),
      expect.objectContaining({ key: "b", reason: expect.stringContaining("score") })
    ]);
    expect(recovered.confirmationRequired).toBe(true);
  });
});
