# Design: Pegasus Memory MCP

## Technical Approach

Build Pegasus Memory MCP as a local-first TypeScript/Node MCP server over stdio, published for the MVP as the unscoped npm package `pegasus-memory-mcp` with CLI bin `pegasus-memory-mcp`. Keep core memory and recovery behavior independent from MCP transport and SQLite persistence. SQLite operational state is authoritative at `~/.local/share/pegasus-memory-mcp/memory.db` by default; `manifest.json` remains optional import/export only.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Boundaries | `core` owns contracts/use cases; `adapters/mcp` maps tools; `adapters/sqlite` maps storage/search; `bin` boots stdio. | MCP-coupled services; DB-active-record domain. | Preserves core ≠ MCP adapters ≠ DB persistence. |
| Runtime/storage | TypeScript, `@modelcontextprotocol/sdk`, `better-sqlite3`, SQLite FTS5. | Go/Rust; `sqlite3`; `node:sqlite`. | Matches proposal stack, simple transactional local storage, mature FTS5 support. |
| Validation | Zod schemas at adapter boundary. | Ad-hoc validation. | Clear MCP errors while keeping core inputs transport-neutral. |
| Naming/package | Product name `Pegasus Memory MCP`; npm package and bin `pegasus-memory-mcp`. | Scoped MVP package such as `@pegasus/memory-mcp`. | Unscoped install is simpler for MVP docs and usage; scoped names stay reserved for a future Pegasus MCP suite. |
| Default DB path | `~/.local/share/pegasus-memory-mcp/memory.db`, overridable by configuration/env. | Project-local DB; hidden cwd file; manifest as source of truth. | Stable user data location avoids cwd surprises and keeps operational state independent from optional exports. |
| Lifecycle metadata | Shared lifecycle columns on each durable source table, not only one memory table. | Unified memory record for all types; separate unrelated metadata tables. | Decisions, observations, handoffs, artifacts, and task progress need consistent freshness without forcing all records into one shape. |
| Migrations | Versioned SQL + `schema_migrations`. | ORM auto-sync. | Reviewable local storage evolution. |

## Module Layout

| Path | Role |
|---|---|
| `src/core/entities/` | Project, change, session, records, artifacts, handoffs, task progress, events, lifecycle types. |
| `src/core/use-cases/` | Record writes, active context, recovery ranking, search orchestration. |
| `src/core/ports/` | `MemoryRepository`, `SearchIndex`, `Clock`, `IdGenerator`. |
| `src/core/freshness/` | Review windows and stale/confirmation signal calculation. |
| `src/adapters/sqlite/` | Repositories, migrations, FTS synchronization, transactions. |
| `src/adapters/mcp/` | Tool schemas, request/response mapping, error mapping. |
| `src/bin/` | `pegasus-memory-mcp` CLI/bin entrypoint, default DB path config, stdio startup. |
| `package.json` | npm package metadata for `pegasus-memory-mcp`, bin mapping, scripts, dependencies. |
| `migrations/`, `tests/` | SQL migrations and unit/integration/contract tests. |

## Data Flow

```text
MCP client -> adapters/mcp -> core use case -> ports -> adapters/sqlite -> SQLite/FTS5
                                  |                                 |
                                  +---- freshness/recovery rules ----+
```

Writes validate at the MCP boundary, execute a core use case, persist source rows in one transaction, append an audit event, and update FTS. Reads resolve project/change, rank context, join source rows, compute lifecycle signals, and return stale/ambiguous metadata; user confirmation remains the consuming agent's job.

## SQLite Schema Proposal

| Table | Key columns |
|---|---|
| `project` | `id`, `key`, `name`, `root_path`, `active_change_id`, timestamps |
| `change` | `id`, `project_id`, `key`, `title`, `phase`, `status`, `is_active`, `last_touched_at`, lifecycle columns |
| `session` | `id`, `project_id`, `change_id`, `started_at`, `ended_at`, `summary` |
| `memory_record` | `id`, `project_id`, `change_id`, `session_id`, `kind`, `title`, `content`, `rationale`, `scope`, lifecycle columns |
| `artifact` | `id`, `project_id`, `change_id`, `kind`, `path`, `title`, `summary`, lifecycle columns |
| `handoff` | `id`, `project_id`, `change_id`, `session_id`, `content`, lifecycle columns |
| `task_progress` | `id`, `project_id`, `change_id`, `task_key`, `status`, `notes`, `blockers`, lifecycle columns |
| `event` | `id`, `project_id`, `change_id`, `session_id`, `type`, `subject_type`, `subject_id`, `payload_json`, `created_at` |

Lifecycle columns are `created_at`, `updated_at`, optional `review_after`, `lifecycle_state`, and optional `archived_at`. Events are append-only evidence and do not carry review authority.

## FTS and Search Semantics

`memory_fts` stores searchable text plus routing columns: `source_type`, `source_id`, `project_id`, `change_id`. It is an index, not source of truth. `source_type/source_id` maps back to exactly one source table (`memory_record`, `artifact`, `handoff`, or `task_progress`). Search first applies requested project/change/type/scope constraints against source tables, uses FTS for textual candidates/ranking, then re-joins source rows to decorate recency and freshness. Denormalized FTS routing columns are only pruning aids and are validated by the source join.

## Freshness Policy

Default review windows: decisions 180 days, observations 90 days, handoffs 30 days, task progress 14 days; artifacts only become stale through explicit lifecycle state or stale linked change. Responses expose `freshness`, `stale`, `needs_review`, and `confirm_before_relying`; the MCP server never asks users.

## Recovery Algorithm

1. Resolve project by explicit key, root path, or unique recent project; otherwise return concise project candidates.
2. Prefer `project.active_change_id` when present and not archived.
3. Otherwise score changes: active flag, recency bucket, phase completeness, task completion signal, and non-archived state. Stable key ordering is only for deterministic presentation.
4. Auto-return only when the top score beats the runner-up by at least one material bucket (design threshold: 100 points) or no runner-up exists.
5. If score gap is below threshold or primary dimensions tie, return `status: "ambiguous"` with up to five candidates containing key/title/phase/last_touched/reason so the consuming agent can ask one concise question.

## Tool Mapping

| Tool | Core use case |
|---|---|
| `record_observation`, `record_decision` | Create `memory_record`, lifecycle metadata, event, FTS row. |
| `record_handoff`, `record_artifact`, `record_task_progress` | Persist source row with lifecycle metadata, event, FTS row. |
| `get_active_context`, `recover_context` | Resolve/rank context and return bundle with freshness/ambiguity signals. |
| `search_memory` | FTS candidate search with source-table filters and freshness decoration. |
| `list_recent_changes`, `list_recent_events` | Deterministic recent work and bounded audit history. |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Freshness, ranking thresholds, response shaping. | Vitest core tests. |
| Integration | Migrations, transactions, FTS joins/filtering. | Temp SQLite DB per test. |
| MCP contract | Tool validation and response schemas. | SDK handler tests. |
| CLI smoke | stdio server starts and opens DB path. | Minimal process smoke. |

## Migration / Rollout

Initial rollout creates `migrations/001_initial.sql`. No existing production data migration is required.

Future suite note: if Pegasus later grows multiple MCP packages, scoped names may be introduced (`@pegasus/memory-mcp`, `@pegasus/spec-mcp`, `@pegasus/handoff-mcp`, `@pegasus/context-mcp`). Do not use scoped names for the MVP.

## Risks and Mitigations

- Boundary drift: keep SDK/SQLite imports out of `src/core`.
- FTS sync bugs: update FTS in the same transaction as source writes.
- Review size: split setup, core, SQLite, MCP, and CLI/test slices under the 400-line budget.

## Open Questions

- None.
