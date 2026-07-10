# Delta for Operational Memory Core

## ADDED Requirements

### Requirement: Project Reset Command Contract

The system MUST expose `reset --project <project_id>` for project-scoped cleanup. It MUST require the exact confirmation flag for destructive execution, MUST support `--dry-run`, and MUST delete only the selected project's data from the active/configured database. Reset MUST explicitly remove matching `memory_fts` rows for that project and MUST NOT delete DB files, other projects, unrelated records, or arbitrary paths.

#### Scenario: Dry-run describes project reset

- GIVEN a project exists in the active database
- WHEN `reset --project <project_id> --dry-run` is called
- THEN the command prints the planned targets and deletion scope
- AND it exits 0 without mutating data

#### Scenario: Missing project is a no-op

- GIVEN the target project does not exist
- WHEN reset is executed with the confirmation flag
- THEN the command exits 0
- AND it reports a no-op result

### Requirement: Purge All Command Contract

The system MUST expose `purge --all` for full cleanup of Pegasus-owned default storage. It MUST require the exact confirmation flag for destructive execution, MUST support `--dry-run`, and MUST delete only Pegasus-owned default database paths and SQLite sidecars. Purge MUST NOT delete arbitrary custom `--db` or `PEGASUS_MEMORY_DB_PATH` locations, user files, or workspace data.

#### Scenario: Dry-run describes purge scope

- GIVEN the server can resolve its owned default storage locations
- WHEN `purge --all --dry-run` is called
- THEN the command prints the planned filesystem targets
- AND it exits 0 without deleting anything

#### Scenario: Custom database path is preserved

- GIVEN a custom database path is configured
- WHEN `purge --all` is executed with the confirmation flag
- THEN the custom path is not deleted
- AND only Pegasus-owned default paths are eligible for removal

### Requirement: Stable Maintenance Output and Exit Codes

The system MUST emit stable maintenance status output for reset and purge commands using consistent fields for command, mode, targets, deleted, skipped, and status. Successful execution, dry-run, and no-op outcomes MUST exit 0. Usage, validation, or real operational failures MUST exit non-zero.

#### Scenario: Successful no-op returns success

- GIVEN a destructive command finds nothing to delete
- WHEN the command completes
- THEN the status output marks the result as no-op
- AND the process exits 0

#### Scenario: Invalid invocation fails

- GIVEN the command is missing the required confirmation or target flag
- WHEN it is executed
- THEN the command reports a usage or validation error
- AND it exits non-zero
