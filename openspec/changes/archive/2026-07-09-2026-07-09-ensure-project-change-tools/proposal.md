# Proposal: Ensure Project and Change Tools

## Intent

Fresh workspaces need an explicit bootstrap path before recording memory. Today, `record_*` writes assume project/change rows already exist, so consumers can hit raw SQLite foreign-key failures. Add idempotent `ensure_project` and `ensure_change` MCP tools so callers can create or confirm parents before writes.

## Scope

### In Scope
- Add public MCP tools `ensure_project` and `ensure_change`.
- Keep existing project/change rows idempotent; avoid destructive metadata overwrites.
- Return stable `precondition_failed` with `basis: project_not_found` when ensuring a change for a missing project.
- Document the official fresh-workspace flow: `health -> recover_context -> ensure_project -> ensure_change -> record_artifact / record_observation`.
- Cover tool registration, idempotency, and missing-project precondition behavior in tests.

### Out of Scope
- Auto-creating projects from `ensure_change` or `record_*` tools.
- Destructive metadata updates for existing projects/changes.
- New UI or Pegasus-specific workflow names.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `operational-memory-core`: add explicit parent-bootstrap write tools and define their idempotent behavior.
- `context-recovery`: document the recommended availability/recovery/bootstrap sequence and any capability flags needed by consumers.

## Approach

Expose both tools at the MCP adapter layer and route them through core repository ports to SQLite `saveProject` / `saveChange`-equivalent behavior. `ensure_project` requires a stable `project_id/key`; optional metadata may include name, workspace root, and description. `ensure_change` requires `project_id` plus stable `change_id`; optional metadata may include title, status, kind/type, and description. Keep parent creation explicit: callers must ensure the project first.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/index.ts` | Modified | Tool schemas, handlers, response/error mapping. |
| `src/core/ports/index.ts` | Modified | Repository contract for ensure operations. |
| `src/adapters/sqlite/index.ts` | Modified | Idempotent persistence helpers and safe metadata completion. |
| `tests/mcp/`, `tests/integration/` | Modified | Bootstrap, idempotency, and precondition coverage. |
| `README.md`, `openspec/specs/*` | Modified | Consumer flow and behavioral contract. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hidden implicit creation returns via `record_*` | Low | Keep write preconditions explicit in specs/tests. |
| FK internals leak to callers | Medium | Normalize missing-project errors in `ensure_change`. |
| Metadata upserts overwrite useful data | Medium | Only fill empty fields when safely supported. |

## Rollback Plan

Remove the two MCP tools, port additions, docs, and tests; existing `record_*` behavior remains unchanged.

## Dependencies

- Existing SQLite project/change tables and `saveProject` / `saveChange` behavior.

## Success Criteria

- [ ] Fresh consumers can call the official bootstrap flow before writes without FK failures.
- [ ] Repeated ensures return existing rows safely.
- [ ] Missing project on `ensure_change` returns stable `precondition_failed` / `project_not_found`.
