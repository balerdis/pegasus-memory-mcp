CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT,
  root_path TEXT,
  active_change_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_after TEXT,
  lifecycle_state TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS "change" (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  phase TEXT,
  status TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  last_touched_at TEXT,
  task_completion_ratio REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_after TEXT,
  lifecycle_state TEXT,
  archived_at TEXT,
  UNIQUE(project_id, key)
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  change_id TEXT REFERENCES "change"(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS memory_record (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  change_id TEXT REFERENCES "change"(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES "session"(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('observation', 'decision')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  rationale TEXT,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_after TEXT,
  lifecycle_state TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS artifact (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  change_id TEXT REFERENCES "change"(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  path TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_after TEXT,
  lifecycle_state TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS handoff (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  change_id TEXT REFERENCES "change"(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES "session"(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_after TEXT,
  lifecycle_state TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS task_progress (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  change_id TEXT REFERENCES "change"(id) ON DELETE SET NULL,
  task_key TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  blockers_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_after TEXT,
  lifecycle_state TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS event (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  change_id TEXT REFERENCES "change"(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES "session"(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  source_type UNINDEXED,
  source_id UNINDEXED,
  project_id UNINDEXED,
  change_id UNINDEXED,
  text
);

CREATE INDEX IF NOT EXISTS idx_change_project ON "change"(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_record_project_change ON memory_record(project_id, change_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_artifact_project_change ON artifact(project_id, change_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_handoff_project_change ON handoff(project_id, change_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_task_progress_project_change ON task_progress(project_id, change_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_event_project_change_created ON event(project_id, change_id, created_at);
