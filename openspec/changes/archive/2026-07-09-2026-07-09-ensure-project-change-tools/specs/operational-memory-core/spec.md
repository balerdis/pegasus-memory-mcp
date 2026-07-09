# Delta for Operational Memory Core

## ADDED Requirements

### Requirement: Project Bootstrap Is Idempotent

The system MUST expose `ensure_project` to create or confirm a project using a stable `project_id`/`key`. It MAY accept optional `name`, `workspace_root`, and `description` metadata. Repeated calls with the same stable key MUST return the existing project row and MUST NOT destructively overwrite stored metadata. The MCP input contract MUST use `project_id` for the stable project identifier.

#### Scenario: Existing project is confirmed

- GIVEN a project already exists for the supplied stable key
- WHEN `ensure_project` is called with the same key
- THEN the existing project is returned
- AND its stored metadata is preserved

#### Scenario: Missing project is created

- GIVEN no project exists for the supplied stable key
- WHEN `ensure_project` is called with that key
- THEN the project is created and returned
- AND the returned row can be used for later change-scoped writes

#### Scenario: Project bootstrap schema is stable

- GIVEN a consumer prepares a bootstrap call
- WHEN `ensure_project` is called
- THEN the call MUST require `project_id`
- AND MAY include `key`, `name`, `workspace_root`, and `description`

### Requirement: Change Bootstrap Requires an Ensured Project

The system MUST expose `ensure_change` to create or confirm a change using `project_id` plus a stable `change_id`. It MAY accept optional `key`, `title`, `status`, `kind`/`type`, and `description` metadata. The system MUST NOT implicitly create a project. If the parent project is missing, it MUST fail with `precondition_failed` and `basis: project_not_found`; the error message MUST be clear and MUST NOT expose raw SQLite foreign-key details.

#### Scenario: Existing change is confirmed

- GIVEN the project exists and a change already exists for the stable change ID
- WHEN `ensure_change` is called
- THEN the existing change is returned idempotently
- AND its stored metadata is preserved

#### Scenario: Missing project is rejected

- GIVEN the project does not exist
- WHEN `ensure_change` is called with that project ID
- THEN the call fails with `precondition_failed`
- AND `basis` is `project_not_found`
- AND no raw database FK error is exposed

#### Scenario: Change bootstrap schema is stable

- GIVEN a consumer prepares a change bootstrap call
- WHEN `ensure_change` is called
- THEN the call MUST require `project_id` and `change_id`
- AND MAY include `key`, `title`, `status`, `kind`, `type`, and `description`
