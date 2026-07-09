## Verification Report

**Change**: 2026-07-09-ensure-project-change-tools
**Slice**: 1 / PR 1 — core, SQLite, migration, and integration tests only
**Version**: N/A
**Mode**: Standard
**Verified at**: 2026-07-09

### Scope

Verified only the claimed Slice 1 tasks:

- 1.1 metadata fields + lookup contracts
- 1.2 SQLite migration v2
- 1.3 ensure-bootstrap lookup-before-save use case + `project_not_found` precondition
- 2.1 SQLite ensure helpers returning existing rows unchanged
- 3.2 integration tests for migration, metadata round trip, preserved rows, and missing-project rejection

The following tasks remain intentionally out of scope for this slice: MCP `ensure_project` / `ensure_change` handlers and schemas, `health.capabilities.parent_bootstrap`, MCP adapter tests, README docs, and final spec/docs updates.

### Completeness

| Metric | Value |
|--------|-------|
| Slice 1 tasks total | 5 |
| Slice 1 tasks complete | 5 |
| Whole-change tasks total | 10 |
| Whole-change tasks complete | 5 |
| Whole-change tasks incomplete | 5 |

### Build & Tests Execution

**Typecheck**: ✅ Passed

```text
npm run typecheck
> tsc -p tsconfig.json --noEmit
```

**Integration tests**: ✅ 9 passed

```text
npm run test:integration
Test Files  2 passed (2)
Tests       9 passed (9)
```

**Full test suite**: ✅ 26 passed

```text
npm test
Test Files  6 passed (6)
Tests       26 passed (26)
```

**Build**: ✅ Passed

```text
npm run build
> rm -rf dist && tsc -p tsconfig.json && chmod +x dist/bin/pegasus-memory-mcp.js
```

**Whitespace check**: ✅ Passed

```text
git diff --check
```

**Coverage**: ➖ Not available; no coverage command is configured in `package.json`.

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Project Bootstrap Is Idempotent | Existing project is confirmed | `tests/integration/sqlite-persistence.test.ts` > `ensures projects and changes without mutating existing metadata` | ✅ COMPLIANT for core/storage slice |
| Project Bootstrap Is Idempotent | Missing project is created | `tests/integration/sqlite-persistence.test.ts` > `creates missing bootstrap rows and rejects change ensure when the project is missing` | ✅ COMPLIANT for core/storage slice |
| Change Bootstrap Requires an Ensured Project | Existing change is confirmed | `tests/integration/sqlite-persistence.test.ts` > `ensures projects and changes without mutating existing metadata` | ✅ COMPLIANT for core/storage slice |
| Change Bootstrap Requires an Ensured Project | Missing project is rejected | `tests/integration/sqlite-persistence.test.ts` > `creates missing bootstrap rows and rejects change ensure when the project is missing` | ✅ COMPLIANT for core/storage slice |
| Bootstrap Capability Flags Are Discoverable | Healthy server advertises bootstrap support | Not in Slice 1 | ⚠️ OUT OF SCOPE |
| Fresh-Workspace Bootstrap Sequence Is Supported | Empty workspace follows the bootstrap path | Not in Slice 1 | ⚠️ OUT OF SCOPE |

**Compliance summary**: 4/4 Slice 1 applicable scenarios compliant; 2 scenarios intentionally deferred to Slice 2.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Add nullable metadata fields | ✅ Implemented | `Project.description`, `Change.description`, and `Change.kind` are present in `src/core/entities/index.ts`; SQLite mapping persists and reads them. |
| Add lookup contracts | ✅ Implemented | `MemoryRepository` includes `getProjectById`, `getProjectByKey`, `getChangeById`, and `getChangeByProjectAndKey`. |
| Add SQLite migration v2 | ✅ Implemented | `migrations/002_bootstrap_metadata.sql` adds only nullable columns; runner applies versions 1 and 2 transactionally. |
| Lookup-before-save ensure behavior | ✅ Implemented | `createBootstrapEnsurer` checks project/change existence before `saveProject` / `saveChange`, preventing metadata overwrite on existing rows. |
| Missing project precondition | ✅ Implemented | `ensureChange` returns `{ ok: false, status: "precondition_failed", basis: "project_not_found", confirmationRequired: false }` before any change save. |
| SQLite ensure helpers preserve existing rows | ✅ Implemented | `SQLiteMemoryStore.ensureProject` / `ensureChange` return existing rows before save. |
| Metadata round trip and preservation tests | ✅ Implemented | Integration tests cover v2 migration columns, metadata persistence, preserved existing metadata, created rows, and missing-project rejection without FK wording. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Explicit MCP tools, not auto-created parents | ⚠️ Deferred | MCP tool exposure is intentionally not part of Slice 1. Core `ensureChange` does not auto-create projects. |
| Lookup first and only save when missing | ✅ Yes | Implemented in `src/core/use-cases/ensure-bootstrap.ts`; integration tests prove existing metadata is preserved. |
| Add nullable `description` and `kind` metadata | ✅ Yes | Entity, SQLite schema, persistence mapping, and tests align. |
| Non-destructive migration | ✅ Yes | v2 only adds nullable columns and does not backfill or alter existing data. |
| Health advertises `parent_bootstrap` | ⚠️ Deferred | Intentionally out of Slice 1; existing MCP health still reports recovery/search/write only. |

### Issues Found

**CRITICAL**: None for Slice 1.

**WARNING**: Whole-change archive is not ready because MCP tool wiring, health capability flag, MCP adapter tests, README documentation, and final spec/docs updates remain intentionally incomplete.

**SUGGESTION**: In Slice 2, add adapter-level tests that prove the public MCP response shape preserves the same stable `precondition_failed` / `project_not_found` contract and does not leak SQLite FK details.

### Verdict

PASS for Slice 1 / PR 1.

Slice 1 satisfies the spec portions it can satisfy before MCP wiring: core/storage idempotency, lookup-before-save behavior, metadata preservation, non-destructive migration, and missing-project precondition handling are implemented and covered by passing runtime tests.
