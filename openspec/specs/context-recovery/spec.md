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
