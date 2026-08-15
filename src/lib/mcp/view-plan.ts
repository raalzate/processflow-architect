/**
 * @fileOverview Plan de VISTAS de un modelo (PURO).
 *
 * Un solo diagrama con todo dentro es la forma más rápida de volver ilegible un
 * buen análisis. Este módulo mira lo que el modelo YA tiene (roles de sus
 * elementos y tamaño) y propone el conjunto de vistas ideal:
 *
 *  - **cortes** (`split`): el diagrama pasa el tamaño legible → una vista por
 *    participante/contexto, y el resto al big picture.
 *  - **complementos** (`complement`): el material da para otra mirada que hoy
 *    falta — el paisaje de sistemas, el proceso operativo, la visión de dominio.
 *
 * Es determinista y se decide por ROLES (`../notations`), no por literales de
 * tipo: una notación nueva entra en el plan declarando sus roles (P6).
 */

import type { NotationId } from "../notations";
import { roleOfType, type ElementRole } from "../notations";
import { isContainerType } from "./catalog";
import type { BuilderNode, DiagramModel } from "./diagram-builder";
import { MAX_NODES } from "./quality";

export interface ViewSuggestion {
  /** Notación con la que se construiría la vista. */
  notation: NotationId;
  /** Nombre sugerido de la pestaña. */
  name: string;
  kind: "split" | "complement";
  /** Por qué esta vista, en una línea (va al humano). */
  rationale: string;
  /** Contenedores/elementos que cubriría (vacío = todo lo que quede). */
  covers?: string[];
}

const isContainer = (n: BuilderNode) => isContainerType(n.tipo_elemento);

/** Cuenta nodos por rol dentro de una lista. */
function countByRole(notation: NotationId, nodes: BuilderNode[]): Partial<Record<ElementRole, number>> {
  const out: Partial<Record<ElementRole, number>> = {};
  for (const n of nodes) {
    const role = roleOfType(notation, n.tipo_elemento);
    if (role) out[role] = (out[role] ?? 0) + 1;
  }
  return out;
}

/** Mínimo de elementos para que un contenedor merezca su propia vista. */
const MIN_FOR_OWN_VIEW = 3;
/** Sistemas distintos a partir de los cuales el paisaje C4 aporta. */
const MIN_SYSTEMS_FOR_C4 = 3;
/** Pasos/comandos en un contenedor a partir de los cuales hay un proceso que dibujar. */
const MIN_STEPS_FOR_BPMN = 4;

export function suggestViews(model: DiagramModel): ViewSuggestion[] {
  const notation = model.meta.notation;
  const nodes = model.nodes.filter((n) => !isContainer(n));
  const containers = model.nodes.filter(isContainer);
  const roles = countByRole(notation, nodes);
  const out: ViewSuggestion[] = [];

  // --- Cortes por tamaño -----------------------------------------------------
  if (nodes.length > MAX_NODES) {
    const grandes = containers.filter(
      (c) => nodes.filter((n) => n.container === c.nombre).length >= MIN_FOR_OWN_VIEW
    );
    for (const c of grandes) {
      const dentro = nodes.filter((n) => n.container === c.nombre);
      out.push({
        notation,
        name: c.nombre,
        kind: "split",
        rationale: `El diagrama tiene ${nodes.length} elementos (legible hasta ~${MAX_NODES}); "${c.nombre}" aporta ${dentro.length} y se sostiene como vista propia.`,
        covers: [c.nombre],
      });
    }
    if (!grandes.length) {
      out.push({
        notation,
        name: `${model.meta.nombre_proyecto} · fase 1`,
        kind: "split",
        rationale: `${nodes.length} elementos sin contenedores que permitan cortar: divide el flujo por fases y entrega una vista por fase.`,
      });
    }
  }

  // --- Complementos por contenido -------------------------------------------
  const sistemas = (roles.system ?? 0) + (roles.external ?? 0) + (roles.datastore ?? 0);
  if (notation !== "c4" && sistemas >= MIN_SYSTEMS_FOR_C4) {
    out.push({
      notation: "c4",
      name: "Paisaje de sistemas",
      kind: "complement",
      rationale: `El modelo nombra ${sistemas} sistemas/almacenes: un C4 muestra quién se integra con quién y por qué canal, que aquí no se ve.`,
    });
  }

  if (notation !== "bpmn") {
    const candidato = containers
      .map((c) => {
        const dentro = nodes.filter((n) => n.container === c.nombre);
        const pasos = countByRole(notation, dentro);
        return { c, pasos: (pasos.command ?? 0) + (pasos.task ?? 0) };
      })
      .sort((a, b) => b.pasos - a.pasos)[0];
    if (candidato && candidato.pasos >= MIN_STEPS_FOR_BPMN) {
      out.push({
        notation: "bpmn",
        name: `Proceso · ${candidato.c.nombre}`,
        kind: "complement",
        rationale: `"${candidato.c.nombre}" concentra ${candidato.pasos} pasos: como BPMN se ve quién ejecuta cada uno y qué decide el flujo.`,
        covers: [candidato.c.nombre],
      });
    }
  }

  if (notation !== "ddd" && (roles.task ?? 0) >= 6) {
    out.push({
      notation: "ddd",
      name: "Visión de dominio",
      kind: "complement",
      rationale: `${roles.task} pasos operativos sin una visión de dominio: un Event Storming muestra los hechos de negocio y las fronteras que el proceso da por supuestas.`,
    });
  }

  return out;
}

/** Plan formateado para la respuesta MCP (y para que el humano lo apruebe). */
export function formatViewPlan(views: ViewSuggestion[]): string {
  if (!views.length) {
    return "El modelo se sostiene como una sola vista: tamaño legible y sin material para otra mirada.";
  }
  const bloque = (kind: ViewSuggestion["kind"], titulo: string) => {
    const items = views.filter((v) => v.kind === kind);
    if (!items.length) return "";
    return (
      `## ${titulo}\n` +
      items.map((v) => `- **${v.name}** (${v.notation}) — ${v.rationale}`).join("\n")
    );
  };
  return [
    bloque("split", "Cortes (el diagrama actual no cabe en una vista)"),
    bloque("complement", "Complementos (otra mirada que el material sostiene)"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
