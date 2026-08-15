/**
 * @fileOverview Vista previa Mermaid de un diagrama en construcción.
 *
 * Convierte un `DiagramModel` a un `flowchart` de Mermaid para que el agente
 * (Claude Code / Codex) y el usuario puedan EYEBALLear el diseño antes de
 * exportarlo a la app. La forma de cada nodo respeta la notación (rounded,
 * rect, ellipse, diamond, cylinder). Puro: sólo imports relativos.
 */

import { ALL_ELEMENTS } from "../notations";
import type { DiagramModel, BuilderNode } from "./diagram-builder";

/** Id seguro para Mermaid (alfanumérico + guion bajo). */
function safeId(id: string): string {
  const s = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(s) ? s : `n_${s}`;
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
