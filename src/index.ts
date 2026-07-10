export const packageName = "pegasus-memory-mcp";
export const packageVersion = "0.1.0";
export const productName = "Pegasus Memory MCP";

export type * from "./core/entities/index.js";
export type * from "./core/ports/index.js";
export { defaultReviewAfter, evaluateFreshness } from "./core/freshness/index.js";
export { createMemoryWriter } from "./core/use-cases/write-memory.js";
export { createBootstrapEnsurer } from "./core/use-cases/ensure-bootstrap.js";
export type { EnsureChangeInput, EnsureChangeResult, EnsureProjectInput, EnsureProjectResult } from "./core/use-cases/ensure-bootstrap.js";
export { purgeAllCleanup, resetProjectCleanup } from "./core/use-cases/cleanup.js";
export { getActiveContext, recoverContext } from "./core/use-cases/recovery.js";
export { createSQLiteMemoryStore, defaultDatabasePath, defaultDatabaseTargets, openSQLiteDatabase, purgeOwnedSQLiteStorage, resetProjectData, runMigrations } from "./adapters/sqlite/index.js";
export type { SQLiteMemorySearchInput, SQLiteMemorySearchResult } from "./adapters/sqlite/index.js";
export { createMcpToolHandlers, createPegasusMcpServer, toolSchemas } from "./adapters/mcp/index.js";
export type { McpAdapterRuntime, RecentEventReader } from "./adapters/mcp/index.js";
