import type { GraphData } from "../types";

/** Una identidad se asigna al importar; nunca depende de un nombre posterior. */
export function withStableGraphIds(graph: GraphData, uid: () => string = () => crypto.randomUUID()): GraphData {
  const next: GraphData = structuredClone(graph);
  const used = new Set<string>();
  const unique = (candidate: string) => {
    let value = candidate;
    let suffix = 1;
    while (used.has(value)) value = `${candidate}-${++suffix}`;
    used.add(value);
    return value;
  };
  for (const container of next.agregados ?? []) {
    container.id = unique(container.id || `agg-${container.nombre_agregado}`);
  }
  const groups = [next.big_picture?.aristas, next.politicas_inter_agregados,
    ...(next.agregados ?? []).map((a) => a.aristas)];
  for (const edges of groups) for (const edge of edges ?? []) edge.id = unique(edge.id || `edge-${uid()}`);
  return next;
}
