# Exploration Addendum: Memory Model and Recovery

## Engram-like concepts to keep for MVP

Keep the smallest set of concepts that make recovery useful:

- `project` — stable workspace identity.
- `change` — the named active work item inside a project.
- `session` — one agent run or recovery window.
- `handoff` — the latest compact recovery note.
- `decision` — durable rationale with tradeoffs.
- `artifact` — pointers/summaries for PRD, proposal, spec, design, tasks, verify.
- `task_progress` — enough state to resume work safely.
- `event` — append-only timeline for audit and reconstruction.

Also keep lightweight search over operational text so the server can answer "what was I doing?" without semantic overreach.

## What to avoid to keep the project small

Do not ship the Engram parts that are valuable but not essential for MVP:

- embeddings / semantic vector search
- cross-project intelligence
- sync / collaboration / multi-device replication
- analytics / reporting dashboards
- raw chat transcript storage as a first-class product surface
- permissioning / sharing / review workflows
- pin / judge / social-style memory controls unless later proven necessary
- Pegasus-specific filenames or workflow assumptions in the core model

## Active change recovery when multiple changes exist

The MCP should maintain its own internal project/change state and treat that as the source of truth.

Recommended recovery order:

1. Resolve the project.
2. Use the stored active change for that project if present.
3. Otherwise rank recent changes by last touched, active flag, and phase completeness.
4. If one change is still clearly best, recover it automatically.
5. If ambiguity remains, ask one concise clarifying question and show only the candidate changes.

The key constraint: recovery must be deterministic when it can be, and must not force the user to understand internal organization.

## manifest.json vs internal state

`manifest.json` should **not** be the sole source of truth.

Use this split instead:

- **Internal MCP state**: authoritative source for project, change, session, and recovery data.
- **Optional manifest integration**: bootstrap input, import/export hint, or compatibility layer.

Why: multiple active changes, recovery windows, and durable handoffs are MCP concerns; making users rely on a manifest couples product behavior to a file that may not express the full recovery state.

## Product-level success criteria for PRD

The PRD should consider the MVP successful if:

- A user can recover the right project/change context from a cold start without manual state reconstruction.
- When exactly one change is active, recovery is automatic and correct.
- When multiple changes exist, recovery resolves deterministically or asks at most one clarifying question.
- The system stays generic across projects and does not expose Pegasus-only concepts in the core contract.
- The server preserves durable decisions, handoffs, and task progress, not just metadata.
- `manifest.json` can help, but the product still works if it is missing or stale.
- The MVP remains small: local-first, fast, and focused on operational recovery rather than full Engram parity.

## Recommendation

Proceed with an internal project/change/session state model, optional manifest integration, and a strict MVP boundary around recovery-oriented operational memory.
