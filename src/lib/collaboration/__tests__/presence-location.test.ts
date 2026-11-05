import { describe, expect, it } from "vitest";
import { collaboratorsDescription, participantsForRoom } from "../participants";
import { presenceIsActivity, sanitizePresence } from "../presence";

describe("ubicación de compañeros", () => {
  const location = (branchId: string, viewId: string, sessionId: string) => sanitizePresence({ name: "Nafes", branchId, viewId, sessionId, pointer: { x: 1, y: 2 }, selectedIds: [] }, `guest:${sessionId}`, 1)!;
  const people = () => participantsForRoom({ ownId: "host", ownName: "Ana", owner: true, connected: true, members: [{ id: "guest", name: "Nafes", role: "editor", connected: true, revoked: false }], locations: [location("shared", "one", "a"), location("feature", "two", "b")] });
  it("mantiene juntas rama y vista, contando una persona aunque abra dos ventanas", () => {
    expect(collaboratorsDescription(people(), "host", "shared")).toBe("Nafes está trabajando en esta rama.");
    expect(collaboratorsDescription(people(), "host", "shared", "one")).toBe("Nafes está trabajando en esta vista.");
    expect(collaboratorsDescription(people(), "host", "shared", "two")).toBe("");
    expect(collaboratorsDescription(people(), "guest", "shared", "one")).toBe("");
    expect(people()[1].locations).toEqual([{ branchId: "shared", viewId: "one" }, { branchId: "feature", viewId: "two" }]);
  });
  it("describe varios nombres sin exponer identificadores", () => {
    const guest = people()[1];
    const list = [guest, { ...guest, id: "other", name: "Luis" }, { ...guest, id: "third", name: "Paula" }];
    expect(collaboratorsDescription(list.slice(0, 2), "host", "shared")).toBe("Nafes y Luis están trabajando en esta rama.");
    expect(collaboratorsDescription(list, "host", "shared", "one")).toBe("Nafes y 2 compañeros más están trabajando en esta vista.");
  });
  it("renovar presencia estacionaria no es actividad, pero mover, conectar o cambiar de vista sí", () => {
    const first = location("shared", "one", "a");
    expect(presenceIsActivity(first, { ...first, seenAt: 5000 })).toBe(false);
    expect(presenceIsActivity(first, { ...first, pointer: { x: 9, y: 2 } })).toBe(true);
    expect(presenceIsActivity(first, { ...first, viewId: "two" })).toBe(true);
    expect(presenceIsActivity(first, { ...first, connecting: { sourceId: "node", x: 4, y: 5 } })).toBe(true);
  });
});
