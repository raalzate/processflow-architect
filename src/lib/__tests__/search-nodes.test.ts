import { describe, expect, it } from "vitest";
import { buscarNodos, nodosBuscables, MIN_QUERY } from "@/lib/search-nodes";
import type { GraphNode } from "@/lib/types";

const nodo = (over: Partial<GraphNode> & { id: string; nombre: string }): GraphNode =>
  ({ tipo_elemento: "Comando", estado_comparativo: "nuevo", ...over }) as GraphNode;

const delProyecto = [nodo({ id: "p1", nombre: "Pagar cuota" })];

/** Vista custom con su propio grafo (las tabs de abajo). */
const vistaConGrafo = {
  id: "v1",
  name: "Modelo C4",
  kind: "graph" as const,
  graph: {
    nombre_proyecto: "x",
    version: "1",
    fecha_analisis: "2026-08-27",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [{ id: "api", nombre: "Proxy de pagos", tipo_elemento: "Contenedor", estado_comparativo: "nuevo" }],
      aristas: [],
    },
    agregados: [
      {
        nombre_agregado: "Pagos",
        entidad_raiz: "Pago",
        descripcion: "",
        nodos: [{ id: "db", nombre: "Policies DB", tipo_elemento: "Base de Datos", estado_comparativo: "nuevo" }],
        aristas: [],
      },
    ],
    read_models: [],
    responsables: [],
    notas: "",
    transcript: "",
  },
  createdAt: "2026-08-27",
} as never;

describe("nodosBuscables", () => {
  it("con una vista de grafo activa, se busca en la VISTA (es lo que el usuario ve)", () => {
    // El fallo que esto frena: el buscador miraba sólo el proyecto, así que en una
    // vista —donde vive el diagrama que se está editando— no encontraba nada y
    // parecía roto (#219).
    const nodos = nodosBuscables(vistaConGrafo, delProyecto);
    expect(nodos.map((n) => n.nombre).sort()).toEqual(["Policies DB", "Proxy de pagos"]);
  });

  it("sin vista activa se busca en el proyecto", () => {
    expect(nodosBuscables(undefined, delProyecto)).toEqual(delProyecto);
  });

  it("una vista que NO es de grafo (mermaid) cae al proyecto", () => {
    const mermaid = { id: "v2", name: "Secuencia", kind: "mermaid", mermaidCode: "x", createdAt: "" } as never;
    expect(nodosBuscables(mermaid, delProyecto)).toEqual(delProyecto);
  });

  it("una vista de grafo VACÍA no cae al proyecto: lo que se ve es lo que se busca", () => {
    // Si cayera al proyecto, el buscador encontraría cosas que no están en pantalla.
    const vacia = { ...(vistaConGrafo as any), graph: { ...(vistaConGrafo as any).graph, big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, agregados: [] } };
    expect(nodosBuscables(vacia, delProyecto)).toEqual([]);
  });

  it("la vista built-in del diseño (sin grafo propio) usa el proyecto", () => {
    const design = { id: "design", name: "Modelo", kind: "graph", builtin: true, createdAt: "" } as never;
    expect(nodosBuscables(design, delProyecto)).toEqual(delProyecto);
  });
});

describe("buscarNodos", () => {
  const nodos = [
    nodo({ id: "1", nombre: "Proxy de pagos", descripcion: "reenvía al servicio existente" }),
    nodo({ id: "2", nombre: "Cobrar cuota", tipo_elemento: "Comando", agregado: "Pagos" }),
    nodo({ id: "3", nombre: "Póliza creada", tipo_elemento: "Evento" }),
  ];

  it("encuentra por nombre, sin distinguir mayúsculas", () => {
    expect(buscarNodos("PROXY", nodos).map((n) => n.id)).toEqual(["1"]);
  });

  it("encuentra por descripción, tipo y contenedor", () => {
    expect(buscarNodos("reenvía", nodos).map((n) => n.id)).toEqual(["1"]);
    expect(buscarNodos("evento", nodos).map((n) => n.id)).toEqual(["3"]);
    expect(buscarNodos("pagos", nodos).map((n) => n.id).sort()).toEqual(["1", "2"]);
  });

  it("ignora acentos: «poliza» encuentra «Póliza»", () => {
    // Escribir con acentos en una búsqueda rápida es justo lo que nadie hace.
    expect(buscarNodos("poliza", nodos).map((n) => n.id)).toEqual(["3"]);
  });

  it("una consulta demasiado corta no busca (evita listar todo al primer carácter)", () => {
    expect(buscarNodos("p", nodos)).toEqual([]);
    expect(MIN_QUERY).toBeGreaterThan(1);
  });

  it("espacios de borde no cuentan como consulta", () => {
    expect(buscarNodos("   ", nodos)).toEqual([]);
  });

  it("sin coincidencias devuelve lista vacía, no todo", () => {
    expect(buscarNodos("zzzz", nodos)).toEqual([]);
  });
});
