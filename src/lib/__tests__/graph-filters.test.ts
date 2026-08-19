import { describe, it, expect } from "vitest";
import {
  applyGraphFilters,
  filterOptions,
  hasActiveFilters,
  isChecked,
  NO_FILTERS,
  reconcileFilters,
  toggleHidden,
} from "../graph-filters";
import { isNotationContainer as isContainerType } from "../notations";

/** Nodos como los tiene el lienzo: el contenedor es un nodo más. */
const nodo = (over: Partial<any> = {}) => ({
  id: over.id ?? "n1",
  nombre: over.nombre ?? "Nodo",
  agregado: over.agregado ?? "Ventas",
  tipo_elemento: over.tipo_elemento ?? "Comando",
  ...over,
});

const arista = (source: string, target: string) => ({ source, target });

describe("filterOptions", () => {
  it("ofrece sólo los contenedores y tipos que EXISTEN en el grafo", () => {
    const o = filterOptions(
      [
        nodo({ tipo_elemento: "Agregado", agregado: "Ventas" }),
        nodo({ tipo_elemento: "Comando", agregado: "Ventas" }),
        nodo({ tipo_elemento: "Evento", agregado: "Ventas" }),
        nodo({ tipo_elemento: "Comando", agregado: "Cobros" }),
      ],
      "ddd",
      isContainerType
    );
    expect(o.containers).toEqual(["Ventas", "Cobros"]);
    expect(o.types).toEqual(["Comando", "Evento"]); // "Agregado" es contenedor: otro eje
  });

  it("la etiqueta del eje de contenedores sigue a la notación de la VISTA", () => {
    // El defecto original: una vista BPMN rotulaba «Límite de Sistema» (C4).
    expect(filterOptions([], "bpmn", isContainerType).containerLabel).toBe("Pool");
    expect(filterOptions([], "c4", isContainerType).containerLabel).toBe("Límite de Sistema");
    expect(filterOptions([], "ddd", isContainerType).containerLabel).toBe("Agregado");
    expect(filterOptions([], "uml", isContainerType).containerLabel).toBe("Paquete");
  });

  it("un grafo vacío no ofrece opciones (y no revienta)", () => {
    const o = filterOptions([], "ddd", isContainerType);
    expect([o.containers, o.types]).toEqual([[], []]);
  });
});

describe("isChecked · toggleHidden", () => {
  it("lo que no se ocultó, se ve", () => {
    expect(isChecked([], "Comando")).toBe(true);
    expect(isChecked(["Comando"], "Comando")).toBe(false);
  });

  it("destildar UNO no toca a los demás", () => {
    const hidden = toggleHidden([], "Evento", false);
    expect(hidden).toEqual(["Evento"]);
    expect(isChecked(hidden, "Comando")).toBe(true);
  });

  it("volver a tildar lo saca de los ocultos", () => {
    expect(toggleHidden(["Evento", "Comando"], "Evento", true)).toEqual(["Comando"]);
  });

  it("destildar dos veces no duplica", () => {
    expect(toggleHidden(["Evento"], "Evento", false)).toEqual(["Evento"]);
  });
});

describe("reconcileFilters", () => {
  const opciones = (containers: string[], types: string[]) => ({
    containers,
    types,
    containerLabel: "Agregado",
  });

  it("un tipo NUEVO nace visible y NO resucita lo que ocultaste", () => {
    // Éste es el caso que rompía la versión por "visibles": al aparecer un tipo
    // nuevo se recalculaba la selección y el tipo escondido volvía al lienzo.
    const r = reconcileFilters({ hiddenContainers: [], hiddenTypes: ["Evento"] }, opciones([], ["Comando", "Evento", "Politica"]));
    expect(r.hiddenTypes).toEqual(["Evento"]);
    expect(isChecked(r.hiddenTypes, "Politica")).toBe(true);
  });

  it("olvida lo oculto que ya no existe (apaga el badge sin nada que mostrar)", () => {
    const r = reconcileFilters({ hiddenContainers: ["Borrado"], hiddenTypes: [] }, opciones(["Ventas"], []));
    expect(r.hiddenContainers).toEqual([]);
    expect(hasActiveFilters(r)).toBe(false);
  });

  it("sin filtros no inventa nada", () => {
    expect(reconcileFilters(NO_FILTERS, opciones(["A"], ["B"]))).toEqual(NO_FILTERS);
  });
});

describe("hasActiveFilters", () => {
  it("distingue «nada tocado» de «algo oculto»", () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ hiddenContainers: [], hiddenTypes: ["Evento"] })).toBe(true);
  });
});

describe("applyGraphFilters", () => {
  const nodes = [
    nodo({ id: "c1", nombre: "Ventas", tipo_elemento: "Agregado", agregado: "Ventas" }),
    nodo({ id: "a", nombre: "Cotizar", tipo_elemento: "Comando", agregado: "Ventas" }),
    nodo({ id: "b", nombre: "Cotizada", tipo_elemento: "Evento", agregado: "Ventas" }),
    nodo({ id: "c2", nombre: "Cobros", tipo_elemento: "Agregado", agregado: "Cobros" }),
    nodo({ id: "d", nombre: "Cobrar", tipo_elemento: "Comando", agregado: "Cobros" }),
  ];
  const links = [arista("a", "b"), arista("b", "d")];

  it("sin filtros se dibuja todo", () => {
    const r = applyGraphFilters(nodes, links, NO_FILTERS, isContainerType);
    expect(r.nodes).toHaveLength(5);
    expect(r.links).toHaveLength(2);
    expect(r.hidden).toBe(0);
  });

  it("ocultar un tipo se lleva sus aristas y cuenta lo oculto", () => {
    const r = applyGraphFilters(nodes, links, { hiddenContainers: [], hiddenTypes: ["Evento"] }, isContainerType);
    expect(r.nodes.map((n) => n.id)).toEqual(["c1", "a", "c2", "d"]); // sin el Evento
    expect(r.links).toHaveLength(0); // ambas aristas tocaban el evento
    expect(r.hidden).toBe(1);
  });

  it("ocultar un contenedor se lleva a sus hijos", () => {
    const r = applyGraphFilters(nodes, links, { hiddenContainers: ["Cobros"], hiddenTypes: [] }, isContainerType);
    expect(r.nodes.map((n) => n.id)).toEqual(["c1", "a", "b"]);
    expect(r.hidden).toBe(2); // el contenedor "Cobros" y su comando
  });

  it("un contenedor NO se oculta por destildar tipos (se juzga en su propio eje)", () => {
    const r = applyGraphFilters(nodes, links, { hiddenContainers: [], hiddenTypes: ["Comando", "Evento"] }, isContainerType);
    expect(r.nodes.map((n) => n.id)).toEqual(["c1", "c2"]); // los marcos quedan
    expect(r.hidden).toBe(3);
  });

  it("destildar TODO en los dos ejes deja el lienzo vacío (y lo dice)", () => {
    const r = applyGraphFilters(nodes, links, { hiddenContainers: ["Ventas", "Cobros"], hiddenTypes: ["Comando", "Evento"] }, isContainerType);
    expect(r.nodes).toEqual([]);
    expect(r.links).toEqual([]);
    expect(r.hidden).toBe(5);
  });

  it("una arista sobrevive sólo si sus DOS extremos quedan visibles", () => {
    const r = applyGraphFilters(nodes, links, { hiddenContainers: ["Cobros"], hiddenTypes: [] }, isContainerType);
    expect(r.links).toEqual([arista("a", "b")]);
  });

  it("acepta las tres formas de arista del repo (id, nodo, sourceId)", () => {
    const conObjeto = applyGraphFilters(nodes, [{ source: { id: "a" }, target: { id: "b" } }], NO_FILTERS, isContainerType);
    expect(conObjeto.links).toHaveLength(1);
    // El lienzo usa sourceId/targetId: si no se soportara, el filtro no ocultaría
    // ninguna arista y quedarían flechas apuntando al vacío.
    const delLienzo = applyGraphFilters(
      nodes,
      [{ id: "l1", sourceId: "a", targetId: "b" }, { id: "l2", sourceId: "b", targetId: "d" }],
      { hiddenContainers: [], hiddenTypes: ["Evento"] },
      isContainerType
    );
    expect(delLienzo.links).toEqual([]);
  });

  it("no muta la entrada: filtrar es visual, el modelo queda intacto", () => {
    const copia = JSON.parse(JSON.stringify(nodes));
    applyGraphFilters(nodes, links, { hiddenContainers: ["Ventas", "Cobros"], hiddenTypes: ["Comando", "Evento"] }, isContainerType);
    expect(nodes).toEqual(copia);
  });
});
