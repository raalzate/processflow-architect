import { afterEach, describe, expect, it, vi } from "vitest";
import { conocimientoDeModelo, construirConocimiento } from "../conocimiento";
import { explicacionLegible } from "../ficha";
import { iriPredicado } from "../iri";
import { validar } from "../validate";
import { ELEMENTOS_POR_VISTA, procesoLineal, proyectoSintetico } from "./fixtures/sintetico";

/**
 * T17 · SC-003, FR-021, Q11 — el MECANISMO, sin reloj.
 *
 * Los milisegundos (< 500 ms el proyecto, < 50 ms una vista) los mide
 * `scripts/bench-ontology.ts` FUERA del gate: un tope de tiempo en un test mide
 * la máquina del día y se rompe bajo cobertura (regla RELOJ, #376). Acá se
 * prueba lo que hace posible ese número: el proyecto entero razona sin tocar
 * el tope, y editar nada no re-expresa nada.
 */
describe("rendimiento (50 vistas × 40 elementos): el mecanismo", { timeout: 30_000 }, () => {
  afterEach(() => vi.restoreAllMocks());

  it("el proyecto completo razona y valida sin llegar al tope", () => {
    const p = proyectoSintetico("perf", 50);
    const k = construirConocimiento(p, { tipo: "proyecto" });
    expect(k.elementos).toHaveLength(50 * ELEMENTOS_POR_VISTA);
    expect(k.topeAlcanzado).toBe(false);
    expect(k.deducidos).toBeGreaterThan(10_000);
    // Las vistas no se mezclan: ningún deducido cruza de una vista a otra sin vínculo.
    expect(k.store.match().every((h) => h.s.split("/")[1] === h.o.split("/")[1] || !h.o.startsWith("kb:"))).toBe(true);
    expect(validar(k).length).toBeGreaterThan(0);
    // Sin tope de TIEMPO (eso lo mide el bench): sólo margen para la cobertura.
  }, 60_000);

  // #742 · O2: la clausura de una cadena larga, completa y sin repetir trabajo.
  it("un BPMN lineal de 250 tareas cierra `precede` completo sin llegar al tope", () => {
    const n = 250;
    const k = conocimientoDeModelo(procesoLineal(n));
    expect(k.topeAlcanzado).toBe(false);
    expect(k.store.match(undefined, iriPredicado("precede"))).toHaveLength((n * (n - 1)) / 2);
    // La explicación de la punta a punta sigue bajando hasta lo dibujado.
    const lineas = explicacionLegible(k, [k.elementos[0].iri, iriPredicado("precede"), k.elementos[n - 1].iri]);
    expect(lineas?.some((l) => l.dibujado)).toBe(true);
  }, 60_000);

  it("recalcular sin cambios no vuelve a serializar ni a razonar (memo por identidad y hash)", () => {
    const p = proyectoSintetico("perf-memo", 10);
    const k = construirConocimiento(p, { tipo: "proyecto" });
    const stringify = vi.spyOn(JSON, "stringify");
    // Otro objeto de entrada, mismas vistas: es lo que pasa con el estado de React tras editar otra cosa.
    expect(construirConocimiento({ proyecto: p.proyecto, vistas: [...p.vistas] }, { tipo: "proyecto" })).toBe(k);
    expect(stringify.mock.calls.filter((c) => typeof c[0] === "object" && c[0] && "big_picture" in c[0])).toEqual([]);
  });

  it("editar UNA vista re-expresa sólo esa", () => {
    const p = proyectoSintetico("perf-una", 10);
    construirConocimiento(p, { tipo: "proyecto" });
    const vistas = [...p.vistas];
    vistas[3] = { ...vistas[3], graph: { ...vistas[3].graph!, notas: "editada" } };
    const stringify = vi.spyOn(JSON, "stringify");
    construirConocimiento({ proyecto: p.proyecto, vistas }, { tipo: "proyecto" });
    const grafos = stringify.mock.calls.filter((c) => typeof c[0] === "object" && c[0] && "big_picture" in c[0]);
    expect(grafos).toHaveLength(1);
  });
});
