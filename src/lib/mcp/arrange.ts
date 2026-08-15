/**
 * @fileOverview Reorganizar un `GraphData` ya existente (PURO).
 *
 * Es el puente entre el lienzo y el layout: el diseñador serializa lo que tiene,
 * pide una disposición nueva y aplica SÓLO las posiciones resultantes. Así el
 * botón «Organizar» y la herramienta MCP `relayout_diagram` usan exactamente el
 * mismo algoritmo — lo que el humano ve en la app es lo que el agente genera.
 *
 * Devuelve un mapa de posiciones en vez de un grafo nuevo a propósito: el lienzo
 * conserva sus ids, su selección y su historial, y sólo mueve cajas.
 */

import type { GraphData } from "../types";
import type { NotationId } from "../notations";
import { fromGraphData, relayout, reorderLanes, type LayoutOptions } from "./diagram-builder";

export interface ArrangedBox {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface ArrangeResult {
  /** Posición nueva por id de elemento (nodos no contenedores). */
  nodes: Record<string, ArrangedBox>;
  /** Posición nueva por NOMBRE de contenedor (su nombre es su clave en el lienzo). */
  containers: Record<string, ArrangedBox>;
}

export interface ArrangeOptions extends LayoutOptions {
  /** Orden propuesto de las bandas (p. ej. el que sugiere la IA). */
  laneOrder?: string[];
}

/** Nombres de las bandas del grafo, en su orden actual (entrada para la IA). */
export function laneNames(graph: GraphData): string[] {
  return (graph.agregados ?? []).map((a) => a.nombre_agregado);
}

/** Resumen corto del contenido de cada banda, para que la IA ordene con criterio. */
export function laneSummary(graph: GraphData): string {
  return (graph.agregados ?? [])
    .map((a) => {
      const hijos = (a.nodos ?? []).slice(0, 6).map((n) => n.nombre).join(", ");
      return `${a.nombre_agregado}: ${hijos || "(vacío)"}`;
    })
    .join("\n");
}

/**
 * Calcula la disposición nueva de un grafo. `notation` decide la estrategia por
 * defecto (flujo o capas) cuando no se pide una explícita.
 */
export function arrangeGraphData(
  graph: GraphData,
  notation: NotationId | string | undefined,
  opts: ArrangeOptions = {}
): ArrangeResult {
  const { laneOrder, ...layoutOpts } = opts;
  const model = fromGraphData(graph, (notation as NotationId) || (graph.notation as NotationId) || "ddd");
  const dispuesto = laneOrder?.length
    ? reorderLanes(model, laneOrder, layoutOpts)
    : relayout(model, layoutOpts);

  const nodes: Record<string, ArrangedBox> = {};
  const containers: Record<string, ArrangedBox> = {};
  const nombresDeBanda = new Set(laneNames(graph));

  for (const n of dispuesto.nodes) {
    if (typeof n.x !== "number" || typeof n.y !== "number") continue;
    const box: ArrangedBox = { x: n.x, y: n.y, width: n.width, height: n.height };
    // Los contenedores se identifican por nombre: `fromGraphData` les genera un
    // id propio (`agg-…`) que el lienzo no conoce.
    if (nombresDeBanda.has(n.nombre)) containers[n.nombre] = box;
    else nodes[n.id] = box;
  }
  return { nodes, containers };
}
