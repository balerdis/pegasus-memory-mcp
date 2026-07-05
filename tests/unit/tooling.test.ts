import { describe, expect, it } from "vitest";
import { packageName, productName } from "../../src/index.js";

describe("package metadata", () => {
  it("exposes the MVP package and product names", () => {
    expect(packageName).toBe("pegasus-memory-mcp");
    expect(productName).toBe("Pegasus Memory MCP");
  });
});
