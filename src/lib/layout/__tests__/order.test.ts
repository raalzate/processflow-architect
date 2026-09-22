import { describe, expect, it } from "vitest";

import { medirLegibilidad, type Caja, type Relacion } from "../metrics";
import { ordenarCapas } from "../order";

const caja = (id: string, x: number, y: number, extra: Partial<Caja> = {}): Caja => ({
  id,
  x,
  y,
  width: 100,
  height: 60,
  ...extra,
});

/** Dos columnas cruzadas: a→d y c→b se cortan en X hasta que se permutan. */
const cruzado = () => ({
  cajas: [caja("a", 0, 0), caja("c", 0, 300), caja("b", 500, 0), caja("d", 500, 300)],
  relaciones: [
    { id: "e0", fuente: "a", destino: "d" },
    { id: "e1", fuente: "c", destino: "b" },
  ] as Relacion[],
});

describe("ordenarCapas", () => {
  it("TS-001 · deshace el cruce permutando dentro de la capa", () => {
    const { cajas, relaciones } = cruzado();
    expect(medirLegibilidad(cajas, relaciones).cruces).toBe(1);
    const out = ordenarCapas(cajas, relaciones);
    expect(medirLegibilidad(out, relaciones).cruces).toBe(0);
  });

  it("TS-001 · sólo permuta ranuras: el conjunto de posiciones no cambia", () => {
    const { cajas, relaciones } = cruzado();
    const antes = cajas.map((c) => `${c.x},${c.y}`).sort();
    const despues = ordenarCapas(cajas, relaciones).map((c) => `${c.x},${c.y}`).sort();
    expect(despues).toEqual(antes);
  });

  it("TS-004 · un diagrama que ya es el mejor de su topología no se toca", () => {
    const cajas = [caja("a", 0, 0), caja("b", 500, 0), caja("c", 0, 300), caja("d", 500, 300)];
    const relaciones: Relacion[] = [
      { id: "e0", fuente: "a", destino: "b" },
      { id: "e1", fuente: "c", destino: "d" },
    ];
    expect(ordenarCapas(cajas, relaciones)).toEqual(cajas);
  });

  it("TS-008 · es determinista: dos corridas dan lo mismo", () => {
    const { cajas, relaciones } = cruzado();
    expect(ordenarCapas(cajas, relaciones)).toEqual(ordenarCapas(cajas, relaciones));
  });

  it("TS-010 · ningún elemento sale de su banda", () => {
    const banda = (id: string, y: number) =>
      caja(id, 0, y, { width: 800, height: 260, esContenedor: true });
    const cajas = [
      banda("arriba", 0),
      banda("abajo", 300),
      caja("a", 60, 40, { container: "arriba" }),
      caja("b", 600, 40, { container: "arriba" }),
      caja("c", 60, 340, { container: "abajo" }),
      caja("d", 600, 340, { container: "abajo" }),
    ];
    const relaciones: Relacion[] = [
      { id: "e0", fuente: "a", destino: "d" },
      { id: "e1", fuente: "c", destino: "b" },
    ];
    const out = ordenarCapas(cajas, relaciones);
    const dentro = (hijo: string, madre: string) => {
      const h = out.find((c) => c.id === hijo)!;
      const m = out.find((c) => c.id === madre)!;
      return h.x >= m.x && h.y >= m.y && h.x + h.width <= m.x + m.width && h.y + h.height <= m.y + m.height;
    };
    expect(dentro("a", "arriba")).toBe(true);
    expect(dentro("b", "arriba")).toBe(true);
    expect(dentro("c", "abajo")).toBe(true);
    expect(dentro("d", "abajo")).toBe(true);
  });

  it("no mueve los contenedores: son el marco, no el contenido", () => {
    const cajas = [
      caja("banda", 0, 0, { width: 800, height: 400, esContenedor: true }),
      caja("a", 40, 40, { container: "banda" }),
      caja("b", 600, 40, { container: "banda" }),
    ];
    const relaciones: Relacion[] = [{ id: "e0", fuente: "a", destino: "b" }];
    const banda = ordenarCapas(cajas, relaciones).find((c) => c.id === "banda")!;
    expect({ x: banda.x, y: banda.y }).toEqual({ x: 0, y: 0 });
  });

  it("FR-002 · descarta la permutación que empeora alguna de las dos métricas", () => {
    // La caja del medio hace que permutar cambie un cruce por un paso sobre
    // caja: el coste combinado baja, pero el diagrama queda peor de leer.
    const cajas = [
      caja("a", 0, 0),
      caja("b", 0, 200),
      caja("medio", 250, 100),
      caja("c", 500, 0),
      caja("d", 500, 200),
    ];
    const relaciones: Relacion[] = [
      { id: "e0", fuente: "a", destino: "c" },
      { id: "e1", fuente: "b", destino: "d" },
    ];
    const base = medirLegibilidad(cajas, relaciones);
    const out = medirLegibilidad(ordenarCapas(cajas, relaciones), relaciones);
    expect(out.cruces).toBeLessThanOrEqual(base.cruces);
    expect(out.sobreCaja).toBeLessThanOrEqual(base.sobreCaja);
  });

  it("FR-012 · con el presupuesto agotado devuelve una disposición válida", () => {
    const { cajas, relaciones } = cruzado();
    const out = ordenarCapas(cajas, relaciones, { presupuestoMs: 0, ahora: () => 10_000 });
    expect(out).toHaveLength(cajas.length);
  });
});
