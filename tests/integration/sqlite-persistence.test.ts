import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSQLiteMemoryStore,
  defaultDatabasePath,
  openSQLiteDatabase,
  runMigrations,
  type SQLiteMemorySearchResult
} from "../../src/adapters/sqlite/index.js";
import { createMemoryWriter, type ArtifactRecord, type Handoff, type MemoryRecord, type Project, type TaskProgress } from "../../src/index.js";

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

async function tempDb() {
  const dir = await mkdtemp(join(tmpdir(), "pegasus-memory-mcp-"));
  return { dir, dbPath: join(dir, "memory.db") };
}

async function seededStore() {
  const { dbPath } = await tempDb();
  const store = createSQLiteMemoryStore({ databasePath: dbPath });
  await store.saveProject({ id: "project-1", key: "pegasus", name: "Pegasus", lifecycle: { createdAt: now, updatedAt: now } });
  await store.saveProject({ id: "project-2", key: "other", name: "Other", lifecycle: { createdAt: now, updatedAt: now } });
  await store.saveChange({ id: "change-1", projectId: "project-1", key: "main", title: "Main", lifecycle: { createdAt: now, updatedAt: now }, lastTouchedAt: now });
  await store.saveChange({ id: "change-2", projectId: "project-1", key: "next", title: "Next", lifecycle: { createdAt: now, updatedAt: now }, lastTouchedAt: new Date("2026-07-04T00:00:00.000Z") });
  await store.saveChange({ id: "change-3", projectId: "project-2", key: "external", title: "External", lifecycle: { createdAt: now, updatedAt: now } });
  return store;
}

function resultTitles(results: SQLiteMemorySearchResult[]) {
  return results.map((result) => result.title ?? result.content);
}

describe("SQLite persistence and search", () => {
  it("runs the initial migration with source tables, events, and FTS5", async () => {
    const { dbPath } = await tempDb();
    const db = openSQLiteDatabase(dbPath);
    try {
      runMigrations(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') ORDER BY name").all() as Array<{ name: string }>;
      expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(["schema_migrations", "project", "change", "session", "memory_record", "artifact", "handoff", "task_progress", "event", "memory_fts"]));
      expect(db.prepare("SELECT version FROM schema_migrations").pluck().all()).toEqual([1]);
    } finally {
      db.close();
    }
  });

  it("rolls back source, event, and FTS writes together when a transaction fails", async () => {
    const store = await seededStore();
    const record: MemoryRecord = {
      id: "memory-1",
      projectId: "project-1",
      changeId: "change-1",
      kind: "decision",
      title: "Atomic SQLite",
      content: "FTS updates stay atomic",
      rationale: "Consistency",
      scope: "change",
      lifecycle: { createdAt: now, updatedAt: now }
    };

    await expect(
      store.transaction(async () => {
        await store.saveMemoryRecord(record);
        await store.upsert({ sourceType: "memory_record", sourceId: record.id, projectId: record.projectId, changeId: record.changeId, text: record.content });
        throw new Error("fail after FTS");
      })
    ).rejects.toThrow("fail after FTS");

    expect(await store.searchMemory({ projectId: "project-1", query: "atomic" })).toEqual([]);
  });

  it("persists writer records and searches through source-table joins with filters, recency, and freshness", async () => {
    const store = await seededStore();
    const writer = createMemoryWriter(store, store, new FixedClock(), new SequenceIds());

    const decision = await writer.recordDecision({ projectId: "project-1", changeId: "change-1", title: "Use SQLite", content: "Local operational memory", rationale: "Durable FTS", scope: "change" });
    await store.saveMemoryRecord({ ...(decision.record as MemoryRecord), id: "stale-observation", changeId: "change-2", kind: "observation", title: "Use SQLite cautiously", content: "Expired search result", scope: "project", lifecycle: { createdAt: now, updatedAt: new Date("2026-01-01T00:00:00.000Z"), reviewAfter: new Date("2026-01-02T00:00:00.000Z") } });
    await store.upsert({ sourceType: "memory_record", sourceId: "stale-observation", projectId: "project-1", changeId: "change-2", text: "Use SQLite cautiously Expired search result" });
    await store.saveHandoff({ id: "handoff-1", projectId: "project-2", changeId: "change-3", content: "Use SQLite elsewhere", lifecycle: { createdAt: now, updatedAt: now } });
    await store.upsert({ sourceType: "handoff", sourceId: "handoff-1", projectId: "project-2", changeId: "change-3", text: "Use SQLite elsewhere" });

    const projectResults = await store.searchMemory({ projectId: "project-1", query: "sqlite" });
    expect(resultTitles(projectResults)).toEqual(["Use SQLite", "Use SQLite cautiously"]);
    expect(projectResults[0]).toMatchObject({ sourceType: "memory_record", scope: "change", changeId: "change-1", stale: false, confirmBeforeRelying: false });
    expect(projectResults[1]).toMatchObject({ scope: "project", changeId: "change-2", stale: true, needsReview: true, confirmBeforeRelying: true });

    const scopedResults = await store.searchMemory({ projectId: "project-1", changeId: "change-1", query: "sqlite", scope: "change" });
    expect(resultTitles(scopedResults)).toEqual(["Use SQLite"]);
  });

  it("works without manifest authority and keeps internal memory authoritative when a manifest is stale", async () => {
    const { dir, dbPath } = await tempDb();
    const missingManifestStore = createSQLiteMemoryStore({ databasePath: dbPath });
    await missingManifestStore.saveProject({ id: "project-1", key: "pegasus", lifecycle: { createdAt: now, updatedAt: now } });
    await missingManifestStore.saveChange({ id: "change-1", projectId: "project-1", key: "internal", title: "Internal", lifecycle: { createdAt: now, updatedAt: now } });
    await missingManifestStore.saveArtifact({ id: "artifact-1", projectId: "project-1", changeId: "change-1", kind: "design", title: "Internal design", summary: "SQLite is authoritative", lifecycle: { createdAt: now, updatedAt: now } } as ArtifactRecord);
    await missingManifestStore.upsert({ sourceType: "artifact", sourceId: "artifact-1", projectId: "project-1", changeId: "change-1", text: "Internal design SQLite is authoritative" });

    expect(resultTitles(await missingManifestStore.searchMemory({ projectId: "project-1", query: "authoritative" }))).toEqual(["Internal design"]);

    await writeFile(join(dir, "manifest.json"), JSON.stringify({ change: { key: "stale-manifest" }, memory: "manifest-only" }));
    const staleManifestStore = createSQLiteMemoryStore({ databasePath: dbPath });
    expect(resultTitles(await staleManifestStore.searchMemory({ projectId: "project-1", query: "authoritative" }))).toEqual(["Internal design"]);
    expect(await staleManifestStore.searchMemory({ projectId: "project-1", query: "manifest-only" })).toEqual([]);
  });

  it("creates the default database parent under the user data directory", () => {
    expect(defaultDatabasePath("/tmp/home")).toBe("/tmp/home/.local/share/pegasus-memory-mcp/memory.db");
  });
});
