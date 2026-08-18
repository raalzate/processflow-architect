/**
 * @fileOverview Estado de la app visible para un agente externo (PURO).
 *
 * Un agente que diseña por MCP trabajaba a ciegas: no sabía si había un proyecto
 * abierto, con qué notación, ni qué vistas existían ya. Consecuencias reales:
 * vistas duplicadas, un BPMN colgado del proyecto equivocado y exportaciones que
 * pisan el trabajo del humano.
 *
 * Este módulo define el retrato del estado (lo arma el renderer, lo cachea el
 * proceso main y lo sirve la herramienta `get_app_state`) y su formato legible.
 * La INGESTA de este estado es el primer paso del skill: antes de subir algo,
 * mirar qué hay.
 */

import type { NotationId } from "../notations";
import type { GraphData, SavedFile } from "../types";
import type { DesignView } from "../views-types";

export interface AppViewInfo {
  id: string;
  name: string;
  kind: DesignView["kind"];
  notation?: NotationId;
  /** true en las vistas del sistema (no cuentan para el límite). */
  builtin?: boolean;
  /** Elementos de la vista (0 en vistas Mermaid, que son código). */
  elements: number;
}

export interface AppState {
  /** Proyecto ACTIVO en el lienzo (null = la app está en la pantalla de bienvenida). */
  projectName: string | null;
  /** Notación del proyecto activo. */
  notation?: NotationId;
  counts: { containers: number; nodes: number; edges: number };
  /** Pestañas del proyecto activo (built-in + custom). */
  views: AppViewInfo[];
  /** Cupo de vistas custom del proyecto. */
  viewsLimit: number;
  /** Otros proyectos guardados (nombres), para no crear duplicados. */
  projects: string[];
  /** ISO del momento en que el renderer publicó el estado. */
  updatedAt: string;
}

/**
 * Conteo de un grafo (contenedores · nodos · aristas). Exportado porque el
 * inventario de vistas del agente (`src/lib/ai/agent-retrieval.ts`) necesita el
 * MISMO número que ve el humano en `get_app_state`: dos cuentas distintas del
 * mismo grafo es una discusión que nadie gana.
 */
export function countGraph(graph: GraphData | null | undefined): AppState["counts"] {
  if (!graph) return { containers: 0, nodes: 0, edges: 0 };
  const containers = graph.agregados?.length ?? 0;
  const nodes =
    (graph.big_picture?.nodos?.length ?? 0) +
    (graph.agregados ?? []).reduce((acc, a) => acc + (a.nodos?.length ?? 0), 0);
  const edges =
    (graph.big_picture?.aristas?.length ?? 0) +
    (graph.politicas_inter_agregados?.length ?? 0) +
    (graph.agregados ?? []).reduce((acc, a) => acc + (a.aristas?.length ?? 0), 0);
  return { containers, nodes, edges };
}

/** Arma el retrato desde lo que el renderer ya tiene en memoria. */
export function describeAppState(input: {
  graph: GraphData | null;
  views: DesignView[];
  savedFiles?: Pick<SavedFile, "name">[];
  viewsLimit: number;
  now: string;
}): AppState {
  const { graph, views, savedFiles = [], viewsLimit, now } = input;
  return {
    projectName: graph?.nombre_proyecto ?? null,
    notation: graph?.notation as NotationId | undefined,
    counts: countGraph(graph),
    views: views.map((v) => ({
      id: v.id,
      name: v.name,
      kind: v.kind,
      notation: v.notation,
      builtin: v.builtin,
      elements: v.graph ? countGraph(v.graph).nodes : 0,
    })),
    viewsLimit,
    projects: savedFiles.map((f) => f.name),
    updatedAt: now,
  };
}

/**
 * Formato para la respuesta MCP. Además del retrato dice qué se PUEDE hacer con
 * ese estado: es la diferencia entre informar y evitar el error (exportar una
 * vista sin proyecto activo, duplicar una pestaña que ya existe).
 */
export function formatAppState(state: AppState | null): string {
  if (!state) {
    return [
      "La app no ha publicado su estado (no está abierta, o este servidor MCP corre en modo repo/stdio).",
      "Implicaciones: `export_as_view` no está disponible y `export_to_app` sólo escribirá un .json que el usuario importa a mano.",
      "Pide al usuario abrir Processflow Architect con el servidor MCP activo (Ajustes → Servidor MCP) si quiere ver el diagrama en el lienzo.",
    ].join("\n");
  }

  const custom = state.views.filter((v) => !v.builtin);
  const lines: string[] = [];

  if (!state.projectName) {
    lines.push(
      "Proyecto activo: NINGUNO (la app está en la pantalla de bienvenida).",
      "Implicación: `export_to_app` creará el proyecto; `export_as_view` no tiene dónde colgar la pestaña."
    );
  } else {
    lines.push(
      `Proyecto activo: "${state.projectName}" (notación ${state.notation ?? "ddd"}).`,
      `Contenido: ${state.counts.containers} contenedor(es) · ${state.counts.nodes} elemento(s) · ${state.counts.edges} relación(es).`,
      "⚠️ `export_to_app` REEMPLAZA el proyecto activo por uno nuevo: si el usuario quiere sumar al que ya tiene, usa `export_as_view`."
    );
  }

  lines.push(
    custom.length
      ? `Vistas existentes (${custom.length}/${state.viewsLimit}): ${custom
          .map((v) => `"${v.name}" [${v.kind}${v.notation ? `/${v.notation}` : ""}, ${v.elements} elementos]`)
          .join(", ")}. No repitas un nombre: revisa si tu vista ya existe y actualízala en vez de duplicarla.`
      : `Sin vistas custom (cupo ${state.viewsLimit}).`
  );

  if (state.projects.length > 1) {
    lines.push(`Otros proyectos guardados: ${state.projects.join(", ")}.`);
  }

  lines.push(`Estado publicado: ${state.updatedAt}.`);
  return lines.join("\n");
}
