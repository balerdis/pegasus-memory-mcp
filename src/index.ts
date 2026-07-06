export const packageName = "pegasus-memory-mcp";
export const productName = "Pegasus Memory MCP";

export type * from "./core/entities/index.js";
export type * from "./core/ports/index.js";
export { defaultReviewAfter, evaluateFreshness } from "./core/freshness/index.js";
export { createMemoryWriter } from "./core/use-cases/write-memory.js";
export { getActiveContext, recoverContext } from "./core/use-cases/recovery.js";
export { createSQLiteMemoryStore, defaultDatabasePath, openSQLiteDatabase, runMigrations } from "./adapters/sqlite/index.js";
export type { SQLiteMemorySearchInput, SQLiteMemorySearchResult } from "./adapters/sqlite/index.js";
