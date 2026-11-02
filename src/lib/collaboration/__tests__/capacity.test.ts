import { describe, expect, it } from "vitest";
import { estimateCapacity, Seats, NetworkLoad } from "../capacity";

describe("room capacity", () => {
  it("uses the smallest measured resource budget and includes the host", () => {
    const small = estimateCapacity({ freeMemoryBytes: 512 * 1024 ** 2, projectBytes: 4 * 1024 ** 2, mergeMs: 20 });
    const large = estimateCapacity({ freeMemoryBytes: 8 * 1024 ** 3, projectBytes: 1024, mergeMs: 1, uploadBytesPerSecond: 1024 ** 2, updateBytesPerSecond: 1024 });
    expect(small.limit).toBeGreaterThanOrEqual(1); expect(large.limit).toBeGreaterThan(small.limit);
    expect(small.networkMeasured).toBe(false); expect(large.networkMeasured).toBe(true);
  });
  it("admits atomically, reconnects without an extra seat, and releases", () => {
    const seats = new Seats(3); expect(seats.enter("a")).toBe(true); expect(seats.enter("b")).toBe(true);
    expect(seats.enter("b")).toBe(true); expect(seats.enter("c")).toBe(false);
    expect(seats.count).toBe(3); seats.leave("a"); expect(seats.enter("c")).toBe(true);
  });
  it("stops new admissions after pressure without ejecting current users", () => {
    const seats = new Seats(10); seats.enter("a"); seats.enter("b"); seats.resize(2);
    expect(seats.count).toBe(3); expect(seats.enter("a")).toBe(true); expect(seats.enter("c")).toBe(false);
  });
  it("counts the host separately from the upload budget for guests", () => {
    const capacity = estimateCapacity({ freeMemoryBytes: 8 * 1024 ** 3, projectBytes: 1024, mergeMs: 1, uploadBytesPerSecond: 65536, updateBytesPerSecond: 16384 });
    expect(capacity.limit).toBe(3);
  });
  it("conservatively accounts for the slow Internet path in a mixed room", () => {
    const load = new NetworkLoad();
    const mixed = load.budget([{ cwnd: 1024 ** 2, rttMs: 2 }, { cwnd: 16384, rttMs: 200 }], 1000);
    expect(mixed.uploadBytesPerSecond).toBe(81920);
    expect(mixed.updateBytesPerSecond).toBe(16384);
    expect(mixed.networkSource).toBe("transport");
    const fast = load.budget([{ cwnd: 1024 ** 2, rttMs: 2 }], 1000);
    expect(fast.uploadBytesPerSecond).toBeGreaterThan(mixed.uploadBytesPerSecond!);
  });
  it("reduces admission when live editing and presence traffic increases, then recovers", () => {
    const load = new NetworkLoad(), paths = [{ cwnd: 131072, rttMs: 100 }];
    const input = { freeMemoryBytes: 8 * 1024 ** 3, projectBytes: 1024, mergeMs: 1 };
    const idle = estimateCapacity({ ...input, ...load.budget(paths, 1000) });
    load.record(512000, 1000);
    const busy = estimateCapacity({ ...input, ...load.budget(paths, 2000) });
    expect(busy.limit).toBeLessThan(idle.limit);
    expect(busy.reason).toContain("transporte");
    expect(estimateCapacity({ ...input, ...load.budget(paths, 8000) }).limit).toBe(idle.limit);
  });
  it("does not invent a network speed for unavailable or invalid path statistics", () => {
    const load = new NetworkLoad();
    expect(load.budget([], 1000)).toEqual({});
    expect(load.budget([{ cwnd: 0, rttMs: 10 }, { cwnd: NaN, rttMs: 20 }, { cwnd: 10, rttMs: 0 }], 1000)).toEqual({});
  });
});
