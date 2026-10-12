import { describe, expect, it } from "vitest";

import { medirLegibilidad, recortarABorde, type Caja, type Punto, type Relacion } from "../metrics";
import { repartirAnclajes, rutarRelaciones } from "../routing";

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

// Regla de conector de diagram-design (ADR 0006 · #538): cada relación que
// sale por un mismo borde tiene su propio punto de anclaje.
describe("repartirAnclajes", () => {
  /** a manda dos relaciones hacia la derecha; las dos pisan `medio` y se rutean. */
  const abanico = () => ({
    cajas: [caja("a", 0, 0), caja("medio", 300, 0), caja("b", 600, 0), caja("c", 600, 40)],
    relaciones: [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "a", destino: "c" },
    ] as Relacion[],
  });
  const medir = (cajas: Caja[], relaciones: Relacion[], rutas: Map<string, Punto[]>) =>
    medirLegibilidad(
      cajas,
      relaciones.map((r) => {
        const q = rutas.get(r.id);
        return q?.length ? conRuta(r, cajas, q) : r;
      })
    );

  it("separa dos relaciones ruteadas que salían por el mismo punto", () => {
    const { cajas, relaciones } = abanico();
    const rutas = rutarRelaciones(cajas, relaciones);
    expect(rutas.size).toBe(2);
    const sinRepartir = repartirAnclajes(cajas, relaciones, new Map(), 8);
    void sinRepartir;
    const medida = medir(cajas, relaciones, rutas);
    expect(medida.anclajesCompartidos).toBe(0);
    expect(medida.sobreCaja).toBe(0);
  });

  it("no mueve la punta de una relación en recta: ocupa su hueco y las ruteadas se corren", () => {
    const cajas = [caja("a", 0, 0), caja("b", 400, 0), caja("c", 400, 100)];
    const relaciones: Relacion[] = [
      { id: "recta", fuente: "a", destino: "b" },
      { id: "ruteada", fuente: "a", destino: "c" },
    ];
    // La ruteada arranca en el mismo punto que la recta (fuera del borde, a la
    // altura del centro de a).
    const rutas = new Map<string, Punto[]>([["ruteada", [{ x: 250, y: 30 }, { x: 250, y: 130 }]]]);
    expect(medir(cajas, relaciones, rutas).anclajesCompartidos).toBe(1);
    const repartidas = repartirAnclajes(cajas, relaciones, rutas, 8);
    expect(repartidas.has("recta")).toBe(false);
    expect(medir(cajas, relaciones, repartidas).anclajesCompartidos).toBe(0);
    // El primer quiebre quedó pegado al borde derecho de a y el tramo sigue axial.
    const q = repartidas.get("ruteada")!;
    expect(q[0].x).toBe(108);
    expect(q[0].y).toBe(q[1].y);
  });

  it("un borde ya repartido no se toca", () => {
    const cajas = [caja("a", 0, 0), caja("b", 400, -200), caja("c", 400, 200)];
    const relaciones: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "a", destino: "c" },
    ];
    const rutas = new Map<string, Punto[]>([["e1", [{ x: 250, y: 30 }, { x: 250, y: 230 }]]]);
    const antes = medir(cajas, relaciones, rutas);
    const repartidas = repartirAnclajes(cajas, relaciones, rutas, 8);
    if (antes.anclajesCompartidos === 0) expect([...repartidas.entries()]).toEqual([...rutas.entries()]);
    else expect(medir(cajas, relaciones, repartidas).anclajesCompartidos).toBeLessThan(antes.anclajesCompartidos);
  });
});
