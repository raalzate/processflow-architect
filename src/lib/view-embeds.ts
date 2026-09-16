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

// -----------------------------------------------------------------------------
// Jerarquía de la tira de pestañas.
//
// El modelo de vistas es un ÁRBOL (una vista embebe subprocesos), pero la tira lo
// pintaba plano: cada subproceso gastaba una pestaña. Lo de abajo deriva la
// jerarquía del propio grafo — sin formato persistido nuevo — para que la tira
// muestre sólo raíces y cada raíz liste sus subprocesos.
// -----------------------------------------------------------------------------

/** Vista mínima que necesitan estas funciones (evita atar `lib/` a la UI). */
export interface EmbedView {
  id: string;
  graph?: GraphData | null;
  builtin?: boolean;
}

/** hijo → conjunto de vistas que lo embeben. Una vista puede tener varios padres. */
export type ParentMap = Map<string, Set<string>>;

/** Nodo que embebe una vista: sirve para decir DESDE DÓNDE se entra al subproceso. */
export interface EmbedOrigin {
  /** Vista que contiene el nodo. */
  parentViewId: string;
  nodeId: string;
  nodeName: string;
  /** Vista embebida por ese nodo. */
  viewRef: string;
}

/** Nodos con `viewRef` de un grafo, con su nombre (para mostrar el origen). */
export function collectEmbedNodes(
  graph: GraphData | null | undefined
): { nodeId: string; nodeName: string; viewRef: string }[] {
  if (!graph) return [];
  const out: { nodeId: string; nodeName: string; viewRef: string }[] = [];
  const push = (n: { id?: string; nombre?: string; viewRef?: string } | undefined | null) => {
    if (n?.viewRef) out.push({ nodeId: n.id ?? "", nodeName: n.nombre ?? "", viewRef: n.viewRef });
  };
  (graph.big_picture?.nodos || []).forEach(push);
  (graph.agregados || []).forEach((a) => (a.nodos || []).forEach(push));
  return out;
}

/**
 * hijo → padres. Sólo cuenta referencias a vistas EXISTENTES: un `viewRef`
 * colgante (la vista se borró) no debe esconder ni inventar nada.
 */
export function buildParentMap(views: EmbedView[]): ParentMap {
  const existentes = new Set(views.map((v) => v.id));
  const m: ParentMap = new Map();
  for (const v of views) {
    for (const ref of collectViewRefs(v.graph)) {
      if (!existentes.has(ref) || ref === v.id) continue;
      if (!m.has(ref)) m.set(ref, new Set());
      m.get(ref)!.add(v.id);
    }
  }
  return m;
}

/** Hijos directos de `viewId`, en el orden de `views` (estable en la UI). */
export function childrenOf(views: EmbedView[], viewId: string): string[] {
  const view = views.find((v) => v.id === viewId);
  if (!view) return [];
  const refs = new Set(collectViewRefs(view.graph));
  return views.filter((v) => v.id !== viewId && refs.has(v.id)).map((v) => v.id);
}

/** Orígenes (vista padre + nodo) desde los que se embebe `viewId`. */
export function originsOf(views: EmbedView[], viewId: string): EmbedOrigin[] {
  const out: EmbedOrigin[] = [];
  for (const v of views) {
    if (v.id === viewId) continue;
    for (const n of collectEmbedNodes(v.graph)) {
      if (n.viewRef === viewId) out.push({ parentViewId: v.id, ...n });
    }
  }
  return out;
}

/**
 * Vistas que van en la tira: las que nadie embebe, más las built-in (P: una vista
 * del sistema nunca se esconde). Red de seguridad: si tras eso alguna vista queda
 * INALCANZABLE —un ciclo A↔B, donde todas tienen padre— se promueve a raíz la
 * primera de cada bolsa huérfana. Así la tira nunca queda vacía ni deja una vista
 * sin camino para llegar.
 */
export function rootViewIds(views: EmbedView[]): string[] {
  const parents = buildParentMap(views);
  const esRaiz = (v: EmbedView) => v.builtin || !(parents.get(v.id)?.size);
  const roots = views.filter(esRaiz).map((v) => v.id);

  const alcanzables = new Set<string>();
  const marcar = (id: string) => {
    if (alcanzables.has(id)) return;
    alcanzables.add(id);
    childrenOf(views, id).forEach(marcar);
  };
  roots.forEach(marcar);

  for (const v of views) {
    if (alcanzables.has(v.id)) continue;
    roots.push(v.id);
    marcar(v.id);
  }
  // Orden de `views`: la tira no debe reordenarse por promover una raíz.
  const enRoots = new Set(roots);
  return views.filter((v) => enRoots.has(v.id)).map((v) => v.id);
}

/**
 * Raíz de la tira que corresponde a `viewId`: él mismo si es raíz, si no el primer
 * ancestro raíz (BFS, tolerante a ciclos). Sirve para resaltar la pestaña padre
 * mientras se navega en profundidad, cuando la vista activa ya no está en la tira.
 */
export function rootAncestorOf(views: EmbedView[], viewId: string): string | null {
  const roots = new Set(rootViewIds(views));
  if (roots.has(viewId)) return viewId;
  const parents = buildParentMap(views);
  const seen = new Set([viewId]);
  let nivel = [...(parents.get(viewId) ?? [])];
  while (nivel.length) {
    const raiz = nivel.find((id) => roots.has(id));
    if (raiz) return raiz;
    const siguiente: string[] = [];
    for (const id of nivel) {
      if (seen.has(id)) continue;
      seen.add(id);
      siguiente.push(...(parents.get(id) ?? []));
    }
    nivel = siguiente;
  }
  return null;
}

/**
 * Ruta `[raíz, …, viewId]` para llegar a una vista desde la tira de pestañas.
 * BFS desde las raíces: devuelve el camino más corto (y determinista, en el orden
 * de `views`). Para una raíz es `[viewId]`; `[]` si la vista no existe. Sirve para
 * que cualquier salto —paleta de comandos, enlace— entre con el breadcrumb bien
 * puesto en vez de dejar la vista activa fuera de la tira y sin rastro.
 */
export function pathToView(views: EmbedView[], viewId: string): string[] {
  if (!views.some((v) => v.id === viewId)) return [];
  const roots = rootViewIds(views);
  if (roots.includes(viewId)) return [viewId];
  const seen = new Set(roots);
  let cola = roots.map((id) => [id]);
  while (cola.length) {
    const siguiente: string[][] = [];
    for (const ruta of cola) {
      for (const hijo of childrenOf(views, ruta[ruta.length - 1])) {
        if (hijo === viewId) return [...ruta, hijo];
        if (seen.has(hijo)) continue;
        seen.add(hijo);
        siguiente.push([...ruta, hijo]);
      }
    }
    cola = siguiente;
  }
  return [viewId];
}
