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
import { FIXTURES, LINEA_BASE, OBJETIVO, RELACIONES_DE_REFERENCIA } from "./fixtures";

const medidas = FIXTURES.map((f) => ({
  fixture: f,
  d: relayoutConMedida(f.modelo()),
  // La línea base se mide con la estrategia que el diagrama tenía ANTES de la
  // feature: es contra ese punto de partida que SC-002 exige no empeorar.
  base: relayoutConMedida(f.modelo(), f.estrategiaBase ? { strategy: f.estrategiaBase } : {}),
}));

describe("línea base de los diagramas de referencia", () => {
  it("el conjunto son las 108 relaciones del spec", () => {
    expect(RELACIONES_DE_REFERENCIA).toBe(108);
  });

  it("la línea base registrada sigue siendo la que mide la disposición de partida", () => {
    const suma = medidas.reduce(
      (t, { base }) => ({
        cruces: t.cruces + base.legibilidad.antes.cruces,
        sobreCaja: t.sobreCaja + base.legibilidad.antes.sobreCaja,
      }),
      { cruces: 0, sobreCaja: 0 }
    );
    expect(suma).toEqual(LINEA_BASE);
  });

  it("TS-001 · TS-002 · SC-001 · el conjunto entero queda dentro del objetivo", () => {
    const suma = medidas.reduce(
      (t, { d }) => ({
        cruces: t.cruces + d.legibilidad.despues.cruces,
        sobreCaja: t.sobreCaja + d.legibilidad.despues.sobreCaja,
      }),
      { cruces: 0, sobreCaja: 0 }
    );
    expect(suma.cruces).toBeLessThanOrEqual(OBJETIVO.cruces);
    expect(suma.sobreCaja).toBeLessThanOrEqual(OBJETIVO.sobreCaja);
  });

  it.each(medidas)("TS-003 · SC-002 · $fixture.id no empeora", ({ fixture, d }) => {
    expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(fixture.hoy.cruces);
    expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(fixture.hoy.sobreCaja);
    // Tope por diagrama declarado en el spec, que es más flojo que la línea base
    // medida: se comprueba igual para que el criterio del spec quede escrito.
    expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(fixture.limiteSpec.cruces);
    expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(fixture.limiteSpec.sobreCaja);
    // Trinquete: lo que ya se logró no se pierde. Cumplir el objetivo del spec
    // dejaría pasar un retroceso de 0 a 5 cruces sin una sola prueba en rojo.
    expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(fixture.logrado.cruces);
    expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(fixture.logrado.sobreCaja);
  });

  it("SC-003 · cada diagrama de referencia se dispone en menos de 200 ms", () => {
    for (const { fixture } of medidas) {
      const t0 = Date.now();
      relayoutConMedida(fixture.modelo());
      expect(Date.now() - t0).toBeLessThan(200);
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
        const d = relayoutConMedida(f.modelo(), estrategia ? { strategy: estrategia } : {});
        return {
          cruces: t.cruces + d.legibilidad.despues.cruces,
          sobreCaja: t.sobreCaja + d.legibilidad.despues.sobreCaja,
        };
      },
      { cruces: 0, sobreCaja: 0 }
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
      const d = relayoutConMedida(f.modelo());
      expect(d.legibilidad.despues.cruces).toBeLessThanOrEqual(f.hoy.cruces);
      expect(d.legibilidad.despues.sobreCaja).toBeLessThanOrEqual(f.hoy.sobreCaja);
    }
  });
});
