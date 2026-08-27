/**
 * @fileOverview Portapapeles del lienzo (PURO).
 *
 * Copiar y pegar cajas es la operación que más se repite al modelar, y hacerla a
 * mano —crear el elemento, renombrarlo, reconectarlo— es donde se pierde el
 * tiempo. Acá vive la parte que se puede probar sin DOM: QUÉ se copia (los
 * elementos y los enlaces que quedan enteros dentro de la selección) y CÓMO se
 * pega (ids nuevos, nombres sin choques, contenidos que siguen a su contenedor).
 *
 * Reglas que este módulo garantiza:
 * - Copiar un CONTENEDOR se lleva su contenido: si te llevás el Pool sin sus
 *   tareas, lo pegado no es lo que estaba seleccionado en pantalla.
 * - Sólo viajan los enlaces con AMBAS puntas copiadas; uno con una punta fuera
 *   quedaría apuntando a un nodo del diagrama original.
 * - Pegar nunca reusa un id ni pisa un nombre existente: el `agregado` (que en
 *   este lienzo referencia al padre POR NOMBRE) se reapunta al contenedor nuevo.
 *
 * El estado del portapapeles vive en el módulo, no en el componente: así se
 * copia en una vista y se pega en otra aunque el lienzo se haya remontado.
 */
import type { DesignerLink, DesignerNode } from "./serialize";
import { isContainerType } from "./serialize";

/** Contenido del portapapeles: elementos y los enlaces internos de la selección. */
export interface CanvasClipboard {
  nodes: DesignerNode[];
  links: DesignerLink[];
}

/** Desplazamiento por defecto de lo pegado, para que no tape al original. */
export const PASTE_OFFSET = { x: 40, y: 40 };

/**
 * Contenido de un contenedor: los nodos cuyo `agregado` es su nombre, y lo que
 * cuelgue de ellos si a su vez son contenedores (jerarquía por nombre).
 */
function descendants(container: DesignerNode, nodes: Map<string, DesignerNode>): DesignerNode[] {
  const out: DesignerNode[] = [];
  const pending = [container.nombre];
  const visited = new Set<string>();
  while (pending.length) {
    const parent = pending.shift()!;
    if (!parent || visited.has(parent)) continue;
    visited.add(parent);
    for (const n of nodes.values()) {
      if (n.agregado !== parent || n.nombre === parent) continue;
      out.push(n);
      if (isContainerType(n.tipo_elemento)) pending.push(n.nombre);
    }
  }
  return out;
}

/**
 * Arma el contenido del portapapeles a partir de la selección.
 * @returns `null` si la selección no tiene ningún nodo ni enlace copiable.
 */
export function copySelection(
  nodes: Map<string, DesignerNode>,
  links: Map<string, DesignerLink>,
  selectedIds: Set<string> | Iterable<string>,
): CanvasClipboard | null {
  const ids = new Set(selectedIds);
  const picked = new Map<string, DesignerNode>();
  for (const id of ids) {
    const n = nodes.get(id);
    if (!n) continue;
    picked.set(n.id, n);
    if (isContainerType(n.tipo_elemento)) {
      for (const d of descendants(n, nodes)) picked.set(d.id, d);
    }
  }

  // Enlaces: los que quedan ENTEROS dentro de lo copiado. Un enlace seleccionado
  // suelto (sin sus dos nodos) no se copia: pegarlo no tendría a qué unir.
  const copiedLinks: DesignerLink[] = [];
  for (const l of links.values()) {
    if (picked.has(l.sourceId) && picked.has(l.targetId)) copiedLinks.push(l);
  }

  if (picked.size === 0) return null;
  return {
    // Copia de los metadatos también: compartir el array dejaría al pegado y al
    // original editándose entre sí a la primera mutación descuidada.
    nodes: Array.from(picked.values()).map((n) => ({
      ...n,
      ...(n.metadata ? { metadata: n.metadata.map((m) => ({ ...m })) } : {}),
      // Igual con la spec: es un objeto anidado, y compartirlo haría que editar
      // la copia reescribiera la especificación del original.
      ...(n.spec ? { spec: structuredClone(n.spec) } : {}),
    })),
    links: copiedLinks.map((l) => ({ ...l })),
  };
}

/** Esquina superior izquierda del contenido copiado (para pegar en un punto). */
export function clipboardOrigin(clip: CanvasClipboard): { x: number; y: number } {
  let x = Infinity;
  let y = Infinity;
  for (const n of clip.nodes) {
    x = Math.min(x, n.x);
    y = Math.min(y, n.y);
  }
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

/**
 * Nombre libre para una copia. Se conserva el nombre original si nadie lo usa
 * (pegar en OTRA vista no debería renombrar nada); si choca, se sufija.
 */
export function uniqueCopyName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  const raíz = base.replace(/ \(copia(?: \d+)?\)$/, "");
  let candidato = `${raíz} (copia)`;
  let i = 2;
  while (taken.has(candidato)) candidato = `${raíz} (copia ${i++})`;
  return candidato;
}

export interface PasteOptions {
  /** Generador de ids (inyectable para poder probar el resultado). */
  newId: () => string;
  /** Punto del lienzo donde cae la esquina del contenido (menú «Pegar aquí»). */
  at?: { x: number; y: number };
  /** Desplazamiento respecto del original; se ignora si viene `at`. */
  offset?: { x: number; y: number };
}

export interface PasteResult {
  nodes: Map<string, DesignerNode>;
  links: Map<string, DesignerLink>;
  /** Ids de lo recién pegado: es lo que queda seleccionado. */
  newIds: Set<string>;
}

/**
 * Pega el portapapeles sobre el lienzo: ids nuevos, nombres sin choques,
 * geometría desplazada y jerarquía (`agregado`) reapuntada a las copias.
 */
export function pasteClipboard(
  nodes: Map<string, DesignerNode>,
  links: Map<string, DesignerLink>,
  clip: CanvasClipboard,
  opts: PasteOptions,
): PasteResult {
  const origen = clipboardOrigin(clip);
  const offset = opts.offset ?? PASTE_OFFSET;
  const delta = opts.at
    ? { x: opts.at.x - origen.x, y: opts.at.y - origen.y }
    : { x: offset.x, y: offset.y };

  const taken = new Set(Array.from(nodes.values()).map((n) => n.nombre));
  const idMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  const nuevos = new Map<string, DesignerNode>(nodes);
  const newIds = new Set<string>();

  for (const original of clip.nodes) {
    const id = opts.newId();
    const nombre = uniqueCopyName(original.nombre, taken);
    taken.add(nombre);
    idMap.set(original.id, id);
    nameMap.set(original.nombre, nombre);
    nuevos.set(id, {
      ...original,
      id,
      nombre,
      x: original.x + delta.x,
      y: original.y + delta.y,
      estado_comparativo: "nuevo",
    });
    newIds.add(id);
  }

  // El `agregado` referencia al padre POR NOMBRE: si el padre también se copió,
  // el hijo tiene que apuntar a la COPIA; si no, sigue en el contenedor original.
  // Un contenedor se declara padre de sí mismo (`agregado === nombre`), así que
  // el mismo remapeo le sirve: su nombre también está en `nameMap`.
  for (const id of newIds) {
    const n = nuevos.get(id)!;
    const padre = n.agregado ? nameMap.get(n.agregado) : undefined;
    if (padre && padre !== n.agregado) nuevos.set(id, { ...n, agregado: padre });
  }

  const nuevosLinks = new Map<string, DesignerLink>(links);
  for (const l of clip.links) {
    const sourceId = idMap.get(l.sourceId);
    const targetId = idMap.get(l.targetId);
    if (!sourceId || !targetId) continue;
    const id = opts.newId();
    nuevosLinks.set(id, {
      ...l,
      id,
      sourceId,
      targetId,
      // Los puntos de quiebre y el corrimiento de la etiqueta son coordenadas
      // del lienzo: si no se mueven con la copia, el trazo sale deformado.
      ...(l.midpoint ? { midpoint: { x: l.midpoint.x + delta.x, y: l.midpoint.y + delta.y } } : {}),
      ...(l.midpoints
        ? { midpoints: l.midpoints.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y })) }
        : {}),
    });
    newIds.add(id);
  }

  return { nodes: nuevos, links: nuevosLinks, newIds };
}

// =============================================================================
// Portapapeles compartido (estado de módulo)
// =============================================================================

let compartido: CanvasClipboard | null = null;

/** Guarda lo copiado. Sobrevive al remontaje del lienzo (copiar en una vista, pegar en otra). */
export function setSharedClipboard(clip: CanvasClipboard | null): void {
  compartido = clip;
}

/** Lo último copiado, o `null` si no hay nada. */
export function getSharedClipboard(): CanvasClipboard | null {
  return compartido;
}
