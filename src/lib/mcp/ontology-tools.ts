/**
 * @fileOverview Ontología por MCP: fijar el significado de una flecha (spec 027) — PURO.
 *
 * El servidor (`main/services/mcp-tools.ts`) sólo carga, llama y guarda; la
 * decisión vive acá para poder probarla sin levantar el proceso stdio.
 */

import { DEFAULT_NOTATION_ID } from "../notations";
import { predicadosCompatibles, validarPredicado } from "../ontology/predicate-guess";
import { updateEdge, type DiagramModel } from "./diagram-builder";
import { mermaidSafeId } from "./mermaid-id";

/** El nodo por id exacto o por el id como se dibuja en Mermaid (como `updateEdge`). */
const tipoDe = (model: DiagramModel, id: string): string | undefined =>
  (model.nodes.find((n) => n.id === id) ?? model.nodes.find((n) => mermaidSafeId(n.id) === id))?.tipo_elemento;

/**
 * Fija (o quita, con `null`) el predicado de la relación `from → to`. Un
 * predicado que el reglamento no admite entre esos tipos se RECHAZA con los
 * compatibles: el agente externo debe elegir uno válido, no dejar un hallazgo.
 * @throws si la relación no existe o el predicado no corresponde.
 */
export function setEdgePredicate(
  model: DiagramModel,
  from: string,
  to: string,
  predicate: string | null
): { model: DiagramModel } {
  if (predicate === null) {
    // La MISMA arista que tocaría update_edge (mismo id exacto → id Mermaid, la
    // primera f→t): quitar y fijar no pueden actuar sobre aristas distintas.
    const antes = model.edges;
    const next = updateEdge(model, from, to, { predicado: undefined });
    return {
      model: {
        ...next,
        edges: next.edges.map((e, i) => {
          if (e === antes[i] || !("predicado" in e)) return e;
          const { predicado: _quitado, ...resto } = e;
          return resto;
        }),
      },
    };
  }
  // Que la relación exista va antes que el reglamento, con el mensaje de update_edge.
  updateEdge(model, from, to, {});
  const notation = model.meta.notation ?? DEFAULT_NOTATION_ID;
  const tf = tipoDe(model, from);
  const tt = tipoDe(model, to);
  if (tf && tt) {
    const h = validarPredicado(predicate, tf, tt, notation);
    if (h) {
      const compatibles = predicadosCompatibles(tf, tt, notation).map((p) => p.id);
      throw new Error(`${h.mensaje} Predicados compatibles entre ${tf} y ${tt}: ${compatibles.join(", ")}.`);
    }
  }
  return { model: updateEdge(model, from, to, { predicado: predicate }) };
}
