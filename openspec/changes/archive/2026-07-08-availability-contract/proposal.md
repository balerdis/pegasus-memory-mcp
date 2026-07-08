# Proposal: Availability Contract

## Intent

Make Pegasus Memory MCP safe for installers, bootstraps, and standalone users to probe before recovery. Today callers must infer availability from real recovery/search calls, which mixes process/tool absence, empty memory, ambiguous recovery, and real persistence failures.

## Scope

### In Scope
- Add side-effect-free MCP `health` tool.
- Define successful health response: `ok: true`, `status: "operational"`, server/version, and capability flags for recovery/search/write surfaces.
- Normalize consumer-visible states: MCP unavailable out-of-band, available/no recoverable context, available/ambiguous recovery, and real read/persistence errors.
- Document VS Code stdio `mcp.json` setup and DB path guidance.
- Keep bootstrap consumption generic; no dependency on `pegasus-ia-bootstrap` internals.

### Out of Scope
- Deep database diagnostics or write probes inside `health`.
- Changing recovery ranking semantics beyond clearer envelopes.
- Publishing/release packaging changes.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `context-recovery`: Add the availability/read-error taxonomy, `health` readiness contract, and explicit `not_found`/`ambiguous` recovery states.
- `operational-memory-core`: Clarify standalone stdio MCP setup and preserve transport/core/storage separation for installer consumption.

## Approach

Add `health` to MCP schemas/handlers with no required input and no writes. Keep transport/process unavailability outside tool responses: callers/bootstrap detect missing MCP process/tool separately. Update recovery/read handlers so expected empty/ambiguous states remain normal responses, while unexpected read/persistence failures return explicit error codes. Extend README with VS Code `mcp.json` examples using `node dist/bin/pegasus-memory-mcp.js` and optional `PEGASUS_MEMORY_DB_PATH`/`--db`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/index.ts` | Modified | Add `health`; normalize read error envelopes. |
| `src/bin/pegasus-memory-mcp.ts` | Modified | Ensure stdio startup remains standalone and smoke-safe. |
| `README.md` | Modified | Add VS Code stdio setup and consumer-state guidance. |
| `openspec/specs/context-recovery/spec.md` | Modified | Delta for health/recovery/error contract. |
| `tests/mcp/mcp-adapter.test.ts` | Modified | Contract tests for health and failure envelopes. |
| `tests/cli/runtime.test.ts` | Modified | Startup/config docs-aligned coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Health becomes a slow DB check | Med | Keep it readiness/capability only. |
| Bootstrap-specific assumptions leak in | Med | Specify generic MCP/stdio contract only. |
| Error envelopes hide bugs | Low | Only normalize known read/persistence boundaries; keep unexpected startup failure out-of-band. |

## Rollback Plan

Remove the `health` tool, revert README/spec deltas, and restore previous handler error behavior. Existing write/recovery tools remain compatible.

## Dependencies

- Existing MCP SDK stdio runtime and SQLite store.

## Success Criteria

- [ ] `health` returns operational readiness without writes.
- [ ] Consumers can distinguish unavailable MCP, no context, ambiguous recovery, and real read/persistence errors.
- [ ] README includes working VS Code `mcp.json` guidance without bootstrap-specific coupling.
