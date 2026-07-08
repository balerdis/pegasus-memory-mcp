# Design: Availability Contract

## Technical Approach

Add a side-effect-free `health` MCP tool at the adapter layer and keep availability semantics explicit in existing read tools. The MCP process/tool-unavailable case remains out-of-band for consumers. When the server is reachable, `health`, `recover_context`, and read/search tools return structured states that let generic installers and editors decide whether to continue, ask for confirmation, or surface a real storage failure.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Adapter-only `health` handler | Avoids core/storage coupling; cannot prove DB row-level health | Chosen. `health` reports server/tool readiness, package version, static capabilities, and configured/default DB path only. |
| Deep DB diagnostic probe | Stronger persistence signal but may open/write/migrate or slow startup | Rejected. The spec requires no state writes and no deep diagnostics. |
| Throw MCP errors for no context | Simple internally but conflates empty state with transport failure | Rejected. `recover_context` keeps normal `not_found`/`ambiguous` response states. |
| Bootstrap-specific contract | Easier for Pegasus Bootstrap now but couples this package to one consumer | Rejected. README documents generic MCP/stdio behavior and JSON response states only. |

## Data Flow

```text
Consumer/VS Code ──stdio──> MCP server
   ├─ health ─────────────> adapter metadata only ──> structured operational snapshot
   ├─ recover_context ────> core recovery + repository reads ──> selected/not_found/ambiguous/read_error
   └─ search_memory ──────> search port read ──────────────────> ok results/read_error
```

`health` must not call writer methods, migrations beyond normal CLI startup, repository reads, FTS, or manifest import/export. CLI startup still constructs the SQLite store as today; health itself only reflects the already-running runtime.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/mcp/index.ts` | Modify | Add `health` schema/handler; include it in registration; wrap read handlers with normalized read/persistence errors. |
| `src/bin/pegasus-memory-mcp.ts` | Modify | Pass runtime metadata (`databasePath`, default path, version/package info) to the MCP adapter without changing private packaging. |
| `src/index.ts` | Modify | Export only package-owned constants/types if needed; no Pegasus Bootstrap imports. |
| `tests/mcp/mcp-adapter.test.ts` | Modify | Add health, no-write, error-envelope, no-context, and ambiguous-state contract tests. |
| `tests/cli/runtime.test.ts` | Modify | Verify documented DB path precedence and private package/bin assumptions used by `mcp.json`. |
| `README.md` | Modify | Add VS Code `mcp.json` examples and generic consumer state guidance. |

## Interfaces / Contracts

`health` input: `{}`.

`health` response shape:

```ts
type HealthResponse = {
  ok: true;
  status: "operational";
  tool: "health";
  server: { name: "pegasus-memory-mcp"; version: string };
  capabilities: { recovery: true; search: boolean; write: true };
  defaultDbPath: string;
  configuredDbPath?: string;
};
```

Read-state taxonomy:

| State | Tool exposure | Meaning |
|-------|---------------|---------|
| MCP unavailable/tool missing | Out-of-band invocation failure | Process, stdio config, or tool registration failed. |
| `not_found` | `recover_context`, `get_active_context`, list reads | Reachable server, no matching project/context/change. |
| `ambiguous` | `recover_context` | Multiple plausible contexts; return concise candidates and `confirmationRequired: true`. |
| `read_error` | `recover_context`, `get_active_context`, list/search reads | Repository/search read failed after server was reachable. |
| `persistence_error` | write tools | Write/transaction/index persistence failed. |
| `validation_error` / `unsupported_operation` | Existing adapter error envelope | Invalid input or missing optional port. |

Implementation should add adapter helpers such as `safeRead`/`safeWrite` around handler bodies. Expected recovery states remain normal responses; thrown storage errors become `{ ok: false, status: "read_error", error: { code, message } }` for read tools or `persistence_error` for write tools.

## Documentation Approach

README adds VS Code `mcp.json` with `command: "node"`, `args: ["/absolute/path/to/dist/bin/pegasus-memory-mcp.js"]`, optional `env.PEGASUS_MEMORY_DB_PATH`, and an alternate `--db` example. It documents that installers should first invoke `health`; if invocation fails, treat MCP as unavailable, not as empty memory.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit/MCP | `health` registration, shape, capability flags, no writes | Extend fake store counters and `toolSchemas` expectations. |
| Unit/MCP | `not_found`, `ambiguous`, `read_error`, `persistence_error` envelopes | Fake store methods that return empty/ambiguous data or throw. |
| CLI/docs | DB path precedence and VS Code examples match runtime | Runtime tests for `--db` over env/default and README string assertions if useful. |
| Verification | Private package remains private | Keep package test asserting `private: true` and bin path. |

## Migration / Rollout

No data migration required. This is an additive MCP contract and documentation change; existing tool names and successful response shapes remain compatible.

## Open Questions

- None.
