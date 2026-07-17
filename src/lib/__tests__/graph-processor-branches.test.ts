import { describe, it, expect } from "vitest";
import { processGraphData } from "@/lib/graph-processor";
import type { GraphData } from "@/lib/types";

const n = (id: string, nombre = id, tipo = "Comando") => ({
  id,
  nombre,
  tipo_elemento: tipo,
  estado_comparativo: "nuevo" as const,
});

describe("processGraphData — redes de seguridad y ramas defensivas", () => {
  it("red de seguridad: nodos sin aristas → incluye TODOS (lienzo nunca vacío)", () => {
    const data = {
      nombre_proyecto: "P",
      agregados: [
        // Sin aristas y sin políticas → nada conectado → dispara el fallback.
        { nombre_agregado: "Ventas", descripcion: "", nodos: [n("a"), n("b", "b", "Evento")] },
        { nombre_agregado: "Pagos" /* sin nodos */ },
      ],
    } as unknown as GraphData;
    const out = processGraphData(data);
    expect(out.nodes.map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(out.links).toHaveLength(0);
    expect(out.aggregates).toContain("Ventas");
  });

  it("expone el big_picture como 'Visión General' si no hay agregados con nodos", () => {
    const data = {
      nombre_proyecto: "P",
      agregados: [],
      big_picture: {
        descripcion: "BP",
        nodos: [n("x"), n("y", "y", "Evento")],
        aristas: [{ fuente: "x", destino: "y", descripcion: "" }],
      },
    } as unknown as GraphData;
    const out = processGraphData(data);
    expect(out.aggregates.some((a) => a.startsWith("Visión General"))).toBe(true);
    expect(out.nodes.map((x) => x.id).sort()).toEqual(["x", "y"]);
    expect(out.links).toHaveLength(1);
  });

  it("procesa políticas inter-agregados y descarta nodos sueltos", () => {
    const data = {
      nombre_proyecto: "P",
      agregados: [
        { nombre_agregado: "A", descripcion: "desc", nodos: [n("a1"), n("solo")], aristas: [] },
        { nombre_agregado: "B", descripcion: "", nodos: [n("b1", "b1", "Evento")], aristas: [] },
      ],
      politicas_inter_agregados: [{ fuente: "a1", destino: "b1", descripcion: "pol" }],
    } as unknown as GraphData;
    const out = processGraphData(data);
    // a1 y b1 conectados por la política; "solo" (sin aristas) se descarta.
    expect(out.nodes.map((x) => x.id).sort()).toEqual(["a1", "b1"]);
    expect(out.links.some((l) => l.tipo === "politica")).toBe(true);
    // El nombre del agregado con descripción lleva el sufijo " - desc".
    expect(out.aggregates.some((a) => a === "A - desc")).toBe(true);
  });

  it("lanza con jsonData nulo", () => {
    expect(() => processGraphData(null as unknown as GraphData)).toThrow(/vacío|inválido/);
  });
});
