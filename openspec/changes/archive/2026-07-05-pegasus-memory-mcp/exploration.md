# Exploration: pegasus-memory-mcp

## Current State

Pegasus IA Bootstrap already treats `docs/pegasus/memory/` as the continuity layer and enforces a `PRD -> proposal -> spec -> design -> tasks -> apply -> verify` workflow. That is the right reference point for a memory server, but the new project should stay smaller: recover operational context by `project/change`, not mirror the full Pegasus workflow or become a full Engram clone.

### MVP scope

- Persist the current project, active change, session, phase, artifact pointers, decisions, handoffs, task progress, and append-only events.
- Recover the latest useful context bundle automatically when context is lost.
- Support fast, local search and recent-context retrieval.
- Stay local-first and opaque about internal organization.
- Exclude embeddings, sync, collaboration, analytics, and cross-project intelligence from MVP.

### Initial data model

| Entity | Purpose |
|---|---|
| `project` | Stable workspace identity and display metadata. |
| `change` | Active named work item under a project; tracks status and active/recovery pointers. |
| `session` | One agent run or recovery window. |
| `phase` | Lifecycle stage marker (`prd`, `proposal`, `spec`, `design`, `tasks`, `apply`, `verify`, `handoff`). |
| `artifact` | File pointers, summaries, or snapshots tied to a phase or change. |
| `decision` | Durable rationale with tradeoffs and timestamps. |
| `handoff` | Current recovery note for the next session. |
| `task_progress` | Slice/task status, blockers, and completion notes. |
| `event` | Append-only operational log for changes, recoveries, and state transitions. |

### MCP API surface candidates

**Persistence tools**

- `upsert_project`
- `upsert_change`
- `start_session`
- `set_active_change`
- `record_phase`
- `record_artifact`
- `record_decision`
- `record_handoff`
- `record_task_progress`
- `append_event`

**Retrieval tools**

- `get_active_context`
- `recover_context`
- `search_memory`
- `list_recent_changes`
- `list_recent_events`

**Resource candidates**

- `memory://project/{project_key}`
- `memory://project/{project_key}/change/{change_key}`
- `memory://session/{session_id}`
- `memory://recover/{project_key}`

### SQLite + FTS5 query strategy

- Keep normalized tables for identity, lifecycle state, timestamps, and foreign keys.
- Add FTS5 over human-authored text fields only: titles, summaries, notes, decision rationale, handoff text, blocker text, and artifact descriptions.
- Weight title/summary higher than body text; combine FTS score with recency and active-status boosts.
- Filter first by `project_key` and `change_key`, then rank by recency and phase relevance.
- Index only operational memory, not raw chat transcripts or code.
- Use append-only event rows for auditability, then derive the current recovery bundle from the latest durable state.

### Agent recovery flow

1. Resolve the workspace/project automatically from the local config or current directory.
2. Load the active change for that project.
3. Pull the latest handoff, decisions, task progress, phase state, and recent events.
4. Rank by `project_key + change_key + recency + active flag`.
5. Return a compact recovery bundle first; ask the user only if multiple changes remain genuinely ambiguous.

### Runtime evaluation

| Runtime | Fit | Notes |
|---|---|---|
| TypeScript / Node | Best overall | Strongest MCP SDK maturity and examples; good fit for tools/resources/prompts; packaging via npm/pnpm is straightforward enough for a small local server. |
| Python | Fastest to prototype | SQLite support is trivial and local scripting is easy, but the MCP SDK docs show more beta/pre-release packaging friction than TS. |
| Go | Best single-binary story | Great distribution and performance, but smaller MCP ecosystem/ergonomics and more boilerplate for a tiny server. |

## Affected Areas

- `PRD-bootstrap-cli-lifecycle.md`, `README.md`, `handoff.md`, `openspec/config.yaml`, `openspec/specs/pegasus-harness-bootstrap/spec.md` — evidence for local-first lifecycle, project/change recovery, and memory conventions.
- `openspec/changes/2026-07-04-pegasus-memory-mcp/exploration.md` — this exploration artifact.
- New repo (`pegasus-memory-mcp`) — likely future `src/`, `migrations/`, and packaging files, but no implementation yet.

## Approaches

1. **Minimal SQLite + FTS5 memory core** — Store only operational memory and recoverable context, with generic project/change/session/phase primitives.
   - Pros: smallest MVP, easiest to reason about, low operational cost, fast local retrieval.
   - Cons: no semantic recall and no cross-project intelligence.
   - Effort: Low/Medium.

2. **SQLite + FTS5 plus semantic enrichment later** — Start with the minimal core, then add embeddings or graph-like relationships if retrieval quality proves insufficient.
   - Pros: keeps MVP focused while preserving a path to richer recall.
   - Cons: extra design work later; easy to overbuild too early.
   - Effort: Medium.

## Recommendation

Build the **minimal SQLite + FTS5 memory core first** and ship it as a **TypeScript/Node MCP server**. That gives the best balance of MCP SDK maturity, local-agent friendliness, and enough performance for persistence/retrieval workloads. Keep the schema generic (`project`, `change`, `session`, `phase`, `artifact`, `decision`, `handoff`, `task_progress`, `event`) so Pegasus can integrate without the server knowing Pegasus-specific filenames or workflow internals.

## Risks

- Overfitting the schema to Pegasus file names instead of keeping opaque project/change identifiers.
- Underestimating recovery ambiguity when multiple changes are active in the same workspace.
- Letting FTS5 become a dumping ground for everything instead of limiting it to operational text.
- Picking a runtime for installation convenience without checking the actual local execution environment.

## Ready for Proposal

Yes. The proposal should define the exact MVP boundary, the generic persistence/recovery contract, and the first runtime choice (`TypeScript/Node`) without coupling the server to Pegasus internals.
