import { describe, expect, it } from "vitest";
import { toGraphData } from "@/lib/mcp/diagram-builder";
import { construirConocimiento, iriElemento, iriPredicado, literal, RDFS_LABEL } from "..";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const pf = iriPredicado;
const pedidos = () => ({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() });

// T16 · FR-014, FR-021.
describe("construirConocimiento", () => {
  it("alcance proyecto: todas las vistas, razonadas con su notación", () => {
    const k = construirConocimiento(pedidos(), { tipo: "proyecto" });
    const es = (id: string) => iriElemento(PROYECTO_PEDIDOS, "v-es", id);
    expect(k.store.has([es("pagar"), pf("provoca"), es("factura-emitida")])).toBe(true);
    expect(k.store.has([iriElemento(PROYECTO_PEDIDOS, "v-c4", "pagos"), pf("depende_de"), iriElemento(PROYECTO_PEDIDOS, "v-c4", "pasarela")])).toBe(true);
    expect(k.deducidos).toBeGreaterThan(0);
    expect(k.topeAlcanzado).toBe(false);
    expect(k.hallazgos).toEqual([]);
  });

  it("alcance vista ⊂ alcance proyecto", () => {
    const vista = construirConocimiento(pedidos(), { tipo: "vista", vista: "v-bpmn" });
    const proyecto = construirConocimiento(pedidos(), { tipo: "proyecto" });
    const hechos = vista.store.match();
    expect(hechos.length).toBeGreaterThan(0);
    expect(hechos.length).toBeLessThan(proyecto.store.size);
    for (const h of hechos) expect(proyecto.store.has([h.s, h.p, h.o])).toBe(true);
    expect(hechos.every((h) => h.s.includes("/v-bpmn/"))).toBe(true);
  });

  it("acepta un GraphData suelto (el lienzo abierto)", () => {
    const k = construirConocimiento(toGraphData(modeloES()), { tipo: "proyecto" });
    expect(k.store.match(undefined, RDFS_LABEL, literal("Pagar"))).toHaveLength(1);
    expect(k.store.match(undefined, pf("provoca")).length).toBeGreaterThan(0);
  });

  it("organización: une sus proyectos y no ve los de otra", () => {
    const orgA = {
      organizacion: "a",
      proyectos: [pedidos(), { proyecto: "inventario", vistas: vistasPedidos().slice(2) }],
    };
    const orgB = { organizacion: "b", proyectos: [{ proyecto: "secreto", vistas: vistasPedidos() }] };
    const ka = construirConocimiento(orgA, { tipo: "organizacion" });
    const kb = construirConocimiento(orgB, { tipo: "organizacion" });
    const proyectos = (k: typeof ka) => new Set(k.store.match().map((h) => h.s.split("/")[0]));
    expect(proyectos(ka)).toEqual(new Set(["kb:pedidos", "kb:inventario"]));
    expect([...proyectos(kb)]).toEqual(["kb:secreto"]);
  });

  it("vista que no existe: conocimiento vacío, sin error", () => {
    const k = construirConocimiento(pedidos(), { tipo: "vista", vista: "no-esta" });
    expect(k.store.size).toBe(0);
  });

  // R-09b: memo por hash. Mismo contenido (aunque sea otro objeto) ⇒ no recalcula.
  it("mismo contenido ⇒ devuelve el mismo conocimiento sin recalcular", () => {
    const a = construirConocimiento(pedidos(), { tipo: "proyecto" });
    const b = construirConocimiento(pedidos(), { tipo: "proyecto" });
    expect(b).toBe(a);
    const vistas = vistasPedidos();
    vistas[0].graph!.notas = "cambió algo";
    const c = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas }, { tipo: "proyecto" });
    expect(c).not.toBe(a);
  });

  it("las vistas Mermaid no aportan hechos", () => {
    const vistas = [
      ...vistasPedidos(),
      { id: "v-m", name: "Mermaid", kind: "mermaid" as const, mermaidCode: "graph TD; A-->B", createdAt: "" },
    ];
    const k = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas }, { tipo: "proyecto" });
    expect(k.store.match().some((h) => h.s.includes("/v-m/"))).toBe(false);
  });
});
