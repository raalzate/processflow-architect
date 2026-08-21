// =============================================================================
// Serialización entre el lienzo del diseñador y el formato GraphData.
//
// El diseñador es ahora la ÚNICA fuente del JSON de dominio: produce y consume
// `SavedFile.content` (GraphData), el mismo formato que antes se importaba.
//
//  - canvasToGraphData: lienzo (Maps) -> GraphData   (lo que generan las demás utilidades)
//  - graphDataToCanvas: GraphData -> lienzo (Maps)   (reconstrucción al cargar)
//
// La geometría (x/y/width/height) se persiste dentro del propio GraphData
// (campos opcionales de GraphNode y Agregado), por lo que el diseño se
// reconstruye 1:1 al recargar sin necesidad de un estado paralelo.
// =============================================================================

import {
  type GraphData,
  type GraphNode,
  type Agregado,
} from "@/lib/types";
import { type EdgeRelationKind } from "@/lib/edge-relations";
import { normalizarLista, type ElementMetadata } from "@/lib/element-metadata";
import {
  isNotationContainer,
  sizeOfType,
  DEFAULT_NODE_SIZE,
  type NotationId,
} from "@/lib/notations";

/**
 * Tipo de elemento del lienzo. Antes era la unión cerrada de DDD; ahora es un
 * string porque cada notación (DDD, BPMN, C4, UML) aporta sus propios tipos.
 */
export type DesignerElementType = string;

/** Nodo del lienzo: tipo visual + geometría. */
export interface DesignerNode {
  id: string;
  nombre: string;
  tipo_elemento: DesignerElementType;
  descripcion?: string;
  agregado?: string; // nombre del contenedor padre ("" si está en el Big Picture)
  estado_comparativo: GraphNode["estado_comparativo"];
  tags_tecnologia?: string[] | null;
  /** Color de fondo personalizado (hex). */
  color?: string;
  /** Color de borde/contorno personalizado (hex). */
  borderColor?: string;
  /**
   * Referencias y datos externos de la caja (repo, wiki, dueño). Vale igual para
   * un nodo y para un CONTENEDOR: en el lienzo el contenedor también es un
   * `DesignerNode` (`agg-<nombre>`), pero al guardar viaja a `Agregado.metadata`.
   */
  metadata?: ElementMetadata[];
  /** Id de la vista embebida (subproceso): abrirlo entra a esa vista. */
  viewRef?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** Enlace del lienzo. */
export interface DesignerLink {
  id: string;
  sourceId: string;
  targetId: string;
  descripcion: string;
  /** Color de línea personalizado (hex). */
  color?: string;
  /** true → línea discontinua (punteada); por defecto continua. */
  dashed?: boolean;
  /** Enrutado del trazo: recta (por defecto), curva o escalonada (ortogonal). */
  routing?: "straight" | "curved" | "orthogonal";
  /** Dirección de la(s) flecha(s): al destino (por defecto), ambos, o ninguna. */
  arrow?: "end" | "both" | "none";
  /** Relación UML de la arista (marca de cada punta y trazo) — ver `edge-relations.ts`. */
  relation?: EdgeRelationKind;
  /** Ancla de la punta en el nodo ORIGEN (x/y normalizados 0..1 de su caja). */
  sourceAnchor?: { x: number; y: number };
  /** Ancla de la punta en el nodo DESTINO (x/y normalizados 0..1 de su caja). */
  targetAnchor?: { x: number; y: number };
  /** Punto de doblez (esquina) del enrutado escalonado. @deprecated usar midpoints */
  midpoint?: { x: number; y: number };
  /** Puntos de quiebre (esquinas) del enrutado escalonado, en orden. */
  midpoints?: { x: number; y: number }[];
  /**
   * Desplazamiento de la etiqueta respecto de su sitio natural sobre el trazo
   * (px del lienzo). Sin esto la etiqueta era inamovible y se solapaba con
   * nodos o con otras líneas sin salida posible.
   */
  labelOffset?: { x: number; y: number };
}

// Contenedor según el registro GLOBAL de notaciones (DDD, BPMN, C4, UML).
// Independiente de la notación activa: un grafo puede contener tipos de varias.
export const isContainerType = (t: string) => isNotationContainer(t);

// --- Layout por defecto al reconstruir nodos sin geometría guardada ---
// El tamaño del nodo suelto lo declara su notación (`sizeOfType`); estos valores
// sólo sirven para la rejilla de reconstrucción, que es previa al tipo.
const NODE_W = DEFAULT_NODE_SIZE.w;
const NODE_H = DEFAULT_NODE_SIZE.h;
const AGG_W = 500;
const AGG_H = 400;

// =============================================================================
// canvasToGraphData
// =============================================================================

/**
 * Convierte el estado del lienzo en un GraphData válido.
 * @param nodes  Mapa de nodos del lienzo.
 * @param links  Mapa de enlaces del lienzo.
 * @param base   GraphData previo del que se conservan los metadatos
 *               (nombre_proyecto, version, fecha, big_picture.descripcion,
 *               hotspots, read_models, responsables, notas, transcript).
 */
export function canvasToGraphData(
  nodes: Map<string, DesignerNode>,
  links: Map<string, DesignerLink>,
  base: Partial<GraphData> & { nombre_proyecto: string; fecha_analisis: string }
): GraphData {
  const nodeList = Array.from(nodes.values());

  // 1. Contenedores -> agregados[]
  const agregados: Agregado[] = nodeList
    .filter((n) => isContainerType(n.tipo_elemento))
    .map((c) => ({
      nombre_agregado: c.nombre,
      entidad_raiz: (c.descripcion || "").trim() || c.nombre,
      descripcion: c.descripcion || "",
      nodos: [],
      aristas: [],
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      // Conserva el tipo de contenedor REAL (DDD o de otra notación) para round-trip 1:1.
      tipo_contenedor: c.tipo_elemento,
      color: c.color,
      borderColor: c.borderColor,
      metadata: c.metadata,
    }));
  const aggByName = new Map(agregados.map((a) => [a.nombre_agregado, a]));

  // 2. Nodos de dominio -> a su agregado o al Big Picture
  const bigNodos: Omit<GraphNode, "agregado">[] = [];
  for (const n of nodeList) {
    if (isContainerType(n.tipo_elemento)) continue;
    const domain = toDomainNode(n);
    const agg = n.agregado ? aggByName.get(n.agregado) : undefined;
    if (agg) agg.nodos.push(domain);
    else bigNodos.push(domain);
  }

  // 3. Enlaces -> aristas internas / políticas inter-agregados / big picture
  const aggregateOf = (id: string): string => {
    const nn = nodes.get(id);
    if (!nn) return "";
    return isContainerType(nn.tipo_elemento) ? nn.nombre : nn.agregado || "";
  };

  const bigAristas: Omit<GraphData["big_picture"]["aristas"][number], never>[] =
    [];
  const policies: NonNullable<GraphData["politicas_inter_agregados"]> = [];

  for (const l of links.values()) {
    if (!nodes.has(l.sourceId) || !nodes.has(l.targetId)) continue;
    const arista = {
      fuente: l.sourceId,
      destino: l.targetId,
      descripcion: l.descripcion || "",
      color: l.color,
      dashed: l.dashed,
      routing: l.routing,
      arrow: l.arrow,
      relation: l.relation,
      sourceAnchor: l.sourceAnchor,
      targetAnchor: l.targetAnchor,
      midpoints: l.midpoints,
      labelOffset: l.labelOffset,
    };
    // Sólo cuenta como "dentro de un agregado" si el agregado EXISTE como contenedor
    // (un nodo puede referenciar un agregado ya borrado → su enlace va al Big Picture).
    const rawSa = aggregateOf(l.sourceId);
    const rawTa = aggregateOf(l.targetId);
    const sa = rawSa && aggByName.has(rawSa) ? rawSa : "";
    const ta = rawTa && aggByName.has(rawTa) ? rawTa : "";

    if (sa && ta && sa === ta) {
      aggByName.get(sa)!.aristas.push(arista);
    } else if (sa && ta && sa !== ta) {
      policies.push(arista);
    } else {
      // Al menos un extremo está en el Big Picture (o referencia un agregado inexistente).
      bigAristas.push(arista);
    }
  }

  return {
    nombre_proyecto: base.nombre_proyecto,
    version: base.version || "1.0.0",
    // La notación viaja CON el documento: si no se propaga aquí, el autoguardado
    // del lienzo la borra y la vista vuelve a la notación por defecto.
    notation: base.notation,
    // Igual que la notación: si no se propaga acá, el autoguardado del lienzo
    // borra el enrutado por defecto de la vista en el primer cambio.
    defaultRouting: base.defaultRouting,
    fecha_analisis: base.fecha_analisis,
    big_picture: {
      descripcion: base.big_picture?.descripcion || "",
      hotspots: base.big_picture?.hotspots || [],
      nodos: bigNodos,
      aristas: bigAristas,
    },
    agregados,
    read_models: base.read_models || [],
    politicas_inter_agregados: policies,
    responsables: base.responsables || [],
    notas: base.notas || "",
    transcript: base.transcript || "",
  };
}

/** Nodo de lienzo -> nodo de dominio (sin `agregado`, con geometría). */
function toDomainNode(n: DesignerNode): Omit<GraphNode, "agregado"> {
  return {
    id: n.id,
    nombre: n.nombre,
    // DDD usa tipos de NODE_TYPES; otras notaciones aportan tipos libres (se guardan tal cual).
    tipo_elemento: n.tipo_elemento as unknown as GraphNode["tipo_elemento"],
    descripcion: n.descripcion,
    estado_comparativo: n.estado_comparativo || "nuevo",
    tags_tecnologia: n.tags_tecnologia ?? null,
    color: n.color,
    borderColor: n.borderColor,
    metadata: n.metadata,
    viewRef: n.viewRef,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  };
}

// =============================================================================
// graphDataToCanvas
// =============================================================================

/**
 * Reconstruye el estado del lienzo a partir de un GraphData.
 * Reutiliza la geometría persistida; si falta, aplica un layout incremental.
 */
export function graphDataToCanvas(content: GraphData | null | undefined): {
  nodes: Map<string, DesignerNode>;
  links: Map<string, DesignerLink>;
} {
  const nodes = new Map<string, DesignerNode>();
  const links = new Map<string, DesignerLink>();
  if (!content) return { nodes, links };

  let aggCursor = 0;
  const placeAgg = (a: Agregado) => {
    if (typeof a.x === "number" && typeof a.y === "number")
      return { x: a.x, y: a.y };
    const col = aggCursor % 2;
    const row = Math.floor(aggCursor / 2);
    aggCursor++;
    return { x: 60 + col * (AGG_W + 80), y: 60 + row * (AGG_H + 80) };
  };

  // Agregados (contenedores) + sus nodos y aristas internas
  (content.agregados || []).forEach((agg) => {
    const pos = placeAgg(agg);
    const w = agg.width || AGG_W;
    const h = agg.height || AGG_H;
    const containerId = `agg-${agg.nombre_agregado}`;
    nodes.set(containerId, {
      id: containerId,
      nombre: agg.nombre_agregado,
      // Restaura el tipo de contenedor guardado; si es desconocido, cae a "Agregado".
      tipo_elemento:
        agg.tipo_contenedor && isContainerType(agg.tipo_contenedor)
          ? agg.tipo_contenedor
          : "Agregado",
      descripcion: agg.descripcion || agg.entidad_raiz || "",
      agregado: agg.nombre_agregado,
      estado_comparativo: "nuevo",
      color: (agg as any).color,
      borderColor: (agg as any).borderColor,
      // Lo guardado puede venir de un import o de una versión vieja: se normaliza
      // (descarta lo inválido, deduplica por clave) en vez de confiar.
      metadata: normalizarLista((agg as any).metadata),
      x: pos.x,
      y: pos.y,
      width: w,
      height: h,
    });

    let i = 0;
    (agg.nodos || []).forEach((n: any) => {
      nodes.set(n.id, hydrateNode(n, agg.nombre_agregado, pos, w, i++));
    });

    (agg.aristas || []).forEach((a: any) => addLink(links, a));
  });

  // Big Picture (nodos sin agregado)
  let j = 0;
  (content.big_picture?.nodos || []).forEach((n: any) => {
    nodes.set(n.id, hydrateNode(n, "", { x: 60, y: 60 }, 0, j++, true));
  });
  (content.big_picture?.aristas || []).forEach((a: any) => addLink(links, a));

  // Políticas inter-agregados
  (content.politicas_inter_agregados || []).forEach((a: any) =>
    addLink(links, a)
  );

  return { nodes, links };
}

function hydrateNode(
  n: any,
  agregado: string,
  containerPos: { x: number; y: number },
  containerWidth: number,
  index: number,
  bigPicture = false
): DesignerNode {
  const hasPos = typeof n.x === "number" && typeof n.y === "number";
  let x = n.x;
  let y = n.y;
  if (!hasPos) {
    if (bigPicture) {
      x = 60 + (index % 5) * (NODE_W + 24);
      y = 60 + Math.floor(index / 5) * (NODE_H + 40);
    } else {
      const perRow = Math.max(1, Math.floor((containerWidth - 40) / (NODE_W + 24)));
      x = containerPos.x + 24 + (index % perRow) * (NODE_W + 24);
      y = containerPos.y + 60 + Math.floor(index / perRow) * (NODE_H + 40);
    }
  }
  return {
    id: n.id,
    nombre: n.nombre,
    tipo_elemento: n.tipo_elemento,
    descripcion: n.descripcion,
    agregado,
    estado_comparativo: n.estado_comparativo || "nuevo",
    tags_tecnologia: n.tags_tecnologia ?? null,
    color: n.color,
    borderColor: n.borderColor,
    metadata: normalizarLista(n.metadata),
    viewRef: n.viewRef,
    x,
    y,
    width: n.width,
    height: n.height,
  };
}

function addLink(
  links: Map<string, DesignerLink>,
  a: {
    fuente: string;
    destino: string;
    descripcion?: string;
    color?: string;
    dashed?: boolean;
    routing?: DesignerLink["routing"];
    arrow?: DesignerLink["arrow"];
    relation?: DesignerLink["relation"];
    sourceAnchor?: DesignerLink["sourceAnchor"];
    targetAnchor?: DesignerLink["targetAnchor"];
    midpoint?: DesignerLink["midpoint"];
    midpoints?: DesignerLink["midpoints"];
    labelOffset?: DesignerLink["labelOffset"];
  }
) {
  const id = `link-${a.fuente}-${a.destino}-${crypto.randomUUID()}`;
  links.set(id, {
    id,
    sourceId: a.fuente,
    targetId: a.destino,
    descripcion: a.descripcion || "",
    color: a.color,
    dashed: a.dashed,
    routing: a.routing,
    arrow: a.arrow,
    relation: a.relation,
    sourceAnchor: a.sourceAnchor,
    targetAnchor: a.targetAnchor,
    // Compat: grafos viejos guardaban un único `midpoint`.
    midpoints: a.midpoints ?? (a.midpoint ? [a.midpoint] : undefined),
    labelOffset: a.labelOffset,
  });
}

// =============================================================================
// Utilidad: nodos aislados (sin enlaces) — el procesador del grafo los descarta
// de las vistas, así que el diseñador avisa al usuario.
// =============================================================================

/** Devuelve los nombres de nodos no-contenedor sin ningún enlace. */
export function findIsolatedNodes(
  nodes: Map<string, DesignerNode>,
  links: Map<string, DesignerLink>
): string[] {
  const connected = new Set<string>();
  for (const l of links.values()) {
    connected.add(l.sourceId);
    connected.add(l.targetId);
  }
  return Array.from(nodes.values())
    .filter((n) => !isContainerType(n.tipo_elemento) && !connected.has(n.id))
    .map((n) => n.nombre);
}

// =============================================================================
// Utilidad: caja envolvente del contenido (para "ajustar a contenido").
// =============================================================================

/** Rectángulo envolvente en coordenadas del lienzo. */
export interface ContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Caja que contiene TODOS los nodos (usa su geometría real; si falta ancho/alto,
 * aplica el tamaño por defecto según sea contenedor o nodo simple). Devuelve
 * null si no hay nodos. La usa "ajustar a contenido" para encuadrar el zoom.
 */
export function computeContentBounds(
  nodes: Map<string, DesignerNode>,
  notation?: NotationId
): ContentBounds | null {
  if (nodes.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes.values()) {
    const isC = isContainerType(n.tipo_elemento);
    // El tamaño guardado sólo manda en los contenedores (son redimensionables);
    // en un nodo suelto puede venir de un layout viejo y dejaría el encuadre —y
    // el recorte del export— más chico que el nodo que se dibuja hoy.
    const w = isC ? n.width ?? AGG_W : sizeOfType(n.tipo_elemento, notation).w;
    const h = isC ? n.height ?? AGG_H : sizeOfType(n.tipo_elemento, notation).h;
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + w > maxX) maxX = n.x + w;
    if (n.y + h > maxY) maxY = n.y + h;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** GraphData mínimo válido para un proyecto nuevo. */
export function emptyGraphData(
  nombre_proyecto: string,
  fecha_analisis: string,
  /** Notación con la que nace el modelo; viaja en el documento (ver GraphData). */
  notation?: NotationId
): GraphData {
  return {
    nombre_proyecto,
    version: "1.0.0",
    notation,
    fecha_analisis,
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
  };
}
