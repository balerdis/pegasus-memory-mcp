# Tasks: Ensure Project and Change Tools

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520-700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: core + SQLite ensure path + migration; PR 2: MCP tools + tests + docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add idempotent ensure bootstrap core/storage support | PR 1 | Migration + entity/port updates + lookup-before-save use case |
| 2 | Expose tools and prove behavior end-to-end | PR 2 | MCP wiring, health flag, tests, README/spec updates |

## Phase 1: Foundation

- [x] 1.1 Add nullable bootstrap metadata fields and lookup contracts in `src/core/entities/index.ts` and `src/core/ports/index.ts`.
- [x] 1.2 Add SQLite migration v2 for nullable `project.description`, `change.description`, and `change.kind` in `migrations/002_bootstrap_metadata.sql`.
- [x] 1.3 Create `src/core/use-cases/ensure-bootstrap.ts` with lookup-before-save logic and `project_not_found` precondition handling.

## Phase 2: Core + Adapter Wiring

- [x] 2.1 Implement SQLite ensure helpers in `src/adapters/sqlite/index.ts` so existing project/change rows are returned unchanged.
- [x] 2.2 Export and wire `ensure_project` / `ensure_change` handlers and schemas in `src/adapters/mcp/index.ts`.
- [x] 2.3 Add `health.capabilities.parent_bootstrap = true` in `src/adapters/mcp/index.ts`.

## Phase 3: Testing

- [x] 3.1 Extend `tests/mcp/mcp-adapter.test.ts` for tool registration/schema, idempotency, missing-project precondition, and no raw FK leak.
- [x] 3.2 Extend `tests/integration/sqlite-persistence.test.ts` for migration, metadata round trip, preserved existing rows, and change-ensure requiring a project.

## Phase 4: Documentation

- [x] 4.1 Update `README.md` with the official flow: `health -> recover_context -> ensure_project -> ensure_change -> record_*`.
- [x] 4.2 Update `openspec/changes/2026-07-09-ensure-project-change-tools/specs/*` and related docs to match the final bootstrap contract.
