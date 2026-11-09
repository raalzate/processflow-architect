import { describe, expect, it } from "vitest";
import { vistasPedidos } from "@/lib/ontology/__tests__/fixtures/pedidos";
import { construirConocimiento, PROYECTO_SUELTO } from "@/lib/ontology/conocimiento";
import { patronDeTexto } from "@/lib/ontology/query";
import { DESCONOCIDO, caminoGrafo, conocimientoDelCatalogo, consultarGrafo, porQue } from "../agent-knowledge";
import { READ_TOOLS, applyToolCall, startRun } from "../agent-run";
import type { Catalog } from "../agent-retrieval";
import { buildContext, conocimientoDelFoco } from "../litert-agent";

/** El catálogo que ve el agente: las tres vistas de Pedidos con su grafo. */
const catalogo = (): Catalog => ({
  views: vistasPedidos().map((v) => ({ name: v.name, notation: v.notation!, kind: "graph" as const, graph: v.graph })),
});
const nueva = () => startRun({ uid: () => "r1" }, "pregunta");

// T26 · FR-032, FR-033, US5-AC1, US5-AC2, US5-AC4.
describe("patrón en texto → Patron", () => {
  const k = () => conocimientoDelCatalogo(catalogo());

  it("parte sujeto · predicado · objeto aunque los nombres o el predicado tengan espacios", () => {
    expect(patronDeTexto(k(), "Pagar provoca ?x")).toEqual(["Pagar", "provoca", "?x"]);
    expect(patronDeTexto(k(), "Facturar reacciona a PagoRealizado")).toEqual(["Facturar", "reacciona a", "PagoRealizado"]);
    expect(patronDeTexto(k(), "?c dispara ?e")).toEqual(["?c", "dispara", "?e"]);
    expect(patronDeTexto(k(), "Pedido recibido fluye a ?x")).toEqual(["Pedido recibido", "fluye a", "?x"]);
  });

  it("sin predicado reconocible no hay patrón", () => {
    expect(patronDeTexto(k(), "Pagar ?x")).toBeUndefined();
    expect(patronDeTexto(k(), "Pagar come ?x")).toBeUndefined();
    expect(patronDeTexto(k(), "Inventario dispara ?x")).toBeUndefined();
    expect(patronDeTexto(k(), "Inventario dispara ?x", { laxo: true })).toEqual(["Inventario", "dispara", "?x"]);
  });

  it("cada vista del catálogo es una vista del conocimiento (memorizado por contenido)", () => {
    const a = conocimientoDelCatalogo(catalogo());
    expect(a.vistas.map((v) => v.vista)).toEqual(["Event Storming", "Proceso de cobro", "Paisaje"]);
    expect(conocimientoDelCatalogo(catalogo())).toBe(a);
  });
});

describe("herramientas del agente sobre el grafo", () => {
  it("consultar_grafo: filas con nombres, citables", () => {
    const r = consultarGrafo(catalogo(), "Pagar provoca ?x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain("?x = FacturaEmitida");
    expect(r.note.nodes).toEqual(expect.arrayContaining(["PagoRealizado", "FacturaEmitida"]));
    expect(r.note.source).toEqual({ type: "model", name: "grafo: Pagar provoca ?x" });
  });

  it("consultar_grafo: varios patrones con «;» se combinan por la variable", () => {
    const r = consultarGrafo(catalogo(), "?c dispara ?e; ?e activa ?p");
    expect(r.ok && r.text).toContain("?c = Pagar, ?e = PagoRealizado, ?p = Facturar");
  });

  it("sin filas: «desconocido en el modelo», no un error que invite a adivinar (US5-AC2)", () => {
    const r = consultarGrafo(catalogo(), "Cancelar dispara ?x");
    expect(r.ok && r.text).toBe(DESCONOCIDO);
    // Un nombre que el modelo no tiene también es «desconocido», no un patrón ilegible.
    expect(consultarGrafo(catalogo(), "Inventario dispara ?x")).toMatchObject({ ok: true, text: DESCONOCIDO });
  });

  it("la palabra dibujada en la flecha se entiende aunque sea sinónimo («Pagar emite ?x», #742)", () => {
    const r = consultarGrafo(catalogo(), "Pagar emite ?x");
    expect(r.ok && r.text).toContain("PagoRealizado");
    expect(porQue(catalogo(), "Pagar emite PagoRealizado").ok && porQue(catalogo(), "Pagar emite PagoRealizado")).toMatchObject({
      text: expect.stringContaining("(dibujado)"),
    });
  });

  it("camino: la cadena legible, con el paso deducido marcado (US5-AC1)", () => {
    const r = caminoGrafo(catalogo(), "Pagar", "FacturaEmitida", "provoca");
    expect(r.ok && r.text).toBe(
      "1 camino(s):\n- Pagar —dispara→ PagoRealizado —activa (deducido)→ Facturar —emite→ FacturarPedido —dispara→ FacturaEmitida"
    );
    expect(caminoGrafo(catalogo(), "Cancelar", "FacturaEmitida").ok && caminoGrafo(catalogo(), "Cancelar", "FacturaEmitida")).toMatchObject({
      text: DESCONOCIDO,
    });
    expect(caminoGrafo(catalogo(), "Pagar", undefined, "come").ok).toBe(false);
  });

  it("por_que: viñetas hasta lo dibujado", () => {
    const r = porQue(catalogo(), "Pagar provoca FacturaEmitida");
    expect(r.ok && r.text.split("\n")[0]).toBe("- Pagar — provoca → FacturaEmitida (por transitiva)");
    expect(r.ok && r.text).toContain("(dibujado)");
    expect(porQue(catalogo(), "Cancelar provoca FacturaEmitida")).toMatchObject({ text: DESCONOCIDO });
  });
});

describe("las consultas en el ciclo de la corrida", () => {
  it("son herramientas de lectura declaradas", () => {
    expect(READ_TOOLS).toEqual(expect.arrayContaining(["consultar_grafo", "camino", "por_que"]));
  });

  it("cuestan lo que ocupan y dejan una nota citable", () => {
    const s0 = nueva();
    const r = applyToolCall(s0, { tool: "camino", desde: "Pagar", hasta: "FacturaEmitida" }, catalogo());
    expect(r.observation).toContain("Pagar —dispara→ PagoRealizado");
    expect(r.state.budgetLeft).toBe(s0.budgetLeft - r.observation.length);
    expect(r.state.notes).toHaveLength(1);
  });

  it("un patrón ilegible no rompe la corrida ni gasta presupuesto", () => {
    const s0 = nueva();
    const r = applyToolCall(s0, { tool: "consultar_grafo", patron: "qué pasa con todo" }, catalogo());
    expect(r.observation).toMatch(/^No entiendo el patrón/);
    expect(r.state).toBe(s0);
  });
});

describe("buildContext con lo deducido del foco (FR-033)", () => {
  const graph = () => vistasPedidos()[0].graph!;

  it("la pregunta nombra a Pagar: el contexto trae su subgrafo con lo deducido", () => {
    const t = conocimientoDelFoco(graph(), "¿Qué termina provocando pagar?");
    expect(t).toContain("### Conocimiento alrededor de lo que se pregunta");
    expect(t).toContain("Pagar,provoca,FacturaEmitida,i");
    expect(buildContext({ modelFile: "m", message: "¿qué provoca Pagar?", graphData: graph() })).toContain(
      "Pagar,dispara,PagoRealizado,d"
    );
  });

  it("sin foco o sin grafo, nada", () => {
    expect(conocimientoDelFoco(graph(), "hola")).toBe("");
    expect(conocimientoDelFoco(undefined, "pagar")).toBe("");
    expect(buildContext({ modelFile: "m", message: "hola", graphData: graph() })).not.toContain("Conocimiento alrededor");
  });

  it("el conocimiento del foco es el mismo que el de la API pura", () => {
    const k = construirConocimiento(graph(), { tipo: "proyecto" });
    expect(k.elementos[0].proyecto).toBe(PROYECTO_SUELTO);
  });
});
