import { describe, expect, it } from "vitest";
import { applyRecordDelta } from "../canvas-merge";

describe("incremental remote canvas updates", () => {
  const before = new Map([["a", { id: "a", x: 10, name: "A" }]]);
  it("retains an active local move and applies unrelated remote fields", () => {
    const local = new Map([["a", { id: "a", x: 40, name: "A" }]]);
    const remote = new Map([
      ["a", { id: "a", x: 10, name: "Renamed" }],
      ["b", { id: "b", x: 90, name: "B" }],
    ]);
    const result = applyRecordDelta(local, before, remote, true);
    expect(result.get("a")).toEqual({ id: "a", x: 40, name: "Renamed" });
    expect(result.has("b")).toBe(true);
  });
  it("rebases old undo snapshots so undo cannot remove another user's work", () => {
    const oldHistory = new Map([["a", { id: "a", x: 0, name: "A" }]]);
    const remote = new Map([
      ["a", { id: "a", x: 10, name: "Renamed" }],
      ["b", { id: "b", x: 90, name: "B" }],
    ]);
    const result = applyRecordDelta(oldHistory, before, remote);
    expect(result.get("a")).toEqual({ id: "a", x: 0, name: "Renamed" });
    expect(result.has("b")).toBe(true);
  });
  it("does not resurrect remote deletions from an old undo snapshot", () => {
    expect(applyRecordDelta(before, before, new Map()).size).toBe(0);
  });
});
