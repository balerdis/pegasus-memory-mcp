# Context Recovery

## Purpose

Define read-side behavior for recovering active context, searching local operational memory, listing recent changes/events, surfacing stale signals, and handling ambiguous recovery.

## Requirements

### Requirement: Active Context Retrieval

The system MUST expose `get_active_context` to return the best current project/change context bundle, including latest relevant handoff, decisions, artifacts, task progress, phase/status where known, and freshness signals.

#### Scenario: Active change exists

- GIVEN a project has a stored active change
- WHEN `get_active_context` is called
- THEN the response returns that change first
- AND includes enough context for an agent to resume safely

#### Scenario: Stale decision in active context

- GIVEN active context includes a decision past review deadline
- WHEN context is returned
- THEN that decision includes stale/needs_review metadata
- AND the MCP response exposes the signal without asking the user itself

### Requirement: Context Recovery Ranking

The system MUST expose `recover_context` to recover from cold start or lost context. It MUST prefer stored active state, then deterministic ranking by recency, active status, and phase/task completeness. It MUST ask for clarification only when ambiguity remains.

#### Scenario: Deterministic recovery

- GIVEN no active change pointer exists but one change ranks clearly highest
- WHEN `recover_context` is called
- THEN the system returns that change automatically
- AND explains the recovery basis in behavior-level metadata

#### Scenario: Ambiguous recovery

- GIVEN multiple changes remain equally plausible after ranking
- WHEN `recover_context` is called
- THEN the response marks recovery as ambiguous
- AND returns only concise candidate choices for the consuming agent to ask once

### Requirement: Local Memory Search

The system MUST expose `search_memory` for project-scoped search over operational memory text using local SQLite + FTS5 search capability. Search results MUST include record type, scope, recency, and freshness/staleness signals where relevant.

#### Scenario: Search decisions and handoffs

- GIVEN decisions, handoffs, artifacts, observations, and task notes exist
- WHEN `search_memory` is called with a query
- THEN matching operational records are returned for the requested scope
- AND raw chat transcripts are not required as a first-class search source

#### Scenario: Search returns stale result

- GIVEN a matching observation is past its review deadline
- WHEN it appears in search results
- THEN the result includes stale/confirm-before-relying metadata

### Requirement: Recent Change and Event Lists

The system MUST expose `list_recent_changes` and `list_recent_events`. Recent changes SHOULD help users choose or inspect active work; recent events MUST be presented as audit/history, not current decision authority.

#### Scenario: List recent changes

- GIVEN several changes exist for a project
- WHEN `list_recent_changes` is called
- THEN the response orders useful recent candidates deterministically
- AND includes status/last-touched context sufficient for selection

#### Scenario: List recent events

- GIVEN operational events were appended over time
- WHEN `list_recent_events` is called
- THEN the response returns bounded audit history
- AND does not imply events supersede durable decisions

### Requirement: Consumer-Controlled Confirmation

The MCP server MUST expose stale, needs-review, confirmation-needed, and ambiguity signals, but MUST NOT decide conversational confirmation policy for the consuming agent.

#### Scenario: Agent decides whether to ask

- GIVEN a recovery response contains stale or ambiguous signals
- WHEN the consuming agent receives the response
- THEN the MCP has provided enough metadata to ask the user if needed
- AND the MCP itself has not performed user confirmation

### Requirement: Side-Effect-Free Health Probe

The system MUST expose a side-effect-free `health` MCP tool that returns an operational snapshot when the server is reachable. The response MUST be generic enough for standalone MCP consumers to rely on it without Pegasus-specific coupling.

#### Scenario: Healthy server reports readiness

- GIVEN the MCP server is running and reachable
- WHEN `health` is called
- THEN the response indicates `ok` and an operational status
- AND includes capability flags for recovery, search, and write surfaces

#### Scenario: Health does not change memory

- GIVEN any recoverable memory state exists
- WHEN `health` is called repeatedly
- THEN no recoverable state is created, updated, or consumed
- AND the result stays independent from manifest presence

### Requirement: Bootstrap Capability Flags Are Discoverable

The system MUST include capability flags in `health` that let consumers detect `recovery`, `search`, `write`, and `parent_bootstrap` support. The presence of `parent_bootstrap` MUST indicate that `ensure_project` and `ensure_change` are available for the current server.

#### Scenario: Healthy server advertises bootstrap support

- GIVEN the server is reachable
- WHEN `health` is called
- THEN the response includes `recovery`, `search`, `write`, and `parent_bootstrap` capability flags
- AND the consumer can choose a bootstrap path without guessing

### Requirement: Fresh-Workspace Bootstrap Sequence Is Supported

The system MUST support the recommended cold-start order `health -> recover_context -> ensure_project -> ensure_change -> record_artifact / record_observation`. When no recoverable context exists, `recover_context` MUST return `not_found` so the consumer can bootstrap parents before writing.

#### Scenario: Empty workspace follows the bootstrap path

- GIVEN the server is reachable and no recoverable context exists
- WHEN `health` is called and then `recover_context` is called
- THEN `health` reports the bootstrap capability flag
- AND `recover_context` returns `not_found`
- AND the consumer can proceed to `ensure_project` and `ensure_change` before writes

### Requirement: Explicit Availability and Recovery States

The system MUST distinguish unavailable MCP process/tool access, available-but-empty context, available-but-ambiguous recovery, and available-but-failed read or persistence operations. `recover_context` MUST return `not_found` when no recoverable context exists and `ambiguous` when recovery cannot be resolved deterministically.

#### Scenario: No recoverable context

- GIVEN the server is reachable and has no recoverable context
- WHEN `recover_context` is called
- THEN the response is `not_found`
- AND it does not masquerade as a transport or persistence failure

#### Scenario: Ambiguous recovery

- GIVEN multiple stored contexts remain equally plausible
- WHEN `recover_context` is called
- THEN the response is `ambiguous`
- AND it returns only concise candidates for consumer follow-up

#### Scenario: Read or persistence failure

- GIVEN the server is reachable but storage read or persistence access fails
- WHEN `recover_context` or `search_memory` is called
- THEN the response returns an explicit error state distinct from `not_found` and `ambiguous`

#### Scenario: MCP process or tool is unavailable

- GIVEN the MCP process is missing or the tool cannot be invoked
- WHEN a consumer probes availability
- THEN the failure is detected outside the normal tool response
- AND the server does not report a false recovery state
