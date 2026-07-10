# Exploration: cleanup / uninstall contract

## Current State

- The CLI only supports `--help`, `--version`, `--db`, and `--smoke-start`; there is no official destructive maintenance mode.
- The SQLite schema is project-centric and already cascades most project-owned rows from `project(id)` through `ON DELETE CASCADE`.
- `memory_fts` is the main exception: it has no foreign keys, so project deletion must clean FTS rows explicitly.
- The codebase currently has no config/cache files in source; the only owned persistent file today is the SQLite DB at `~/.local/share/pegasus-memory-mcp/memory.db` (plus SQLite sidecars if they exist).
- Existing OpenSpec already covers bootstrap/write/recovery behavior, but not cleanup/uninstall semantics.

## Affected Areas

- `src/bin/pegasus-memory-mcp.ts` — add subcommand dispatch for `reset` and `purge`, confirmation flags, dry-run output, and exit-code handling.
- `src/adapters/sqlite/index.ts` — add project-scoped delete/purge helpers or a maintenance port implementation.
- `src/core/*` — likely a small maintenance use case/port if we keep destructive DB logic out of the CLI.
- `tests/cli/runtime.test.ts` and `tests/integration/sqlite-persistence.test.ts` — verify parser, no-op behavior, dry-run, project reset, purge, and FTS cleanup.
- `README.md` — document the official contract and delegation boundary.
- `openspec/specs/operational-memory-core/spec.md` — add the new maintenance requirement(s).

## Approaches

1. **Core maintenance use case + SQLite delete helpers** — add a tiny maintenance port/use case for project reset and global purge, then let the CLI call it.
   - Pros: keeps destructive behavior in the domain layer, testable without shelling out, cleaner boundary for future bootstrap consumers.
   - Cons: adds a new port/use-case pair for a narrow feature.
   - Effort: Medium.

2. **CLI-only imperative cleanup** — let the CLI open SQLite, run deletes, and unlink the DB file directly.
   - Pros: fewer files touched.
   - Cons: mixes policy with transport, makes reuse harder, and leaks storage details into the command implementation.
   - Effort: Low.

## Recommendation

Use a **core maintenance boundary** for `reset --project` and keep `purge --all` as a CLI-owned file operation that still resolves its own DB path internally. That preserves the rule that Pegasus Memory owns its own deletion/reset semantics while keeping Pegasus IA free of internal paths.

Recommended contract:

- `pegasus-memory-mcp reset --project <project_id> --yes [--dry-run]`
- `pegasus-memory-mcp purge --all --yes-i-understand-this-deletes-data [--dry-run]`

Behavior rules:

- `--dry-run` prints the deletion plan and exits 0 without mutating anything.
- Actual deletion requires the explicit confirmation flag.
- Missing targets are no-op and exit 0.
- Output must state what will be deleted before execution and what was deleted afterward.

Deletion boundaries:

- `reset --project` deletes one project’s data only: the `project` row, cascaded `change`/`session`/project-scoped records, plus explicit `memory_fts` rows for that project.
- `purge --all` deletes the owned SQLite DB file and SQLite sidecars (`-wal`, `-shm`, `-journal`) and may remove an empty Pegasus-owned data directory.
- `purge --all` must not delete workspace folders, user repos, OpenSpec artifacts, or any path outside Pegasus-owned storage.

## Risks

- The FTS table is easy to forget; if it is not cleared, resets leave stale search hits.
- A broad purge that removes parent directories too aggressively could delete non-Pegasus files when a custom DB path is used.
- If command output is not stable, bootstrap automation will have a hard time consuming it safely.
- The command boundary needs to stay explicit so Pegasus IA does not start depending on internal filesystem assumptions.

## Ready for Proposal

Yes. This should be a **modification to the existing `operational-memory-core` spec**, not a new domain, with README and tests updated alongside it.

Review workload forecast: likely a single PR if scoped to CLI + SQLite + tests + docs, roughly **250-380 changed lines**. Split only if the purge filesystem cleanup grows beyond the current file-touch footprint.
