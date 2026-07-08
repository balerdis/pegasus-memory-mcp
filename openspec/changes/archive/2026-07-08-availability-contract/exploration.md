# Exploration: Availability contract for Pegasus Memory MCP

## Current State

- The MCP surface is `record_observation`, `record_decision`, `record_handoff`, `record_artifact`, `record_task_progress`, `get_active_context`, `recover_context`, `search_memory`, `list_recent_changes`, and `list_recent_events`.
- `get_active_context` is currently just an alias to `recoverContext`.
- `recoverContext` already distinguishes `selected`, `ambiguous`, and `not_found`.
- Storage/read failures are not normalized into a dedicated public contract yet; non-`McpAdapterError` failures can still bubble as transport errors.
- README documents stdio startup and DB path, but not VS Code `mcp.json` wiring.

## Affected Areas

- `src/adapters/mcp/index.ts` — add the side-effect-free availability tool and normalize read/persistence failure envelopes.
- `src/core/use-cases/recovery.ts` — likely no core logic change, unless the error taxonomy is pushed deeper.
- `src/bin/pegasus-memory-mcp.ts` — may expose the same availability contract for smoke/startup docs or CLI checks.
- `README.md` — add VS Code `mcp.json` examples and install/run guidance.
- `openspec/specs/context-recovery/spec.md` — add the explicit availability/recovery/error taxonomy.
- `openspec/specs/operational-memory-core/spec.md` — only a small note if health is documented as transport-level, not core behavior.
- `tests/mcp/mcp-adapter.test.ts` and `tests/cli/runtime.test.ts` — contract coverage for the new tool and error envelopes.

## Approaches

1. **Add `health` as the explicit availability probe** — return a side-effect-free snapshot of server readiness and capabilities.
   - Pros: clear semantic name, aligns with operational readiness, not transport-only like `ping`.
   - Cons: one more tool to document and test.
   - Effort: Low.

2. **Add `ping` as a minimal probe** — return only a pong-style acknowledgement.
   - Pros: smallest possible surface.
   - Cons: too transport-y, does not help installers distinguish readiness states, and invites future rework.
   - Effort: Low.

## Recommendation

Use **`health`** (not `ping`) and keep it side-effect-free. The tool should return `ok: true`, `status: "operational"`, and capability/readiness flags when the server is live. Keep `recover_context` responsible for `not_found` vs `ambiguous`. Normalize real read/persistence failures into explicit error codes such as `read_error` / `persistence_error` so consumers can tell them apart from “no context”.

## Risks

- If error codes stay implicit, bootstrap logic will keep guessing between “no context” and “the server is broken”.
- If the probe becomes a deep DB check, it can stop being side-effect-free or become too slow for startup gating.
- If README and installer docs drift, VS Code setup will still feel manual even after the tool exists.

## Ready for Proposal

Yes. The next step is a small OpenSpec delta that adds the `health` contract, the error taxonomy, and the VS Code stdio configuration guidance.
