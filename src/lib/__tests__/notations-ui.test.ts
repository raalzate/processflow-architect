import { describe, it, expect } from "vitest";
import { notationBadgeClass, swatchClass, getNotation } from "../notations";

describe("notationBadgeClass", () => {
  it("da un color distinto por familia de notación", () => {
    const ddd = notationBadgeClass("ddd");
    const bpmn = notationBadgeClass("bpmn");
    const c4 = notationBadgeClass("c4");
    const uml = notationBadgeClass("uml");
    const set = new Set([ddd, bpmn, c4, uml]);
    expect(set.size).toBe(4); // los cuatro son distintos
  });

  it("incluye variante dark: para no romper el tema oscuro", () => {
    expect(notationBadgeClass("c4")).toContain("dark:");
  });

  it("notación desconocida cae a DDD (coherente con getNotation)", () => {
    expect(notationBadgeClass("no-existe")).toBe(notationBadgeClass("ddd"));
    expect(notationBadgeClass(undefined)).toBe(notationBadgeClass("ddd"));
  });
});

describe("swatchClass", () => {
  it("traduce el relleno SVG (fill-*) a fondo HTML (bg-*)", () => {
    const evento = getNotation("ddd").elements.find((e) => e.type === "Evento")!;
    expect(evento.bg).toMatch(/^fill-/);
    expect(swatchClass(evento)).toBe(evento.bg.replace("fill-", "bg-"));
    expect(swatchClass(evento).startsWith("bg-")).toBe(true);
  });
});
