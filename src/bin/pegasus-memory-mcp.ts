#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { randomUUID } from "node:crypto";
import { packageName, packageVersion, productName, createMemoryWriter, createSQLiteMemoryStore, defaultDatabasePath, purgeAllCleanup, purgeOwnedSQLiteStorage, resetProjectCleanup, resetProjectData, type MaintenanceResult } from "../index.js";
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
  const maintenance = await dispatchMaintenanceCommand(args, env);
  if (maintenance) {
    if (maintenance.exitCode === 0) {
      console.log(JSON.stringify(maintenance.result));
    } else {
      console.error(JSON.stringify(maintenance.result));
    }
    return maintenance.exitCode;
  }

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

async function dispatchMaintenanceCommand(args: string[], env: NodeJS.ProcessEnv): Promise<{ exitCode: number; result: MaintenanceResult } | undefined> {
  const command = args[0];
  if (command !== "reset" && command !== "purge") {
    return undefined;
  }

  try {
    if (command === "reset") {
      return { exitCode: 0, result: await runResetCommand(args.slice(1), env) };
    }
    return { exitCode: 0, result: await runPurgeCommand(args.slice(1), env) };
  } catch (error) {
    const validation = error instanceof MaintenanceCliError ? error : undefined;
    return {
      exitCode: validation?.exitCode ?? 1,
      result: {
        command,
        mode: args.includes("--dry-run") ? "dry_run" : "execute",
        targets: [],
        deleted: [],
        skipped: [{ target: command, reason: validation?.message ?? errorMessage(error) }],
        status: "error"
      }
    };
  }
}

async function runResetCommand(args: string[], env: NodeJS.ProcessEnv): Promise<MaintenanceResult> {
  const projectId = flagValue(args, "--project");
  if (!projectId) {
    throw new MaintenanceCliError("missing_project", 2);
  }
  const mode = resolveMaintenanceMode(args, "--yes");
  const config = resolveRuntimeConfig(args, env);
  return resetProjectCleanup({
    projectId,
    databasePath: config.databasePath,
    mode,
    maintenance: { resetProjectData }
  });
}

async function runPurgeCommand(args: string[], env: NodeJS.ProcessEnv): Promise<MaintenanceResult> {
  if (!args.includes("--all")) {
    throw new MaintenanceCliError("missing_all", 2);
  }
  const mode = resolveMaintenanceMode(args, "--yes-i-understand-this-deletes-data");
  const config = resolveRuntimeConfig(args, env);
  const defaultDbPath = defaultDatabasePath(env.HOME);
  return purgeAllCleanup({
    mode,
    home: env.HOME,
    configuredDbPath: config.databasePath !== defaultDbPath ? config.databasePath : undefined,
    purgeOwnedStorage: purgeOwnedSQLiteStorage
  });
}

function resolveMaintenanceMode(args: string[], confirmationFlag: string): "dry_run" | "execute" {
  const dryRun = args.includes("--dry-run");
  const confirmed = args.includes(confirmationFlag);
  if (dryRun === confirmed) {
    throw new MaintenanceCliError("requires_exactly_one_confirmation_or_dry_run_flag", 2);
  }
  return dryRun ? "dry_run" : "execute";
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "maintenance_command_failed";
}

class MaintenanceCliError extends Error {
  constructor(message: string, readonly exitCode: 1 | 2) {
    super(message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
