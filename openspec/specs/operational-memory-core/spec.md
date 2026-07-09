# Operational Memory Core

## Purpose

Define local operational memory writes for projects, changes, sessions, events, artifacts, decisions, handoffs, task progress, freshness metadata, and optional manifest import/export.

## Requirements

### Requirement: Local Operational Records

The system MUST persist operational memory for a project using generic project/change/session concepts and MUST NOT require Pegasus-specific workflow names. The MVP MUST run as a TypeScript/Node MCP server over stdio, and behavior MUST preserve a strong separation between core memory logic, MCP transport/adapters, and persistence/search storage.

#### Scenario: Store project-scoped memory

- GIVEN a caller records memory for a project and change
- WHEN the record is accepted
- THEN the memory is associated with that project/change/session context
- AND it can be recovered without relying on a raw transcript

#### Scenario: Reject transport coupling in behavior

- GIVEN the same core operation is invoked through an MCP tool
- WHEN the operation is processed
- THEN business behavior is defined by the core memory contract
- AND not by MCP transport or database-specific details

### Requirement: Write Tool Surface

The system MUST expose behavior-level MCP write tools: `record_observation`, `record_decision`, `record_handoff`, `record_artifact`, and `record_task_progress`. Each successful write MUST create recoverable state and SHOULD append an event suitable for audit/history.

#### Scenario: Record a decision

- GIVEN a caller submits a decision with rationale and scope
- WHEN `record_decision` succeeds
- THEN the decision is available to recovery and search
- AND its freshness metadata is returned on later reads

#### Scenario: Record task progress

- GIVEN a caller submits task status, blockers, or completion notes
- WHEN `record_task_progress` succeeds
- THEN later recovery can resume from that progress
- AND recent event history reflects that progress update

### Requirement: Freshness Metadata

The system MUST track freshness metadata for observations and decisions, including review timing where available. Records past their review deadline MUST be returned with stale/needs_review/confirm_before_relying equivalent signals.

#### Scenario: Fresh record remains trusted context

- GIVEN an observation has not passed its review deadline
- WHEN it is returned by recovery or search
- THEN the response marks it as current or not stale

#### Scenario: Expired decision requires confirmation

- GIVEN a decision has passed its review deadline
- WHEN it is returned by recovery or search
- THEN the response includes a stale/needs_review signal
- AND indicates consumers should confirm before relying on it

### Requirement: Events Are Audit History

The system MUST preserve events as append-only operational history and MUST NOT treat events alone as current decision truth.

#### Scenario: Event does not override a decision

- GIVEN an event mentions an earlier choice
- WHEN current context is requested
- THEN durable decisions and handoffs define current truth
- AND the event is exposed only as historical evidence

### Requirement: Optional Manifest Integration

The system MAY import from or export to `manifest.json` for bootstrap or compatibility, but the product MUST work when the manifest is missing or stale.

#### Scenario: Missing manifest

- GIVEN no `manifest.json` exists
- WHEN memory is written or recovered
- THEN the system uses its internal operational state
- AND does not fail because the manifest is absent

#### Scenario: Stale manifest

- GIVEN `manifest.json` conflicts with newer internal memory
- WHEN recovery needs current context
- THEN internal memory remains authoritative
- AND manifest data is treated only as optional input or output

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
