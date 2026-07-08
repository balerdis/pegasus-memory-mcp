#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { packageName, packageVersion, productName, createMemoryWriter, createSQLiteMemoryStore, defaultDatabasePath } from "../index.js";
import { createPegasusMcpServer } from "../adapters/mcp/index.js";

export interface RuntimeConfig {
  databasePath: string;
  smokeStart: boolean;
}

export function resolveRuntimeConfig(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const dbFlagIndex = args.indexOf("--db");
  const dbFromFlag = dbFlagIndex >= 0 ? args[dbFlagIndex + 1] : undefined;
  return {
    databasePath: dbFromFlag ?? env.PEGASUS_MEMORY_DB_PATH ?? defaultDatabasePath(env.HOME),
    smokeStart: args.includes("--smoke-start")
  };
}

export async function runCli(args: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (args.includes("--version")) {
    console.log(packageName);
    return 0;
  }

  if (args.includes("--help")) {
    console.log(`${productName} (${packageName})`);
    return 0;
  }

  const config = resolveRuntimeConfig(args, env);
  const defaultDbPath = defaultDatabasePath(env.HOME);
  const store = createSQLiteMemoryStore({ databasePath: config.databasePath });
  const clock = { now: () => new Date() };
  const ids = { generate: (prefix: string) => `${prefix}-${randomUUID()}` };
  const writer = createMemoryWriter(store, store, clock, ids);

  if (config.smokeStart) {
    store.close();
    return 0;
  }

  const server = createPegasusMcpServer({
    repository: store,
    searchIndex: store,
    searchable: store,
    eventReader: store,
    writer,
    clock,
    metadata: {
      serverName: packageName,
      version: packageVersion,
      defaultDbPath,
      ...(config.databasePath !== defaultDbPath ? { configuredDbPath: config.databasePath } : {})
    }
  });
  await server.connect(new StdioServerTransport());
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
