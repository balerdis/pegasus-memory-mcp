# Delta for Context Recovery

## ADDED Requirements

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
