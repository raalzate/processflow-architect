/**
 * @fileOverview Herramientas de LECTURA del agente (PURO).
 *
 * El agente ya no recibe un paquete de contexto armado antes de saber qué
 * necesita: pide lo que le hace falta con tres herramientas de sólo lectura
 * —inventario, leer una vista, buscar en el modelo— dentro del bucle ReAct.
 * Antes llegaban con contenido sólo las vistas pineadas a mano (10 de 50
 * posibles) y del resto ni el agente ni el humano sabían nada: el artefacto
 * salía confiado y parcial, que es peor que salir corto.
 *
 * Sin React ni Electron: la entrada es un CATÁLOGO plano que el contexto arma
 * una vez por turno (ver `plan.md` D1), así esto se prueba con literales y la
 * misma función sirve a cualquier motor.
 */

import type { AgentNote } from "../agent-types";
import type { GraphData, GraphNode } from "../types";
import { collectGraphNodes } from "../view-nodes";
import { countGraph } from "../mcp/app-state";
import { graphToToon } from "./graph-toon";

/** Techo de una sola lectura: una vista enorme no se come el presupuesto entero. */
export const VIEW_READ_MAX = 6000;
/** Tope de resultados de una búsqueda (más que esto no se lee, se hojea). */
export const SEARCH_LIMIT = 12;
/** Nodos citables que se recuerdan por vista leída (los que puede citar el artefacto). */
export const MAX_CITABLE_NODES = 40;

/** Una vista tal como la ve el agente. `graph` va sólo en las que lo tienen. */
export interface ViewEntry {
  name: string;
  notation: string;
  kind: "design" | "graph" | "mermaid";
  graph?: GraphData;
  mermaidCode?: string;
  /** Ya inyectada a mano al chat: el agente no gasta presupuesto releyéndola. */
  pinned?: boolean;
}

export interface Catalog {
  views: ViewEntry[];
}

export interface ViewInventoryItem {
  name: string;
  notation: string;
  kind: ViewEntry["kind"];
  nodes: number;
  edges: number;
  /** Sin nodos ni aristas: no vale gastar una lectura. */
  empty: boolean;
  pinned: boolean;
}

export type ToolResult =
  | { ok: true; text: string; cost: number; note: AgentNote; truncated?: boolean }
  | { ok: false; error: string; suggestions?: string[] };

/* -------------------------------------------------------------------------- */
/* Normalización y resolución de nombres                                       */
/* -------------------------------------------------------------------------- */

/**
 * Clave de comparación de un nombre de vista. El modelo local escribe los
 * nombres de memoria: sin normalizar, «pagos» por «Pagos · Cobro» quema un turno
 * y a veces la corrida entera.
 */
export function normalizeName(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Distancia de edición (Levenshtein) acotada: sólo se usa para sugerir. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/**
 * Resuelve el nombre pedido a una vista del catálogo. Si no hay coincidencia,
 * devuelve nombres cercanos: un error accionable vale un turno, uno mudo lo tira
 * (CONSTITUTION §P11).
 */
export function resolveViewName(
  cat: Catalog,
  name: string
): { name: string } | { suggestions: string[] } {
  const target = normalizeName(name);
  if (target) {
    const exact = cat.views.find((v) => normalizeName(v.name) === target);
    if (exact) return { name: exact.name };
    // Contención: «pagos» encuentra «Pagos · Cobro» (el modelo abrevia).
    const contains = cat.views.filter((v) => {
      const n = normalizeName(v.name);
      return n.includes(target) || target.includes(n);
    });
    if (contains.length === 1) return { name: contains[0].name };
    if (contains.length > 1) return { suggestions: contains.map((v) => v.name) };
  }
  const cercanos = cat.views
    .map((v) => ({ v, d: editDistance(target, normalizeName(v.name)) }))
    .filter(({ v, d }) => d <= 2 || sharedPrefix(target, normalizeName(v.name)) >= 4)
    .sort((a, b) => a.d - b.d || cat.views.indexOf(a.v) - cat.views.indexOf(b.v))
    .map(({ v }) => v.name);
  return { suggestions: cercanos.length ? cercanos : cat.views.map((v) => v.name) };
}

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/* -------------------------------------------------------------------------- */
/* 1 · Inventario                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Qué vistas hay y cuánto pesa cada una, SIN su contenido: con esto el agente
 * decide qué vale leer. Los conteos salen de `countGraph` (el mismo que sirve
 * `get_app_state`): dos cuentas distintas del mismo grafo es una discusión que
 * nadie gana.
 */
export function listViews(cat: Catalog): ViewInventoryItem[] {
  return cat.views.map((v) => {
    const c = v.graph ? countGraph(v.graph) : { nodes: 0, edges: 0, containers: 0 };
    const mermaidLen = (v.mermaidCode ?? "").trim().length;
    return {
      name: v.name,
      notation: v.notation,
      kind: v.kind,
      nodes: c.nodes,
      edges: c.edges,
      empty: c.nodes === 0 && c.edges === 0 && mermaidLen === 0,
      pinned: v.pinned === true,
    };
  });
}

/** Inventario en texto para el modelo (una línea por vista, corto a propósito). */
export function formatInventory(items: ViewInventoryItem[]): string {
  if (!items.length) return "No hay vistas en el proyecto.";
  return items
    .map((i) => {
      const marcas = [i.empty ? "vacía" : null, i.pinned ? "ya en contexto" : null]
        .filter(Boolean)
        .join(", ");
      return `- "${i.name}" (${i.notation}, ${i.nodes} nodos, ${i.edges} aristas${
        marcas ? `, ${marcas}` : ""
      })`;
    })
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* 2 · Leer una vista                                                          */
/* -------------------------------------------------------------------------- */

const containerNames = (graph: GraphData | undefined): string[] =>
  (graph?.agregados ?? []).map((a) => a.nombre_agregado).filter(Boolean);

/**
 * Devuelve el grafo de la vista en TOON (o su código Mermaid), recortado al
 * presupuesto, más la nota atribuida que la corrida recordará de ella.
 */
export function readView(cat: Catalog, name: string, budget: number): ToolResult {
  const resuelto = resolveViewName(cat, name);
  if (!("name" in resuelto)) {
    return {
      ok: false,
      error: `No existe la vista "${name}".`,
      suggestions: resuelto.suggestions,
    };
  }
  if (budget <= 0) {
    return {
      ok: false,
      error:
        "Sin presupuesto de contexto: no se pueden leer más vistas. Consolidá con lo que ya leíste y declará qué quedó afuera.",
    };
  }
  const view = cat.views.find((v) => v.name === resuelto.name)!;
  const limit = Math.min(VIEW_READ_MAX, budget);

  let cuerpo: string;
  let nodes: string[] = [];
  const facts: string[] = [];

  if (view.kind === "mermaid") {
    cuerpo = (view.mermaidCode ?? "").trim() || "(vista Mermaid vacía)";
    facts.push(`Vista Mermaid (${view.notation}), ${cuerpo.split("\n").length} líneas de código.`);
  } else {
    const c = countGraph(view.graph);
    const nodos: GraphNode[] = collectGraphNodes(view.graph);
    nodes = nodos.map((n) => n.nombre).filter(Boolean).slice(0, MAX_CITABLE_NODES);
    cuerpo = view.graph ? graphToToon(view.graph) : "(vista vacía)";
    facts.push(`${c.nodes} nodos y ${c.edges} aristas (notación ${view.notation}).`);
    const conts = containerNames(view.graph);
    if (conts.length) facts.push(`Contenedores: ${conts.join(", ")}.`);
  }

  const truncated = cuerpo.length > limit;
  const text = truncated ? `${cuerpo.slice(0, limit)}\n…(recortado por presupuesto)` : cuerpo;
  if (truncated) facts.push("Lectura RECORTADA por presupuesto: la vista tiene más de lo leído.");

  return {
    ok: true,
    text,
    cost: text.length,
    truncated,
    note: { source: { type: "view", name: view.name }, facts, nodes },
  };
}

/* -------------------------------------------------------------------------- */
/* 3 · Buscar en el modelo                                                     */
/* -------------------------------------------------------------------------- */

interface Hit {
  view: string;
  name: string;
  tipo: string;
  descripcion: string;
  /** Menor = mejor: 0 exacto, 1 prefijo, 2 substring del nombre, 3 descripción, 4 tipo. */
  tier: number;
  viewIdx: number;
  nodeIdx: number;
}

/**
 * Busca un término en todas las vistas y dice EN QUÉ VISTA vive cada hallazgo,
 * que es lo que permite encontrar un concepto sin leer 40 vistas.
 *
 * El orden es determinista (exacto > prefijo > substring del nombre >
 * descripción > tipo, y a igualdad el orden del catálogo): un ranking con
 * puntajes flotantes haría los tests frágiles y el humano no podría reproducir
 * lo que vio.
 */
export function searchModel(cat: Catalog, term: string, limit = SEARCH_LIMIT): ToolResult {
  const needle = normalizeName(term);
  if (!needle) return { ok: false, error: "Falta el término de búsqueda." };

  const hits: Hit[] = [];
  cat.views.forEach((v, viewIdx) => {
    collectGraphNodes(v.graph).forEach((n, nodeIdx) => {
      const nombre = normalizeName(n.nombre);
      const desc = normalizeName(n.descripcion ?? "");
      const tipo = normalizeName(n.tipo_elemento ?? "");
      let tier = -1;
      if (nombre === needle) tier = 0;
      else if (nombre.startsWith(needle)) tier = 1;
      else if (nombre.includes(needle)) tier = 2;
      else if (desc.includes(needle)) tier = 3;
      else if (tipo.includes(needle)) tier = 4;
      if (tier < 0) return;
      hits.push({
        view: v.name,
        name: n.nombre,
        tipo: n.tipo_elemento ?? "",
        descripcion: (n.descripcion ?? "").slice(0, 120),
        tier,
        viewIdx,
        nodeIdx,
      });
    });
  });

  hits.sort((a, b) => a.tier - b.tier || a.viewIdx - b.viewIdx || a.nodeIdx - b.nodeIdx);
  const top = hits.slice(0, limit);

  const text = top.length
    ? top
        .map(
          (h) =>
            `- "${h.name}" [${h.tipo}] en la vista "${h.view}"${
              h.descripcion ? ` — ${h.descripcion}` : ""
            }`
        )
        .join("\n") + (hits.length > top.length ? `\n…(${hits.length - top.length} más)` : "")
    : `Sin coincidencias para "${term}".`;

  const vistas = Array.from(new Set(top.map((h) => h.view)));
  const facts = top.length
    ? [
        `"${term}" aparece en ${top.length} elemento(s) de ${vistas.length} vista(s): ${vistas.join(", ")}.`,
      ]
    : [`"${term}" no aparece en ninguna vista.`];

  return {
    ok: true,
    text,
    cost: text.length,
    note: {
      source: { type: "model", name: `búsqueda: ${term}` },
      facts,
      nodes: top.map((h) => h.name),
    },
  };
}
