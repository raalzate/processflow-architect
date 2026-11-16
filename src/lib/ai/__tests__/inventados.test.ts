import { describe, expect, it } from "vitest";
import { inexistentesEn, nombresCitados } from "../eval-ontology";
import { inventadosEnRespuesta } from "../agent-knowledge";
import { vistasPedidos } from "@/lib/ontology/__tests__/fixtures/pedidos";
import type { Catalog } from "../agent-retrieval";

const VOCAB = ["Pagar", "PagoRealizado", "Facturar", "FacturaEmitida", "Pagos", "emite"];

// #767: el detector del banco de evaluación, usable en vivo en el chat.
describe("inexistentesEn", () => {
  it("encuentra el nombre citado que no está en el modelo", () => {
    expect(inexistentesEn("Pagar emite «Facturita».", VOCAB)).toEqual(["Facturita"]);
  });

  it("sin negrita: en el chat **Resumen** es formato, no un nombre", () => {
    expect(nombresCitados("**Resumen**: Pagar dispara PagoRealizado.", { negrita: false })).toEqual(["PagoRealizado"]);
    expect(inexistentesEn("**Resumen**: Pagar dispara PagoRealizado.", VOCAB, VOCAB, { negrita: false })).toEqual([]);
  });

  it("con negrita (el banco) se sigue contando como cita, como antes", () => {
    expect(nombresCitados("**Facturita**")).toEqual(["Facturita"]);
  });
});

describe("inventadosEnRespuesta", () => {
  const cat: Catalog = {
    views: vistasPedidos().map((v) => ({ name: v.name, kind: "graph", notation: v.notation, graph: v.graph })) as Catalog["views"],
  };

  it("marca un elemento que el modelo no tiene", () => {
    expect(inventadosEnRespuesta(cat, "Pagar dispara «ReembolsoEmitido».")).toEqual(["ReembolsoEmitido"]);
  });

  it("no marca elementos ni vistas que existen", () => {
    const vista = cat.views[0].name;
    expect(inventadosEnRespuesta(cat, `En «${vista}», Pagar dispara PagoRealizado.`)).toEqual([]);
  });

  it("sin vistas con grafo no hay contra qué comparar: no marca nada", () => {
    expect(inventadosEnRespuesta({ views: [] }, "«Cualquier Cosa»")).toEqual([]);
  });
});
