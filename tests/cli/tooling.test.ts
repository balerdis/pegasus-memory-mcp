import { describe, expect, it } from "vitest";
import { runCli } from "../../src/bin/pegasus-memory-mcp.js";

describe("CLI smoke test foundation", () => {
  it("exposes a placeholder help command without starting the MCP runtime", () => {
    expect(runCli(["--help"])).toBe(0);
  });
});
