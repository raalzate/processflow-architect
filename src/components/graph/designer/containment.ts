/**
 * @fileOverview ¿Dentro de qué contenedor está un nodo? (PURO)
 *
 * Había TRES reglas distintas para lo mismo y ninguna coincidía con lo que se
 * ve en el lienzo:
 *  - al soltar de la paleta se miraba el punto del cursor, con el tamaño del
 *    contenedor cayendo al valor por defecto si le faltaba,
 *  - al terminar de arrastrar se miraba la ESQUINA superior izquierda del nodo
 *    y el tamaño del contenedor caía a 0 (un contenedor sin geometría no
 *    adoptaba nunca),
 *  - `nodeAtPoint` (reapuntar una relación) usaba la caja completa vía `nodeBox`.
 *
 * Peor: la pertenencia sólo se recalculaba para los nodos que el humano acababa
 * de arrastrar. En un C4 con bandas, seis cajas dentro del mismo límite podían
 * quedar tres listadas y tres fuera del modelo, sin diferencia visible.
 *
 * Acá vive la única regla: gana el contenedor que MÁS CUBRE la caja del nodo, y
 * hace falta cubrir al menos la mitad para adoptarlo (rozar un borde no basta).
 * A igual solape gana el contenedor más chico: con cajas anidadas, el padre es
 * el fondo. La geometría es lo que el humano ve, así que es la que manda.
 */
import { nodeBox } from "./link-geom";
import { isContainerType, type DesignerNode } from "./serialize";
import type { NotationId } from "@/lib/notations";

/** Área de la intersección de dos rectángulos; 0 si no se tocan. Puro. */
export function overlapArea(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const ancho = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const alto = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ancho > 0 && alto > 0 ? ancho * alto : 0;
}

/** Fracción de la caja del nodo que hace falta cubrir para adoptarlo. */
export const MIN_COBERTURA = 0.5;

/**
 * Contenedor al que pertenece `node` según la geometría, o `null` si ninguno lo
 * cubre lo suficiente. Los contenedores no se anidan en el modelo: si `node` es
 * un contenedor, devuelve `null` (su `agregado` es su propio nombre).
 */
export function containerOf(
  node: DesignerNode,
  nodes: Iterable<DesignerNode>,
  notation?: NotationId
): DesignerNode | null {
  if (isContainerType(node.tipo_elemento)) return null;
  const caja = nodeBox(node, notation);
  const suya = { x: node.x, y: node.y, ...caja };
  const areaNodo = caja.w * caja.h;
  if (areaNodo <= 0) return null;
  let mejor: DesignerNode | null = null;
  let mejorSolape = 0;
  let mejorArea = Infinity;
  for (const c of nodes) {
    if (c.id === node.id || !isContainerType(c.tipo_elemento)) continue;
    const cb = nodeBox(c, notation);
    const solape = overlapArea(suya, { x: c.x, y: c.y, ...cb });
    if (solape / areaNodo < MIN_COBERTURA) continue;
    const area = cb.w * cb.h;
    // Más solape gana; a igual solape, el contenedor más chico (el hijo).
    if (solape > mejorSolape || (solape === mejorSolape && area < mejorArea)) {
      mejor = c;
      mejorSolape = solape;
      mejorArea = area;
    }
  }
  return mejor;
}

/**
 * Recalcula el `agregado` de TODOS los nodos según la geometría. Devuelve el
 * mapa nuevo y cuántos cambiaron (0 ⇒ se puede reusar el mapa original y no
 * re-renderizar). Un contenedor conserva su propio nombre como `agregado`; un
 * nodo que no cae en ninguno queda con `""` (Big Picture).
 */
export function reassignContainers(
  nodes: Map<string, DesignerNode>,
  notation?: NotationId
): { nodes: Map<string, DesignerNode>; cambios: number } {
  const lista = Array.from(nodes.values());
  let cambios = 0;
  const next = new Map(nodes);
  for (const node of lista) {
    const esperado = isContainerType(node.tipo_elemento)
      ? node.nombre
      : containerOf(node, lista, notation)?.nombre ?? "";
    if ((node.agregado ?? "") !== esperado) {
      next.set(node.id, { ...node, agregado: esperado });
      cambios++;
    }
  }
  return cambios ? { nodes: next, cambios } : { nodes, cambios: 0 };
}
