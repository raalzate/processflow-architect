/**
 * @fileOverview Buscador global: qué se busca y dónde (PURO).
 *
 * El buscador de la barra miraba SÓLO los nodos del proyecto cargado. Los
 * diagramas que se editan como **vista** —las tabs de abajo— tienen su grafo en
 * la vista, así que trabajando ahí el buscador no encontraba nada y parecía roto
 * (#219). La regla ahora es simple: **se busca lo que se está viendo**.
 *
 * Acá viven las dos decisiones —de qué grafo salen los nodos, y qué cuenta como
 * coincidencia—; el provider y el componente orquestan.
 */

import { processGraphData } from "./graph-processor";
import type { DesignView } from "./views-types";
import type { GraphNode } from "./types";

/**
 * Mínimo de caracteres para buscar. Con uno solo, cualquier diagrama devuelve
 * media lista y el popover deja de ayudar.
 */
export const MIN_QUERY = 2;

/**
 * Los nodos sobre los que se busca: los de la vista activa si tiene grafo
 * propio, y los del proyecto si no (vista built-in, vista de Mermaid, o ninguna).
 *
 * Una vista de grafo **vacía** devuelve vacío a propósito: caer al proyecto haría
 * que el buscador encontrara elementos que no están en pantalla, que es peor que
 * no encontrar nada.
 */
export function nodosBuscables(
  vistaActiva: DesignView | undefined,
  nodosDelProyecto: readonly GraphNode[]
): GraphNode[] {
  const grafo = vistaActiva?.kind === "graph" ? vistaActiva.graph : undefined;
  if (!grafo) return [...nodosDelProyecto];
  try {
    return processGraphData(grafo).nodes;
  } catch {
    // Un grafo de vista mal formado no puede romper la búsqueda del proyecto.
    return [...nodosDelProyecto];
  }
}

/** Comparación sin acentos ni mayúsculas: nadie escribe «póliza» en una búsqueda rápida. */
const plano = (t: string): string =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Nodos que coinciden con la consulta por nombre, descripción, tipo o contenedor.
 * Por debajo de `MIN_QUERY` no se busca (devuelve vacío).
 */
export function buscarNodos(query: string, nodos: readonly GraphNode[]): GraphNode[] {
  const q = plano((query ?? "").trim());
  if (q.length < MIN_QUERY) return [];
  return nodos.filter((n) =>
    [n.nombre, n.descripcion, n.tipo_elemento, n.agregado].some(
      (campo) => typeof campo === "string" && plano(campo).includes(q)
    )
  );
}
