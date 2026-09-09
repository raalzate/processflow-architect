/**
 * Paleta General: formas de propósito general (dibujo libre).
 *
 * Lo que se prueba acá es lo que la distingue del resto y lo que ninguna regla
 * genérica ve: que sea DECLARADAMENTE sin semántica (`freeform`, sin roles), que
 * cada silueta que ofrece exista de verdad como forma dibujable, y que sus tipos
 * —nombres tan comunes como «Rectángulo» o «Documento»— no pisen los de ninguna
 * otra notación: el índice global de elementos es por tipo, así que un nombre
 * repetido le cambiaría el dibujo a la notación ajena.
 */
import { describe, it, expect } from "vitest";
import {
  ALL_ELEMENTS,
  COMPACT_NODE_SIZE,
  DEFAULT_NODE_SIZE,
  NOTATION_IDS,
  NOTATION_LIST,
  getNotation,
  isFreeformType,
  isTableType,
  textStyleOfType,
  notationRoles,
  notationTypes,
  sizeOfType,
  type ShapeKind,
} from "@/lib/notations";
import { NOTATION_HELP } from "@/lib/notation-help";
import { mermaidShapeDelims } from "@/lib/mcp/to-mermaid";

const GENERAL = getNotation("general");

/** Siluetas que el lienzo sabe dibujar (las declaradas en `ShapeKind`). */
const FORMAS: ShapeKind[] = [
  "rounded",
  "rect",
  "ellipse",
  "diamond",
  "cylinder",
  "triangle",
  "hexagon",
  "parallelogram",
  "cloud",
  "cube",
  "document",
  "step",
  "note",
  "callout",
  "callout-oval",
  "semicircle",
  "dshape",
  "process",
  "frame",
  "list",
  "person",
  "text",
];

describe("la notación General existe y es elegible", () => {
  it("está en el registro y en la lista de los SELECT", () => {
    expect(GENERAL.id).toBe("general");
    expect(NOTATION_IDS).toContain("general");
  });

  it("arranca por el rectángulo: la caja que sirve para cualquier cosa", () => {
    expect(GENERAL.defaultType).toBe("Rectángulo");
    expect(notationTypes("general")).toContain("Rectángulo");
    expect(notationTypes("general")).not.toContain("Contenedor General");
    expect(notationTypes("general", { includeContainers: true })).toContain("Contenedor General");
  });
});

describe("es dibujo libre, y lo declara", () => {
  it("se marca `freeform` y no declara ningún rol", () => {
    expect(GENERAL.freeform).toBe(true);
    expect(Object.values(notationRoles("general")).flatMap((t) => t ?? [])).toEqual([]);
  });

  it("es la ÚNICA libre: las demás siguen siendo semánticas", () => {
    expect(NOTATION_LIST.filter((n) => n.freeform).map((n) => n.id)).toEqual(["general"]);
  });

  it("ninguna de sus formas se dibuja como caja de tabla", () => {
    for (const e of GENERAL.elements) expect(isTableType(e.type), e.type).toBe(false);
  });
});

describe("cada forma de la paleta se puede dibujar", () => {
  it("su silueta es una de las que el lienzo conoce", () => {
    for (const e of GENERAL.elements) {
      if (e.container) continue; // los contenedores se dibujan por `containerStyle`
      expect(FORMAS, `${e.type} → ${e.shape}`).toContain(e.shape ?? "rounded");
    }
  });

  it("la paleta usa las siluetas NUEVAS (si no, sobraba la notación)", () => {
    const usadas = new Set(GENERAL.elements.map((e) => e.shape));
    for (const forma of [
      "hexagon",
      "parallelogram",
      "cloud",
      "cube",
      "document",
      "step",
      "note",
      "callout",
      "callout-oval",
      "semicircle",
      "dshape",
      "process",
      "frame",
      "list",
      "person",
      "text",
    ]) {
      expect(usadas.has(forma as ShapeKind), forma).toBe(true);
    }
  });

  it("toda silueta declarada tiene delimitadores de Mermaid (la vista previa no se rompe)", () => {
    for (const forma of FORMAS) {
      const [abre, cierra] = mermaidShapeDelims(
        GENERAL.elements.find((e) => e.shape === forma)?.type ?? "Rectángulo"
      );
      expect(abre.length, forma).toBeGreaterThan(0);
      expect(cierra.length, forma).toBeGreaterThan(0);
    }
  });

  it("cada forma explica qué es y para qué se usa", () => {
    for (const e of GENERAL.elements) expect(NOTATION_HELP[e.type], e.type).toBeTruthy();
  });
});

describe("tamaño por elemento", () => {
  it("el cuadrado y el círculo miden lo mismo de ancho que de alto", () => {
    for (const t of ["Cuadrado", "Círculo", "Figura de Persona"]) {
      const { w, h } = sizeOfType(t, "general");
      expect(w, t).toBe(h);
    }
  });

  it("las demás usan la ficha de siempre", () => {
    for (const t of ["Rectángulo", "Elipse", "Documento", "Nube"]) {
      expect(sizeOfType(t, "general"), t).toEqual(DEFAULT_NODE_SIZE);
    }
  });

  it("un símbolo compacto de otra notación no cambia por esto", () => {
    expect(sizeOfType("Evento de Inicio", "bpmn")).toEqual(COMPACT_NODE_SIZE);
  });
});

describe("los nombres no pisan a otra notación", () => {
  it("ningún tipo de General existe en DDD, BPMN, C4, UML ni MER", () => {
    const propios = GENERAL.elements.map((e) => e.type);
    for (const n of NOTATION_LIST) {
      if (n.id === "general") continue;
      const ajenos = new Set(n.elements.map((e) => e.type));
      for (const t of propios) expect(ajenos.has(t), `${t} también está en ${n.id}`).toBe(false);
    }
  });

  it("el índice global devuelve LA forma de General para sus tipos", () => {
    expect(ALL_ELEMENTS["Rectángulo"].shape).toBe("rect");
    expect(ALL_ELEMENTS["Nube"].shape).toBe("cloud");
    // Y no le cambió la silueta a un tipo ajeno de nombre parecido.
    expect(ALL_ELEMENTS["Nota"].shape).toBe("rect");
  });
});

describe("rotulado de las formas libres", () => {
  it("una forma libre se marca como tal y el resto no", () => {
    expect(isFreeformType("Rectángulo")).toBe(true);
    expect(isFreeformType("Nube")).toBe(true);
    // Un tipo semántico de otra notación NO es libre: sigue mostrando su ficha
    // con el `[Tipo]` y su icono.
    for (const t of ["Comando", "Tarea", "Contenedor", "Clase", "Tabla Relacional"]) {
      expect(isFreeformType(t), t).toBe(false);
    }
  });

  it("el título y el rótulo se rotulan distinto (si no, se leen igual)", () => {
    expect(textStyleOfType("Título y Texto")).toBe("heading");
    expect(textStyleOfType("Texto Libre")).toBe("label");
    // Cualquier otro tipo cae al rótulo simple: es el valor por defecto.
    expect(textStyleOfType("Rectángulo")).toBe("label");
  });

  it("las cajas de texto son BAJAS: el texto no arrastra el hueco de la ficha", () => {
    // Lo que molesta en un rótulo es el ALTO: una línea de texto en una caja de
    // 104 px deja un hueco que se arrastra y se conecta como si fuera la forma.
    // El ancho es libre — un encabezado necesita renglón largo.
    for (const t of ["Texto Libre", "Título y Texto"]) {
      expect(sizeOfType(t, "general").h, t).toBeLessThan(DEFAULT_NODE_SIZE.h);
    }
    // Y el título tiene más aire que el rótulo: lleva dos bloques de texto.
    expect(sizeOfType("Título y Texto", "general").h).toBeGreaterThan(
      sizeOfType("Texto Libre", "general").h
    );
  });
});
