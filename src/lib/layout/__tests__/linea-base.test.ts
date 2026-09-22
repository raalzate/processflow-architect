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
import { FIXTURES, LINEA_BASE, OBJETIVO, RELACIONES_DE_REFERENCIA } from "./fixtures";

const medidas = FIXTURES.map((f) => ({ fixture: f, d: relayoutConMedida(f.modelo()) }));

describe("línea base de los diagramas de referencia", () => {
  it("el conjunto son las 108 relaciones del spec", () => {
    expect(RELACIONES_DE_REFERENCIA).toBe(108);
  });

  it("la línea base registrada sigue siendo la que mide la disposición de partida", () => {
    const suma = medidas.reduce(
      (t, { d }) => ({
        cruces: t.cruces + d.legibilidad.antes.cruces,
        sobreCaja: t.sobreCaja + d.legibilidad.antes.sobreCaja,
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
  });

  it("SC-003 · cada diagrama de referencia se dispone en menos de 200 ms", () => {
    for (const { fixture } of medidas) {
      const t0 = Date.now();
      relayoutConMedida(fixture.modelo());
      expect(Date.now() - t0).toBeLessThan(200);
    }
  });
});
