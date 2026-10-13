import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NOTATION_LIST, bgDeFill, notationBadgeClass, swatchClass, getNotation } from "../notations";

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
  it("traduce TODO el relleno SVG (fill-*) a fondo HTML (bg-*), también la variante dark: (#588)", () => {
    const evento = getNotation("ddd").elements.find((e) => e.type === "Evento")!;
    expect(evento.bg).toMatch(/^fill-/);
    expect(evento.bg).toContain("dark:fill-");
    expect(swatchClass(evento)).toBe(evento.bg.replace(/fill-/g, "bg-"));
    expect(swatchClass(evento)).not.toContain("fill-");
  });

  it("bgDeFill cubre cualquier relleno del registro: ninguno deja un fill- en HTML (#588)", () => {
    for (const n of NOTATION_LIST) {
      for (const el of n.elements) {
        const bg = bgDeFill(el.bg);
        expect(bg, `${n.id}/${el.type}`).not.toMatch(/(^|[\s:])fill-/);
        expect(bg.split(" ").length, `${n.id}/${el.type}`).toBe(el.bg.split(" ").length);
      }
    }
    expect(bgDeFill("fill-zinc-100 dark:fill-zinc-700")).toBe("bg-zinc-100 dark:bg-zinc-700");
    expect(bgDeFill("fill-[#fff]")).toBe("bg-[#fff]");
  });
});

/**
 * Expande llaves al estilo Tailwind: `a-{b,c}-{1,2}` → a-b-1, a-b-2, a-c-1, a-c-2.
 * Lo que `@source inline(...)` de globals.css declara es lo que el CSS trae.
 */
function expandir(patron: string): string[] {
  const m = /\{([^}]*)\}/.exec(patron);
  if (!m) return [patron];
  return m[1].split(",").flatMap((opt) => expandir(patron.replace(m[0], opt)));
}

describe("safelist de fondos de la paleta (#588)", () => {
  it("todo relleno del registro, traducido a bg-*, está declarado en @source inline de globals.css", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
    const declaradas = new Set(
      [...css.matchAll(/@source inline\("([^"]+)"\)/g)].flatMap((m) => expandir(m[1]))
    );
    for (const n of NOTATION_LIST) {
      for (const el of n.elements) {
        for (const clase of bgDeFill(el.bg).split(/\s+/)) {
          expect(declaradas.has(clase), `${n.id}/${el.type}: «${clase}» no está safelistada`).toBe(true);
        }
      }
    }
  });
});
