import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  ArtifactRecord,
  Change,
  CoreEvent,
  Handoff,
  LifecycleMetadata,
  MemoryKind,
  MemoryRecord,
  Project,
  TaskProgress
} from "../../core/entities/index.js";
import { evaluateFreshness } from "../../core/freshness/index.js";
import type { ContextBundle, MemoryRepository, SearchEntry, SearchIndex, TransactionalMemoryRepository } from "../../core/ports/index.js";

export interface SQLiteMemoryStoreOptions {
  databasePath?: string;
  migrationsDir?: string;
}

export interface SQLiteMemorySearchInput {
  projectId: string;
  query: string;
  changeId?: string;
  sourceType?: SearchEntry["sourceType"];
  scope?: string;
  limit?: number;
  now?: Date;
}

export interface SQLiteMemorySearchResult {
  sourceType: SearchEntry["sourceType"];
  sourceId: string;
  projectId: string;
  changeId?: string;
  scope?: string;
  title?: string;
  content: string;
  updatedAt: Date;
  stale: boolean;
  needsReview: boolean;
  confirmBeforeRelying: boolean;
  freshnessReason: string;
}

type Row = Record<string, unknown>;

const migrationVersion = 1;
const migrationName = "001_initial.sql";

export function defaultDatabasePath(home = process.env.HOME ?? process.cwd()): string {
  return join(home, ".local", "share", "pegasus-memory-mcp", "memory.db");
}

export function openSQLiteDatabase(databasePath = defaultDatabasePath()): Database.Database {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function runMigrations(db: Database.Database, migrationsDir = resolve(process.cwd(), "migrations")): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(migrationVersion);
  if (applied) {
    return;
  }

  const sql = readFileSync(join(migrationsDir, migrationName), "utf8");
  const migrate = db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(migrationVersion, migrationName, new Date().toISOString());
  });
  migrate();
}

export function createSQLiteMemoryStore(options: SQLiteMemoryStoreOptions = {}): SQLiteMemoryStore {
  const db = openSQLiteDatabase(options.databasePath);
  runMigrations(db, options.migrationsDir);
  return new SQLiteMemoryStore(db);
}

export class SQLiteMemoryStore implements MemoryRepository, SearchIndex, TransactionalMemoryRepository {
  private transactionDepth = 0;

  constructor(private readonly db: Database.Database) {}

  close(): void {
    this.db.close();
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.db.prepare("BEGIN").run();
    this.transactionDepth += 1;
    try {
      const result = await operation();
      this.db.prepare("COMMIT").run();
      return result;
    } catch (error) {
      this.db.prepare("ROLLBACK").run();
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async saveProject(project: Project): Promise<void> {
    this.db
      .prepare(`INSERT INTO project (id, key, name, root_path, active_change_id, created_at, updated_at, review_after, lifecycle_state, archived_at)
        VALUES (@id, @key, @name, @rootPath, @activeChangeId, @createdAt, @updatedAt, @reviewAfter, @lifecycleState, @archivedAt)
        ON CONFLICT(id) DO UPDATE SET key = excluded.key, name = excluded.name, root_path = excluded.root_path, active_change_id = excluded.active_change_id, updated_at = excluded.updated_at, review_after = excluded.review_after, lifecycle_state = excluded.lifecycle_state, archived_at = excluded.archived_at`)
      .run(bind({ id: project.id, key: project.key, name: project.name, rootPath: project.rootPath, activeChangeId: project.activeChangeId, ...toLifecycleColumns(project.lifecycle) }));
  }

  async saveChange(change: Change): Promise<void> {
    this.db
      .prepare(`INSERT INTO "change" (id, project_id, key, title, phase, status, is_active, last_touched_at, task_completion_ratio, created_at, updated_at, review_after, lifecycle_state, archived_at)
        VALUES (@id, @projectId, @key, @title, @phase, @status, @isActive, @lastTouchedAt, @taskCompletionRatio, @createdAt, @updatedAt, @reviewAfter, @lifecycleState, @archivedAt)
        ON CONFLICT(id) DO UPDATE SET key = excluded.key, title = excluded.title, phase = excluded.phase, status = excluded.status, is_active = excluded.is_active, last_touched_at = excluded.last_touched_at, task_completion_ratio = excluded.task_completion_ratio, updated_at = excluded.updated_at, review_after = excluded.review_after, lifecycle_state = excluded.lifecycle_state, archived_at = excluded.archived_at`)
      .run(bind({ id: change.id, projectId: change.projectId, key: change.key, title: change.title, phase: change.phase, status: change.status, isActive: change.isActive ? 1 : 0, lastTouchedAt: toIso(change.lastTouchedAt), taskCompletionRatio: change.taskCompletionRatio, ...toLifecycleColumns(change.lifecycle) }));
  }

  async saveMemoryRecord(record: MemoryRecord): Promise<void> {
    this.db
      .prepare(`INSERT INTO memory_record (id, project_id, change_id, session_id, kind, title, content, rationale, scope, created_at, updated_at, review_after, lifecycle_state, archived_at)
        VALUES (@id, @projectId, @changeId, @sessionId, @kind, @title, @content, @rationale, @scope, @createdAt, @updatedAt, @reviewAfter, @lifecycleState, @archivedAt)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, rationale = excluded.rationale, scope = excluded.scope, updated_at = excluded.updated_at, review_after = excluded.review_after, lifecycle_state = excluded.lifecycle_state, archived_at = excluded.archived_at`)
      .run(bind({ id: record.id, projectId: record.projectId, changeId: record.changeId, sessionId: record.sessionId, kind: record.kind, title: record.title, content: record.content, rationale: record.rationale, scope: record.scope, ...toLifecycleColumns(record.lifecycle) }));
  }

  async saveHandoff(handoff: Handoff): Promise<void> {
    this.db
      .prepare(`INSERT INTO handoff (id, project_id, change_id, session_id, content, created_at, updated_at, review_after, lifecycle_state, archived_at)
        VALUES (@id, @projectId, @changeId, @sessionId, @content, @createdAt, @updatedAt, @reviewAfter, @lifecycleState, @archivedAt)
        ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at, review_after = excluded.review_after, lifecycle_state = excluded.lifecycle_state, archived_at = excluded.archived_at`)
      .run(bind({ id: handoff.id, projectId: handoff.projectId, changeId: handoff.changeId, sessionId: handoff.sessionId, content: handoff.content, ...toLifecycleColumns(handoff.lifecycle) }));
  }

  async saveArtifact(artifact: ArtifactRecord): Promise<void> {
    this.db
      .prepare(`INSERT INTO artifact (id, project_id, change_id, kind, path, title, summary, created_at, updated_at, review_after, lifecycle_state, archived_at)
        VALUES (@id, @projectId, @changeId, @kind, @path, @title, @summary, @createdAt, @updatedAt, @reviewAfter, @lifecycleState, @archivedAt)
        ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, path = excluded.path, title = excluded.title, summary = excluded.summary, updated_at = excluded.updated_at, review_after = excluded.review_after, lifecycle_state = excluded.lifecycle_state, archived_at = excluded.archived_at`)
      .run(bind({ id: artifact.id, projectId: artifact.projectId, changeId: artifact.changeId, kind: artifact.kind, path: artifact.path, title: artifact.title, summary: artifact.summary, ...toLifecycleColumns(artifact.lifecycle) }));
  }

  async saveTaskProgress(progress: TaskProgress): Promise<void> {
    this.db
      .prepare(`INSERT INTO task_progress (id, project_id, change_id, task_key, status, notes, blockers_json, created_at, updated_at, review_after, lifecycle_state, archived_at)
        VALUES (@id, @projectId, @changeId, @taskKey, @status, @notes, @blockersJson, @createdAt, @updatedAt, @reviewAfter, @lifecycleState, @archivedAt)
        ON CONFLICT(id) DO UPDATE SET task_key = excluded.task_key, status = excluded.status, notes = excluded.notes, blockers_json = excluded.blockers_json, updated_at = excluded.updated_at, review_after = excluded.review_after, lifecycle_state = excluded.lifecycle_state, archived_at = excluded.archived_at`)
      .run(bind({ id: progress.id, projectId: progress.projectId, changeId: progress.changeId, taskKey: progress.taskKey, status: progress.status, notes: progress.notes, blockersJson: JSON.stringify(progress.blockers ?? []), ...toLifecycleColumns(progress.lifecycle) }));
  }

  async appendEvent(event: CoreEvent): Promise<void> {
    this.db
      .prepare(`INSERT INTO event (id, project_id, change_id, session_id, type, subject_type, subject_id, payload_json, created_at)
        VALUES (@id, @projectId, @changeId, @sessionId, @type, @subjectType, @subjectId, @payloadJson, @createdAt)`)
      .run(bind({ id: event.id, projectId: event.projectId, changeId: event.changeId, sessionId: event.sessionId, type: event.type, subjectType: event.subjectType, subjectId: event.subjectId, payloadJson: JSON.stringify(event.payload), createdAt: toIso(event.createdAt) }));
  }

  async upsert(entry: SearchEntry): Promise<void> {
    this.db.prepare("DELETE FROM memory_fts WHERE source_type = ? AND source_id = ?").run(entry.sourceType, entry.sourceId);
    this.db.prepare("INSERT INTO memory_fts (source_type, source_id, project_id, change_id, text) VALUES (?, ?, ?, ?, ?)").run(entry.sourceType, entry.sourceId, entry.projectId, entry.changeId, entry.text);
  }

  async getProjectByKey(key: string): Promise<Project | undefined> {
    const row = this.db.prepare("SELECT * FROM project WHERE key = ?").get(key) as Row | undefined;
    return row ? toProject(row) : undefined;
  }

  async getChangeById(id: string): Promise<Change | undefined> {
    const row = this.db.prepare('SELECT * FROM "change" WHERE id = ?').get(id) as Row | undefined;
    return row ? toChange(row) : undefined;
  }

  async listChanges(projectId: string): Promise<Change[]> {
    const rows = this.db.prepare('SELECT * FROM "change" WHERE project_id = ? ORDER BY COALESCE(last_touched_at, updated_at) DESC, key ASC').all(projectId) as Row[];
    return rows.map(toChange);
  }

  async getContextBundle(projectId: string, changeId: string): Promise<ContextBundle> {
    return {
      memories: (this.db.prepare("SELECT * FROM memory_record WHERE project_id = ? AND change_id = ? ORDER BY updated_at DESC").all(projectId, changeId) as Row[]).map(toMemoryRecord),
      handoffs: (this.db.prepare("SELECT * FROM handoff WHERE project_id = ? AND change_id = ? ORDER BY updated_at DESC").all(projectId, changeId) as Row[]).map(toHandoff),
      artifacts: (this.db.prepare("SELECT * FROM artifact WHERE project_id = ? AND change_id = ? ORDER BY updated_at DESC").all(projectId, changeId) as Row[]).map(toArtifact),
      taskProgress: (this.db.prepare("SELECT * FROM task_progress WHERE project_id = ? AND change_id = ? ORDER BY updated_at DESC").all(projectId, changeId) as Row[]).map(toTaskProgress),
      events: (this.db.prepare("SELECT * FROM event WHERE project_id = ? AND change_id = ? ORDER BY created_at DESC LIMIT 50").all(projectId, changeId) as Row[]).map(toEvent)
    };
  }

  async listRecentEvents(projectId: string, input: { changeId?: string; limit?: number } = {}): Promise<CoreEvent[]> {
    const changeFilter = input.changeId ? "AND change_id = @changeId" : "";
    const rows = this.db
      .prepare(`SELECT * FROM event WHERE project_id = @projectId ${changeFilter} ORDER BY created_at DESC, id ASC LIMIT @limit`)
      .all({ projectId, changeId: input.changeId, limit: input.limit ?? 20 }) as Row[];
    return rows.map(toEvent);
  }

  async searchMemory(input: SQLiteMemorySearchInput): Promise<SQLiteMemorySearchResult[]> {
    const now = input.now ?? new Date();
    const sourceTypes = input.sourceType ? [input.sourceType] : ["memory_record", "handoff", "artifact", "task_progress"] as const;
    const results = sourceTypes.flatMap((sourceType) => this.searchSource(sourceType, input, now));
    return results.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || left.sourceId.localeCompare(right.sourceId)).slice(0, input.limit ?? 20);
  }

  private searchSource(sourceType: SearchEntry["sourceType"], input: SQLiteMemorySearchInput, now: Date): SQLiteMemorySearchResult[] {
    const query = escapeFtsQuery(input.query);
    const params: Record<string, unknown> = { query, projectId: input.projectId, changeId: input.changeId, scope: input.scope, sourceType };
    const changeFilter = input.changeId ? "AND source.change_id = @changeId" : "";
    const scopeFilter = input.scope && sourceType === "memory_record" ? "AND source.scope = @scope" : "";
    const sql = sourceQuery(sourceType, changeFilter, scopeFilter);
    const rows = this.db.prepare(sql).all(params) as Row[];
    return rows.map((row) => toSearchResult(sourceType, row, now));
  }
}

function sourceQuery(sourceType: SearchEntry["sourceType"], changeFilter: string, scopeFilter: string): string {
  const columns = {
    memory_record: "source.scope AS scope, source.title AS title, source.content || COALESCE('\\n' || source.rationale, '') AS content, source.kind AS freshness_type",
    handoff: "NULL AS scope, NULL AS title, source.content AS content, 'handoff' AS freshness_type",
    artifact: "NULL AS scope, source.title AS title, COALESCE(source.summary, source.path, '') AS content, 'artifact' AS freshness_type",
    task_progress: "NULL AS scope, source.task_key AS title, source.status || COALESCE('\\n' || source.notes, '') AS content, 'task_progress' AS freshness_type"
  }[sourceType];
  return `SELECT fts.source_type, fts.source_id, source.project_id, source.change_id, ${columns}, source.updated_at, source.review_after, source.lifecycle_state, source.archived_at
    FROM memory_fts fts
    JOIN ${sourceType} source ON source.id = fts.source_id AND source.project_id = fts.project_id AND COALESCE(source.change_id, '') = COALESCE(fts.change_id, '')
    WHERE fts.source_type = @sourceType AND memory_fts MATCH @query AND source.project_id = @projectId ${changeFilter} ${scopeFilter}`;
}

function toLifecycleColumns(lifecycle: LifecycleMetadata): Row {
  return {
    createdAt: toIso(lifecycle.createdAt),
    updatedAt: toIso(lifecycle.updatedAt),
    reviewAfter: toIso(lifecycle.reviewAfter),
    lifecycleState: lifecycle.state,
    archivedAt: toIso(lifecycle.archivedAt)
  };
}

function bind(values: Row): Row {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value ?? null]));
}

function toLifecycle(row: Row): LifecycleMetadata {
  return {
    createdAt: fromIso(row.created_at),
    updatedAt: fromIso(row.updated_at),
    reviewAfter: fromOptionalIso(row.review_after),
    state: row.lifecycle_state as LifecycleMetadata["state"],
    archivedAt: fromOptionalIso(row.archived_at)
  };
}

function toProject(row: Row): Project {
  return { id: row.id as string, key: row.key as string, name: row.name as string | undefined, rootPath: row.root_path as string | undefined, activeChangeId: row.active_change_id as string | undefined, lifecycle: toLifecycle(row) };
}

function toChange(row: Row): Change {
  return { id: row.id as string, projectId: row.project_id as string, key: row.key as string, title: row.title as string, phase: row.phase as string | undefined, status: row.status as string | undefined, isActive: row.is_active === 1, lastTouchedAt: fromOptionalIso(row.last_touched_at), taskCompletionRatio: row.task_completion_ratio as number | undefined, lifecycle: toLifecycle(row) };
}

function toMemoryRecord(row: Row): MemoryRecord {
  return { id: row.id as string, projectId: row.project_id as string, changeId: row.change_id as string | undefined, sessionId: row.session_id as string | undefined, kind: row.kind as MemoryKind, title: row.title as string, content: row.content as string, rationale: row.rationale as string | undefined, scope: row.scope as MemoryRecord["scope"], lifecycle: toLifecycle(row) };
}

function toHandoff(row: Row): Handoff {
  return { id: row.id as string, projectId: row.project_id as string, changeId: row.change_id as string | undefined, sessionId: row.session_id as string | undefined, content: row.content as string, lifecycle: toLifecycle(row) };
}

function toArtifact(row: Row): ArtifactRecord {
  return { id: row.id as string, projectId: row.project_id as string, changeId: row.change_id as string | undefined, kind: row.kind as string, path: row.path as string | undefined, title: row.title as string, summary: row.summary as string | undefined, lifecycle: toLifecycle(row) };
}

function toTaskProgress(row: Row): TaskProgress {
  return { id: row.id as string, projectId: row.project_id as string, changeId: row.change_id as string | undefined, taskKey: row.task_key as string, status: row.status as TaskProgress["status"], notes: row.notes as string | undefined, blockers: JSON.parse((row.blockers_json as string | undefined) ?? "[]") as string[], lifecycle: toLifecycle(row) };
}

function toEvent(row: Row): CoreEvent {
  return { id: row.id as string, projectId: row.project_id as string, changeId: row.change_id as string | undefined, sessionId: row.session_id as string | undefined, type: row.type as string, subjectType: row.subject_type as CoreEvent["subjectType"], subjectId: row.subject_id as string, payload: JSON.parse(row.payload_json as string) as Record<string, unknown>, createdAt: fromIso(row.created_at) };
}

function toSearchResult(sourceType: SearchEntry["sourceType"], row: Row, now: Date): SQLiteMemorySearchResult {
  const lifecycle = toLifecycle(row);
  const freshnessType = row.freshness_type as Parameters<typeof evaluateFreshness>[0];
  const freshness = evaluateFreshness(freshnessType, lifecycle, now);
  return {
    sourceType,
    sourceId: row.source_id as string,
    projectId: row.project_id as string,
    changeId: row.change_id as string | undefined,
    scope: row.scope as string | undefined,
    title: row.title as string | undefined,
    content: row.content as string,
    updatedAt: lifecycle.updatedAt,
    stale: freshness.stale,
    needsReview: freshness.needsReview,
    confirmBeforeRelying: freshness.confirmBeforeRelying,
    freshnessReason: freshness.reason
  };
}

function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" ");
}

function toIso(value?: Date): string | undefined {
  return value?.toISOString();
}

function fromIso(value: unknown): Date {
  return new Date(value as string);
}

function fromOptionalIso(value: unknown): Date | undefined {
  return typeof value === "string" ? new Date(value) : undefined;
}
