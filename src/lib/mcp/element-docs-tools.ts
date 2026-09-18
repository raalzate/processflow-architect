/**
 * @fileOverview Adjuntos de un elemento por MCP: adjuntar, listar, leer, buscar (PURO).
 *
 * La ficha de la app deja adjuntar el material a mano (`element-docs.ts`); esto
 * es lo mismo para un agente externo. Vive acá —y no en
 * `main/services/mcp-tools.ts`— porque lo que DECIDE debe ser puro y tener
 * cobertura: el handler MCP sólo orquesta (mismo reparto que
 * `element-spec-tools.ts`).
 *
 * La regla que gobierna todo el archivo: **índice sí, contenido no**. Una
 * lectura de la caja dice QUÉ material hay; el contenido se pide por su nombre.
 * Devolverlo entero en cada lectura revienta la respuesta y gasta la ventana del
 * que la recibe en material que quizá no necesitaba.
 */

import {
  attachElementDoc,
  formatDocsIndex,
  readElementDocRange,
  removeElementDoc,
  searchElementDocs,
  type ElementDoc,
  type ElementDocTipo,
  type HitDoc,
  type LecturaDoc,
} from "../element-docs";
import type { BuilderNode, DiagramModel } from "./diagram-builder";

/** Nombres e ids de los elementos, para el error de una referencia que no existe. */
const disponibles = (model: DiagramModel): string =>
  model.nodes.map((n) => `${n.nombre} (${n.id})`).join(", ") || "(el diagrama no tiene elementos)";

/**
 * Resuelve la referencia a un elemento: por id exacto, y si no, por nombre sin
 * distinguir mayúsculas. El agente externo copia el nombre del Mermaid mucho más
 * seguido que el id, y hacerlo fallar por eso es hacerle perder un turno.
 *
 * @throws si no resuelve, nombrando lo que hay.
 */
export function resolverElemento(model: DiagramModel, ref: string): BuilderNode {
  const t = (ref ?? "").trim();
  if (!t) throw new Error(`Falta el elemento. Los que hay: ${disponibles(model)}.`);
  const porId = model.nodes.find((n) => n.id === t);
  if (porId) return porId;
  const k = t.toLowerCase();
  const porNombre = model.nodes.filter((n) => n.nombre.toLowerCase() === k);
  if (porNombre.length === 1) return porNombre[0];
  if (porNombre.length > 1)
    throw new Error(
      `Hay ${porNombre.length} elementos llamados "${t}": usá el id (${porNombre
        .map((n) => n.id)
        .join(", ")}).`
    );
  throw new Error(`No existe el elemento "${t}". Los que hay: ${disponibles(model)}.`);
}

/** Lo que hace falta para adjuntar por MCP. */
export interface EntradaDocMcp {
  nombre: string;
  texto: string;
  tipo?: ElementDocTipo;
  origen?: string;
  origenRuta?: string;
  addedAt?: string;
}

/**
 * Adjunta material a un elemento. Devuelve el modelo nuevo y el adjunto tal como
 * quedó —recortado o no—, que es lo que el handler necesita para poder AVISAR
 * del recorte en vez de esconderlo.
 *
 * @throws si el elemento no existe o si la caja llegó a su tope.
 */
export function attachDocToElement(
  model: DiagramModel,
  ref: string,
  entrada: EntradaDocMcp
): { model: DiagramModel; elemento: BuilderNode; doc: ElementDoc } {
  const target = resolverElemento(model, ref);
  const adjuntos = attachElementDoc(target.adjuntos ?? [], entrada);
  const doc = adjuntos.find((d) => d.nombre === entrada.nombre.trim())!;
  return {
    model: {
      ...model,
      nodes: model.nodes.map((n) => (n.id === target.id ? { ...n, adjuntos } : n)),
    },
    elemento: target,
    doc,
  };
}

/** Quita un adjunto. @throws si el elemento o el adjunto no existen. */
export function removeDocFromElement(
  model: DiagramModel,
  ref: string,
  nombre: string
): { model: DiagramModel; elemento: BuilderNode; quedan: number } {
  const target = resolverElemento(model, ref);
  const antes = target.adjuntos ?? [];
  const adjuntos = removeElementDoc(antes, nombre);
  if (adjuntos.length === antes.length)
    throw new Error(
      `"${target.nombre}" no tiene ningún adjunto llamado "${nombre}".${
        antes.length ? ` Los que tiene: ${antes.map((d) => d.nombre).join(", ")}.` : ""
      }`
    );
  return {
    model: {
      ...model,
      nodes: model.nodes.map((n) =>
        n.id === target.id ? { ...n, adjuntos: adjuntos.length ? adjuntos : undefined } : n
      ),
    },
    elemento: target,
    quedan: adjuntos.length,
  };
}

/** Lee un trozo del adjunto de un elemento. @throws si el elemento no existe. */
export function readDocOfElement(
  model: DiagramModel,
  ref: string,
  nombre: string,
  desde?: number,
  hasta?: number
): LecturaDoc {
  const target = resolverElemento(model, ref);
  return readElementDocRange(target.adjuntos ?? [], nombre, desde, hasta);
}

/**
 * Índice de adjuntos: de un elemento, o del diagrama entero. Es lo que se
 * devuelve en cada lectura de la caja; el contenido NUNCA sale de acá.
 */
export function docsIndex(model: DiagramModel, ref?: string): string {
  if (ref) {
    const target = resolverElemento(model, ref);
    const idx = formatDocsIndex(target.adjuntos ?? []);
    return idx || `"${target.nombre}" no tiene material adjunto.`;
  }
  const partes: string[] = [];
  for (const n of model.nodes) {
    if (!n.adjuntos?.length) continue;
    partes.push(`## ${n.nombre} (${n.id})`, formatDocsIndex(n.adjuntos));
  }
  return partes.length
    ? partes.join("\n")
    : "Ninguna caja del diagrama tiene material adjunto: quien la construya no tiene contra qué hacerlo.";
}

/** Busca un término en el material de todo el diagrama. */
export function searchDocsInModel(model: DiagramModel, termino: string, maxHits?: number): HitDoc[] {
  return searchElementDocs(
    model.nodes.map((n) => ({ id: n.id, nombre: n.nombre, adjuntos: n.adjuntos })),
    termino,
    maxHits
  );
}

/** Los hits con la forma que se le muestra al agente (elemento · adjunto · línea). */
export function formatHits(hits: readonly HitDoc[]): string {
  if (!hits.length) return "";
  return hits
    .map((h) => `- ${h.elemento} · "${h.doc}":${h.linea} — ${h.texto}`)
    .join("\n");
}
