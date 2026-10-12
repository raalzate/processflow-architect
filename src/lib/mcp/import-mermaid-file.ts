/**
 * @fileOverview Un archivo Mermaid → proyecto importable (PURO, #540).
 *
 * Es el tramo común del botón «Importar Mermaid…» de la app y de la
 * herramienta MCP `import_mermaid`: elegir el bloque, redibujarlo con
 * `fromMermaid`, disponerlo legible y contar lo que no llegó. Vive en `lib/`
 * para que la UI y el servidor importen EXACTAMENTE lo mismo y el ledger se
 * pruebe sin lienzo.
 */

import { INITIAL_NOTATION_ID, type NotationId } from "../notations";
import { fromMermaid } from "./from-mermaid";
import { bloquesMermaid, GRAMATICAS_SOPORTADAS, type BloqueMermaid } from "./mermaid-source";
import { relayoutConMedida, toGraphData, type DiagramModel } from "./diagram-builder";
import type { ImportLedger } from "./import-ledger";
import type { GraphData } from "../types";

export interface ImportMermaidOpts {
  /** Nombre del proyecto; por defecto, el del archivo sin extensión. */
  nombre?: string;
  /** Notación con que leer un flowchart (una secuencia entra en la notación que declare línea de vida). */
  notation?: NotationId;
  /** Qué bloque del archivo, si trae varios (desde 0). */
  bloque?: number;
}

export type ImportMermaidResult =
  | {
      ok: true;
      nombre: string;
      model: DiagramModel;
      graph: GraphData;
      hallazgos: string[];
      ledger: ImportLedger;
      bloques: BloqueMermaid[];
    }
  | { ok: false; error: string; bloques: BloqueMermaid[] };

/** Nombre de proyecto a partir del nombre de archivo. */
export const nombreDeArchivo = (archivo: string): string =>
  archivo.replace(/\.(mmd|mermaid|md|markdown|txt)$/i, "").split(/[\\/]/).pop()?.trim() || "importado";

export function importarMermaid(texto: string, archivo: string, opts: ImportMermaidOpts = {}): ImportMermaidResult {
  const bloques = bloquesMermaid(texto);
  if (!bloques.length) {
    return { ok: false, error: `"${archivo}" no trae ningún bloque Mermaid (ni fence \`\`\`mermaid ni cabecera ${GRAMATICAS_SOPORTADAS}).`, bloques };
  }
  const indice = opts.bloque ?? 0;
  const bloque = bloques[indice];
  if (!bloque) {
    return { ok: false, error: `"${archivo}" trae ${bloques.length} bloque(s) Mermaid (0–${bloques.length - 1}); no existe el ${indice}.`, bloques };
  }
  if (bloque.grammar === "otro") {
    return {
      ok: false,
      error: `El bloque ${indice} es \`${bloque.cabecera}\`, que no se importa. Soportados: ${GRAMATICAS_SOPORTADAS}.`,
      bloques,
    };
  }
  const nombre = opts.nombre?.trim() || nombreDeArchivo(archivo);
  const notation = opts.notation ?? INITIAL_NOTATION_ID;
  let parse;
  try {
    parse = fromMermaid(bloque.codigo, notation, { nombre });
  } catch (e: any) {
    return { ok: false, error: `No se pudo leer el bloque ${indice}: ${e?.message ?? e}`, bloques };
  }
  if (!parse.model.nodes.length) {
    return { ok: false, error: `El bloque ${indice} se leyó pero no declara ningún elemento: no se importó nada.`, bloques };
  }
  // Redibujar, no convertir: la fuente no trae posiciones (Mermaid no las
  // tiene) y las que pondría su renderer tampoco valdrían. La disposición
  // legible es la del lienzo.
  const model = relayoutConMedida(parse.model).model;
  return { ok: true, nombre, model, graph: toGraphData(model), hallazgos: parse.hallazgos, ledger: parse.ledger, bloques };
}
