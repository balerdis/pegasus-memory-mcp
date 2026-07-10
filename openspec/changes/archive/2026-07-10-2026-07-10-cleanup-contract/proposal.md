# Proposal: Cleanup and Uninstall Contract

## Intent

Define destructive maintenance commands so Pegasus IA can delegate reset/uninstall safely without knowing internal paths. This adds CLI reset/purge and handles `memory_fts` outside FK cascades.

## Scope

### In Scope
- Add commands:
  - `pegasus-memory-mcp reset --project <project_id> --yes`
  - `pegasus-memory-mcp reset --project <project_id> --dry-run`
  - `pegasus-memory-mcp purge --all --yes-i-understand-this-deletes-data`
  - `pegasus-memory-mcp purge --all --dry-run`
- Enforce safety: no destructive action without the exact confirmation flag; dry-run prints the plan and deletes nothing.
- Define stable machine-readable-ish output for Bootstrap automation; exit `0` for success/no-op and non-zero only for real errors.
- Update README/docs/tests for boundaries, flags, output, exit codes, FTS cleanup, no-op, dry-run, and private package status.

### Out of Scope
- Publishing/releasing; keep the package private.
- SQLite triggers, FTS external-content/source-table coupling, or removing `--db` / `PEGASUS_MEMORY_DB_PATH`.
- Pegasus IA passing or deleting internal Pegasus Memory paths during normal integration.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `operational-memory-core`: add behavior for project reset and Pegasus-owned purge.

## Approach

- `reset --project` is a logical project-scoped operation against the active configured DB. It deletes the target `project` row, cascaded project rows, and matching `memory_fts` rows. It does not delete DB files, sidecars, config, other projects, repos, OpenSpec artifacts, or arbitrary paths.
- `purge --all` uses Option A: delete only the Pegasus-owned default DB path and SQLite sidecars (`-wal`, `-shm`, `-journal`), and optionally an empty owned data directory. It ignores custom `--db` / `PEGASUS_MEMORY_DB_PATH` paths.
- Output uses stable labeled lines or JSON-like records: command, mode (`dry_run|execute`), targets, planned/deleted/skipped, status.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/bin/pegasus-memory-mcp.ts` | Modified | CLI safety, output, exits |
| `src/core/*`, `src/adapters/sqlite/index.ts` | Modified | Boundary, FTS cleanup |
| `tests/cli/runtime.test.ts`, `tests/integration/sqlite-persistence.test.ts` | Modified | Safety/no-op/FTS/purge |
| `README.md`, `openspec/specs/operational-memory-core/spec.md`, `package.json` | Modified | Docs/spec/private package |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale FTS rows | Medium | Explicit cleanup tests |
| Custom path data loss | Medium | Purge ignores custom paths |
| Output churn | Medium | Document stable fields |

## Rollback Plan

Revert CLI, maintenance helpers, README/spec/tests. DBs remain valid because no triggers or FTS source-table coupling are introduced.

## Dependencies

- SQLite FK cascades and default data path resolution.

## Success Criteria

- [ ] Commands require explicit confirmation for destructive execution.
- [ ] Dry-run reports a stable plan and mutates nothing.
- [ ] Reset removes only one project and its FTS rows from the active DB.
- [ ] Purge removes only Pegasus-owned default paths and ignores custom paths.
- [ ] README/docs/tests cover the contract; package remains private.
