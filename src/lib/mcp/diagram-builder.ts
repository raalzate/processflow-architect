/**
 * @fileOverview Constructor PURO de diagramas para el servidor MCP.
 *
 * Modela un diagrama en memoria (contenedores, nodos, aristas) y lo serializa
 * al formato `GraphData` que la app importa 1:1 (mismo formato que produce el
 * diseñador, ver `components/graph/designer/serialize.ts`). Reglas replicadas:
 *
 *  - Los CONTENEDORES (Agregado, Pool, Límite de Sistema, Paquete, …) se vuelven
 *    entradas de `agregados[]` con su `tipo_contenedor`.
 *  - Un nodo con `container` = nombre de un contenedor existente va a
 *    `agregados[].nodos`; si no, al `big_picture.nodos`.
 *  - Una arista intra-contenedor va a `agregados[].aristas`; entre contenedores
 *    distintos a `politicas_inter_agregados`; el resto al `big_picture.aristas`.
 *
 * Además genera geometría (x/y/width/height) para que el diseñador reconstruya
 * el lienzo sin recalcular, y valida el diagrama (tipos, ids, aristas colgantes,
 * nodos aislados —que el procesador del grafo descarta—).
 *
 * PURO: sin React, sin Electron; sólo imports relativos → corre en vitest y en
 * el proceso stdio del MCP vía tsx.
 */

import type { GraphData, GraphNode, Agregado } from "../types";
import { getNotation, isNotationContainer, type NotationId } from "../notations";
import { validTypesFor } from "./catalog";

// --- Geometría por defecto (misma escala que el diseñador) ---
const NODE_W = 160;
const NODE_H = 60;
const AGG_W = 500;
const AGG_H = 400;
const GAP = 40;

const ESTADOS = ["nuevo", "modificado", "sin_cambios", "existente", "eliminado"] as const;
type Estado = (typeof ESTADOS)[number];

export interface DiagramMeta {
  nombre_proyecto: string;
  notation: NotationId;
  descripcion?: string;
  version?: string;
  fecha_analisis?: string;
}

/** Nodo en construcción. `container` = NOMBRE del contenedor padre (o vacío). */
export interface BuilderNode {
  id: string;
  nombre: string;
  tipo_elemento: string;
  descripcion?: string;
  /** Nombre del contenedor al que pertenece (los contenedores lo dejan vacío). */
  container?: string;
  estado_comparativo?: Estado;
  tags_tecnologia?: string[] | null;
  color?: string;
  borderColor?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface BuilderEdge {
  fuente: string;
  destino: string;
  descripcion?: string;
  color?: string;
  dashed?: boolean;
  arrow?: "end" | "both" | "none";
  routing?: "straight" | "curved" | "orthogonal";
}

export interface DiagramModel {
  meta: DiagramMeta;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Utilidades
// =============================================================================

/** Slug estable para ids autogenerados a partir del nombre. */
export function slugify(name: string): string {
  const base = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos (marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "nodo";
}

/** Genera un id único dentro del modelo a partir de un nombre. */
function uniqueId(model: DiagramModel, name: string): string {
  const base = slugify(name);
  const taken = new Set(model.nodes.map((n) => n.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

const findNode = (model: DiagramModel, id: string): BuilderNode | undefined =>
  model.nodes.find((n) => n.id === id);

const isContainerNode = (n: BuilderNode): boolean => isNotationContainer(n.tipo_elemento);

// =============================================================================
// Construcción (funciones inmutables: devuelven un modelo NUEVO)
// =============================================================================

export function emptyDiagram(meta: DiagramMeta): DiagramModel {
  return { meta: { ...meta }, nodes: [], edges: [] };
}

/** Añade un CONTENEDOR (Agregado, Pool, Límite, Paquete…). Lanza si el tipo no es contenedor. */
export function addContainer(
  model: DiagramModel,
  input: Omit<BuilderNode, "id" | "container"> & { id?: string }
): { model: DiagramModel; id: string } {
  if (!isNotationContainer(input.tipo_elemento)) {
    throw new Error(
      `"${input.tipo_elemento}" no es un tipo contenedor. Contenedores válidos: ${[...allContainerTypes()].join(", ")}.`
    );
  }
  const id = input.id ?? uniqueId(model, input.nombre);
  if (findNode(model, id)) throw new Error(`Ya existe un elemento con id "${id}".`);
  const node: BuilderNode = { ...input, id, container: "" };
  return { model: { ...model, nodes: [...model.nodes, node] }, id };
}

/** Añade un NODO. Si `container` se indica, debe existir y ser contenedor. */
export function addNode(
  model: DiagramModel,
  input: Omit<BuilderNode, "id"> & { id?: string }
): { model: DiagramModel; id: string } {
  if (isNotationContainer(input.tipo_elemento)) {
    throw new Error(
      `"${input.tipo_elemento}" es un contenedor: usa addContainer, no addNode.`
    );
  }
  if (input.container) {
    const parent = model.nodes.find((n) => n.nombre === input.container && isContainerNode(n));
    if (!parent) {
      throw new Error(
        `El contenedor "${input.container}" no existe. Créalo primero con add_container.`
      );
    }
  }
  const id = input.id ?? uniqueId(model, input.nombre);
  if (findNode(model, id)) throw new Error(`Ya existe un elemento con id "${id}".`);
  const node: BuilderNode = { ...input, id };
  return { model: { ...model, nodes: [...model.nodes, node] }, id };
}

/** Conecta dos elementos por id. Ambos extremos deben existir. */
export function addEdge(model: DiagramModel, input: BuilderEdge): DiagramModel {
  if (!findNode(model, input.fuente)) throw new Error(`La fuente "${input.fuente}" no existe.`);
  if (!findNode(model, input.destino)) throw new Error(`El destino "${input.destino}" no existe.`);
  return { ...model, edges: [...model.edges, { ...input }] };
}

/** Elimina un nodo/contenedor y las aristas que lo tocan. */
export function removeNode(model: DiagramModel, id: string): DiagramModel {
  const node = findNode(model, id);
  const nodes = model.nodes.filter((n) => n.id !== id);
  // Si era contenedor, sus hijos quedan sueltos (container vacío).
  const orphaned = node && isContainerNode(node)
    ? nodes.map((n) => (n.container === node.nombre ? { ...n, container: "" } : n))
    : nodes;
  const edges = model.edges.filter((e) => e.fuente !== id && e.destino !== id);
  return { ...model, nodes: orphaned, edges };
}

// =============================================================================
// Validación
// =============================================================================

function allContainerTypes(): Set<string> {
  // Recolecta de todas las notaciones los tipos marcados como contenedor.
  const types = new Set<string>();
  for (const id of ["ddd", "bpmn", "c4", "uml"] as NotationId[]) {
    for (const e of getNotation(id).elements) {
      if (e.container) types.add(e.type);
    }
  }
  return types;
}

/**
 * Valida el diagrama. `errors` rompen la importación; `warnings` no, pero avisan
 * (p. ej. nodos aislados que el procesador del grafo descarta del lienzo).
 */
export function validate(model: DiagramModel): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validTypes = validTypesFor(model.meta.notation);
  const ids = new Set<string>();
  const connected = new Set<string>();
  for (const e of model.edges) {
    connected.add(e.fuente);
    connected.add(e.destino);
  }

  for (const n of model.nodes) {
    if (ids.has(n.id)) errors.push(`Id duplicado: "${n.id}".`);
    ids.add(n.id);
    // Tipo desconocido para la notación → warning (un grafo puede mezclar notaciones).
    if (!validTypes.has(n.tipo_elemento)) {
      warnings.push(
        `"${n.nombre}" usa el tipo "${n.tipo_elemento}", que no pertenece a la notación "${model.meta.notation}".`
      );
    }
    // Nodo no-contenedor sin ninguna arista: el procesador del grafo lo descarta.
    if (!isContainerNode(n) && !connected.has(n.id)) {
      warnings.push(
        `"${n.nombre}" (${n.id}) no tiene aristas; el lienzo lo descartará. Conéctalo con add_edge.`
      );
    }
    // container referenciado inexistente.
    if (n.container && !model.nodes.some((c) => c.nombre === n.container && isContainerNode(c))) {
      errors.push(`"${n.nombre}" referencia el contenedor inexistente "${n.container}".`);
    }
  }

  for (const e of model.edges) {
    if (!ids.has(e.fuente)) errors.push(`Arista con fuente inexistente "${e.fuente}".`);
    if (!ids.has(e.destino)) errors.push(`Arista con destino inexistente "${e.destino}".`);
  }

  if (model.nodes.length === 0) warnings.push("El diagrama no tiene nodos.");

  return { ok: errors.length === 0, errors, warnings };
}

// =============================================================================
// Layout automático (asigna geometría a lo que no la tenga)
// =============================================================================

/** Devuelve un modelo con geometría completa (respeta coords ya presentes). */
export function layout(model: DiagramModel): DiagramModel {
  const containers = model.nodes.filter(isContainerNode);
  const nodes = model.nodes.filter((n) => !isContainerNode(n));

  // Posición de cada contenedor: grid 2 columnas.
  const placed = new Map<string, BuilderNode>();
  containers.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = c.x ?? 60 + col * (AGG_W + GAP + 40);
    const y = c.y ?? 60 + row * (AGG_H + GAP + 40);
    const width = c.width ?? AGG_W;
    const height = c.height ?? AGG_H;
    placed.set(c.id, { ...c, x, y, width, height });
  });

  // Hijos dentro de su contenedor; sueltos en una columna a la derecha del grid.
  const containersByName = new Map(
    [...placed.values()].map((c) => [c.nombre, c])
  );
  const childCursor = new Map<string, number>();
  const freeArea = {
    x: 60 + 2 * (AGG_W + GAP + 40),
    y: 60,
  };
  let freeIndex = 0;

  const laidNodes = nodes.map((n) => {
    if (typeof n.x === "number" && typeof n.y === "number") return n;
    const parent = n.container ? containersByName.get(n.container) : undefined;
    if (parent) {
      const i = childCursor.get(parent.id) ?? 0;
      childCursor.set(parent.id, i + 1);
      const perRow = Math.max(1, Math.floor(((parent.width ?? AGG_W) - GAP) / (NODE_W + 24)));
      const x = (parent.x ?? 0) + 24 + (i % perRow) * (NODE_W + 24);
      const y = (parent.y ?? 0) + 60 + Math.floor(i / perRow) * (NODE_H + GAP);
      return { ...n, x, y };
    }
    const x = freeArea.x + (freeIndex % 3) * (NODE_W + 24);
    const y = freeArea.y + Math.floor(freeIndex / 3) * (NODE_H + GAP);
    freeIndex++;
    return { ...n, x, y };
  });

  return { ...model, nodes: [...placed.values(), ...laidNodes] };
}

// =============================================================================
// Serialización a GraphData (formato que la app importa)
// =============================================================================

function toDomainNode(n: BuilderNode): Omit<GraphNode, "agregado"> {
  return {
    id: n.id,
    nombre: n.nombre,
    tipo_elemento: n.tipo_elemento as GraphNode["tipo_elemento"],
    descripcion: n.descripcion,
    estado_comparativo: n.estado_comparativo ?? "nuevo",
    tags_tecnologia: n.tags_tecnologia ?? null,
    color: n.color,
    borderColor: n.borderColor,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  };
}

/**
 * Serializa el modelo a `GraphData`. Aplica layout primero para garantizar
 * geometría. Es la salida que `handleCreateProjectFromContent` carga en el lienzo.
 */
export function toGraphData(input: DiagramModel): GraphData {
  const model = layout(input);
  const { meta } = model;

  const containers = model.nodes.filter(isContainerNode);
  const domainNodes = model.nodes.filter((n) => !isContainerNode(n));

  const agregados: Agregado[] = containers.map((c) => ({
    nombre_agregado: c.nombre,
    entidad_raiz: (c.descripcion || "").trim() || c.nombre,
    descripcion: c.descripcion || "",
    nodos: [],
    aristas: [],
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
    tipo_contenedor: c.tipo_elemento,
    color: c.color,
    borderColor: c.borderColor,
  }));
  const aggByName = new Map(agregados.map((a) => [a.nombre_agregado, a]));

  const bigNodos: Omit<GraphNode, "agregado">[] = [];
  for (const n of domainNodes) {
    const domain = toDomainNode(n);
    const agg = n.container ? aggByName.get(n.container) : undefined;
    if (agg) agg.nodos.push(domain);
    else bigNodos.push(domain);
  }

  // Contenedor de cada id (nombre del contenedor, o "" si está en el big picture).
  const containerOf = (id: string): string => {
    const n = findNode(model, id);
    if (!n) return "";
    if (isContainerNode(n)) return aggByName.has(n.nombre) ? n.nombre : "";
    return n.container && aggByName.has(n.container) ? n.container : "";
  };

  const bigAristas: GraphData["big_picture"]["aristas"] = [];
  const policies: NonNullable<GraphData["politicas_inter_agregados"]> = [];

  for (const e of model.edges) {
    const arista = {
      fuente: e.fuente,
      destino: e.destino,
      descripcion: e.descripcion || "",
      color: e.color,
      dashed: e.dashed,
      arrow: e.arrow,
      routing: e.routing,
    };
    const sa = containerOf(e.fuente);
    const ta = containerOf(e.destino);
    if (sa && ta && sa === ta) aggByName.get(sa)!.aristas.push(arista);
    else if (sa && ta && sa !== ta) policies.push(arista);
    else bigAristas.push(arista);
  }

  return {
    nombre_proyecto: meta.nombre_proyecto,
    version: meta.version || "1.0.0",
    // La notación viaja con el modelo: así export_to_app (que no la pasaba por
    // canal aparte) entrega un proyecto con la paleta correcta, no forzado a DDD.
    notation: meta.notation,
    fecha_analisis: meta.fecha_analisis || new Date().toISOString().slice(0, 10),
    big_picture: {
      descripcion: meta.descripcion || "",
      hotspots: [],
      nodos: bigNodos,
      aristas: bigAristas,
    },
    agregados,
    read_models: [],
    politicas_inter_agregados: policies,
    responsables: [],
    notas: "",
    transcript: "",
  };
}

/** Reconstruye un `DiagramModel` desde un `GraphData` (para editar diseños existentes). */
export function fromGraphData(data: GraphData, notation: NotationId = "ddd"): DiagramModel {
  const nodes: BuilderNode[] = [];
  const edges: BuilderEdge[] = [];

  for (const agg of data.agregados || []) {
    nodes.push({
      id: `agg-${agg.nombre_agregado}`,
      nombre: agg.nombre_agregado,
      tipo_elemento: agg.tipo_contenedor && isNotationContainer(agg.tipo_contenedor)
        ? agg.tipo_contenedor
        : "Agregado",
      descripcion: agg.descripcion || agg.entidad_raiz || "",
      container: "",
      color: (agg as any).color,
      borderColor: (agg as any).borderColor,
      x: agg.x,
      y: agg.y,
      width: agg.width,
      height: agg.height,
    });
    for (const n of agg.nodos || []) {
      nodes.push({ ...(n as any), container: agg.nombre_agregado });
    }
    for (const a of agg.aristas || []) {
      edges.push({
        fuente: a.fuente,
        destino: a.destino,
        descripcion: (a as any).descripcion,
        // Preservar el estilo de la arista (punteado = retorno en secuencia, etc.).
        dashed: (a as any).dashed,
        arrow: (a as any).arrow,
        color: (a as any).color,
        routing: (a as any).routing,
      });
    }
  }
  for (const n of data.big_picture?.nodos || []) {
    nodes.push({ ...(n as any), container: "" });
  }
  const pushEdge = (a: any) =>
    edges.push({
      fuente: a.fuente,
      destino: a.destino,
      descripcion: a.descripcion,
      // Preservar el estilo (punteado = retorno en secuencia, flecha, color, enrutado).
      dashed: a.dashed,
      arrow: a.arrow,
      color: a.color,
      routing: a.routing,
    });
  for (const a of data.big_picture?.aristas || []) pushEdge(a);
  for (const a of data.politicas_inter_agregados || []) pushEdge(a);

  return {
    meta: {
      nombre_proyecto: data.nombre_proyecto,
      notation,
      descripcion: data.big_picture?.descripcion,
      version: data.version,
      fecha_analisis: data.fecha_analisis,
    },
    nodes,
    edges,
  };
}
