import { describe, it, expect } from "vitest";
import type { GraphData, GraphNode } from "../types";
import type { ElementDoc } from "../element-docs";
import { buscarElementos, contarPorEstado, fichaDeElemento, type EntradaDeElemento } from "../element-browser";

const nodo = (id: string, extra: Partial<GraphNode> = {}): Omit<GraphNode, "agregado"> => ({
  id,
  nombre: id,
  tipo_elemento: "Contenedor",
  estado_comparativo: "nuevo",
  ...extra,
});

function grafo(): GraphData {
  return {
    nombre_proyecto: "P",
    version: "1",
    fecha_analisis: "",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [nodo("usuario", { nombre: "Usuario", tipo_elemento: "Persona" })],
      aristas: [{ fuente: "usuario", destino: "api", descripcion: "consulta errores" }],
    },
    agregados: [
      {
        nombre_agregado: "Motor",
        entidad_raiz: "",
        descripcion: "",
        nodos: [
          nodo("api", {
            nombre: "API de Consultas",
            descripcion: "Expone las consultas de observación.",
            tags_tecnologia: ["Go", "gRPC"],
            metadata: [
              { clave: "repo", valor: "https://github.com/acme/motor", tipo: "url" },
              { clave: "owner", valor: "Equipo Motor" },
            ],
            adjuntos: [{ nombre: "openapi.yaml", texto: "x" } as unknown as ElementDoc],
          }),
          nodo("db", { nombre: "Almacén de Métricas", tipo_elemento: "Base de Datos", estado_comparativo: "modificado" }),
        ],
        aristas: [{ fuente: "api", destino: "db", descripcion: "lee series" }],
      },
    ],
    read_models: [],
    responsables: [],
    notas: "",
    transcript: "",
  };
}

const entradas = (): EntradaDeElemento[] => {
  const g = grafo();
  return [
    ...g.big_picture.nodos.map((n) => ({ node: { ...n, agregado: "" } as GraphNode, viewId: "v1", viewName: "C4 L2", grafo: g })),
    ...g.agregados[0].nodos.map((n) => ({ node: { ...n, agregado: "Motor" } as GraphNode, viewId: "v1", viewName: "C4 L2", grafo: g })),
  ];
};

describe("buscarElementos", () => {
  it("sin consulta devuelve todo, en el mismo orden", () => {
    expect(buscarElementos(entradas(), "  ").map((e) => e.node.id)).toEqual(["usuario", "api", "db"]);
  });

  it("ignora mayúsculas y tildes", () => {
    expect(buscarElementos(entradas(), "almacen").map((e) => e.node.id)).toEqual(["db"]);
    expect(buscarElementos(entradas(), "MÉTRICAS").map((e) => e.node.id)).toEqual(["db"]);
  });

  it("busca también en tipo, grupo, descripción, tecnologías y vista", () => {
    expect(buscarElementos(entradas(), "persona").map((e) => e.node.id)).toEqual(["usuario"]);
    expect(buscarElementos(entradas(), "grpc").map((e) => e.node.id)).toEqual(["api"]);
    expect(buscarElementos(entradas(), "observación").map((e) => e.node.id)).toEqual(["api"]);
    expect(buscarElementos(entradas(), "c4 l2")).toHaveLength(3);
  });

  it("lo que coincide por nombre va primero", () => {
    // «motor» está en el grupo de api y db, y en el NOMBRE de ninguno; «consultas»
    // está en el nombre de api y en la descripción de la relación de usuario no.
    const r = buscarElementos(entradas(), "consultas");
    expect(r[0].node.id).toBe("api");
  });

  it("todas las palabras tienen que aparecer", () => {
    expect(buscarElementos(entradas(), "api go").map((e) => e.node.id)).toEqual(["api"]);
    expect(buscarElementos(entradas(), "api python")).toHaveLength(0);
  });
});

describe("contarPorEstado", () => {
  it("cuenta cada estado", () => {
    expect(contarPorEstado(entradas())).toEqual({ nuevo: 2, modificado: 1 });
  });
});

describe("fichaDeElemento", () => {
  it("arma la ficha con todo lo que el elemento declara", () => {
    const api = entradas()[1];
    const f = fichaDeElemento(api);
    expect(f).toMatchObject({
      nombre: "API de Consultas",
      tipo: "Contenedor",
      estado: "nuevo",
      grupo: "Motor",
      vista: "C4 L2",
      descripcion: "Expone las consultas de observación.",
      tecnologias: ["Go", "gRPC"],
      adjuntos: ["openapi.yaml"],
    });
    expect(f.referencias).toEqual([
      { clave: "repo", valor: "https://github.com/acme/motor", enlace: "https://github.com/acme/motor" },
      { clave: "owner", valor: "Equipo Motor", enlace: null },
    ]);
  });

  it("lista las relaciones que entran y salen, con el nombre del otro extremo", () => {
    const f = fichaDeElemento(entradas()[1]);
    expect(f.salientes).toEqual([{ otro: "Almacén de Métricas", descripcion: "lee series" }]);
    expect(f.entrantes).toEqual([{ otro: "Usuario", descripcion: "consulta errores" }]);
  });

  it("un elemento mínimo no inventa secciones", () => {
    const f = fichaDeElemento(entradas()[2]);
    expect(f.descripcion).toBeUndefined();
    expect(f.tecnologias).toEqual([]);
    expect(f.referencias).toEqual([]);
    expect(f.adjuntos).toEqual([]);
    expect(f.spec).toBeUndefined();
    expect(f.salientes).toEqual([]);
  });

  it("sin grafo no hay relaciones, pero la ficha sigue armándose", () => {
    const e = { ...entradas()[1], grafo: undefined };
    expect(fichaDeElemento(e)).toMatchObject({ nombre: "API de Consultas", entrantes: [], salientes: [] });
  });

  it("resume la spec por cuántos pasos, requisitos y criterios tiene", () => {
    const e = entradas()[1];
    e.node.spec = {
      featureName: "Consultar",
      status: "borrador",
      input: "",
      stories: [{} as never, {} as never],
      edgeCases: [],
      requirements: [{} as never],
      entities: [],
      criteria: [],
    } as unknown as GraphNode["spec"];
    expect(fichaDeElemento(e).spec).toEqual({ titulo: "Consultar", estado: "borrador", pasos: 2, requisitos: 1, criterios: 0 });
  });
});
