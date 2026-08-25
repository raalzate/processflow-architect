/**
 * @fileOverview Vista previa Mermaid de un diagrama en construcción.
 *
 * Convierte un `DiagramModel` a un `flowchart` de Mermaid para que el agente
 * (Claude Code / Codex) y el usuario puedan EYEBALLear el diseño antes de
 * exportarlo a la app. La forma de cada nodo respeta la notación (rounded,
 * rect, ellipse, diamond, cylinder). Puro: sólo imports relativos.
 */

import { ALL_ELEMENTS } from "../notations";
import { mermaidSafeId as safeId, idCambiaEnMermaid } from "./mermaid-id";
import type { DiagramModel, BuilderNode } from "./diagram-builder";

/**
 * Los ids que en el dibujo NO se llaman como en las herramientas (Mermaid no
 * admite guiones). Se declaran junto a la vista previa: sin eso, el agente copia
 * del diagrama un id que no existe y lo manda a `update_element`/`remove_element`.
 */
export function idsQueCambian(model: DiagramModel): { real: string; mermaid: string }[] {
  return model.nodes
    .filter((n) => idCambiaEnMermaid(n.id))
    .map((n) => ({ real: n.id, mermaid: safeId(n.id) }));
}

/** Escapa la etiqueta para Mermaid (comillas y saltos de línea). */
function label(text: string): string {
  return (text || "").replace(/"/g, "#quot;").replace(/\n/g, "<br>");
}

/**
 * Delimitadores Mermaid de la FORMA que la notación declara para un tipo. Única
 * tabla forma→Mermaid del repo (la usa también `mermaid-diagram.ts`): así DDD,
 * BPMN, C4 y UML exportan con su símbolo sin tablas de tipos cableadas.
 */
export function mermaidShapeDelims(tipo: string): [string, string] {
  switch (ALL_ELEMENTS[tipo]?.shape ?? "rounded") {
    case "rect":
      return ["[", "]"];
    case "ellipse":
      return ["((", "))"];
    case "diamond":
      return ["{", "}"];
    case "cylinder":
      return ["[(", ")]"];
    case "rounded":
    default:
      return ["(", ")"];
  }
}

const shapeDelims = (node: BuilderNode): [string, string] =>
  mermaidShapeDelims(node.tipo_elemento);

const isContainer = (n: BuilderNode): boolean =>
  Boolean(ALL_ELEMENTS[n.tipo_elemento]?.container);

/** Declaración de un nodo (forma + etiqueta con su tipo). */
function declare(node: BuilderNode): string {
  const [open, close] = shapeDelims(node);
  const text = `${label(node.nombre)}<br><i>${label(node.tipo_elemento)}</i>`;
  return `  ${safeId(node.id)}${open}"${text}"${close}`;
}

/** Genera el `flowchart` Mermaid del modelo. */
export function toMermaid(model: DiagramModel): string {
  const containers = model.nodes.filter(isContainer);
  const domain = model.nodes.filter((n) => !isContainer(n));
  const containerNames = new Set(containers.map((c) => c.nombre));

  const lines: string[] = ["flowchart LR"];

  // Un subgraph por contenedor, con sus hijos dentro.
  for (const c of containers) {
    lines.push(`  subgraph ${safeId(c.id)}["${label(c.nombre)}"]`);
    for (const n of domain) {
      if (n.container === c.nombre) lines.push(`  ${declare(n)}`);
    }
    lines.push("  end");
  }

  // Nodos sueltos (sin contenedor válido).
  for (const n of domain) {
    if (!n.container || !containerNames.has(n.container)) lines.push(declare(n));
  }

  // Aristas.
  for (const e of model.edges) {
    const l = e.descripcion ? `|"${label(e.descripcion)}"|` : "";
    const arrow = e.arrow === "none" ? "---" : "-->";
    lines.push(`  ${safeId(e.fuente)} ${arrow}${l} ${safeId(e.destino)}`);
  }

  return lines.join("\n");
}
