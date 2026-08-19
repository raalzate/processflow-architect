/**
 * @fileOverview Filtros del lienzo: qué se dibuja de la vista ACTIVA (PURO).
 *
 * Dos defectos que arregla este módulo, ambos observados en la app:
 *
 *  1. El menú de filtros no hacía nada. `GraphDataProvider` calculaba
 *     `filteredNodes` y nadie los consumía: el lienzo editable se hidrata del
 *     modelo y mantiene su propio estado. Destildar todo cambiaba dos `Set` en
 *     memoria y el dibujo seguía igual.
 *  2. Las opciones salían SIEMPRE del proyecto (la vista «Modelo»), así que en
 *     una vista BPMN el menú ofrecía «Base de Datos» y «Sistema Externo» (C4) y
 *     rotulaba los contenedores como «Límite de Sistema».
 *
 * La regla que se establece acá: **las opciones y la etiqueta salen del grafo que
 * se está dibujando y de SU notación**, y filtrar es sólo visual — nunca cambia
 * el modelo ni se persiste (ver `applyGraphFilters`, que no toca los nodos).
 */

import { notationContainerLabel } from "./notations";
import type { GraphLink, GraphNode } from "./types";

/**
 * Lo que el usuario OCULTÓ. Se guarda el conjunto de ocultos —no el de visibles—
 * por una razón concreta: cuando aparece un tipo o contenedor nuevo (lo acabás de
 * crear, o cambiaste de vista), con "visibles" nacía oculto o, al reconciliar,
 * resucitaba lo que habías escondido a propósito. Con "ocultos", lo nuevo se ve
 * y lo escondido sigue escondido.
 */
export interface GraphFilters {
  hiddenContainers: string[];
  hiddenTypes: string[];
}

export const NO_FILTERS: GraphFilters = { hiddenContainers: [], hiddenTypes: [] };

export interface FilterOptions {
  /** Contenedores presentes en el grafo dibujado, en orden de aparición. */
  containers: string[];
  /** Tipos de elemento presentes (sin los contenedores: ésos son el otro eje). */
  types: string[];
  /** Rótulo del eje de contenedores según la notación de la VISTA. */
  containerLabel: string;
}

/**
 * Opciones del menú, derivadas de los nodos que hay en el lienzo. Se ofrece sólo
 * lo que existe: un menú con tipos que el grafo no tiene es la forma más rápida
 * de que el usuario crea que el filtro está roto.
 */
export function filterOptions(
  nodes: { agregado?: string; tipo_elemento?: string }[],
  notation: string | undefined,
  isContainerType: (type: string) => boolean
): FilterOptions {
  const containers: string[] = [];
  const types: string[] = [];
  for (const n of nodes ?? []) {
    const cont = (n.agregado ?? "").trim();
    if (cont && !containers.includes(cont)) containers.push(cont);
    const tipo = (n.tipo_elemento ?? "").trim();
    // Un contenedor ya se filtra por el primer eje; ofrecerlo también como tipo
    // permitía dos caminos para ocultar lo mismo, con resultados distintos.
    if (tipo && !isContainerType(tipo) && !types.includes(tipo)) types.push(tipo);
  }
  return { containers, types, containerLabel: notationContainerLabel(notation) };
}

/** ¿Está tildado (visible)? Lo que no se ocultó, se ve. */
export function isChecked(hidden: string[], value: string): boolean {
  return !hidden.includes(value);
}

/** Tilda o destilda un valor del eje. */
export function toggleHidden(hidden: string[], value: string, checked: boolean): string[] {
  return checked ? hidden.filter((v) => v !== value) : [...new Set([...hidden, value])];
}

/**
 * Descarta de los ocultos lo que ya no existe en el grafo. Sin esto, un tipo que
 * ocultaste y después borraste dejaba el badge «filtro activo» encendido para
 * siempre, sin nada que mostrar.
 */
export function reconcileFilters(filters: GraphFilters, options: FilterOptions): GraphFilters {
  return {
    hiddenContainers: filters.hiddenContainers.filter((v) => options.containers.includes(v)),
    hiddenTypes: filters.hiddenTypes.filter((v) => options.types.includes(v)),
  };
}

/** ¿Hay algo filtrado? (decide el badge «filtro activo» y el botón de limpiar) */
export function hasActiveFilters(filters: GraphFilters): boolean {
  return filters.hiddenContainers.length > 0 || filters.hiddenTypes.length > 0;
}

export interface FilteredGraph<N, L> {
  nodes: N[];
  links: L[];
  /** Cuántos nodos se están ocultando (para decirlo en la UI, no esconderlo). */
  hidden: number;
}

/**
 * Nodos y aristas VISIBLES. No muta ni descarta nada del modelo: devuelve qué
 * dibujar. Un contenedor oculto se lleva a sus hijos —si no, quedaban flotando
 * sin su marco— y una arista sobrevive sólo si sus dos extremos siguen visibles.
 */
/**
 * Extremos de una arista. Coexisten dos formas en el repo: el grafo del modelo
 * usa `source`/`target` (con id o nodo entero, herencia de D3) y el lienzo usa
 * `sourceId`/`targetId`. Se aceptan las dos para que el filtro sirva a los dos
 * sin obligar a nadie a traducir.
 */
export function edgeEnds(link: unknown): [string, string] {
  const l = link as Record<string, unknown>;
  const id = (e: unknown) => (typeof e === "string" ? e : ((e as { id?: string } | null)?.id ?? ""));
  return [id(l?.source ?? l?.sourceId), id(l?.target ?? l?.targetId)];
}

export function applyGraphFilters<
  N extends { id: string; nombre?: string; agregado?: string; tipo_elemento?: string },
  L
>(
  nodes: N[],
  links: L[],
  filters: GraphFilters,
  isContainerType: (type: string) => boolean
): FilteredGraph<N, L> {
  const visible = (n: N) => {
    const tipo = (n.tipo_elemento ?? "").trim();
    const cont = (n.agregado ?? "").trim();
    // El CONTENEDOR se juzga por su propio nombre, y sólo en el eje de
    // contenedores: su tipo no está en el eje de tipos, así que preguntar por él
    // ahí lo ocultaba en cuanto el usuario destildaba cualquier tipo.
    if (tipo && isContainerType(tipo)) return isChecked(filters.hiddenContainers, n.nombre || cont);
    if (cont && !isChecked(filters.hiddenContainers, cont)) return false;
    return isChecked(filters.hiddenTypes, tipo);
  };
  const visibles = (nodes ?? []).filter(visible);
  const ids = new Set(visibles.map((n) => n.id));
  return {
    nodes: visibles,
    links: (links ?? []).filter((l) => {
      const [a, b] = edgeEnds(l);
      return ids.has(a) && ids.has(b);
    }),
    hidden: (nodes ?? []).length - visibles.length,
  };
}

/** Firma cómoda para el lienzo, que trabaja con `GraphNode`/`GraphLink`. */
export type CanvasFiltered = FilteredGraph<GraphNode, GraphLink>;
