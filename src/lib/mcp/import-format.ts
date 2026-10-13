/**
 * @fileOverview Qué trae un .json que el agente pide importar (PURO, #533).
 *
 * `import_diagram` sólo entendía el GraphData de la app (`agregados`, `big_picture`).
 * Con el formato en que el PROPIO workspace guarda los diagramas —`{meta, nodes,
 * edges}`— importaba 0 elementos y respondía «Importado y FIJADO»: el agente creía
 * tener el diseño y trabajaba sobre un diagrama vacío.
 *
 * Se aceptan los dos formatos. Todo lo demás —un formato desconocido, nodos sin los
 * campos mínimos, un resultado vacío— es un error que dice qué se esperaba.
 */

import type { GraphData } from "../types";
import type { NotationId } from "../notations";
import { fromGraphData, type DiagramModel } from "./diagram-builder";

export type FormatoImportado = "workspace" | "graphdata";

export type ResultadoImportacion =
  | { ok: true; model: DiagramModel; formato: FormatoImportado }
  | { ok: false; error: string };

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const CAMPOS_NODO = ["id", "nombre", "tipo_elemento"] as const;

const FORMATOS =
  "GraphData de la app (`nombre_proyecto`, `agregados`, `big_picture`) o un diagrama del workspace (`meta`, `nodes`, `edges`; cada nodo con `id`, `nombre`, `tipo_elemento` y opcional `container`)";

export function interpretarImportacion(data: unknown, notation?: NotationId): ResultadoImportacion {
  if (!esObjeto(data)) return { ok: false, error: `El archivo no es un objeto JSON. Esperaba ${FORMATOS}.` };

  let model: DiagramModel;
  let formato: FormatoImportado;

  if (esObjeto(data.meta) && Array.isArray(data.nodes)) {
    for (const n of data.nodes as unknown[]) {
      const faltan = CAMPOS_NODO.filter((c) => !esObjeto(n) || typeof n[c] !== "string" || !(n[c] as string).trim());
      if (faltan.length) {
        const id = esObjeto(n) && typeof n.id === "string" ? `"${n.id}"` : "(sin id)";
        return { ok: false, error: `El nodo ${id} no trae ${faltan.join(", ")}. Cada nodo necesita ${CAMPOS_NODO.join(", ")}.` };
      }
    }
    const meta = data.meta as unknown as DiagramModel["meta"];
    model = {
      ...(data as unknown as DiagramModel),
      edges: Array.isArray(data.edges) ? (data.edges as DiagramModel["edges"]) : [],
      meta: {
        ...meta,
        nombre_proyecto: meta.nombre_proyecto || "importado",
        notation: notation ?? meta.notation ?? "ddd",
      },
    };
    formato = "workspace";
  } else if (Array.isArray(data.agregados) || esObjeto(data.big_picture)) {
    const graph = data as unknown as GraphData;
    model = fromGraphData(graph, notation ?? (graph.notation as NotationId) ?? "ddd");
    formato = "graphdata";
  } else {
    const claves = Object.keys(data).slice(0, 8).join(", ") || "(ninguna)";
    return { ok: false, error: `No reconozco el formato. Trae: ${claves}. Esperaba ${FORMATOS}.` };
  }

  if (model.nodes.length === 0) {
    return {
      ok: false,
      error: `El archivo se leyó como ${formato === "workspace" ? "diagrama del workspace" : "GraphData"} pero trae 0 elementos: no se importó nada. Revisá que sea el archivo correcto.`,
    };
  }
  return { ok: true, model, formato };
}
