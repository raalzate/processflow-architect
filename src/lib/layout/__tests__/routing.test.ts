import { describe, expect, it } from "vitest";

import { medirLegibilidad, recortarABorde, type Caja, type Punto, type Relacion } from "../metrics";
import { rutarRelaciones } from "../routing";

const caja = (id: string, x: number, y: number, extra: Partial<Caja> = {}): Caja => ({
  id,
  x,
  y,
  width: 100,
  height: 60,
  ...extra,
});

/** Completa los quiebres con las puntas, como hace el dibujo del lienzo. */
function conRuta(rel: Relacion, cajas: Caja[], quiebres: Punto[]): Relacion {
  const f = cajas.find((c) => c.id === rel.fuente)!;
  const d = cajas.find((c) => c.id === rel.destino)!;
  return {
    ...rel,
    puntos: [
      recortarABorde(f, quiebres[0]),
      ...quiebres,
      recortarABorde(d, quiebres[quiebres.length - 1]),
    ],
  };
}

/** a → b en recta pasa justo por encima de `medio`. */
const conObstaculo = () => ({
  cajas: [caja("a", 0, 0), caja("medio", 300, 0), caja("b", 600, 0)],
  relaciones: [{ id: "e0", fuente: "a", destino: "b" }] as Relacion[],
});

describe("rutarRelaciones", () => {
  it("TS-002 · la relación que pisaría una caja recibe un recorrido que la esquiva", () => {
    const { cajas, relaciones } = conObstaculo();
    expect(medirLegibilidad(cajas, relaciones).sobreCaja).toBe(1);

    const rutas = rutarRelaciones(cajas, relaciones);
    const quiebres = rutas.get("e0");
    expect(quiebres?.length).toBeGreaterThan(0);

    const medida = medirLegibilidad(cajas, [conRuta(relaciones[0], cajas, quiebres!)]);
    expect(medida.sobreCaja).toBe(0);
  });

  it("TS-016 · la relación que ya se lee bien conserva su enrutado por defecto", () => {
    const cajas = [caja("a", 0, 0), caja("medio", 300, 0), caja("b", 600, 0), caja("c", 0, 400), caja("d", 600, 400)];
    const relaciones: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "c", destino: "d" },
    ];
    const rutas = rutarRelaciones(cajas, relaciones);
    expect(rutas.has("e0")).toBe(true);
    // La de abajo no pisa nada: no se rutea y sigue mandando su notación (D2).
    expect(rutas.has("e1")).toBe(false);
  });

  it("TS-009 · un elemento rodeado por los cuatro lados igual recibe recorrido", () => {
    const cajas = [
      caja("preso", 300, 300),
      caja("norte", 300, 200),
      caja("sur", 300, 400),
      caja("oeste", 180, 300),
      caja("este", 420, 300),
      caja("lejos", 900, 300),
    ];
    const relaciones: Relacion[] = [{ id: "e0", fuente: "preso", destino: "lejos" }];
    const rutas = rutarRelaciones(cajas, relaciones);
    // Con o sin quiebres, la relación tiene un recorrido y el diagrama se dibuja.
    const quiebres = rutas.get("e0");
    const medida = medirLegibilidad(
      cajas,
      quiebres?.length ? [conRuta(relaciones[0], cajas, quiebres)] : relaciones
    );
    expect(medida.sinRuta).toBe(0);
    expect(medida.relaciones).toBe(1);
  });

  it("FR-005 · un contenedor no se esquiva: envuelve a sus propios hijos", () => {
    const cajas = [
      caja("banda", 0, 0, { width: 800, height: 300, esContenedor: true }),
      caja("a", 40, 100, { container: "banda" }),
      caja("b", 600, 100, { container: "banda" }),
    ];
    expect(rutarRelaciones(cajas, [{ id: "e0", fuente: "a", destino: "b" }]).size).toBe(0);
  });

  it("FR-010 · la relación fija no se rutea", () => {
    const { cajas, relaciones } = conObstaculo();
    const rutas = rutarRelaciones(cajas, relaciones, { fijas: new Set(["e0"]) });
    expect(rutas.has("e0")).toBe(false);
  });

  it("FR-011 · es determinista", () => {
    const { cajas, relaciones } = conObstaculo();
    const a = rutarRelaciones(cajas, relaciones);
    const b = rutarRelaciones(cajas, relaciones);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("FR-004 · el ruteo no deja el diagrama con más cruces de los que tenía", () => {
    const cajas = [
      caja("a", 0, 0),
      caja("medio", 300, 0),
      caja("b", 600, 0),
      caja("c", 300, 220),
      caja("d", 300, -220),
    ];
    const relaciones: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "c", destino: "d" },
    ];
    const base = medirLegibilidad(cajas, relaciones);
    const rutas = rutarRelaciones(cajas, relaciones);
    const conRutas = relaciones.map((r) => {
      const q = rutas.get(r.id);
      return q?.length ? conRuta(r, cajas, q) : r;
    });
    expect(medirLegibilidad(cajas, conRutas).cruces).toBeLessThanOrEqual(base.cruces);
  });

  it("FR-016 · con el presupuesto agotado no rutea nada y el diagrama sigue en pie", () => {
    const { cajas, relaciones } = conObstaculo();
    let t = 0;
    const rutas = rutarRelaciones(cajas, relaciones, { presupuestoMs: 1, ahora: () => (t += 100) });
    expect(rutas.size).toBe(0);
  });
});
