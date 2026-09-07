import { describe, expect, it } from "vitest";
import { neighborhoodOf, type NeighborEdge } from "@/lib/graph-neighbors";

const e = (id: string, sourceId: string, targetId: string): NeighborEdge => ({
  id,
  sourceId,
  targetId,
});

// a → b → c, y d suelto en otra punta del grafo.
const GRAFO = [e("ab", "a", "b"), e("bc", "b", "c"), e("de", "d", "e")];

const sel = (...ids: string[]) => new Set(ids);

describe("vecindario a un salto (#256)", () => {
  it("sin selección no hay nada resaltado", () => {
    const v = neighborhoodOf(sel(), GRAFO);
    expect(v.nodes.size).toBe(0);
    expect(v.edges.size).toBe(0);
  });

  it("trae los vecinos de los dos lados: la dirección no importa", () => {
    // `b` tiene una arista entrante y una saliente; las dos cuentan.
    const v = neighborhoodOf(sel("b"), GRAFO);
    expect([...v.nodes].sort()).toEqual(["a", "c"]);
    expect([...v.edges].sort()).toEqual(["ab", "bc"]);
  });

  it("es UN salto: lo que está a dos no se resalta", () => {
    // Desde `a` se llega a `c` pasando por `b`, y `c` NO entra.
    const v = neighborhoodOf(sel("a"), GRAFO);
    expect([...v.nodes]).toEqual(["b"]);
    expect([...v.edges]).toEqual(["ab"]);
  });

  it("no toca la otra punta del grafo", () => {
    const v = neighborhoodOf(sel("a"), GRAFO);
    expect(v.nodes.has("d")).toBe(false);
    expect(v.edges.has("de")).toBe(false);
  });

  it("lo seleccionado no vuelve como vecino: el resalte no se pisa", () => {
    // Con `a` y `b` seleccionados, la arista que los une sí se resalta (une la
    // selección) pero ninguno de los dos aparece como vecino.
    const v = neighborhoodOf(sel("a", "b"), GRAFO);
    expect(v.nodes.has("a")).toBe(false);
    expect(v.nodes.has("b")).toBe(false);
    expect([...v.nodes]).toEqual(["c"]);
    expect(v.edges.has("ab")).toBe(true);
  });

  it("multiselección: une los vecindarios", () => {
    const v = neighborhoodOf(sel("a", "d"), GRAFO);
    expect([...v.nodes].sort()).toEqual(["b", "e"]);
    expect([...v.edges].sort()).toEqual(["ab", "de"]);
  });

  it("un auto-enlace no inventa un vecino", () => {
    // Las dos puntas son el mismo nodo: la arista se resalta, pero no hay
    // «otro extremo» que traer.
    const v = neighborhoodOf(sel("a"), [e("aa", "a", "a")]);
    expect(v.nodes.size).toBe(0);
    expect([...v.edges]).toEqual(["aa"]);
  });

  it("una arista seleccionada trae sus dos puntas y no se resalta a sí misma", () => {
    // Seleccionar el ENLACE responde «¿qué une esta flecha?»: los emparentados
    // son sus extremos, y la arista no se pinta de vecina porque ya está
    // seleccionada.
    const v = neighborhoodOf(sel("ab"), GRAFO);
    expect(v.edges.has("ab")).toBe(false);
    expect([...v.nodes].sort()).toEqual(["a", "b"]);
  });

  it("con la arista Y una punta seleccionadas, sólo la otra punta es vecina", () => {
    const v = neighborhoodOf(sel("ab", "a"), GRAFO);
    expect([...v.nodes]).toEqual(["b"]);
    // `bc` sale de `b`, que NO está seleccionado: no entra por elevación.
    expect(v.edges.has("bc")).toBe(false);
  });

  it("los contenedores son nodos cualquiera: Carril → Carril (copia) vale", () => {
    // Nada en la app restringe qué tipo conecta con qué, así que el vecindario
    // no puede asumir que las puntas son nodos sueltos.
    const v = neighborhoodOf(sel("carril"), [e("cc", "carril", "carril-copia")]);
    expect([...v.nodes]).toEqual(["carril-copia"]);
  });

  it("sin aristas no hay vecinos, aunque haya selección", () => {
    const v = neighborhoodOf(sel("a", "b"), []);
    expect(v.nodes.size).toBe(0);
    expect(v.edges.size).toBe(0);
  });
});
