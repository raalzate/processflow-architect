/**
 * @fileOverview Sumar al lienzo lo que llega de un modelo (spec 027 · T34) — PURO.
 *
 * «Proponer hechos» integra un `DiagramModel` en el lienzo que el humano está
 * editando. Lo que ya está dibujado NO se mueve —sólo se le actualiza la
 * metadata (la procedencia que suma la propuesta)—; lo nuevo entra en una
 * columna a la derecha del contenido; una flecha entre un par que ya tiene una
 * no se duplica. Se empareja por id: la ida y vuelta lienzo → modelo → lienzo
 * conserva los ids (lo fija `serialize-predicado.test.ts`).
 */

export interface NodoLienzo {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  metadata?: unknown[];
}

export interface FlechaLienzo {
  id: string;
  sourceId: string;
  targetId: string;
}

export const SEPARACION_COLUMNA = 120;
export const PASO_FILA = 120;
export const MARGEN_SUPERIOR = 60;

export function fusionarEnLienzo<N extends NodoLienzo, L extends FlechaLienzo>(
  actual: { nodes: Map<string, N>; links: Map<string, L> },
  entrante: { nodes: Map<string, N>; links: Map<string, L> }
): { nodes: Map<string, N>; links: Map<string, L>; nodosNuevos: string[]; flechasNuevas: string[]; omitidas: string[] } {
  const nodes = new Map(actual.nodes);
  const borde = Math.max(0, ...[...nodes.values()].map((n) => (n.x ?? 0) + (n.width ?? 0)));
  const nodosNuevos: string[] = [];
  for (const [id, n] of entrante.nodes) {
    const vivo = nodes.get(id);
    if (vivo) {
      if (JSON.stringify(vivo.metadata ?? []) !== JSON.stringify(n.metadata ?? [])) nodes.set(id, { ...vivo, metadata: n.metadata });
      continue;
    }
    nodes.set(id, { ...n, x: borde + SEPARACION_COLUMNA, y: MARGEN_SUPERIOR + nodosNuevos.length * PASO_FILA });
    nodosNuevos.push(id);
  }
  const links = new Map(actual.links);
  const pares = new Set([...links.values()].map((l) => `${l.sourceId}>${l.targetId}`));
  const flechasNuevas: string[] = [];
  const omitidas: string[] = [];
  for (const l of entrante.links.values()) {
    const par = `${l.sourceId}>${l.targetId}`;
    if (pares.has(par)) {
      if (!actual.links.has(l.id)) omitidas.push(l.id);
      continue;
    }
    if (!nodes.has(l.sourceId) || !nodes.has(l.targetId)) {
      omitidas.push(l.id);
      continue;
    }
    pares.add(par);
    links.set(l.id, l);
    flechasNuevas.push(l.id);
  }
  return { nodes, links, nodosNuevos, flechasNuevas, omitidas };
}
