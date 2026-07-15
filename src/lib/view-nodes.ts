/**
 * @fileOverview Extracción PURA de nodos de un GraphData (modelo o grafo de vista).
 *
 * «Elementos Principales» necesita listar también lo diseñado en las VISTAS
 * custom (BPMN/C4/UML), no sólo el modelo del proyecto: cada vista guarda su
 * propio GraphData y este helper lo aplana a la misma forma GraphNode que usa
 * el sidebar (con `agregado` = contenedor de origen).
 */

import type { GraphData, GraphNode } from "./types";

/** Aplana todos los nodos de un grafo: big picture + los de cada contenedor. */
export function collectGraphNodes(graph: GraphData | undefined | null): GraphNode[] {
  if (!graph) return [];
  const out: GraphNode[] = [];
  for (const n of graph.big_picture?.nodos ?? []) {
    out.push({ ...(n as GraphNode), agregado: "" });
  }
  for (const agg of graph.agregados ?? []) {
    for (const n of agg.nodos ?? []) {
      out.push({ ...(n as GraphNode), agregado: agg.nombre_agregado });
    }
  }
  return out;
}
