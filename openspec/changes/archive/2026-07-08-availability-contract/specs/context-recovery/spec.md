# Delta for Context Recovery

## ADDED Requirements

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
