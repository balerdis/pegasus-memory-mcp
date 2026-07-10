# Tasks: Cleanup and Uninstall Contract

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 260-360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Maintenance core + SQLite cleanup | PR 1 | Reset planning/execution, FTS cleanup, purge boundaries |
| 2 | CLI wiring + tests + docs | PR 1 | Dispatch, exit codes, dry-run no-DB-creation, README |

## Phase 1: Foundation / Ports

- [x] 1.1 Extend `src/core/ports/index.ts` with `MaintenanceMode`, `MaintenanceStatus`, `MaintenanceResult`, and a maintenance port for reset/purge planning/execution.
- [x] 1.2 Create `src/core/use-cases/cleanup.ts` to plan cleanup actions without touching stdio or MCP startup.

## Phase 2: Core Implementation

- [x] 2.1 Implement project reset in `src/adapters/sqlite/index.ts` as one transaction: verify target project, delete matching `memory_fts` rows, then delete the project row and rely on FK cascade for child tables.
- [x] 2.2 Add no-op detection and stable result mapping for missing project / empty delete cases in the cleanup flow.
- [x] 2.3 Add purge helpers in `src/adapters/sqlite/index.ts` for `defaultDatabasePath(HOME)` plus `.db-wal`/`.db-shm`/`.db-journal` only; refuse custom `--db` and `PEGASUS_MEMORY_DB_PATH` paths.

## Phase 3: CLI Wiring

- [x] 3.1 Update `src/bin/pegasus-memory-mcp.ts` to dispatch `reset`/`purge` before `createSQLiteMemoryStore`, enforce the exact confirmation flags, and return exit `2` for usage/validation failures.
- [x] 3.2 Emit one stable JSON maintenance record (`command`, `mode`, `targets`, `deleted`, `skipped`, `status`) and route success to stdout, errors to stderr, with exits `0/1/2`.

## Phase 4: Testing / Docs

- [x] 4.1 Add CLI tests in `tests/cli/runtime.test.ts` for confirmation failures, dry-run JSON, no-op success, purge boundary skips, exit codes, and dry-run proving no DB files/directories are created.
- [x] 4.2 Add integration tests in `tests/integration/sqlite-persistence.test.ts` proving project reset removes source rows and `memory_fts` only for the target project.
- [x] 4.3 Update `README.md` with commands, flags, stable output, dry-run/no-op behavior, custom-path refusal, and private-package note.

## Verification Commands

- `npm test -- tests/cli/runtime.test.ts`
- `npm test -- tests/integration/sqlite-persistence.test.ts`
- `npm run typecheck`
- `openspec validate 2026-07-10-cleanup-contract --strict`
