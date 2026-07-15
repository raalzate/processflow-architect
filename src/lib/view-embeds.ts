// =============================================================================
// Grafo de vistas embebidas (subprocesos).
//
// Un nodo puede embeber otra vista vía `viewRef` (estilo "call activity" BPMN).
// Aquí vive la lógica PURA para razonar sobre ese grafo de embebidos: extraer
// las referencias de un grafo y detectar si un nuevo enlace crearía un ciclo
// (A embebe B, B embebe A, …), que dejaría la navegación en profundidad atrapada.
// =============================================================================

import type { GraphData } from "@/lib/types";

/** Ids de vistas embebidas (viewRef) presentes en los nodos de un grafo. */
export function collectViewRefs(graph: GraphData | null | undefined): string[] {
  if (!graph) return [];
  const refs: string[] = [];
  const push = (n: { viewRef?: string } | undefined | null) => {
    if (n?.viewRef) refs.push(n.viewRef);
  };
  (graph.big_picture?.nodos || []).forEach(push);
  (graph.agregados || []).forEach((a) => (a.nodos || []).forEach(push));
  return refs;
}

/** vista → conjunto de vistas que embebe directamente. */
export type EmbedMap = Map<string, Set<string>>;

/** Construye el mapa de embebidos directos a partir de las vistas y sus grafos. */
export function buildEmbedMap(
  views: { id: string; graph?: GraphData | null }[]
): EmbedMap {
  const m: EmbedMap = new Map();
  for (const v of views) m.set(v.id, new Set(collectViewRefs(v.graph)));
  return m;
}

/**
 * ¿Enlazar `from` → `to` crearía un ciclo?
 * Cierto si `from === to` o si `from` ya es alcanzable desde `to` siguiendo los
 * embebidos existentes (el nuevo enlace cerraría el lazo).
 */
export function wouldCreateCycle(
  embeds: EmbedMap,
  from: string,
  to: string
): boolean {
  if (from === to) return true;
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of embeds.get(cur) ?? []) stack.push(next);
  }
  return false;
}
