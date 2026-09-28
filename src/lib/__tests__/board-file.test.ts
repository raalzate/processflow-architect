import { describe, it, expect } from "vitest";
import { BOARD_FORMAT, packBoard, parseBoardFile, sanitizeViews } from "../board-file";
import { emptyPersistedViews, type PersistedViews } from "../views-types";
import type { GraphData } from "../types";

/** GraphData mínimo válido (la vista «Modelo»). */
const proyecto = (nombre = "Pagos"): GraphData =>
  ({
    nombre_proyecto: nombre,
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    agregados: [],
  }) as unknown as GraphData;

/** Catálogo con dos vistas custom, como el que se pierde hoy al exportar. */
const vistas = (): PersistedViews => ({
  customViews: [
    { id: "v1", name: "BPMN Cobro", kind: "graph", createdAt: "2026-09-28" } as never,
    { id: "v2", name: "C4 Sistemas", kind: "graph", createdAt: "2026-09-28" } as never,
  ],
  activeViewId: "v1",
  injectedViewIds: ["v2"],
  openViewIds: [],
});

describe("packBoard", () => {
  it("empaqueta proyecto + vistas con la marca de formato", () => {
    const b = packBoard(proyecto(), vistas());
    expect(b.formato).toBe(BOARD_FORMAT);
    expect(b.proyecto.nombre_proyecto).toBe("Pagos");
    expect(b.vistas.customViews.map((v) => v.id)).toEqual(["v1", "v2"]);
  });

  it("sanea las vistas al empaquetar (no arrastra basura)", () => {
    const b = packBoard(proyecto(), {
      customViews: [{ id: "v1", name: "ok", kind: "graph", createdAt: "" } as never, "basura" as never, { name: "sin id" } as never],
      activeViewId: "v1",
      injectedViewIds: ["v1", 7 as never],
      openViewIds: undefined as never,
    });
    expect(b.vistas.customViews.map((v) => v.id)).toEqual(["v1"]);
    expect(b.vistas.injectedViewIds).toEqual(["v1"]);
    expect(b.vistas.openViewIds).toEqual([]);
  });
});

describe("parseBoardFile · round-trip del tablero completo (#428)", () => {
  it("exportar e importar conserva TODAS las vistas", () => {
    const archivo = JSON.stringify(packBoard(proyecto("Seguros"), vistas()));
    const parsed = parseBoardFile(archivo, "seguros.json");
    expect(parsed.name).toBe("Seguros");
    expect(parsed.content.big_picture).toBeDefined();
    expect(parsed.vistas.customViews.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(parsed.vistas.activeViewId).toBe("v1");
    expect(parsed.vistas.injectedViewIds).toEqual(["v2"]);
  });

  it("propone el nombre desde el nombre de archivo si el proyecto no lo trae", () => {
    const sinNombre = proyecto("");
    delete (sinNombre as { nombre_proyecto?: unknown }).nombre_proyecto;
    const parsed = parseBoardFile(JSON.stringify(packBoard(sinNombre, emptyPersistedViews())), "mi-tablero.json");
    expect(parsed.name).toBe("mi-tablero");
  });
});

describe("parseBoardFile · compatibilidad con el formato viejo", () => {
  it("un GraphData plano (una sola vista) se importa con vistas vacías", () => {
    const parsed = parseBoardFile(JSON.stringify(proyecto("Legado")), "legado.json");
    expect(parsed.name).toBe("Legado");
    expect(parsed.content.nombre_proyecto).toBe("Legado");
    expect(parsed.vistas).toEqual(emptyPersistedViews());
  });
});

describe("parseBoardFile · errores", () => {
  it("un JSON inválido falla con mensaje claro", () => {
    expect(() => parseBoardFile("{ no json")).toThrow(/no es un JSON válido/);
  });

  it("un tablero cuyo proyecto no parece diagrama falla", () => {
    const malo = JSON.stringify({ formato: BOARD_FORMAT, proyecto: { cualquier: "cosa" }, vistas: emptyPersistedViews() });
    expect(() => parseBoardFile(malo)).toThrow(/no tiene forma de diagrama/);
  });

  it("un JSON que no es diagrama ni tablero falla", () => {
    expect(() => parseBoardFile(JSON.stringify({ hola: "mundo" }))).toThrow(/no tiene forma de diagrama/);
  });
});

describe("sanitizeViews", () => {
  it("lo que no es objeto devuelve el catálogo vacío", () => {
    expect(sanitizeViews(null)).toEqual(emptyPersistedViews());
    expect(sanitizeViews("x")).toEqual(emptyPersistedViews());
    expect(sanitizeViews(42)).toEqual(emptyPersistedViews());
  });

  it("sin activeViewId cae en «design»", () => {
    expect(sanitizeViews({ customViews: [] }).activeViewId).toBe("design");
  });
});
