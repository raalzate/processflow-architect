/**
 * @fileOverview Reapuntar una relación a otra caja (PURO).
 *
 * La punta de una arista se podía arrastrar, pero el nodo estaba fijo antes de
 * calcular nada: al soltar sólo cambiaba el ancla DENTRO de la misma caja
 * (issue #129). Corregir «esto sale del Gateway, no del Storefront» obligaba a
 * borrar la arista y recrearla, perdiendo etiqueta, color, trazo, tipo de
 * relación, quiebres y corrimiento de etiqueta.
 *
 * Acá vive la regla: qué se conserva al reapuntar (todo menos el extremo) y qué
 * se rechaza (el self-loop, que no se dibuja).
 */
import { isContainerType, type DesignerNode, type DesignerLink } from "./serialize";
import { nodeBox } from "./link-geom";
import type { NotationId } from "@/lib/notations";

/**
 * Nodo bajo un punto del lienzo. Con cajas anidadas gana la MÁS CHICA: sobre un
 * contenedor con hijos, el destino que el usuario ve bajo el cursor es el hijo.
 * `null` si el punto está en el vacío.
 */
export function nodeAtPoint(
  nodes: Map<string, DesignerNode>,
  p: { x: number; y: number },
  notation?: NotationId
): DesignerNode | null {
  let hit: DesignerNode | null = null;
  let hitArea = Infinity;
  for (const node of nodes.values()) {
    const { w, h } = nodeBox(node, notation);
    if (p.x < node.x || p.x > node.x + w || p.y < node.y || p.y > node.y + h) continue;
    const area = w * h;
    // A igual área gana el que no es contenedor: el contenedor es el fondo.
    const mejor = area < hitArea || (area === hitArea && hit && isContainerType(hit.tipo_elemento));
    if (mejor) {
      hit = node;
      hitArea = area;
    }
  }
  return hit;
}

/**
 * Reapunta un extremo de la relación al nodo indicado. Devuelve:
 *  - la arista nueva (mismo id, mismo todo, salvo el extremo y su ancla),
 *  - la MISMA arista si el extremo ya apuntaba ahí (soltar donde estaba),
 *  - `null` si el reapuntado no es válido (self-loop): quien llama no toca nada.
 *
 * El ancla del nodo abandonado NO se arrastra: era una fracción de otra caja.
 */
export function reconnectLink(
  link: DesignerLink,
  extremo: "source" | "target",
  nuevoNodoId: string
): DesignerLink | null {
  const otro = extremo === "source" ? link.targetId : link.sourceId;
  if (nuevoNodoId === otro) return null; // origen = destino: no se dibuja
  const actual = extremo === "source" ? link.sourceId : link.targetId;
  if (nuevoNodoId === actual) return link;
  const next = { ...link } as DesignerLink;
  if (extremo === "source") {
    next.sourceId = nuevoNodoId;
    delete next.sourceAnchor;
  } else {
    next.targetId = nuevoNodoId;
    delete next.targetAnchor;
  }
  return next;
}
