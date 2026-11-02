import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateGraphSchema } from "../collaboration-schema";

describe("persistent collaboration schema", () => {
  it("matches the application's graph types", () => {
    expect(JSON.parse(readFileSync("src/lib/collaboration/graph-schema.json", "utf8"))).toEqual(generateGraphSchema());
  });
});
