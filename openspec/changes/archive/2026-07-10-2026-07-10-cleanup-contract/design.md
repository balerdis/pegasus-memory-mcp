# Design: Cleanup and Uninstall Contract

## Technical Approach

Add a small maintenance path to the existing TypeScript CLI before MCP server startup. `reset` uses the active configured SQLite DB (`--db` wins over `PEGASUS_MEMORY_DB_PATH`, else default) but only deletes one project. `purge --all` is filesystem cleanup for Pegasus-owned default storage only; it intentionally ignores custom configured DB paths. Output is stable JSON so Pegasus Bootstrap can parse it without scraping prose.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| CLI dispatch | Parse maintenance subcommands in `src/bin/pegasus-memory-mcp.ts` before creating the MCP server. | New binary or MCP tools. | Keeps the official uninstall/reset contract available when the MCP server should not be started. |
| Output | Emit one JSON object to stdout with `command`, `mode`, `targets`, `deleted`, `skipped`, `status`. Errors go to stderr as JSON with `status:"error"`. | Stable labeled text. | JSON is less ambiguous for Bootstrap and easier to snapshot in CLI tests. |
| Reset deletion | In one SQLite transaction: verify project exists, count affected rows, `DELETE FROM memory_fts WHERE project_id = ?`, then `DELETE FROM project WHERE id = ?` and rely on FK cascade for source tables. | Triggers or source-table-only delete. | FTS5 table is independent of FK cascades; explicit cleanup preserves control and avoids hidden trigger magic. |
| Purge scope | Resolve owned default path via `defaultDatabasePath(HOME)` and sidecars only: `.db`, `.db-wal`, `.db-shm`, `.db-journal`; optionally remove the owned data dir only when empty. Custom `--db`/env paths are reported as skipped, never deleted. | Delete configured DB path. | Prevents accidental removal of arbitrary user/workspace files. |

## Data Flow

```text
argv ──→ dispatchMaintenanceCommand ──┬── resetProject(active db) ──→ SQLiteMaintenancePort
                                      └── purgeOwnedStorage(default path) ──→ fs
```

Reset dry-run checks whether the configured DB file exists before opening it. If missing, it returns `status:"noop"` without creating files. Execute uses the same plan shape, then performs deletion.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/bin/pegasus-memory-mcp.ts` | Modify | Add command parsing/dispatch for `reset` and `purge`, confirmation validation, JSON output, and exit codes. |
| `src/core/ports/index.ts` | Modify | Add maintenance result/input types and a `ProjectMaintenancePort` or equivalent minimal port. |
| `src/core/use-cases/cleanup.ts` | Create | Pure reset/purge planning/execution orchestration, independent of MCP stdio. |
| `src/adapters/sqlite/index.ts` | Modify | Implement `planProjectReset`/`resetProjectData` using explicit FTS cleanup plus FK cascade. Export path helpers as needed. |
| `tests/cli/runtime.test.ts` | Modify | Add CLI smoke tests for parsing, confirmation failures, dry-run JSON, custom path skip, and private package assertion. |
| `tests/integration/sqlite-persistence.test.ts` | Modify | Add project reset integration tests proving source rows and `memory_fts` are removed for one project only. |
| `README.md` | Modify | Document commands, flags, JSON fields, exit codes, dry-run/no-op behavior, custom path refusal, and private package status. |

## Interfaces / Contracts

```ts
type MaintenanceMode = "dry_run" | "execute";
type MaintenanceStatus = "planned" | "deleted" | "noop" | "error";

interface MaintenanceResult {
  command: "reset" | "purge";
  mode: MaintenanceMode;
  targets: string[];
  deleted: string[];
  skipped: Array<{ target: string; reason: string }>;
  status: MaintenanceStatus;
}
```

CLI validation: `reset` requires `--project <project_id>` and either `--dry-run` or `--yes`. `purge` requires `--all` and either `--dry-run` or `--yes-i-understand-this-deletes-data`. Missing/invalid flags return exit `2`. Operational failures return `1`. Success, dry-run, and no-op return `0`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Argument parsing, confirmation validation, stable result shape, path resolution. | Vitest against pure helpers. |
| Integration | Reset deletion order and FTS cleanup; custom purge path refusal. | Temporary SQLite DB and temp HOME/files. |
| CLI smoke | Exit codes/stdout/stderr for dry-run, execute, no-op, invalid invocation. | Existing `runCli` tests with captured console output. |

## Migration / Rollout

No DB migration required. Existing schemas remain valid. Package remains private via `package.json` and README guidance.

## Open Questions

None.
