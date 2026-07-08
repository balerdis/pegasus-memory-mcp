import { mkdtemp, readFile } from "node:fs/promises";
import packageJson from "../../package.json" with { type: "json" };
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRuntimeConfig, runCli } from "../../src/bin/pegasus-memory-mcp.js";

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
});
