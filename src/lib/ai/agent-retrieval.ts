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
import { specToContext } from "./graph-toon";
import {
  citaDe,
  formatSourceInventory,
  readSourceRange,
  resolveCita,
  type SourceDoc,
} from "../source-docs";

/**
 * Techo de una sola lectura. Bajó de 6 000 a 2 000 caracteres cuando el motor
 * local empezó a tirar «Too many tokens requested»: la ventana por defecto es de
 * 4 096 tokens (contexto + salida) y dos lecturas de 6 000 caracteres ya la
 * revientan. Lo que se lee ahora es un DIGEST, no el grafo entero.
 */
export const VIEW_READ_MAX = 2000;
/** Tope de resultados de una búsqueda (más que esto no se lee, se hojea). */
export const SEARCH_LIMIT = 12;
/** Nodos citables que se recuerdan por vista leída (los que puede citar el artefacto). */
export const MAX_CITABLE_NODES = 40;
/**
 * Tope de la ficha de UN elemento. Igual que el de una vista: la ficha existe
 * justo para lo que no cabe en el digest —la descripción entera y la spec—, pero
 * un elemento no puede costar más que la vista que lo contiene.
 */
export const ELEMENT_READ_MAX = VIEW_READ_MAX;
/** Descripción recortada en el DIGEST de una vista (la entera se pide con read_element). */
export const DESC_EN_DIGEST = 90;

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
  /**
   * Documentos de los que salió el modelo, con su texto (`source-docs.ts`). No
   * viajan al contexto por existir: el agente ve el inventario y PIDE el trozo.
   */
  sources?: SourceDoc[];
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

/** Todas las aristas del grafo (big picture + políticas + internas de contenedor). */
function collectEdges(graph: GraphData | undefined): { fuente: string; destino: string; descripcion?: string }[] {
  if (!graph) return [];
  return [
    ...(graph.big_picture?.aristas ?? []),
    ...((graph as { politicas_inter_agregados?: unknown[] }).politicas_inter_agregados ?? []),
    ...(graph.agregados ?? []).flatMap((a) => a.aristas ?? []),
  ] as { fuente: string; destino: string; descripcion?: string }[];
}

/**
 * Marca de que la caja tiene MÁS de lo que entra en el digest. Sin ella el agente
 * no puede SABER que existe un contrato: leía 90 caracteres de descripción y
 * contestaba con eso, aunque la spec estuviera escrita (#239). Son tres palabras
 * por nodo y sólo en los nodos que las ganan; el contenido se pide con
 * `read_element`, que es lo que respeta la ventana del motor local.
 */
export function fichaHints(n: GraphNode): string {
  const hints: string[] = [];
  if (specToContext(n.spec)) hints.push("spec");
  if (n.metadata?.length) hints.push("props");
  if ((n.descripcion ?? "").length > DESC_EN_DIGEST) hints.push("desc+");
  return hints.length ? ` {${hints.join(",")}}` : "";
}

/**
 * Retrato COMPACTO de una vista: elementos con su tipo y contenedor, y relaciones
 * con su etiqueta. Reemplaza al TOON completo en la observación que recibe el
 * modelo — el TOON de una vista mediana son ~6 000 caracteres y con una ventana
 * de 4 096 tokens dos lecturas rompían la corrida («Too many tokens requested»).
 * Un digest de la misma vista cabe en ~600, y lo que un artefacto necesita son
 * los nombres, los tipos y quién habla con quién.
 */
export function viewDigest(
  graph: GraphData | undefined,
  notation: string,
  limit = VIEW_READ_MAX
): string {
  const nodos = collectGraphNodes(graph);
  const aristas = collectEdges(graph);
  const porNombre = new Map(nodos.map((n) => [n.id, n.nombre]));
  const lineas: string[] = [];

  const conts = containerNames(graph);
  if (conts.length) lineas.push(`Contenedores: ${conts.join(", ")}.`);

  if (nodos.length) {
    lineas.push("Elementos:");
    for (const n of nodos) {
      const agg = n.agregado ? ` @${n.agregado}` : "";
      const desc = n.descripcion ? ` — ${n.descripcion.slice(0, DESC_EN_DIGEST)}` : "";
      lineas.push(`- ${n.nombre} [${n.tipo_elemento}]${agg}${desc}${fichaHints(n)}`);
    }
  }
  if (aristas.length) {
    lineas.push("Relaciones:");
    for (const a of aristas) {
      const de = porNombre.get(a.fuente) ?? a.fuente;
      const al = porNombre.get(a.destino) ?? a.destino;
      lineas.push(`- ${de} → ${al}${a.descripcion ? ` (${a.descripcion})` : ""}`);
    }
  }
  const texto = `Notación ${notation}.\n${lineas.join("\n")}`.trim();
  return texto.length > limit ? `${texto.slice(0, limit)}\n…(recortado)` : texto;
}

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
    // Digest, no TOON: ver `viewDigest` (la ventana del modelo local es chica).
    cuerpo = view.graph ? viewDigest(view.graph, view.notation, limit) : "(vista vacía)";
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
  /** Marca de lo que la caja tiene y este resultado no trae (ver `fichaHints`). */
  hints: string;
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
        hints: fichaHints(n),
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
            }${h.hints}`
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

/* -------------------------------------------------------------------------- */
/* 4 · Leer la ficha de un elemento                                            */
/* -------------------------------------------------------------------------- */

/** Un elemento encontrado en el catálogo, con la vista en la que vive. */
export interface ElementHit {
  view: ViewEntry;
  node: GraphNode;
}

/**
 * Resuelve el nombre (o el id) de un elemento a UNA caja del catálogo. Mismo
 * criterio que `resolveViewName` —exacto, contención, cercanía— porque el modelo
 * abrevia igual los nombres de caja que los de vista, y un error mudo cuesta un
 * turno de 35 s.
 */
export function resolveElement(cat: Catalog, name: string): ElementHit | { suggestions: string[] } {
  const target = normalizeName(name);
  const todos: ElementHit[] = cat.views.flatMap((view) =>
    collectGraphNodes(view.graph).map((node) => ({ view, node }))
  );
  if (!target) return { suggestions: todos.slice(0, SEARCH_LIMIT).map((h) => h.node.nombre) };

  const exacto = todos.find(
    (h) => normalizeName(h.node.nombre) === target || normalizeName(h.node.id) === target
  );
  if (exacto) return exacto;

  const contiene = todos.filter((h) => {
    const n = normalizeName(h.node.nombre);
    return n.includes(target) || target.includes(n);
  });
  if (contiene.length === 1) return contiene[0];
  if (contiene.length > 1) return { suggestions: contiene.map((h) => h.node.nombre) };

  const cercanos = todos
    .map((h) => ({ h, d: editDistance(target, normalizeName(h.node.nombre)) }))
    .filter(({ d }) => d <= 2)
    .sort((a, b) => a.d - b.d)
    .map(({ h }) => h.node.nombre);
  return { suggestions: cercanos.slice(0, SEARCH_LIMIT) };
}

/**
 * La especificación de un elemento en texto para el modelo. Sale de
 * `specToContext` (la misma poda que ya usa el contexto en TOON): así el agente
 * lee EL MISMO contrato lo pida por donde lo pida, y las marcas «por aclarar»
 * —lo que tiene que preguntarle al humano— viajan pegadas al requisito.
 */
export function formatSpec(spec: unknown): string[] {
  const c = specToContext(spec);
  if (!c) return [];
  const lineas: string[] = [];
  const lista = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  if (typeof c.feature === "string") lineas.push(`Feature: ${c.feature}`);
  if (typeof c.estado === "string") lineas.push(`Estado de la spec: ${c.estado}`);
  if (typeof c.pedido === "string") lineas.push(`Pedido original: ${c.pedido}`);
  for (const h of (Array.isArray(c.historias) ? c.historias : []) as Record<string, unknown>[]) {
    lineas.push(`Historia ${String(h.historia ?? "")}`);
    if (h.porQue) lineas.push(`  porque: ${String(h.porQue)}`);
    for (const e of lista(h.escenarios)) lineas.push(`  escenario: ${e}`);
  }
  const bloque = (titulo: string, items: string[]) => {
    if (items.length) lineas.push(`${titulo}: ${items.join(" · ")}`);
  };
  bloque("Requisitos", lista(c.requisitos));
  bloque("Criterios de éxito", lista(c.criterios));
  bloque("Entidades", lista(c.entidades));
  bloque("Casos límite", lista(c.casosLimite));
  return lineas;
}

/**
 * Ficha COMPLETA de una caja: descripción sin recortar, propiedades y
 * especificación. Es la herramienta que faltaba: el digest de una vista da 90
 * caracteres de descripción por nodo, así que sin esto el agente contestaba
 * sobre el resumen del resumen aunque el contrato estuviera escrito (#239).
 */
export function readElement(cat: Catalog, name: string, budget: number): ToolResult {
  if (budget <= 0) {
    return {
      ok: false,
      error:
        "Sin presupuesto de contexto: no se pueden leer más fichas. Consolidá con lo que ya leíste y declará qué quedó afuera.",
    };
  }
  const hit = resolveElement(cat, name);
  if ("suggestions" in hit) {
    return { ok: false, error: `No existe el elemento "${name}".`, suggestions: hit.suggestions };
  }
  const { node, view } = hit;
  const limit = Math.min(ELEMENT_READ_MAX, budget);

  const lineas: string[] = [`${node.nombre} [${node.tipo_elemento}] · vista "${view.name}"`];
  if (node.agregado) lineas.push(`Contenedor: ${node.agregado}`);
  if (node.descripcion?.trim()) lineas.push(`Descripción: ${node.descripcion.trim()}`);
  const props = (node.metadata ?? []).filter((m) => m?.clave);
  if (props.length)
    lineas.push(`Propiedades: ${props.map((m) => `${m.clave}=${m.valor ?? m.url ?? ""}`).join(" · ")}`);
  const spec = formatSpec(node.spec);
  if (spec.length) lineas.push("Especificación:", ...spec);
  else lineas.push("Sin especificación escrita todavía.");

  // La cita de la caja viaja dentro de la descripción («Fuente: docs/…:36»). Si
  // el documento está adjunto al proyecto, la ficha trae el TROZO que la
  // sostiene: sin esto la cita nombra un archivo que la app no tiene (#240).
  const cita = citaDe(node.descripcion);
  if (cita) {
    const r = resolveCita(cat.sources ?? [], cita);
    if (r.estado === "ok") lineas.push(`Fuente ${r.doc}:`, r.fragmento);
    else if (r.estado === "falta")
      lineas.push(`Fuente citada: ${cita} (el documento NO está adjunto al proyecto).`);
  }

  const cuerpo = lineas.join("\n");
  const truncated = cuerpo.length > limit;
  const text = truncated ? `${cuerpo.slice(0, limit)}\n…(recortado por presupuesto)` : cuerpo;

  const facts = [
    `"${node.nombre}" es un ${node.tipo_elemento} de la vista "${view.name}"${
      node.agregado ? ` (en ${node.agregado})` : ""
    }.`,
  ];
  if (spec.length) facts.push(`Tiene especificación escrita (${spec.length} línea(s) de contrato).`);
  if (truncated) facts.push("Ficha RECORTADA por presupuesto: el elemento tiene más de lo leído.");

  return {
    ok: true,
    text,
    cost: text.length,
    truncated,
    note: { source: { type: "view", name: view.name }, facts, nodes: [node.nombre] },
  };
}


/* -------------------------------------------------------------------------- */
/* 5 · Leer un documento fuente                                                */
/* -------------------------------------------------------------------------- */

/** Inventario de documentos fuente para el system prompt (sin su contenido). */
export function sourceInventory(cat: Catalog): string {
  return formatSourceInventory(cat.sources ?? []);
}

/**
 * Un trozo de un documento fuente. Es la única forma en que el texto del
 * documento entra al contexto: entero no cabe —la ventana del motor local son
 * 4 096 tokens— y empujarlo tampoco serviría, porque lo que el agente necesita es
 * el párrafo que sostiene la caja de la que se le está preguntando (#240).
 */
export function readSource(
  cat: Catalog,
  name: string,
  budget: number,
  from?: number,
  to?: number
): ToolResult {
  if (budget <= 0) {
    return {
      ok: false,
      error:
        "Sin presupuesto de contexto: no se pueden leer más fuentes. Consolidá con lo que ya leíste y declará qué quedó afuera.",
    };
  }
  const docs = cat.sources ?? [];
  if (!docs.length) {
    return {
      ok: false,
      error:
        "El proyecto no tiene documentos fuente adjuntos: las citas de los elementos no se pueden abrir desde acá.",
    };
  }
  const limit = Math.min(VIEW_READ_MAX, budget);
  const r = readSourceRange(docs, name, from, to, limit);
  if (!r.ok) return { ok: false, error: r.error, suggestions: r.disponibles };
  const facts = [`Leído de "${r.doc}"${from ? ` desde la línea ${from}` : ""}.`];
  if (r.truncado) facts.push("Lectura RECORTADA: el documento tiene más de lo leído.");
  return {
    ok: true,
    text: r.texto,
    cost: r.texto.length,
    truncated: r.truncado,
    note: { source: { type: "document", name: r.doc }, facts, nodes: [] },
  };
}
