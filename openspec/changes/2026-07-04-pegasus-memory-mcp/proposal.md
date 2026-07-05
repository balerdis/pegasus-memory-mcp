# Proposal: Generic Local Context Recovery MCP

## Intent

Agents lose continuity across sessions, compactions, and restarts. Pegasus Memory must recover project/change context and flag stale memories.

## Scope

### In Scope
- Projects, changes, events, artifacts, decisions, handoffs, tasks, freshness metadata.
- MCP tools for persistence, recovery, recent context, and SQLite/FTS5 search.
- Freshness defaults; events remain audit/history.
- Optional `manifest.json` import/export.

### Out of Scope
- Embeddings, sync, dashboards, raw transcripts, MCP confirmations, Pegasus-specific recovery.
- Exact SQLite tables and module names; those belong in design.

## Capabilities

### New Capabilities
- `operational-memory-core`: Persistence, history, freshness, write tools.
- `context-recovery`: Active context, search, stale signals, read tools.

### Modified Capabilities
- None; no existing specs are present.

## MVP Stack and Boundary

| Topic | Decision |
|---|---|
| Runtime | TypeScript on Node.js. |
| MCP SDK | `@modelcontextprotocol/sdk`. |
| Transport | stdio first. |
| Storage/search | SQLite + FTS5. |
| Validation | Zod or equivalent runtime schema validation. |
| Packaging | npm/pnpm package with executable CLI/bin entrypoint. |
| Boundary | Core recovery/domain logic ≠ MCP transport/adapters ≠ DB persistence. |

## Initial MCP Tool Surface

MVP tools cover observations, decisions, handoffs, artifacts, tasks, active context, recovery, search, recent changes, and events. Exact schemas and errors belong in specs/design.

## Approach

Ship a local-first stdio MCP server backed by SQLite/FTS5. Keep product logic independent from MCP SDK and database details so later transports or storage refinements do not rewrite recovery logic.

## Recovery Behavior

Prefer stored active change; otherwise rank by active flag, last touched, and phase completeness. Ask once when ambiguous.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `openspec/specs/operational-memory-core/spec.md` | New | Persistence, lifecycle, history, tool writes. |
| `openspec/specs/context-recovery/spec.md` | New | Recovery/search stale signals. |
| Future `src/`, `migrations/` | New | TypeScript MCP server, SQLite/FTS5, CLI/bin packaging. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stale data trusted | Medium | Emit freshness and confirmation-needed signals. |
| Pegasus overfit | Medium | Keep generic nouns and optional integration. |
| Recovery ambiguity | Medium | Rank deterministically; ask once if needed. |
| Boundary drift | Medium | Keep domain, MCP, and DB layers separate. |

## Rollback Plan

Revert proposal/spec/design artifacts. Later implementation must keep migrations reversible and `manifest.json` optional.

## Success Criteria

- [ ] Cold start recovers project/change without manual reconstruction.
- [ ] Multiple changes resolve deterministically or ask one concise question.
- [ ] Stale decisions return confirmation-needed metadata.
- [ ] Event history remains searchable audit, not current decision truth.
- [ ] Product works when `manifest.json` is missing or stale.
