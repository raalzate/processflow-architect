import { describe, expect, it } from "vitest";
import { sanitizePresence, presenceColor, livePresence } from "../presence";
describe("ephemeral presence", () => {
  it("assigns a stable participant color", () => { expect(presenceColor("alice")).toBe(presenceColor("alice")); expect(presenceColor("alice")).not.toBe(presenceColor("bob")); });
  it("validates coordinates, bounds selection payloads, and uses authenticated identity", () => {
    const p = sanitizePresence({ id: "spoof", name: "Ana", viewId: "design", pointer: { x: 12, y: 20 }, selectedIds: ["a"] }, "actual", 500);
    expect(p).toMatchObject({ id: "actual", name: "Ana", seenAt: 500, pointer: { x: 12, y: 20 } });
    expect(sanitizePresence({ pointer: { x: Infinity, y: 0 } }, "actual", 500)).toBeUndefined();
  });
  it("expires disconnected cursors using the supplied clock", () => {
    const p = sanitizePresence({ name: "Ana", viewId: "design", pointer: null, selectedIds: [] }, "ana", 100)!;
    expect(livePresence([p], 200)).toHaveLength(1); expect(livePresence([p], 9000)).toEqual([]);
  });
});
