import { describe, it, expect } from "vitest";
import { applyViewEdit, fundir, reconciliarIds } from "../view-edit";
import type { GraphData } from "../../types";

const nodo = (id: string, nombre: string, tipo: string, extra: Record<string, unknown> = {}) =>
  ({ id, nombre, tipo_elemento: tipo, estado_comparativo: "nuevo", x: 10, y: 20, width: 220, height: 104, ...extra }) as any;

const vista = (): GraphData =>
  ({
    nombre_proyecto: "Tienda",
    version: "1.0.0",
    notation: "c4",
    fecha_analisis: "2026-09-18",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [nodo("web", "Web", "Contenedor"), nodo("api", "API", "Componente")],
      aristas: [{ fuente: "web", destino: "api", descripcion: "llama" }],
    },
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "lo escribió el humano",
    transcript: "",
  }) as any;

const nodos = (g: GraphData) => [
  ...(g.big_picture?.nodos ?? []),
  ...(g.agregados ?? []).flatMap((a) => a.nodos ?? []),
];
const aristas = (g: GraphData) => [
  ...(g.big_picture?.aristas ?? []),
  ...(g.agregados ?? []).flatMap((a) => a.aristas ?? []),
  ...(g.politicas_inter_agregados ?? []),
];

describe("applyViewEdit — elementos", () => {
  it("agrega un elemento con el tipo de la notación y conserva lo que había", () => {
    const r = applyViewEdit(vista(), { kind: "add-element", name: "Ana", type: "persona" }, "c4");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(nodos(r.graph).map((n) => n.nombre)).toEqual(expect.arrayContaining(["Web", "API", "Ana"]));
    expect(nodos(r.graph).find((n) => n.nombre === "Ana")?.tipo_elemento).toBe("Persona");
    // La posición que el humano le dio a lo que ya estaba no se toca (FR-006).
    expect(nodos(r.graph).find((n) => n.id === "web")).toMatchObject({ x: 10, y: 20 });
    // Lo que escribió el humano a nivel proyecto sigue ahí.
    expect(r.graph.notas).toContain("lo escribió el humano");
  });

  it("un tipo que no existe en la notación se rechaza con las opciones", () => {
    const r = applyViewEdit(vista(), { kind: "add-element", name: "X", type: "Aggregate Root" }, "c4");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Persona");
  });

  it("agrega un contenedor cuando el tipo es contenedor", () => {
    const r = applyViewEdit(vista(), { kind: "add-element", name: "Tienda", type: "Límite de Sistema" }, "c4");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.graph.agregados?.map((a) => a.nombre_agregado)).toEqual(["Tienda"]);
  });

  it("renombra y elimina por nombre, sin ids", () => {
    const r1 = applyViewEdit(vista(), { kind: "update-element", name: "api", newName: "Servicio" }, "c4");
    expect(r1.ok && nodos(r1.graph).map((n) => n.nombre)).toEqual(expect.arrayContaining(["Servicio"]));

    const r2 = applyViewEdit(vista(), { kind: "remove-element", name: "API" }, "c4");
    expect(r2.ok && nodos(r2.graph).map((n) => n.nombre)).toEqual(["Web"]);
    // Al irse el elemento se va su relación: no quedan aristas colgando.
    expect(r2.ok && aristas(r2.graph)).toEqual([]);
  });

  it("un elemento que no existe se dice con las opciones, no se inventa", () => {
    const r = applyViewEdit(vista(), { kind: "remove-element", name: "Repositorio" }, "c4");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('"Web"');
  });

  it("dos elementos con el mismo nombre no se resuelven solos", () => {
    const g = vista();
    g.big_picture.nodos.push(nodo("web2", "Web", "Componente"));
    const r = applyViewEdit(g, { kind: "remove-element", name: "Web" }, "c4");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Preguntá cuál");
  });
});

describe("applyViewEdit — relaciones", () => {
  it("agrega, actualiza e invierte una relación nombrando las cajas", () => {
    const r1 = applyViewEdit(vista(), { kind: "add-edge", from: "API", to: "Web", label: "responde" }, "c4");
    expect(r1.ok && aristas(r1.graph)).toHaveLength(2);

    const r2 = applyViewEdit(vista(), { kind: "update-edge", from: "API", to: "Web", invert: true }, "c4");
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // Estaba dibujada web→api aunque el humano la nombró al revés: se invierte esa.
    expect(aristas(r2.graph)[0]).toMatchObject({ fuente: "api", destino: "web" });

    const r3 = applyViewEdit(vista(), { kind: "remove-edge", from: "API", to: "Web" }, "c4");
    expect(r3.ok && aristas(r3.graph)).toEqual([]);
  });

  it("una relación que no existe se rechaza", () => {
    const g = vista();
    g.big_picture.nodos.push(nodo("db", "Base", "Base de Datos"));
    const r = applyViewEdit(g, { kind: "update-edge", from: "Web", to: "Base", label: "x" }, "c4");
    expect(r.ok).toBe(false);
  });
});

describe("la ida y vuelta no le borra al humano lo que dibujó (#344)", () => {
  it("conserva viewRef del nodo y quiebres/anclas de la arista tras add-element", () => {
    const g = vista();
    (g.big_picture.nodos[0] as any).viewRef = "vista-detalle";
    Object.assign(g.big_picture.aristas[0], {
      midpoints: [{ x: 5, y: 6 }],
      labelOffset: { x: 1, y: 2 },
      sourceAnchor: { x: 0.5, y: 1 },
      targetAnchor: { x: 0, y: 0.5 },
    });

    const r = applyViewEdit(g, { kind: "add-element", name: "Ana", type: "Persona" }, "c4");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(nodos(r.graph).find((n) => n.id === "web")).toMatchObject({ viewRef: "vista-detalle" });
    expect(aristas(r.graph)[0]).toMatchObject({
      midpoints: [{ x: 5, y: 6 }],
      labelOffset: { x: 1, y: 2 },
      sourceAnchor: { x: 0.5, y: 1 },
      targetAnchor: { x: 0, y: 0.5 },
    });
  });

  it("lo conserva también tras update-edge y set-graph", () => {
    const g = vista();
    (g.big_picture.nodos[1] as any).viewRef = "detalle-api";
    Object.assign(g.big_picture.aristas[0], { midpoints: [{ x: 9, y: 9 }] });

    const r1 = applyViewEdit(g, { kind: "update-edge", from: "Web", to: "API", label: "invoca" }, "c4");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(aristas(r1.graph)[0]).toMatchObject({ descripcion: "invoca", midpoints: [{ x: 9, y: 9 }] });
    expect(nodos(r1.graph).find((n) => n.id === "api")).toMatchObject({ viewRef: "detalle-api" });

    const entrante = vista();
    const r2 = applyViewEdit(g, { kind: "set-graph", graph: entrante }, "c4");
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(nodos(r2.graph).find((n) => n.id === "api")).toMatchObject({ viewRef: "detalle-api" });
    expect(aristas(r2.graph)[0]).toMatchObject({ midpoints: [{ x: 9, y: 9 }] });
  });
});

describe("set-graph", () => {
  it("nunca publica un grafo vacío (§P8, SC-006)", () => {
    const vacio = { ...vista(), big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, agregados: [] };
    const r = applyViewEdit(vista(), { kind: "set-graph", graph: vacio as GraphData }, "c4");
    expect(r.ok).toBe(false);
  });

  it("reconcilia por nombre para no perder la posición de lo que ya estaba (FR-006)", () => {
    const entrante = vista();
    // El mismo diagrama, con otros ids (es lo que devuelve la vuelta por Mermaid).
    entrante.big_picture.nodos = [nodo("n_web", "Web", "Contenedor", { x: undefined, y: undefined })];
    entrante.big_picture.aristas = [];
    const reconciliado = reconciliarIds(vista(), entrante);
    expect(reconciliado.big_picture.nodos[0].id).toBe("web");

    const r = applyViewEdit(vista(), { kind: "set-graph", graph: entrante }, "c4");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(nodos(r.graph)[0]).toMatchObject({ id: "web", x: 10, y: 20 });
  });
});

describe("fundir", () => {
  it("conserva el nombre del proyecto y las notas del humano", () => {
    const entrante = { ...vista(), nombre_proyecto: "Otro", notas: "" };
    const g = fundir(vista(), entrante as GraphData);
    expect(g.nombre_proyecto).toBe("Tienda");
    expect(g.notas).toContain("lo escribió el humano");
  });
});

describe("revisarGrafoEntrante · la puerta de un cliente MCP externo", () => {
  it("rechaza un grafo cuyas listas no son listas", () => {
    const malo = { ...vista(), agregados: { nombre_agregado: "X" } } as any;
    const r = applyViewEdit(vista(), { kind: "set-graph", graph: malo }, "c4");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("agregados");
  });

  it("rechaza una caja sin nombre o sin tipo", () => {
    const sinNombre = vista();
    sinNombre.big_picture.nodos = [{ id: "x", tipo_elemento: "Persona" } as any];
    expect(applyViewEdit(vista(), { kind: "set-graph", graph: sinNombre }, "c4").ok).toBe(false);

    const sinTipo = vista();
    sinTipo.big_picture.nodos = [{ id: "x", nombre: "Ana" } as any];
    const r = applyViewEdit(vista(), { kind: "set-graph", graph: sinTipo }, "c4");
    expect(r.ok === false && r.error).toContain("no declara tipo");
  });

  it("rechaza un tipo ajeno a la notación con la sugerencia más parecida (§P6)", () => {
    const ajeno = vista();
    ajeno.big_picture.nodos = [nodo("x", "Web", "Container")];
    const r = applyViewEdit(vista(), { kind: "set-graph", graph: ajeno }, "c4");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Contenedor");
  });

  it("revisa también el tipo de los contenedores", () => {
    const g = vista();
    g.agregados = [{ nombre_agregado: "Tienda", entidad_raiz: "", descripcion: "", tipo_contenedor: "Pool", nodos: [], aristas: [] } as any];
    const r = applyViewEdit(vista(), { kind: "set-graph", graph: g }, "c4");
    expect(r.ok).toBe(false); // Pool es de BPMN, no de C4
  });

  it("un grafo correcto pasa", () => {
    expect(applyViewEdit(vista(), { kind: "set-graph", graph: vista() }, "c4").ok).toBe(true);
  });
});
