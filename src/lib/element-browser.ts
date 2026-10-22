/**
 * @fileOverview Explorador de elementos del sidebar: buscar y armar la ficha (PURO).
 *
 * Las listas de «Vistas» y «Elementos Principales» se abren en una modal en vez
 * de desplegarse dentro del sidebar, donde no cabían ni el nombre entero. La
 * modal busca y muestra la ficha de cada elemento sin saltar al lienzo; lo que
 * decide QUÉ se muestra vive aquí, y el componente sólo lo pinta.
 */

import type { GraphData, GraphNode } from "./types";
import { enlaceDe } from "./element-metadata";
import { nombreDe, relaciones } from "./mcp/graph-queries";

/** Un elemento y la vista de la que sale (el grafo, para leer sus relaciones). */
export interface EntradaDeElemento {
  node: GraphNode;
  viewId: string;
  viewName: string;
  grafo?: GraphData;
}

export interface RelacionDeFicha {
  /** Nombre del elemento del otro extremo. */
  otro: string;
  descripcion?: string;
}

export interface FichaDeElemento {
  nombre: string;
  tipo: string;
  estado: GraphNode["estado_comparativo"];
  /** Contenedor donde vive (vacío si está suelto). */
  grupo?: string;
  vista: string;
  descripcion?: string;
  tecnologias: string[];
  referencias: Array<{ clave: string; valor: string; enlace: string | null }>;
  spec?: { titulo: string; estado: string; pasos: number; requisitos: number; criterios: number };
  adjuntos: string[];
  entrantes: RelacionDeFicha[];
  salientes: RelacionDeFicha[];
}

/** Minúsculas y sin tildes: «Almacén» se encuentra escribiendo «almacen». */
const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Filtra por TODAS las palabras de la consulta, en cualquier campo que el humano
 * reconocería (nombre, tipo, grupo, descripción, tecnologías, vista). Lo que
 * coincide por nombre va primero; el resto conserva su orden, que es el de la
 * vista y por eso estable.
 */
export function buscarElementos(entradas: EntradaDeElemento[], consulta: string): EntradaDeElemento[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return entradas;
  const conPuntaje = entradas
    .map((e, i) => {
      const nombre = normalizar(e.node.nombre);
      const todo = normalizar(
        [
          e.node.nombre,
          e.node.tipo_elemento,
          e.node.agregado ?? "",
          e.node.descripcion ?? "",
          ...(e.node.tags_tecnologia ?? []),
          e.viewName,
        ].join(" ")
      );
      if (!palabras.every((p) => todo.includes(p))) return null;
      return { e, i, porNombre: palabras.filter((p) => nombre.includes(p)).length };
    })
    .filter((x): x is { e: EntradaDeElemento; i: number; porNombre: number } => x !== null);
  return conPuntaje.sort((a, b) => b.porNombre - a.porNombre || a.i - b.i).map((x) => x.e);
}

/** Cuántos hay de cada estado del cambio (para los chips de la modal). */
export function contarPorEstado(entradas: EntradaDeElemento[]): Partial<Record<GraphNode["estado_comparativo"], number>> {
  const out: Partial<Record<GraphNode["estado_comparativo"], number>> = {};
  for (const { node } of entradas) out[node.estado_comparativo] = (out[node.estado_comparativo] ?? 0) + 1;
  return out;
}

/**
 * La ficha de lectura de un elemento. Sólo trae las secciones que el elemento
 * declara: una ficha llena de «(vacío)» esconde lo poco que sí dice.
 */
export function fichaDeElemento(entrada: EntradaDeElemento): FichaDeElemento {
  const { node, grafo } = entrada;
  const aristas = grafo ? relaciones(grafo) : [];
  const relacion = (otroId: string, descripcion?: string): RelacionDeFicha => ({
    otro: grafo ? nombreDe(grafo, otroId) : otroId,
    ...(descripcion?.trim() ? { descripcion } : {}),
  });
  const spec = node.spec;
  return {
    nombre: node.nombre,
    tipo: node.tipo_elemento,
    estado: node.estado_comparativo,
    ...(node.agregado ? { grupo: node.agregado } : {}),
    vista: entrada.viewName,
    ...(node.descripcion?.trim() ? { descripcion: node.descripcion } : {}),
    tecnologias: node.tags_tecnologia ?? [],
    referencias: (node.metadata ?? []).map((m) => ({ clave: m.clave, valor: m.valor, enlace: enlaceDe(m) })),
    ...(spec
      ? {
          spec: {
            titulo: spec.featureName,
            estado: spec.status,
            pasos: spec.stories?.length ?? 0,
            requisitos: spec.requirements?.length ?? 0,
            criterios: spec.criteria?.length ?? 0,
          },
        }
      : {}),
    adjuntos: (node.adjuntos ?? []).map((d) => d.nombre),
    entrantes: aristas.filter((a) => a.destino === node.id).map((a) => relacion(a.fuente, a.descripcion)),
    salientes: aristas.filter((a) => a.fuente === node.id).map((a) => relacion(a.destino, a.descripcion)),
  };
}
