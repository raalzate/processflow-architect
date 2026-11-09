import { describe, expect, it } from "vitest";
import { addEdge, addNode, emptyDiagram } from "@/lib/mcp/diagram-builder";
import { typesWithRole } from "@/lib/notations";
import { conocimientoDeModelo, construirConocimiento } from "../conocimiento";
import { PRESUPUESTO_CONTEXTO, contextoParaIA, focoDeTexto } from "../context";
import { iriElemento } from "../iri";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const es = (n: string) => iriElemento(PROYECTO_PEDIDOS, "v-es", n);
const proyecto = () => construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });

/** Una cadena larga de comandos y eventos: más hechos de los que entran. */
function cadenaLarga(n: number) {
  const cmd = typesWithRole("ddd", "command")[0];
  const evt = typesWithRole("ddd", "event")[0];
  let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
  for (let i = 0; i < n; i++) {
    m = addNode(m, { id: `c${i}`, nombre: `Comando número ${i}`, tipo_elemento: cmd }).model;
    m = addNode(m, { id: `e${i}`, nombre: `Evento número ${i}`, tipo_elemento: evt }).model;
    m = addEdge(m, { fuente: `c${i}`, destino: `e${i}`, descripcion: "dispara" });
    m = addEdge(m, { fuente: `c0`, destino: `e${i}`, descripcion: "dispara" });
  }
  return conocimientoDeModelo(m);
}

// T24 · FR-033, US5-AC3, R-10.
describe("contextoParaIA", () => {
  it("el foco y sus hechos cercanos, en TOON", () => {
    const t = contextoParaIA(proyecto(), [es("pagar")]);
    expect(t).toMatch(/^foco\[1\]\{nombre,rol\}:\n {2}Pagar,command/);
    expect(t).toContain("hechos[");
    expect(t).toContain("Pagar,dispara,PagoRealizado,d");
    expect(t).toContain("Cliente,invoca,Pagar,d");
  });

  it("a 2 saltos: llega a Facturar (vía PagoRealizado) pero no a FacturaEmitida por lo dibujado", () => {
    const t = contextoParaIA(proyecto(), [es("pagar")], 10_000);
    expect(t).toContain("Facturar,reacciona_a,PagoRealizado,d");
    expect(t).not.toContain("FacturarPedido,dispara,FacturaEmitida");
  });

  it("incluye lo deducido del foco, marcado como tal", () => {
    const t = contextoParaIA(proyecto(), [es("pagar")], 10_000);
    expect(t).toContain("Pagar,provoca,FacturaEmitida,i");
  });

  it("respeta el presupuesto y avisa cuántos hechos quedaron afuera", () => {
    const k = cadenaLarga(40);
    const t = contextoParaIA(k, [iriElemento("actual", "grafo", "c0")], 600);
    expect(t.length).toBeLessThanOrEqual(600);
    expect(t).toMatch(/… \d+ hechos más lejos del foco/);
    expect(contextoParaIA(k, [iriElemento("actual", "grafo", "c0")]).length).toBeLessThanOrEqual(PRESUPUESTO_CONTEXTO);
  });

  it("un presupuesto donde ni la cabecera entra devuelve nada, nunca más del tope (#742)", () => {
    const k = proyecto();
    for (const tope of [0, 10, 50, 90])
      expect(contextoParaIA(k, [es("pagar")], tope).length).toBeLessThanOrEqual(tope);
    expect(contextoParaIA(k, [es("pagar")], 10)).toBe("");
  });

  it("prioriza el foco: lo dibujado del foco antes que lo deducido y que lo lejano", () => {
    const t = contextoParaIA(proyecto(), [es("pagar")], 10_000);
    const filas = t.split("\n").filter((l) => /,(d|i)$/.test(l));
    const primeroDeducido = filas.findIndex((l) => l.endsWith(",i"));
    const lejano = filas.findIndex((l) => l.includes("Facturar,reacciona_a"));
    expect(filas.slice(0, primeroDeducido).every((l) => l.includes("Pagar"))).toBe(true);
    expect(lejano).toBeGreaterThan(filas.findIndex((l) => l.includes("Pagar,dispara,PagoRealizado")));
  });

  it("sin foco no manda nada; un foco sin flechas manda el foco y su contenedor", () => {
    expect(contextoParaIA(proyecto(), [])).toBe("");
    const t = contextoParaIA(conocimientoDeModelo(modeloES()), [iriElemento("actual", "grafo", "cancelar")]);
    expect(t).toContain("Cancelar");
    expect(t).not.toContain("dispara");
  });

  it("focoDeTexto: el nombre más largo gana y no arrastra al que contiene", () => {
    const k = proyecto();
    expect(focoDeTexto(k, "¿qué provoca FacturarPedido?")).toEqual([es("facturar-pedido")]);
    expect(focoDeTexto(k, "¿Qué hay entre pago realizado y facturar?")).toEqual([es("facturar")]);
    expect(focoDeTexto(k, "nada que ver")).toEqual([]);
  });
});
