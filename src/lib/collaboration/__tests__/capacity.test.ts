import { describe, expect, it } from "vitest";
import { estimateCapacity, Seats } from "../capacity";

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
});
