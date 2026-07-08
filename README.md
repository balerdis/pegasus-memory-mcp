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

## Manifest behavior

`manifest.json` is optional. The server uses its internal SQLite operational state when a manifest is missing or stale; manifests are compatibility/bootstrap artifacts, not the source of truth.

## Verification

```bash
npm run typecheck
npm run build
npm test
```

This MVP is intentionally private for implementation slices. Do not publish it until a dedicated release task removes `"private": true`.
