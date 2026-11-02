import { describe, expect, it } from "vitest";
import { estimateCapacity, Seats, NetworkLoad } from "../capacity";

describe("room capacity", () => {
  it("uses the smallest measured resource budget and includes the host", () => {
    const small = estimateCapacity({
      freeMemoryBytes: 512 * 1024 ** 2,
      projectBytes: 4 * 1024 ** 2,
      mergeMs: 20,
    });
    const large = estimateCapacity({
      freeMemoryBytes: 8 * 1024 ** 3,
      projectBytes: 1024,
      mergeMs: 1,
      uploadBytesPerSecond: 1024 ** 2,
      updateBytesPerSecond: 1024,
    });
    expect(small.limit).toBeGreaterThanOrEqual(1);
    expect(large.limit).toBeGreaterThan(small.limit);
    expect(small.networkMeasured).toBe(false);
    expect(large.networkMeasured).toBe(true);
  });
  it("admits atomically, reconnects without an extra seat, and releases", () => {
    const seats = new Seats(3);
    expect(seats.enter("a")).toBe(true);
    expect(seats.enter("b")).toBe(true);
    expect(seats.enter("b")).toBe(true);
    expect(seats.enter("c")).toBe(false);
    expect(seats.count).toBe(3);
    seats.leave("a");
    expect(seats.enter("c")).toBe(true);
  });
  it("stops new admissions after pressure without ejecting current users", () => {
    const seats = new Seats(10);
    seats.enter("a");
    seats.enter("b");
    seats.resize(2);
    expect(seats.count).toBe(3);
    expect(seats.enter("a")).toBe(true);
    expect(seats.enter("c")).toBe(false);
  });
  it("counts the host separately from the upload budget for guests", () => {
    const capacity = estimateCapacity({
      freeMemoryBytes: 8 * 1024 ** 3,
      projectBytes: 1024,
      mergeMs: 1,
      uploadBytesPerSecond: 65536,
      updateBytesPerSecond: 16384,
    });
    expect(capacity.limit).toBe(3);
  });
  it("conservatively accounts for the slow Internet path in a mixed room", () => {
    const load = new NetworkLoad();
    const mixed = load.budget(
      [
        { cwnd: 1024 ** 2, rttMs: 2 },
        { cwnd: 16384, rttMs: 200 },
      ],
      1000,
    );
    expect(mixed.uploadBytesPerSecond).toBe(81920);
    expect(mixed.updateBytesPerSecond).toBe(16384);
    expect(mixed.networkSource).toBe("transport");
    const fast = load.budget([{ cwnd: 1024 ** 2, rttMs: 2 }], 1000);
    expect(fast.uploadBytesPerSecond).toBeGreaterThan(mixed.uploadBytesPerSecond!);
  });
  it("reduces admission when live editing and presence traffic increases, then recovers", () => {
    const load = new NetworkLoad(),
      paths = [{ cwnd: 131072, rttMs: 100 }];
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
    expect(
      load.budget(
        [
          { cwnd: 0, rttMs: 10 },
          { cwnd: NaN, rttMs: 20 },
          { cwnd: 10, rttMs: 0 },
        ],
        1000,
      ),
    ).toEqual({});
  });
  it("admits 4 LAN + 11 P2P + 5 Relay guests simultaneously even when relay is capped at 5", () => {
    const load = new NetworkLoad();
    const budgets = load.routeBudgets(
      [
        { route: "lan", cwnd: 1024 ** 2, rttMs: 2, calibrated: true },
        { route: "direct", cwnd: 65536, rttMs: 120, calibrated: true },
        { route: "relay", cwnd: 32768, rttMs: 190, calibrated: true },
      ],
      1000,
    );
    const capacity = estimateCapacity({
      freeMemoryBytes: 8 * 1024 ** 3,
      projectBytes: 4096,
      mergeMs: 1,
      routeAware: true,
      ...budgets,
    });
    expect(capacity.limit).toBeGreaterThanOrEqual(21);
    expect(capacity.relayGuestLimit).toBe(5);
    expect(capacity.directGuestLimit).toBeGreaterThanOrEqual(11);

    const seats = new Seats(capacity.limit, {
      directGuestLimit: capacity.directGuestLimit,
      relayGuestLimit: capacity.relayGuestLimit,
    });
    for (let i = 1; i <= 5; i++) expect(seats.enter(`relay-${i}`, "relay")).toBe(true);
    // El sexto que solo puede por relay espera, pero LAN y P2P siguen abiertos:
    expect(seats.enter("relay-6", "relay")).toBe(false);
    for (let i = 1; i <= 11; i++) expect(seats.enter(`p2p-${i}`, "direct")).toBe(true);
    for (let i = 1; i <= 4; i++) expect(seats.enter(`lan-${i}`, "lan")).toBe(true);
    expect(seats.countsByRoute()).toEqual({ lan: 4, direct: 11, relay: 5 });
    expect(seats.count).toBe(21);

    // Si uno de los de relay logra perforación directa P2P en segundo plano, libera su asiento de relay:
    seats.updateRoute("relay-1", "direct");
    expect(seats.countsByRoute()).toEqual({ lan: 4, direct: 12, relay: 4 });
    expect(seats.enter("relay-6", "relay")).toBe(true);
    expect(seats.countsByRoute()).toEqual({ lan: 4, direct: 12, relay: 5 });
  });
  it("handles uncalibrated and LAN-only route measurements without blocking total host capacity", () => {
    const load = new NetworkLoad();
    expect(load.routeBudgets([{ route: "lan", cwnd: 1024 ** 2, rttMs: 1 }], 1000)).toEqual({});
    const uncalibrated = load.routeBudgets(
      [{ route: "relay", cwnd: 16384, rttMs: 250, calibrated: false }],
      1000,
    );
    expect(uncalibrated).toEqual({ calibrating: true });
    const capacity = estimateCapacity({
      freeMemoryBytes: 8 * 1024 ** 3,
      projectBytes: 2048,
      mergeMs: 1,
      routeAware: true,
      ...uncalibrated,
    });
    expect(capacity.networkMeasured).toBe(false);
    expect(capacity.relayGuestLimit).toBeUndefined();
    expect(capacity.reason).toContain("calibración");
  });
});
