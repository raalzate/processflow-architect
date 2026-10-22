/**
 * @fileOverview Modo foco del lienzo (#617): una caja, sus vecinos y las aristas
 * que los unen a opacidad completa; el resto, atenuado. PURO.
 *
 * Nace en la pestaña Spec: cada paso del flujo nombra el componente de una
 * entrada o salida, pero en un diagrama grande no había forma de ver DÓNDE está
 * ni con quién habla. Enfocarlo lo responde sin perder el resto de vista.
 *
 * Dos garantías que viven acá y no en el componente:
 *
 *  - **Atenuar, nunca ocultar** (P8): `OPACIDAD_ATENUADA` es mayor que cero. El
 *    lienzo no puede quedar en blanco porque se enfocó una caja.
 *  - **El contenedor de algo visible no se atenúa**: la banda o el agregado que
 *    aloja a la caja enfocada (o a un vecino) es su contexto; atenuarlo dejaría
 *    la caja flotando sobre un fondo gris que no dice dónde vive.
 *
 * Agnóstico de notación (P6): opera sobre nodos y aristas, sin mirar tipos.
 */

import { neighborhoodOf, type NeighborEdge } from "./graph-neighbors";

/** Opacidad de lo que queda fuera del foco. > 0 a propósito: atenuar, no ocultar. */
export const OPACIDAD_ATENUADA = 0.2;

/** Lo que se ve a opacidad completa mientras hay foco. */
export interface FocoDelLienzo {
  /** Caja enfocada. */
  centro: string;
  nodes: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

/**
 * El subgrafo visible al enfocar `centro`: la caja, sus vecinos a un salto (en
 * las dos direcciones: entradas y salidas), las aristas que la tocan y los
 * contenedores donde viven. `contenedorDe` devuelve el id del contenedor de un
 * nodo, o `undefined` si está suelto.
 */
export function focoEn(
  centro: string,
  edges: Iterable<NeighborEdge>,
  contenedorDe: (id: string) => string | undefined = () => undefined
): FocoDelLienzo {
  const vecinos = neighborhoodOf(new Set([centro]), edges);
  const nodes = new Set<string>([centro, ...vecinos.nodes]);
  for (const id of [...nodes]) {
    const c = contenedorDe(id);
    if (c) nodes.add(c);
  }
  return { centro, nodes, edges: new Set(vecinos.edges) };
}

/** ¿Este nodo o arista queda atenuado? Sin foco, nada lo está. */
export function atenuado(id: string, foco: FocoDelLienzo | null): boolean {
  if (!foco) return false;
  return !foco.nodes.has(id) && !foco.edges.has(id);
}

/** La opacidad a pintar para un id. Nunca 0 (P8). */
export function opacidadEnFoco(id: string, foco: FocoDelLienzo | null): number {
  return atenuado(id, foco) ? OPACIDAD_ATENUADA : 1;
}
