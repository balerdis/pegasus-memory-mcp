import { describe, expect, it } from "vitest";
import { createMcpToolHandlers, toolSchemas } from "../../src/adapters/mcp/index.js";
import { createMemoryWriter, type ArtifactRecord, type Change, type CoreEvent, type Handoff, type MemoryRecord, type Project, type SearchIndex, type TaskProgress } from "../../src/index.js";

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

class FakeStore implements SearchIndex {
  projects: Project[] = [];
  changes: Change[] = [];
  records: MemoryRecord[] = [];
  handoffs: Handoff[] = [];
  artifacts: ArtifactRecord[] = [];
  tasks: TaskProgress[] = [];
  events: CoreEvent[] = [];

  async saveMemoryRecord(record: MemoryRecord) { this.records.push(record); }
  async saveHandoff(handoff: Handoff) { this.handoffs.push(handoff); }
  async saveArtifact(artifact: ArtifactRecord) { this.artifacts.push(artifact); }
  async saveTaskProgress(progress: TaskProgress) { this.tasks.push(progress); }
  async appendEvent(event: CoreEvent) { this.events.push(event); }
  async upsert() {}
  async getProjectByKey(key: string) { return this.projects.find((project) => project.key === key); }
  async getChangeById(id: string) { return this.changes.find((change) => change.id === id); }
  async listChanges(projectId: string) { return this.changes.filter((change) => change.projectId === projectId); }
  async getContextBundle(projectId: string, changeId: string) {
    return {
      memories: this.records.filter((record) => record.projectId === projectId && record.changeId === changeId),
      handoffs: this.handoffs.filter((handoff) => handoff.projectId === projectId && handoff.changeId === changeId),
      artifacts: this.artifacts.filter((artifact) => artifact.projectId === projectId && artifact.changeId === changeId),
      taskProgress: this.tasks.filter((task) => task.projectId === projectId && task.changeId === changeId),
      events: this.events.filter((event) => event.projectId === projectId && event.changeId === changeId)
    };
  }
  async searchMemory() {
    return [{ sourceType: "memory_record" as const, sourceId: "decision-1", projectId: "project-1", changeId: "change-1", scope: "change", title: "Old decision", content: "Confirm before relying", updatedAt: now, stale: true, needsReview: true, confirmBeforeRelying: true, freshnessReason: "review_after_passed" }];
  }
  async listRecentEvents(projectId: string) {
    return this.events.filter((event) => event.projectId === projectId);
  }
}

function seedRuntime() {
  const store = new FakeStore();
  store.projects.push({ id: "project-1", key: "pegasus", activeChangeId: "change-1", lifecycle: { createdAt: now, updatedAt: now } });
  store.changes.push({ id: "change-1", projectId: "project-1", key: "mcp", title: "MCP adapter", phase: "apply", isActive: true, lastTouchedAt: now, lifecycle: { createdAt: now, updatedAt: now } });
  const writer = createMemoryWriter(store, store, new FixedClock(), new SequenceIds());
  return createMcpToolHandlers({ repository: store, searchIndex: store, writer, clock: new FixedClock(), searchable: store, eventReader: store });
}

function seedAmbiguousRuntime() {
  const store = new FakeStore();
  store.projects.push({ id: "project-1", key: "pegasus", lifecycle: { createdAt: now, updatedAt: now } });
  store.changes.push(
    { id: "change-a", projectId: "project-1", key: "a", title: "A", phase: "apply", lastTouchedAt: now, lifecycle: { createdAt: now, updatedAt: now } },
    { id: "change-b", projectId: "project-1", key: "b", title: "B", phase: "apply", lastTouchedAt: now, lifecycle: { createdAt: now, updatedAt: now } }
  );
  const writer = createMemoryWriter(store, store, new FixedClock(), new SequenceIds());
  return createMcpToolHandlers({ repository: store, searchIndex: store, writer, clock: new FixedClock(), searchable: store, eventReader: store });
}

describe("MCP adapter contracts", () => {
  it("declares the complete MVP MCP tool surface", () => {
    expect(Object.keys(toolSchemas).sort()).toEqual([
      "get_active_context",
      "list_recent_changes",
      "list_recent_events",
      "record_artifact",
      "record_decision",
      "record_handoff",
      "record_observation",
      "record_task_progress",
      "recover_context",
      "search_memory"
    ]);
  });

  it("validates write tool inputs and returns freshness plus event metadata", async () => {
    const handlers = seedRuntime();

    await expect(handlers.record_decision({ projectId: "project-1", changeId: "change-1", title: "Missing content" })).rejects.toMatchObject({ code: "validation_error" });
    const result = await handlers.record_decision({ projectId: "project-1", changeId: "change-1", title: "Keep adapters thin", content: "Core owns business behavior", rationale: "Boundary discipline" });

    expect(result.ok).toBe(true);
    expect(result.record).toMatchObject({ kind: "decision", title: "Keep adapters thin", freshness: { stale: false, needsReview: false, confirmBeforeRelying: false } });
    expect(result.event).toMatchObject({ type: "decision.recorded", subjectType: "memory_record" });
  });

  it("exposes stale, needs-review, confirmation-needed, and ambiguous metadata without conversational policy", async () => {
    const handlers = seedRuntime();

    const search = await handlers.search_memory({ projectId: "project-1", query: "decision" });
    expect(search.results[0]).toMatchObject({ stale: true, needsReview: true, confirmBeforeRelying: true });

    const context = await handlers.get_active_context({ projectKey: "pegasus" });
    expect(context).toMatchObject({ status: "selected", confirmationRequired: false, change: { key: "mcp" } });

    const ambiguous = await seedAmbiguousRuntime().recover_context({ projectKey: "pegasus" });
    expect(ambiguous).toMatchObject({ status: "ambiguous", confirmationRequired: true, candidates: [{ key: "a" }, { key: "b" }] });
  });

  it("lists recent changes and audit events deterministically", async () => {
    const handlers = seedRuntime();
    await handlers.record_task_progress({ projectId: "project-1", changeId: "change-1", taskKey: "4.1", status: "completed", notes: "Handlers done" });

    const changes = await handlers.list_recent_changes({ projectKey: "pegasus" });
    expect(changes.changes.map((change) => change.key)).toEqual(["mcp"]);

    const events = await handlers.list_recent_events({ projectKey: "pegasus" });
    expect(events.events).toEqual([expect.objectContaining({ type: "task_progress.recorded", subjectType: "task_progress" })]);
  });
});
