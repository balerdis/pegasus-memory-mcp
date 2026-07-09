# Exploration: ensure_project and ensure_change tools

## Current State

- The MCP adapter currently exposes write tools for observations, decisions, handoffs, artifacts, and task progress, plus read tools for recovery, search, and recent lists.
- `recover_context` already returns `not_found` with `basis: "project_not_found"` when a project key does not exist.
- The SQLite schema enforces foreign keys from `change.project_id` and all project-scoped write tables back to `project(id)`, so a fresh workspace can fail with raw FK errors when consumers write before creating parent rows.
- `src/adapters/sqlite/index.ts` already has idempotent `saveProject` and `saveChange` methods, but nothing in the core or MCP surface calls them as a preflight step.
- The current write path in `createMemoryWriter` assumes `projectId` and optional `changeId` already exist; it only writes the child record, search row, and event.
- Existing tests cover recovery states and SQLite persistence, but not explicit project/change bootstrap tools.

## Affected Areas

- `src/adapters/mcp/index.ts` — add new tool schemas and handlers for `ensure_project` and `ensure_change`.
- `src/adapters/sqlite/index.ts` — expose idempotent project/change ensure operations if the adapter does not already provide a clean query/create helper.
- `src/core/ports/index.ts` — extend the repository contract with ensure operations or equivalent lookup/create primitives.
- `src/core/use-cases/write-memory.ts` — likely no behavioral change, but its preconditions should stay explicit.
- `tests/mcp/mcp-adapter.test.ts` — verify tool registration, idempotency, and precondition errors.
- `tests/integration/sqlite-persistence.test.ts` — verify SQLite upsert/lookup behavior and FK-safe bootstrap.
- `README.md`, `openspec/specs/context-recovery/spec.md`, `openspec/specs/operational-memory-core/spec.md` — document the new consumer flow and contracts.

## Approaches

1. **Explicit ensure tools on the MCP surface** — add `ensure_project` and `ensure_change` as first-class tools that map to repository upserts.
   - Pros: matches the consumer flow exactly, keeps bootstrap separate from writes, and makes idempotent preflight visible.
   - Cons: expands the public surface and adds two more contracts to document/test.
   - Effort: Medium.

2. **Auto-create parents inside write tools** — silently create project/change rows when missing before recording artifacts or observations.
   - Pros: fewer steps for callers.
   - Cons: hides bootstrap intent, makes errors less explicit, and can create accidental projects/changes from bad inputs.
   - Effort: Low.

3. **Add ensure methods only at the SQLite adapter layer** — keep them internal and let higher layers call them indirectly.
   - Pros: minimal surface change.
   - Cons: does not give Pegasus Bootstrap the explicit preflight tools it needs.
   - Effort: Low.

## Recommendation

Add **explicit, idempotent MCP tools** for `ensure_project` and `ensure_change`. `ensure_project` should upsert by project key and return the existing row if present; `ensure_change` should require a known project first, then upsert the change within that project. If `ensure_change` is called before `ensure_project`, return a clear precondition error instead of letting SQLite surface FK failures.

## Risks

- If the ensure operations are implemented only as adapter helpers, the consumer will still have no explicit bootstrap contract.
- If `ensure_change` is allowed to create an implicit project, the flow becomes ambiguous and can hide caller mistakes.
- If tests only cover happy-path upserts, the precondition behavior may regress back into raw FK errors.
- Documentation must clearly state the sequence `health -> recover_context -> ensure_project -> ensure_change -> record_*` for fresh workspaces.

## Ready for Proposal

Yes. The next step is a proposal/spec delta that defines the two new tools, the precondition error for missing projects, and the docs/test updates needed to keep fresh-workspace writes FK-safe.
