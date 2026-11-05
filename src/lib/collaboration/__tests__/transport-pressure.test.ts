import { expect, it } from "vitest";
import { RecentCongestion } from "../session-stability";
it("una ventana QUIC reducida tras reposo no prueba congestión y la presión real caduca", () => {
  const pressure = new RecentCongestion();
  expect(pressure.observe("peer:path", 8, 1000)).toBe(false);
  expect(pressure.observe("peer:path", 8, 40_000)).toBe(false);
  expect(pressure.observe("peer:path", 9, 40_100)).toBe(true);
  expect(pressure.observe("peer:path", 9, 41_000)).toBe(true);
  expect(pressure.observe("peer:path", 9, 60_000)).toBe(false);
  expect(pressure.observe("other:path", 99, 60_000)).toBe(false);
  expect(pressure.observe("peer:path", 0, 60_100)).toBe(false);
});
