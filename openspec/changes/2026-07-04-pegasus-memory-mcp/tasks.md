# Tasks: Pegasus Memory MCP

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,200-1,800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 foundation → PR 2 core → PR 3 SQLite → PR 4 MCP/CLI |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Package, TypeScript, test runner, base layout | PR 1 | Enables verified development without domain behavior. |
| 2 | Core entities, ports, freshness, recovery ranking | PR 2 | No MCP SDK or SQLite imports in `src/core`. |
| 3 | SQLite persistence, migrations, FTS5 | PR 3 | Temp DB integration tests included. |
| 4 | MCP tools, CLI/bin, package metadata | PR 4 | Contract tests and CLI smoke included. |

## Phase 1: Foundation and Tooling

- [x] 1.1 Create `package.json` for package `pegasus-memory-mcp`, product metadata `Pegasus Memory MCP`, bin `pegasus-memory-mcp`, and scripts for build/test/typecheck.
- [x] 1.2 Add TypeScript/Node tooling: `tsconfig.json`, `src/` layout, build output config, and dependencies `@modelcontextprotocol/sdk`, `zod`, `better-sqlite3`, test tooling.
- [x] 1.3 Add `tests/` configuration for unit, integration, MCP contract, and CLI smoke tests; document exact commands in package scripts.

## Phase 2: Core Domain and Recovery Logic

- [ ] 2.0 Add and commit the npm lockfile (`package-lock.json`) so installs are reproducible before adding core behavior.
- [ ] 2.1 Create `src/core/entities/` for projects, changes, sessions, memory records, artifacts, handoffs, task progress, events, and lifecycle metadata.
- [ ] 2.2 Create `src/core/ports/` with `MemoryRepository`, `SearchIndex`, `Clock`, and `IdGenerator`; forbid SDK/SQLite coupling in core.
- [ ] 2.3 Implement `src/core/freshness/` defaults: decisions 180d, observations 90d, handoffs 30d, task progress 14d, artifact explicit-state staleness.
- [ ] 2.4 Implement core write use cases for observations, decisions, handoffs, artifacts, and task progress, including event append contracts.
- [ ] 2.5 Implement active-context and recovery ranking use cases with active-change preference, deterministic score gap, ambiguity candidates, and consumer-controlled confirmation.
- [ ] 2.6 Test freshness signals, event-not-authority behavior, ranking, ambiguity, and write contract behavior from both specs.

## Phase 3: SQLite Persistence and Search

- [ ] 3.1 Add `migrations/001_initial.sql` with `schema_migrations`, source tables, lifecycle columns, `event`, and `memory_fts` using SQLite FTS5.
- [ ] 3.2 Implement `src/adapters/sqlite/` repositories, migration runner, transactions, default DB creation, and FTS updates in the same transaction as source writes.
- [ ] 3.3 Implement project/change filtering, source-table joins, recency decoration, and freshness decoration for `search_memory`.
- [ ] 3.4 Test migrations, transaction rollback, FTS filtering/join correctness, missing manifest tolerance, and stale manifest non-authority with temp SQLite DBs.

## Phase 4: MCP Adapter, CLI, and Packaging

- [ ] 4.1 Add `src/adapters/mcp/` Zod schemas and handlers for `record_observation`, `record_decision`, `record_handoff`, `record_artifact`, `record_task_progress`, `get_active_context`, `recover_context`, `search_memory`, `list_recent_changes`, and `list_recent_events`.
- [ ] 4.2 Map MCP errors/responses without moving business rules into adapters; expose stale, needs-review, confirmation-needed, and ambiguous metadata.
- [ ] 4.3 Add `src/bin/pegasus-memory-mcp` startup over stdio with default DB path `~/.local/share/pegasus-memory-mcp/memory.db` and env/config override.
- [ ] 4.4 Test MCP validation/response contracts and CLI smoke startup against the configured bin.
- [ ] 4.5 Keep `"private": true` during implementation; remove it only in an explicit packaging/release task when the package is ready to publish.

## Phase 5: Verification and Documentation

- [ ] 5.1 Update README or package docs with install/run, bin name, default DB path, and manifest optionality.
- [ ] 5.2 Run `npm test`, `npm run typecheck`, `npm run build`, and CLI smoke once scripts exist.
- [ ] 5.3 Run `openspec validate 2026-07-04-pegasus-memory-mcp --strict` and record the result before apply/verify handoff.
