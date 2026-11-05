import { describe, expect, it } from "vitest";
import { RecurringServiceCost } from "../session-stability";
import { NetworkLoad } from "../capacity";
import { participantsForRoom } from "../participants";
describe("salas duraderas", () => {
  it("una pausa o un pico aislado no se convierten en una sala llena permanente", () => {
    const cost = new RecurringServiceCost();
    for (let i = 0; i < 12; i++) cost.record(2, i * 100);
    cost.record(700, 1300);
    expect(cost.value(1400)).toBe(2);
    for (let i = 0; i < 24; i++) cost.record(50, 1500 + i * 100);
    expect(cost.value(4000)).toBe(50);
    expect(cost.value(40_000)).toBeUndefined();
    cost.record(1, 40_100); expect(cost.value(40_100)).toBe(1);
  });
  it("la inactividad no cuenta como saturación de transporte", () => {
    const load = new NetworkLoad();
    expect(load.hasRecentActivity(1000)).toBe(false);
    load.record(1000, 1000); expect(load.hasRecentActivity(1200)).toBe(true);
    expect(load.hasRecentActivity(30_000)).toBe(false);
  });
  it("muestra conectados de otras ramas aunque el puntero haya caducado", () => {
    const list = participantsForRoom({ ownId: "host", ownName: "Ana", owner: true, connected: true, members: [
      { id: "guest", name: "Luis", role: "editor", connected: true, revoked: false },
      { id: "gone", name: "Paula", role: "editor", connected: false, revoked: false },
    ], locations: [{ id: "guest:window", sessionId: "window", branchId: "backend", viewId: "detail", name: "Luis", pointer: null, selectedIds: [], seenAt: 1, color: "blue" }] });
    expect(list.map(p => p.name)).toEqual(["Ana", "Luis"]);
    expect(list[1].branchIds).toEqual(["backend"]);
    expect(list[1].viewIds).toEqual(["detail"]);
  });
});
