/**
 * @fileOverview Estilo de las relaciones en LOTE (PURO).
 *
 * El enrutado y el trazo se editaban de a una arista, en la ficha «Editar
 * enlace»: en un C4 de 30 relaciones, dejar todo escalonado eran 30 fichas
 * (issue #128). Acá vive la única regla de qué cambia y qué se conserva cuando
 * el cambio va sobre varias aristas a la vez.
 *
 * Dos garantías, y ambas están probadas:
 *  - sólo viajan los campos del parche; anclas, quiebres y corrimiento de
 *    etiqueta quedan como estaban (son trabajo manual del usuario);
 *  - se informa CUÁNTAS aristas tenían enrutado propio y se les pisó: aplicar a
 *    todas es explícito, nunca silencioso (P10).
 */
import type { DesignerLink } from "./serialize";

/** Campos de estilo que se pueden aplicar en lote (el resto no es "estilo"). */
export type LinkStylePatch = Partial<
  Pick<DesignerLink, "routing" | "dashed" | "arrow" | "color" | "relation">
>;

export interface LinkStyleResult {
  /** Mapa nuevo; es el MISMO objeto si no cambió ninguna arista. */
  links: Map<string, DesignerLink>;
  /** Ids de las aristas que efectivamente cambiaron. */
  changed: string[];
  /**
   * Ids que YA tenían un enrutado puesto a mano y se pisó. Quien llama lo dice
   * en el aviso: el usuario tiene que saber que perdió un ajuste manual.
   */
  overridden: string[];
}

/**
 * Aplica el parche de estilo a las aristas indicadas (`"all"` = toda la vista).
 * Ids que no existen se ignoran: la selección puede incluir nodos.
 */
export function styleLinks(
  links: Map<string, DesignerLink>,
  ids: Iterable<string> | "all",
  patch: LinkStylePatch
): LinkStyleResult {
  const claves = Object.keys(patch) as (keyof LinkStylePatch)[];
  const objetivos = ids === "all" ? Array.from(links.keys()) : Array.from(new Set(ids));
  const changed: string[] = [];
  const overridden: string[] = [];
  const next = new Map(links);

  for (const id of objetivos) {
    const link = links.get(id);
    if (!link) continue;
    const cambia = claves.filter((k) => link[k] !== patch[k]);
    if (!cambia.length) continue;
    if (patch.routing !== undefined && link.routing !== undefined && link.routing !== patch.routing) {
      overridden.push(id);
    }
    // Copia superficial + sólo las claves del parche: `sourceAnchor`,
    // `midpoints` y `labelOffset` viajan intactos por el spread.
    next.set(id, { ...link, ...patch });
    changed.push(id);
  }

  return { links: changed.length ? next : links, changed, overridden };
}

/** Aviso para el usuario tras aplicar en lote; `null` si no cambió nada. */
export function styleLinksSummary(res: LinkStyleResult): string | null {
  if (!res.changed.length) return null;
  const n = res.changed.length;
  const base = n === 1 ? "1 relación actualizada" : `${n} relaciones actualizadas`;
  if (!res.overridden.length) return base;
  const m = res.overridden.length;
  return `${base} — se pisó el enrutado puesto a mano en ${m === 1 ? "1" : m}. Deshacer lo revierte de una vez.`;
}
