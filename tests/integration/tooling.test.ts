import { describe, expect, it } from "vitest";

describe("integration test foundation", () => {
  it("is configured without creating SQLite persistence yet", async () => {
    const sqlite = await import("better-sqlite3");
    expect(sqlite.default).toBeTypeOf("function");
  });
});
