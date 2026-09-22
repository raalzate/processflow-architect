import { describe, expect, it } from "vitest";

import { relayout, relayoutConMedida, type DiagramModel } from "../../mcp/diagram-builder";
import {
  disponerLegible,
  esGeometriaManual,
  medirDisposicion,
  presupuestoDe,
  PRESUPUESTO_MS,
  PRESUPUESTO_TECHO_MS,
  resumenDeLegibilidad,
} from "../legible";
import { medirModelo } from "../modelo";
import { FIXTURES } from "./fixtures";

const fixture = (id: string): DiagramModel => FIXTURES.find((f) => f.id === id)!.modelo();

/** Cadena de `n` tareas en fila, con relaciones que saltan de dos en dos. */
function diagramaDe(n: number): DiagramModel {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    nombre: `Elemento ${i}`,
    tipo_elemento: "Tarea",
    container: "",
  }));
  const edges = [];
  for (let i = 0; i + 1 < n; i++) edges.push({ fuente: `n${i}`, destino: `n${i + 1}` });
  for (let i = 0; i + 2 < n; i += 2) edges.push({ fuente: `n${i}`, destino: `n${i + 2}` });
  return { meta: { nombre_proyecto: "sintético", notation: "bpmn" }, nodes, edges } as DiagramModel;
}

describe("disponerLegible", () => {
  it("TS-018 · informa la medida antes y después", () => {
    const d = relayoutConMedida(fixture("geiser-paisaje-de-sistemas"));
    expect(d.legibilidad.antes.relaciones).toBeGreaterThan(0);
    expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(d.legibilidad.antes.cruces);
    expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(d.legibilidad.antes.sobreCaja);
  });

  it("TS-006 · SC-003 · un diagrama de 50 elementos respeta su presupuesto de 200 ms", () => {
    // El tope del test es más ancho que el presupuesto a propósito: bajo la
    // instrumentación de cobertura el mismo cálculo tarda varias veces más, y lo
    // que hay que probar es que la disposición SE CORTA sola, no cuánto corre la
    // máquina del día. Sin cobertura, este diagrama se dispone en ~45 ms.
    const t0 = Date.now();
    relayout(diagramaDe(50));
    expect(Date.now() - t0).toBeLessThan(PRESUPUESTO_MS * 3);
  });

  it("C3 · el presupuesto es 200 ms hasta 50 elementos y 2 s por encima", () => {
    expect(presupuestoDe(diagramaDe(50))).toBe(PRESUPUESTO_MS);
    expect(presupuestoDe(diagramaDe(80))).toBe(PRESUPUESTO_TECHO_MS);
  });

  it("TS-007 · con el presupuesto agotado devuelve lo mejor hallado y lo declara parcial", () => {
    let t = 0;
    const d = disponerLegible(relayout(fixture("geiser-big-picture-del-dominio")), {
      presupuestoMs: 1,
      ahora: () => (t += 500),
    });
    expect(d.parcial).toBe(true);
    expect(d.model.nodes).toHaveLength(fixture("geiser-big-picture-del-dominio").nodes.length);
  });

  it("TS-008 · es determinista: dos disposiciones del mismo modelo coinciden", () => {
    const a = relayout(fixture("cobranza-y-aplicacion-de-pagos"));
    const b = relayout(fixture("cobranza-y-aplicacion-de-pagos"));
    expect(a.nodes).toEqual(b.nodes);
    expect(a.edges).toEqual(b.edges);
  });

  it("TS-012 · la geometría que puso una persona sobrevive a la reorganización", () => {
    const model = relayout(fixture("cobranza-y-aplicacion-de-pagos"));
    const aMano = { x: 12, y: 34 };
    const conManual: DiagramModel = {
      ...model,
      edges: model.edges.map((e, i) => (i === 0 ? { ...e, midpoints: [aMano] } : e)),
    };
    const d = disponerLegible(conManual);
    expect(d.model.edges[0].midpoints).toEqual([aMano]);
    expect(d.model.edges[0].geometriaAuto).toBeUndefined();
    expect(d.legibilidad.conRecorridosManuales).toBe(true);
  });

  it("TS-013 · la geometría calculada sí se recalcula", () => {
    const model = relayout(fixture("cobranza-y-aplicacion-de-pagos"));
    const vieja = { x: -999, y: -999 };
    const conAuto: DiagramModel = {
      ...model,
      edges: model.edges.map((e) => ({ ...e, midpoints: [vieja], geometriaAuto: true })),
    };
    const d = disponerLegible(conAuto);
    expect(d.model.edges.some((e) => e.midpoints?.some((p) => p.x === vieja.x))).toBe(false);
  });

  it("TS-015 · sin relaciones que pisen cajas, el enrutado por defecto no se toca", () => {
    const model: DiagramModel = {
      meta: { nombre_proyecto: "dos cajas", notation: "c4" },
      nodes: [
        { id: "a", nombre: "A", tipo_elemento: "Persona", container: "" },
        { id: "b", nombre: "B", tipo_elemento: "Sistema", container: "" },
      ],
      edges: [{ fuente: "a", destino: "b" }],
    } as DiagramModel;
    const d = relayoutConMedida(model);
    expect(d.model.edges[0].routing).toBeUndefined();
    expect(d.model.edges[0].midpoints).toBeUndefined();
  });

  it("los diagramas de secuencia quedan fuera: manda el tiempo, no la geometría", () => {
    const model: DiagramModel = {
      meta: { nombre_proyecto: "secuencia", notation: "uml" },
      nodes: [
        { id: "a", nombre: "A", tipo_elemento: "Línea de Vida", container: "", x: 0, y: 0, width: 120, height: 400 },
        { id: "b", nombre: "B", tipo_elemento: "Línea de Vida", container: "", x: 400, y: 0, width: 120, height: 400 },
      ],
      edges: [{ fuente: "a", destino: "b", orden: 1 }],
    } as DiagramModel;
    const d = disponerLegible(model);
    expect(d.model).toBe(model);
  });

  it("medirDisposicion no mueve nada", () => {
    const model = relayout(fixture("venta-y-underwriting-en-eva"));
    const d = medirDisposicion(model);
    expect(d.model).toBe(model);
    expect(d.legibilidad.antes).toEqual(d.legibilidad.despues);
    expect(d.legibilidad.antes).toEqual(medirModelo(model));
  });
});

describe("resumenDeLegibilidad", () => {
  const medida = {
    antes: { cruces: 9, sobreCaja: 17, sinRuta: 0, relaciones: 108 },
    despues: { cruces: 4, sobreCaja: 2, sinRuta: 0, relaciones: 108 },
    conRecorridosManuales: false,
  };

  it("TS-018 · dice los dos números, antes y después", () => {
    const texto = resumenDeLegibilidad(medida);
    expect(texto).toContain("cruces 9 → 4");
    expect(texto).toContain("relaciones sobre caja ajena 17 → 2");
  });

  it("C5 · declara si la medida incluye recorridos hechos a mano", () => {
    expect(resumenDeLegibilidad({ ...medida, conRecorridosManuales: true })).toContain("una persona");
  });

  it("FR-016 · avisa cuando la disposición es parcial", () => {
    expect(resumenDeLegibilidad(medida, true)).toContain("PARCIAL");
  });
});

describe("esGeometriaManual", () => {
  it("la geometría anterior a la feature se considera manual (FR-017)", () => {
    expect(esGeometriaManual({ fuente: "a", destino: "b", midpoints: [{ x: 1, y: 2 }] })).toBe(true);
    expect(
      esGeometriaManual({ fuente: "a", destino: "b", midpoints: [{ x: 1, y: 2 }], geometriaAuto: true })
    ).toBe(false);
    expect(esGeometriaManual({ fuente: "a", destino: "b" })).toBe(false);
  });
});
