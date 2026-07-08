# Tasks: Availability Contract

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 220-360 |
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
| 1 | Availability contract core + docs + tests | PR 1 | Single PR; keep health, envelopes, README, and verification together. |

## Phase 1: Contract and runtime shape

- [x] 1.1 Add `health` input/response schema types in `src/adapters/mcp/index.ts`, including server version and DB path metadata.
- [x] 1.2 Add adapter-level envelope helpers in `src/adapters/mcp/index.ts` for normalized read/persistence errors without masking `validation_error` or thrown programmer bugs.

## Phase 2: Core availability behavior

- [x] 2.1 Implement `health` in `createMcpToolHandlers` with `ok: true`, `status: "operational"`, and no repository/search/writer side effects.
- [x] 2.2 Wrap `get_active_context`, `recover_context`, `search_memory`, and write handlers with read/write error envelopes that preserve `not_found` and `ambiguous` as normal states.

## Phase 3: MCP registration and docs wiring

- [x] 3.1 Register `health` in `createPegasusMcpServer` and pass runtime metadata from `src/bin/pegasus-memory-mcp.ts` into the adapter.
- [x] 3.2 Update `README.md` with VS Code `mcp.json` examples using an absolute built script path (`node dist/bin/pegasus-memory-mcp.js`), plus `PEGASUS_MEMORY_DB_PATH` vs `--db` guidance and invocation-failure vs empty-memory wording.

## Phase 4: Testing and verification

- [x] 4.1 Add MCP tests in `tests/mcp/mcp-adapter.test.ts` for `health` shape, tool registration, and repeated calls with zero store mutations.
- [x] 4.2 Extend MCP tests for `not_found`/`ambiguous`, `read_error`/`persistence_error`, and validation/programmer-error visibility.
- [x] 4.3 Extend `tests/cli/runtime.test.ts` for private package/bin assumptions, DB-path precedence, and smoke-start on the configured runtime DB.
- [x] 4.4 Run `npm run typecheck`, `npm run build`, `npm run test:mcp`, `npm run test:cli`, and `openspec validate 2026-07-08-availability-contract --strict`.
