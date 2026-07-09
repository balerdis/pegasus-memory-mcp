import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
  throwOnRead = false;
  throwOnWrite = false;
  throwProgrammerError = false;
  readCount = 0;
  writeCount = 0;

  async saveMemoryRecord(record: MemoryRecord) { this.checkWrite(); this.records.push(record); }
  async saveProject(project: Project) { this.checkWrite(); this.projects.push(project); }
  async saveChange(change: Change) { this.checkWrite(); this.changes.push(change); }
  async saveHandoff(handoff: Handoff) { this.checkWrite(); this.handoffs.push(handoff); }
  async saveArtifact(artifact: ArtifactRecord) { this.checkWrite(); this.artifacts.push(artifact); }
  async saveTaskProgress(progress: TaskProgress) { this.checkWrite(); this.tasks.push(progress); }
  async appendEvent(event: CoreEvent) { this.checkWrite(); this.events.push(event); }
  async upsert() { this.checkWrite(); }
  async getProjectByKey(key: string) { this.checkRead(); return this.projects.find((project) => project.key === key); }
  async getProjectById(id: string) { this.checkRead(); return this.projects.find((project) => project.id === id); }
  async getChangeById(id: string) { this.checkRead(); return this.changes.find((change) => change.id === id); }
  async getChangeByProjectAndKey(projectId: string, key: string) { this.checkRead(); return this.changes.find((change) => change.projectId === projectId && change.key === key); }
  async listChanges(projectId: string) { this.checkRead(); return this.changes.filter((change) => change.projectId === projectId); }
  async getContextBundle(projectId: string, changeId: string) {
    this.checkRead();
    return {
      memories: this.records.filter((record) => record.projectId === projectId && record.changeId === changeId),
      handoffs: this.handoffs.filter((handoff) => handoff.projectId === projectId && handoff.changeId === changeId),
      artifacts: this.artifacts.filter((artifact) => artifact.projectId === projectId && artifact.changeId === changeId),
      taskProgress: this.tasks.filter((task) => task.projectId === projectId && task.changeId === changeId),
      events: this.events.filter((event) => event.projectId === projectId && event.changeId === changeId)
    };
  }
  async searchMemory() {
    this.checkRead();
    return [{ sourceType: "memory_record" as const, sourceId: "decision-1", projectId: "project-1", changeId: "change-1", scope: "change", title: "Old decision", content: "Confirm before relying", updatedAt: now, stale: true, needsReview: true, confirmBeforeRelying: true, freshnessReason: "review_after_passed" }];
  }
  async listRecentEvents(projectId: string) {
    this.checkRead();
    return this.events.filter((event) => event.projectId === projectId);
  }

  private checkRead() {
    this.readCount += 1;
    if (this.throwProgrammerError) {
      throw new TypeError("programmer bug");
    }
    if (this.throwOnRead) {
      throw new Error("database read failed");
    }
  }

  private checkWrite() {
    this.writeCount += 1;
    if (this.throwProgrammerError) {
      throw new TypeError("programmer bug");
    }
    if (this.throwOnWrite) {
      throw new Error("database write failed");
    }
  }
}

function seedRuntime() {
  const store = new FakeStore();
  store.projects.push({ id: "project-1", key: "pegasus", activeChangeId: "change-1", lifecycle: { createdAt: now, updatedAt: now } });
  store.changes.push({ id: "change-1", projectId: "project-1", key: "mcp", title: "MCP adapter", phase: "apply", isActive: true, lastTouchedAt: now, lifecycle: { createdAt: now, updatedAt: now } });
  const writer = createMemoryWriter(store, store, new FixedClock(), new SequenceIds());
  return { store, handlers: createMcpToolHandlers({ repository: store, searchIndex: store, writer, clock: new FixedClock(), searchable: store, eventReader: store, metadata: { version: "0.1.0", defaultDbPath: "/tmp/default.db", configuredDbPath: "/tmp/configured.db" } }) };
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
      "ensure_change",
      "ensure_project",
      "get_active_context",
      "health",
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

  it("declares bootstrap tool schemas with stable snake_case identifiers", () => {
    expect(toolSchemas.ensure_project.safeParse({ project_id: "project-2" }).success).toBe(true);
    expect(toolSchemas.ensure_project.safeParse({ projectId: "project-2" }).success).toBe(false);
    expect(toolSchemas.ensure_change.safeParse({ project_id: "project-2", change_id: "change-2" }).success).toBe(true);
    expect(toolSchemas.ensure_change.safeParse({ project_id: "project-2" }).success).toBe(false);
  });

  it("depends on neutral read/search ports instead of SQLite search types", () => {
    const adapterSource = readFileSync(new URL("../../src/adapters/mcp/index.ts", import.meta.url), "utf8");

    expect(adapterSource).not.toContain("../sqlite");
    expect(adapterSource).toContain("MemorySearchPort");
  });

  it("validates write tool inputs and returns freshness plus event metadata", async () => {
    const { handlers } = seedRuntime();

    await expect(handlers.record_decision({ projectId: "project-1", changeId: "change-1", title: "Missing content" })).rejects.toMatchObject({ code: "validation_error" });
    const result = await handlers.record_decision({ projectId: "project-1", changeId: "change-1", title: "Keep adapters thin", content: "Core owns business behavior", rationale: "Boundary discipline" });

    expect(result.ok).toBe(true);
    expect(result.record).toMatchObject({ kind: "decision", title: "Keep adapters thin", freshness: { stale: false, needsReview: false, confirmBeforeRelying: false } });
    expect(result.event).toMatchObject({ type: "decision.recorded", subjectType: "memory_record" });
  });

  it("exposes stale, needs-review, confirmation-needed, and ambiguous metadata without conversational policy", async () => {
    const { handlers } = seedRuntime();

    const search = await handlers.search_memory({ projectId: "project-1", query: "decision" });
    expect(search.results[0]).toMatchObject({ stale: true, needsReview: true, confirmBeforeRelying: true });

    const context = await handlers.get_active_context({ projectKey: "pegasus" });
    expect(context).toMatchObject({ status: "selected", confirmationRequired: false, change: { key: "mcp" } });

    const ambiguous = await seedAmbiguousRuntime().recover_context({ projectKey: "pegasus" });
    expect(ambiguous).toMatchObject({ status: "ambiguous", confirmationRequired: true, candidates: [{ key: "a" }, { key: "b" }] });
  });

  it("lists recent changes and audit events deterministically", async () => {
    const { handlers } = seedRuntime();
    await handlers.record_task_progress({ projectId: "project-1", changeId: "change-1", taskKey: "4.1", status: "completed", notes: "Handlers done" });

    const changes = await handlers.list_recent_changes({ projectKey: "pegasus" });
    expect(changes.changes.map((change) => change.key)).toEqual(["mcp"]);

    const events = await handlers.list_recent_events({ projectKey: "pegasus" });
    expect(events.events).toEqual([expect.objectContaining({ type: "task_progress.recorded", subjectType: "task_progress" })]);
  });

  it("reports operational health without touching repository or writer state", async () => {
    const { handlers, store } = seedRuntime();

    const first = await handlers.health({});
    const second = await handlers.health({});

    expect(first).toEqual({
      ok: true,
      status: "operational",
      tool: "health",
      server: { name: "pegasus-memory-mcp", version: "0.1.0" },
      capabilities: { recovery: true, search: true, write: true, parent_bootstrap: true },
      defaultDbPath: "/tmp/default.db",
      configuredDbPath: "/tmp/configured.db"
    });
    expect(second).toEqual(first);
    expect(store.readCount).toBe(0);
    expect(store.writeCount).toBe(0);
    expect(store.records).toEqual([]);
  });

  it("ensures projects and changes idempotently without overwriting stored metadata", async () => {
    const { handlers, store } = seedRuntime();

    const existingProject = await handlers.ensure_project({
      project_id: "project-1",
      key: "pegasus",
      name: "Overwritten name",
      workspace_root: "/other/root",
      description: "Overwritten description"
    });
    const newProject = await handlers.ensure_project({
      project_id: "project-2",
      key: "pegasus-memory-mcp",
      name: "Pegasus Memory MCP",
      workspace_root: "/repo/pegasus-memory-mcp",
      description: "Operational memory server"
    });
    const existingChange = await handlers.ensure_change({
      project_id: "project-1",
      change_id: "change-1",
      key: "mcp",
      title: "Overwritten title",
      status: "done",
      kind: "feature",
      description: "Overwritten description"
    });
    const newChange = await handlers.ensure_change({
      project_id: "project-2",
      change_id: "change-2",
      title: "Bootstrap tools",
      status: "apply",
      type: "feature",
      description: "Expose parent bootstrap tools"
    });

    expect(existingProject).toMatchObject({ ok: true, created: false, project: { id: "project-1", key: "pegasus" } });
    expect(existingProject.project).not.toMatchObject({ name: "Overwritten name", rootPath: "/other/root", description: "Overwritten description" });
    expect(newProject).toMatchObject({ ok: true, created: true, project: { id: "project-2", key: "pegasus-memory-mcp", name: "Pegasus Memory MCP", rootPath: "/repo/pegasus-memory-mcp", description: "Operational memory server" } });
    expect(existingChange).toMatchObject({ ok: true, created: false, change: { id: "change-1", title: "MCP adapter" } });
    expect(existingChange.change).not.toMatchObject({ title: "Overwritten title", status: "done", kind: "feature", description: "Overwritten description" });
    expect(newChange).toMatchObject({ ok: true, created: true, change: { id: "change-2", projectId: "project-2", key: "change-2", title: "Bootstrap tools", status: "apply", kind: "feature", description: "Expose parent bootstrap tools" } });
    expect(store.projects).toHaveLength(2);
    expect(store.changes).toHaveLength(2);
  });

  it("returns a stable missing-project precondition for ensure_change without leaking raw FK details", async () => {
    const { handlers } = seedRuntime();

    const result = await handlers.ensure_change({ project_id: "missing-project", change_id: "change-2", title: "Bootstrap tools" });

    expect(result).toEqual({
      ok: false,
      status: "precondition_failed",
      basis: "project_not_found",
      message: "Project 'missing-project' must be ensured before ensuring a change.",
      confirmationRequired: false
    });
    expect(JSON.stringify(result).toLowerCase()).not.toContain("foreign key");
    expect(JSON.stringify(result).toLowerCase()).not.toContain("sqlite");
  });

  it("keeps no context and ambiguous recovery as normal availability states", async () => {
    const empty = new FakeStore();
    const writer = createMemoryWriter(empty, empty, new FixedClock(), new SequenceIds());
    const emptyHandlers = createMcpToolHandlers({ repository: empty, searchIndex: empty, writer, clock: new FixedClock(), searchable: empty });

    await expect(emptyHandlers.recover_context({ projectKey: "pegasus" })).resolves.toMatchObject({ status: "not_found", basis: "project_not_found", confirmationRequired: false });
    await expect(seedAmbiguousRuntime().recover_context({ projectKey: "pegasus" })).resolves.toMatchObject({ status: "ambiguous", confirmationRequired: true, candidates: [{ key: "a" }, { key: "b" }] });
  });

  it("normalizes read and persistence failures without hiding validation or programmer errors", async () => {
    const { handlers, store } = seedRuntime();

    store.throwOnRead = true;
    await expect(handlers.search_memory({ projectId: "project-1", query: "decision" })).resolves.toMatchObject({ ok: false, status: "read_error", error: { code: "read_error", message: "database read failed" } });

    store.throwOnRead = false;
    store.throwOnWrite = true;
    await expect(handlers.record_observation({ projectId: "project-1", title: "Outage", content: "DB locked" })).resolves.toMatchObject({ ok: false, status: "persistence_error", error: { code: "persistence_error", message: "database write failed" } });

    await expect(handlers.record_observation({ projectId: "project-1", title: "Missing content" })).rejects.toMatchObject({ code: "validation_error" });

    store.throwOnWrite = false;
    store.throwProgrammerError = true;
    await expect(handlers.get_active_context({ projectKey: "pegasus" })).rejects.toThrow(TypeError);
  });
});
