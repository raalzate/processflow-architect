import { describe, it, expect } from "vitest";
import { elementoPorNombre, elementosPorTipo, relacionEntre } from "../graph-queries";
import type { GraphData } from "../../types";

const nodo = (id: string, nombre: string, tipo: string) =>
  ({ id, nombre, tipo_elemento: tipo, estado_comparativo: "nuevo" }) as any;

const grafo = (): GraphData =>
  ({
    nombre_proyecto: "P",
    version: "1.0.0",
    fecha_analisis: "2026-09-18",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [nodo("ctrl", "Controlador", "Componente"), nodo("ana", "Ana", "Persona")],
      aristas: [{ fuente: "ctrl", destino: "svc", descripcion: "llama" }],
    },
    agregados: [
      {
        nombre_agregado: "Tienda",
        entidad_raiz: "Tienda",
        descripcion: "",
        tipo_contenedor: "Límite de Sistema",
        nodos: [nodo("svc", "Servicio", "Componente")],
        aristas: [],
      },
    ],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
  }) as any;

describe("consultas deterministas del grafo", () => {
  it("resuelve un elemento por nombre, sin importar acentos ni mayúsculas", () => {
    // El humano escribe de memoria: acentos de más, minúsculas y espacios sobran.
    expect(elementoPorNombre(grafo(), "cóntrolador")).toMatchObject({ kind: "uno", valor: { id: "ctrl" } });
    expect(elementoPorNombre(grafo(), "  controlador ")).toMatchObject({
      kind: "uno",
      valor: { id: "ctrl", container: "" },
    });
  });

  it("encuentra también los que viven dentro de un contenedor, y al contenedor mismo", () => {
    expect(elementoPorNombre(grafo(), "Servicio")).toMatchObject({
      kind: "uno",
      valor: { id: "svc", container: "Tienda" },
    });
    expect(elementoPorNombre(grafo(), "Tienda")).toMatchObject({ kind: "uno", valor: { id: "Tienda" } });
  });

  it("dos elementos con el mismo nombre devuelven «varios», no el primero", () => {
    const g = grafo();
    g.agregados[0].nodos.push(nodo("ctrl2", "Controlador", "Componente"));
    const r = elementoPorNombre(g, "Controlador");
    expect(r.kind).toBe("varios");
    expect(r.kind === "varios" && r.opciones.map((o) => o.id)).toEqual(["ctrl", "ctrl2"]);
  });

  it("el elemento que no existe devuelve «ninguno»", () => {
    expect(elementoPorNombre(grafo(), "Repositorio")).toEqual({ kind: "ninguno" });
    expect(elementoPorNombre(grafo(), "")).toEqual({ kind: "ninguno" });
  });

  it("lista por tipo con la misma normalización", () => {
    const r = elementosPorTipo(grafo(), "componente");
    expect(r.kind).toBe("varios");
    expect(elementosPorTipo(grafo(), "Persona")).toMatchObject({ kind: "uno", valor: { id: "ana" } });
    expect(elementosPorTipo(grafo(), "Evento")).toEqual({ kind: "ninguno" });
  });

  it("encuentra la relación aunque el humano la nombre al revés, y lo declara", () => {
    expect(relacionEntre(grafo(), "Controlador", "Servicio")).toMatchObject({
      kind: "uno",
      valor: { fuente: "ctrl", destino: "svc", invertida: false },
    });
    expect(relacionEntre(grafo(), "Servicio", "Controlador")).toMatchObject({
      kind: "uno",
      valor: { fuente: "ctrl", destino: "svc", invertida: true },
    });
    expect(relacionEntre(grafo(), "Ana", "Servicio")).toEqual({ kind: "ninguno" });
  });
});
