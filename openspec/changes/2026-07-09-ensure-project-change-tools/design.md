# Design: Ensure Project and Change Tools

## Technical Approach

Add first-class parent bootstrap use cases and expose them through the existing MCP adapter registration loop. `ensure_project` creates or confirms a project before any write tools run. `ensure_change` creates or confirms a change only after its parent project exists. Existing `record_*` tools stay unchanged and keep their explicit FK preconditions.

SQLite remains the source of truth. Existing rows are returned without mutation, so repeated ensure calls preserve stored metadata. New rows receive lifecycle metadata through the same freshness model as existing entities. `health` advertises `parent_bootstrap: true` so consumers can follow `health -> recover_context -> ensure_project -> ensure_change -> record_artifact / record_observation`.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add explicit MCP tools | Larger public surface, but clear bootstrap contract | Use `ensure_project` and `ensure_change` tools |
| Auto-create parents from writes | Fewer caller steps, but hides mistakes and can create bad parents | Reject; writes remain explicit |
| Reuse `saveProject` / `saveChange` directly | Simple, but current upserts overwrite metadata | Add ensure use cases that lookup first and only save when missing |
| Store optional description/kind metadata | Requires schema/entity additions | Add nullable `description` on project/change and nullable `kind` on change |

## Data Flow

```text
health ──> capabilities.parent_bootstrap = true
recover_context(projectKey) ──> selected | ambiguous | not_found
ensure_project(projectId/key, metadata) ──> repository.getProjectByKey ──┐
                                                                       ├─ existing: return unchanged
                                                                       └─ missing: saveProject(new)
ensure_change(projectId, changeId, metadata) ──> getProjectByKey/id ─────┐
                                                                        ├─ missing project: precondition_failed/project_not_found
                                                                        ├─ existing change: return unchanged
                                                                        └─ missing change: saveChange(new)
record_* ──> existing writer path
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/entities/index.ts` | Modify | Add optional `description` to `Project` and `Change`; add optional `kind` to `Change`. |
| `src/core/ports/index.ts` | Modify | Add `saveProject`, `saveChange`, and project lookup needed by ensure. Prefer adding `getProjectById` to avoid guessing by key. |
| `src/core/use-cases/ensure-bootstrap.ts` | Create | Own idempotent create/confirm logic, lifecycle defaults, and missing-project precondition response. |
| `src/adapters/sqlite/index.ts` | Modify | Implement `getProjectById`; map new columns; keep existing save methods but do not use them to update existing rows in ensure. |
| `migrations/002_bootstrap_metadata.sql` | Create | Add nullable `project.description`, `change.description`, and `change.kind` columns. Bump migration runner to version 2. |
| `src/adapters/mcp/index.ts` | Modify | Add schemas, handlers, tool registration coverage, and `parent_bootstrap` health flag. |
| `src/index.ts` | Modify | Export ensure use cases/types if needed by tests/consumers. |
| `tests/mcp/mcp-adapter.test.ts` | Modify | Add tool list, schema, health flag, idempotency, and precondition tests. |
| `tests/integration/sqlite-persistence.test.ts` | Modify | Cover migration v2, project/change ensure persistence, and metadata preservation. |
| `README.md` | Modify | Document official cold-start flow and stable precondition error. |

## Interfaces / Contracts

```ts
ensure_project: { projectId: string; key?: string; name?: string; workspaceRoot?: string; description?: string }
// returns { ok: true, project, created: boolean }

ensure_change: { projectId: string; changeId: string; key?: string; title?: string; status?: string; kind?: string; type?: string; description?: string }
// returns { ok: true, change, created: boolean }
// or { ok: false, status: "precondition_failed", basis: "project_not_found", message, confirmationRequired: false }
```

Normalize `type` to `kind`; if both are present and differ, reject with validation error. Default `project.key` to `key ?? projectId`; default `change.key` to `key ?? changeId`; default `change.title` to `title ?? changeId`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Ensure use cases preserve existing metadata and create missing rows | Fake repository tests via MCP adapter or focused core tests |
| MCP | Tool registration, validation, health capabilities, stable precondition response | Extend `tests/mcp/mcp-adapter.test.ts` |
| Integration | SQLite v2 migration, nullable metadata round-trip, no FK leak | Extend `tests/integration/sqlite-persistence.test.ts` |

## Migration / Rollout

Add a non-destructive SQLite migration with nullable columns only. No data backfill required. Existing databases keep current project/change rows and gain optional metadata fields.

## Open Questions

- None.
