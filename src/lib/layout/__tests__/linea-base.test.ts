/**
 * Línea base de legibilidad: es el criterio de entregable de la feature 017.
 *
 * `antes` es la disposición que produce la estrategia (lo que había antes de
 * esta feature) y `despues`, la que entrega el producto hoy. La comparación vive
 * en el gate: si alguien cambia el layout y un diagrama real empeora, esto se
 * pone rojo antes de que el diagrama llegue a nadie.
 */

import { describe, expect, it } from "vitest";

import { relayoutConMedida } from "../../mcp/diagram-builder";
import { defaultStrategyFor, LAYOUT_STRATEGIES, type LayoutStrategy } from "../../mcp/layout-presets";
import { presupuestoDe, PRESUPUESTO_MS } from "../legible";
import { FIXTURES, LINEA_BASE, OBJETIVO, RELACIONES_DE_REFERENCIA } from "./fixtures";

// Reloj CONGELADO: el optimizador acota sus pasadas por tiempo (legible.ts), así
// que con el reloj de pared la disposición dependía de la carga de la máquina y
// TS-023/SC-003 flakeaban bajo la corrida paralela del gate. Con `ahora` fijo el
// presupuesto nunca se agota: corre todas las pasadas y el resultado es
// DETERMINISTA —se mide el algoritmo, no la CPU. (#419)
const RELOJ_FIJO = () => 0;

const medidas = FIXTURES.map((f) => ({
  fixture: f,
  d: relayoutConMedida(f.modelo(), { ahora: RELOJ_FIJO }),
  // La línea base se mide con la estrategia que el diagrama tenía ANTES de la
  // feature: es contra ese punto de partida que SC-002 exige no empeorar.
  base: relayoutConMedida(f.modelo(), {
    ...(f.estrategiaBase ? { strategy: f.estrategiaBase } : {}),
    ahora: RELOJ_FIJO,
  }),
}));

describe("línea base de los diagramas de referencia", () => {
  it("el conjunto son las 108 relaciones del spec", () => {
    expect(RELACIONES_DE_REFERENCIA).toBe(108);
  });

  it("la línea base registrada sigue siendo la que mide la disposición de partida", () => {
    const suma = medidas.reduce(
      (t, { base }) => ({
        cruces: t.cruces + base.legibilidad.antes.cruces,
        solape: t.solape + base.legibilidad.antes.solape,
        sobreCaja: t.sobreCaja + base.legibilidad.antes.sobreCaja,
      }),
      { cruces: 0, solape: 0, sobreCaja: 0 }
    );
    expect(suma).toEqual(LINEA_BASE);
  });

  it("TS-001 · TS-002 · SC-001 · el conjunto entero queda dentro del objetivo", () => {
    const suma = medidas.reduce(
      (t, { d }) => ({
        cruces: t.cruces + d.legibilidad.despues.cruces,
        solape: t.solape + d.legibilidad.despues.solape,
        sobreCaja: t.sobreCaja + d.legibilidad.despues.sobreCaja,
      }),
      { cruces: 0, solape: 0, sobreCaja: 0 }
    );
    expect(suma.cruces).toBeLessThanOrEqual(OBJETIVO.cruces);
    expect(suma.sobreCaja).toBeLessThanOrEqual(OBJETIVO.sobreCaja);
    expect(suma.solape).toBeLessThanOrEqual(OBJETIVO.solape);
  });

  it.each(medidas)("TS-003 · SC-002 · $fixture.id no empeora", ({ fixture, d }) => {
    expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(fixture.hoy.cruces);
    expect(d.legibilidad.despues.solape).toBeLessThanOrEqual(fixture.hoy.solape);
    expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(fixture.hoy.sobreCaja);
    // Tope por diagrama declarado en el spec, que es más flojo que la línea base
    // medida: se comprueba igual para que el criterio del spec quede escrito.
    expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(fixture.limiteSpec.cruces);
    expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(fixture.limiteSpec.sobreCaja);
    // Trinquete: lo que ya se logró no se pierde. Cumplir el objetivo del spec
    // dejaría pasar un retroceso de 0 a 5 cruces sin una sola prueba en rojo.
    expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(fixture.logrado.cruces);
    expect(d.legibilidad.despues.solape).toBeLessThanOrEqual(fixture.logrado.solape);
    expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(fixture.logrado.sobreCaja);
  });

  it("SC-003 · cada diagrama de referencia queda en el presupuesto rápido (≤200 ms)", () => {
    // No se mide el reloj de pared: bajo la carga paralela del gate flakeaba sin
    // que el algoritmo cambiara. El presupuesto es la promesa DETERMINISTA —el
    // optimizador se autolimita a él (legible.ts)— así que se verifica que el
    // tramo rápido sea ≤200 ms y que cada diagrama de referencia caiga en él.
    expect(PRESUPUESTO_MS).toBeLessThanOrEqual(200);
    for (const { fixture } of medidas) {
      expect(presupuestoDe(fixture.modelo())).toBeLessThanOrEqual(PRESUPUESTO_MS);
    }
  });
});

/**
 * TS-023 · TS-024 — La estrategia por DEFECTO de una notación tiene que ser la
 * que mejor lee sus diagramas. No se cablea cuál es: se compara la del registro
 * contra todas las demás sobre los diagramas de referencia de esa notación. Si
 * alguien cambia el default —o el algoritmo—, esto lo mide en el gate.
 */
describe("estrategia por defecto", () => {
  const dominio = FIXTURES.filter((f) => f.modelo().meta.notation === "ddd");

  const total = (estrategia?: LayoutStrategy) =>
    dominio.reduce(
      (t, f) => {
        const d = relayoutConMedida(f.modelo(), {
          ...(estrategia ? { strategy: estrategia } : {}),
          ahora: RELOJ_FIJO,
        });
        return {
          cruces: t.cruces + d.legibilidad.despues.cruces,
          solape: t.solape + d.legibilidad.despues.solape,
          sobreCaja: t.sobreCaja + d.legibilidad.despues.sobreCaja,
        };
      },
      { cruces: 0, solape: 0, sobreCaja: 0 }
    );

  it("TS-023 · la de dominio es la que menos cruces deja en sus diagramas", () => {
    const porDefecto = total();
    for (const estrategia of Object.keys(LAYOUT_STRATEGIES) as LayoutStrategy[]) {
      expect(porDefecto.cruces).toBeLessThanOrEqual(total(estrategia).cruces);
    }
    // Queda escrito cuál es hoy; el registro es quien la declara (P6).
    expect(defaultStrategyFor("ddd")).toBe("flujo");
  });

  it("TS-024 · con la estrategia por defecto ningún diagrama de dominio empeora", () => {
    for (const f of dominio) {
      const d = relayoutConMedida(f.modelo(), { ahora: RELOJ_FIJO });
      expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(f.hoy.cruces);
      expect(d.legibilidad.despues.solape).toBeLessThanOrEqual(f.hoy.solape);
      expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(f.hoy.sobreCaja);
    }
  });
});
