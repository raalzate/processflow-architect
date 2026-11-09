import { describe, expect, it } from "vitest";
import { toGraphData } from "@/lib/mcp/diagram-builder";
import { construirConocimiento } from "../conocimiento";
import { deducidosDe, explicacionLegible, textoDeHecho } from "../ficha";
import { iriElemento, iriPredicado } from "../iri";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const el = (id: string) => iriElemento(PROYECTO_PEDIDOS, "v-es", id);
const k = () => construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });

// T18 · FR-017, US3-AC4: la sección «Deducido» de la ficha, en palabras.
describe("ficha: lo deducido de un elemento", () => {
  it("lista lo deducido de Pagar, legible, sin lo dibujado", () => {
    const filas = deducidosDe(k(), el("pagar"));
    const textos = filas.map((f) => f.texto);
    expect(textos).toContain("Pagar — provoca → FacturaEmitida");
    expect(textos).toContain("Pagar es Intención");
    expect(textos).toContain("Pagar es Nodo de flujo");
    // Lo dibujado no se repite como deducido.
    expect(textos).not.toContain("Pagar — dispara → PagoRealizado");
    expect(filas.every((f) => f.tripleta[0] === el("pagar") || f.tripleta[2] === el("pagar"))).toBe(true);
  });

  it("incluye lo deducido que LLEGA al elemento (la inversa)", () => {
    const textos = deducidosDe(k(), el("facturar")).map((f) => f.texto);
    expect(textos).toContain("PagoRealizado — activa → Facturar");
  });

  it("orden estable: primero las clases, después las relaciones", () => {
    const filas = deducidosDe(k(), el("pagar"));
    const primeraRelacion = filas.findIndex((f) => f.tipo === "relacion");
    expect(filas.slice(0, primeraRelacion).every((f) => f.tipo === "clase")).toBe(true);
  });

  it("un elemento sin deducciones devuelve lista vacía; uno que no existe también", () => {
    expect(deducidosDe(k(), "kb:nada/x/y")).toEqual([]);
  });

  it("textoDeHecho usa nombres y etiquetas, no IRIs", () => {
    expect(textoDeHecho(k(), [el("pagar"), iriPredicado("dispara"), el("pago-realizado")])).toBe(
      "Pagar — dispara → PagoRealizado"
    );
  });

  it("«¿Por qué?» en viñetas: regla y hechos dibujados al pie", () => {
    const lineas = explicacionLegible(k(), [el("pagar"), iriPredicado("provoca"), el("factura-emitida")])!;
    expect(lineas[0]).toMatchObject({ nivel: 0, texto: "Pagar — provoca → FacturaEmitida", regla: "transitiva" });
    const dibujados = lineas.filter((l) => l.dibujado).map((l) => l.texto);
    expect(dibujados).toEqual(
      expect.arrayContaining([
        "Pagar — dispara → PagoRealizado",
        "Facturar — reacciona a → PagoRealizado",
        "Facturar — emite → FacturarPedido",
        "FacturarPedido — dispara → FacturaEmitida",
      ])
    );
    expect(lineas.every((l, i) => i === 0 || l.nivel > 0)).toBe(true);
    expect(explicacionLegible(k(), ["kb:a", "pf:x", "kb:b"])).toBeUndefined();
  });

  it("funciona con el lienzo suelto (GraphData)", () => {
    const suelto = construirConocimiento(toGraphData(modeloES()), { tipo: "proyecto" });
    const iri = suelto.elementos.find((e) => e.id === "pagar")!.iri;
    expect(deducidosDe(suelto, iri).length).toBeGreaterThan(0);
  });
});
