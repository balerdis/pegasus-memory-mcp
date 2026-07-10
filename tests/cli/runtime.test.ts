import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import packageJson from "../../package.json" with { type: "json" };
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultDatabasePath } from "../../src/adapters/sqlite/index.js";
import { resolveRuntimeConfig, runCli } from "../../src/bin/pegasus-memory-mcp.js";

async function captureCli(args: string[], env: NodeJS.ProcessEnv) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((value: string) => stdout.push(value));
  const error = vi.spyOn(console, "error").mockImplementation((value: string) => stderr.push(value));
  try {
    const code = await runCli(args, env);
    return { code, stdout, stderr };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

describe("CLI runtime", () => {
  it("keeps implementation packaging private until an explicit release task", () => {
    expect(packageJson.private).toBe(true);
    expect(packageJson.bin["pegasus-memory-mcp"]).toBe("./dist/bin/pegasus-memory-mcp.js");
  });

  it("resolves default and override database paths while keeping package private", () => {
    expect(resolveRuntimeConfig([], { HOME: "/tmp/home" }).databasePath).toBe("/tmp/home/.local/share/pegasus-memory-mcp/memory.db");
    expect(resolveRuntimeConfig(["--db", "/tmp/custom.db"], { HOME: "/tmp/home", PEGASUS_MEMORY_DB_PATH: "/tmp/env.db" }).databasePath).toBe("/tmp/custom.db");
    expect(resolveRuntimeConfig([], { HOME: "/tmp/home", PEGASUS_MEMORY_DB_PATH: "/tmp/env.db" }).databasePath).toBe("/tmp/env.db");
  });

  it("smoke-starts the configured runtime DB without publishing behavior", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pegasus-memory-cli-"));
    const dbPath = join(dir, "memory.db");

    await expect(runCli(["--smoke-start", "--db", dbPath], { HOME: dir })).resolves.toBe(0);
  });

  it("documents the VS Code stdio setup and availability probe contract", async () => {
    const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");

    expect(readme).toContain('"command": "node"');
    expect(readme).toContain('"/absolute/path/to/pegasus-memory-mcp/dist/bin/pegasus-memory-mcp.js"');
    expect(readme).toContain("PEGASUS_MEMORY_DB_PATH");
    expect(readme).toContain("--db");
    expect(readme).toContain("invoke `health`");
    expect(readme).toContain("invocation fails");
  });

  it("rejects destructive maintenance commands without exact confirmation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pegasus-memory-cli-"));

    const reset = await captureCli(["reset", "--project", "project-1"], { HOME: dir });
    expect(reset.code).toBe(2);
    expect(JSON.parse(reset.stderr[0])).toMatchObject({ command: "reset", status: "error" });

    const purge = await captureCli(["purge", "--all", "--yes"], { HOME: dir });
    expect(purge.code).toBe(2);
    expect(JSON.parse(purge.stderr[0])).toMatchObject({ command: "purge", status: "error" });
  });

  it("dry-runs reset as JSON without creating database files or parent directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pegasus-memory-cli-"));
    const dbPath = join(dir, "missing", "memory.db");

    const result = await captureCli(["reset", "--project", "project-1", "--dry-run", "--db", dbPath], { HOME: dir });
    const record = JSON.parse(result.stdout[0]);

    expect(result.code).toBe(0);
    expect(record).toMatchObject({ command: "reset", mode: "dry_run", status: "noop", deleted: [] });
    expect(record.targets).toContain(dbPath);
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(dirname(dbPath))).toBe(false);
  });

  it("executes missing-project reset as a successful no-op", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pegasus-memory-cli-"));
    const dbPath = join(dir, "memory.db");
    await runCli(["--smoke-start", "--db", dbPath], { HOME: dir });

    const result = await captureCli(["reset", "--project", "missing", "--yes", "--db", dbPath], { HOME: dir });
    const record = JSON.parse(result.stdout[0]);

    expect(result.code).toBe(0);
    expect(record).toMatchObject({ command: "reset", mode: "execute", status: "noop", deleted: [] });
    expect(record.skipped).toEqual(expect.arrayContaining([{ target: "project:missing", reason: "project_not_found" }]));
  });

  it("purges only default owned paths and reports custom database paths as skipped", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pegasus-memory-cli-"));
    const defaultDb = defaultDatabasePath(dir);
    const customDb = join(dir, "custom", "memory.db");
    await mkdir(dirname(defaultDb), { recursive: true });
    await mkdir(dirname(customDb), { recursive: true });
    await writeFile(defaultDb, "owned");
    await writeFile(`${defaultDb}-wal`, "owned wal");
    await writeFile(customDb, "custom");

    const result = await captureCli(["purge", "--all", "--yes-i-understand-this-deletes-data", "--db", customDb], { HOME: dir });
    const record = JSON.parse(result.stdout[0]);

    expect(result.code).toBe(0);
    expect(record).toMatchObject({ command: "purge", mode: "execute", status: "deleted" });
    expect(record.deleted).toEqual(expect.arrayContaining([defaultDb, `${defaultDb}-wal`]));
    expect(record.skipped).toEqual(expect.arrayContaining([{ target: customDb, reason: "custom_database_path_not_owned" }]));
    expect(existsSync(defaultDb)).toBe(false);
    expect(existsSync(`${defaultDb}-wal`)).toBe(false);
    expect(existsSync(customDb)).toBe(true);
  });
});
