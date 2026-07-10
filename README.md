# Pegasus Memory MCP

Local-first MCP server for operational memory: project/change context, handoffs, decisions, task progress, recent events, and SQLite/FTS5 search.

## Quick start

```bash
npm ci
npm_config_ignore_scripts=false npm rebuild better-sqlite3 --foreground-scripts
npm run build
node dist/bin/pegasus-memory-mcp.js --smoke-start
```

The package bin is `pegasus-memory-mcp` and points to `dist/bin/pegasus-memory-mcp.js` after build.

## Run the MCP server

```bash
node dist/bin/pegasus-memory-mcp.js
```

By default, Pegasus Memory stores SQLite data at:

```text
~/.local/share/pegasus-memory-mcp/memory.db
```

Override the database path with either:

```bash
PEGASUS_MEMORY_DB_PATH=/path/to/memory.db node dist/bin/pegasus-memory-mcp.js
node dist/bin/pegasus-memory-mcp.js --db /path/to/memory.db
```

`--db` wins over `PEGASUS_MEMORY_DB_PATH`.

## VS Code stdio setup

Build the project first, then point VS Code at the built CLI with an absolute path:

```json
{
  "servers": {
    "pegasus-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/pegasus-memory-mcp/dist/bin/pegasus-memory-mcp.js"],
      "env": {
        "PEGASUS_MEMORY_DB_PATH": "/absolute/path/to/memory.db"
      }
    }
  }
}
```

You can also pass the database path as a CLI argument. `--db` takes precedence over `PEGASUS_MEMORY_DB_PATH`:

```json
{
  "servers": {
    "pegasus-memory": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/absolute/path/to/pegasus-memory-mcp/dist/bin/pegasus-memory-mcp.js",
        "--db",
        "/absolute/path/to/memory.db"
      ]
    }
  }
}
```

Consumers should first invoke `health`. If the process or tool invocation fails, treat MCP as unavailable out-of-band. If `health` succeeds but `recover_context` returns `not_found`, the server is available and simply has no recoverable context. If `recover_context` returns `ambiguous`, ask the user to choose from the concise candidates. Read failures surface as `read_error`; write failures surface as `persistence_error`.

## Fresh workspace bootstrap flow

Use the official write preflight sequence for new or empty workspaces:

```text
health -> recover_context -> ensure_project -> ensure_change -> record_*
```

`health.capabilities.parent_bootstrap` indicates that `ensure_project` and `ensure_change` are available. `ensure_project` requires `project_id` and accepts optional `key`, `name`, `workspace_root`, and `description`. Repeated calls return the existing project without overwriting stored metadata.

`ensure_change` requires `project_id` and `change_id`, accepts optional `key`, `title`, `status`, `kind`/`type`, and `description`, and does not implicitly create a project. If the parent project is missing, it returns `status: "precondition_failed"` with `basis: "project_not_found"` instead of raw database foreign-key details.

## Manifest behavior

`manifest.json` is optional. The server uses its internal SQLite operational state when a manifest is missing or stale; manifests are compatibility/bootstrap artifacts, not the source of truth.

## Maintenance commands

Pegasus Memory MCP is private implementation infrastructure (`"private": true`) and must not be published until a dedicated release task changes that policy. Bootstrap and uninstall flows should use the official maintenance commands instead of deleting internal paths directly.

### Reset one project

```bash
pegasus-memory-mcp reset --project <project_id> --dry-run
pegasus-memory-mcp reset --project <project_id> --yes
```

`reset --project` uses the active configured database (`--db` wins over `PEGASUS_MEMORY_DB_PATH`, otherwise the default database path). It deletes only the selected project row, relies on SQLite foreign-key cascades for project-scoped source tables, and explicitly removes matching `memory_fts` rows. It never deletes database files, sidecars, other projects, repos, workspaces, or OpenSpec artifacts.

### Purge owned default storage

```bash
pegasus-memory-mcp purge --all --dry-run
pegasus-memory-mcp purge --all --yes-i-understand-this-deletes-data
```

`purge --all` deletes only Pegasus-owned default storage resolved from `defaultDatabasePath(HOME)`: `memory.db`, `memory.db-wal`, `memory.db-shm`, and `memory.db-journal`. Custom database paths from `--db` or `PEGASUS_MEMORY_DB_PATH` are reported as skipped and are never deleted.

Destructive execution requires the exact confirmation flag. `--dry-run` prints the plan and does not create database files or parent directories.

### Stable output and exit codes

Maintenance commands emit one JSON record to stdout on success or stderr on errors:

```json
{
  "command": "reset",
  "mode": "dry_run",
  "targets": ["/home/user/.local/share/pegasus-memory-mcp/memory.db", "project:example", "memory_fts"],
  "deleted": [],
  "skipped": [],
  "status": "planned"
}
```

Fields are stable: `command`, `mode`, `targets`, `deleted`, `skipped`, and `status`. Success, dry-run, and no-op results exit `0`; usage, validation, or missing confirmation exits `2`; real execution errors exit `1`.

## Verification

```bash
npm run typecheck
npm run build
npm test
```

This MVP is intentionally private for implementation slices. Do not publish it until a dedicated release task removes `"private": true`.
