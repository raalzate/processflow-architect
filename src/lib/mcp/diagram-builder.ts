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

import type { GraphData, GraphNode, Agregado, ReadModel } from "../types";
import { problemasDePropiedades } from "../element-properties";
import { sanitizeSpec, type ElementSpec } from "../element-spec";
import {
  normalizarLista,
  quitarMetadata,
  upsertVarios,
  type ElementMetadata,
} from "../element-metadata";
import {
  getNotation,
  hasRole,
  isBlobContainer,
  isNotationContainer,
  nodeSizeForNotation,
  DEFAULT_NODE_SIZE,
  roleOfType,
  typesWithRole,
  type ElementRole,
  type NotationId,
} from "../notations";
import { validTypesFor } from "./catalog";
import { mermaidSafeId } from "./mermaid-id";
import {
  getPreset,
  resolveStrategy,
  scalePreset,
  type LayoutDensity,
  type LayoutPreset,
  type LayoutStrategy,
} from "./layout-presets";

// --- Geometría por defecto ---
/**
 * Ancho de referencia para acotar NOMBRES. No es el tamaño con el que se dibuja:
 * ese lo declara cada notación (`sizeOfType`) y el layout lo lee de ahí. Se
 * mantiene aparte porque el aviso de "este nombre se va a recortar" viaja al
 * agente por MCP y usa la caja por defecto (ver deuda en STATUS.md).
 */
export const NODE_W = DEFAULT_NODE_SIZE.w;

/**
 * Caracteres que caben en el nombre de un nodo. Se deriva de cómo dibuja el
 * lienzo, no de un número elegido a ojo: caja de `NODE_W` con padding `p-2`
 * (8 px por lado), texto `text-xs` (~6,6 px por carácter en negrita) y
 * `line-clamp-2`, del que la fila del icono se come una línea larga. Medido
 * contra diagramas reales: por encima de ~21 caracteres el nombre se recorta.
 */
export const NAME_CHARS_POR_LINEA = Math.floor((NODE_W - 16) / 6.6);
export const MAX_NAME_CHARS = NAME_CHARS_POR_LINEA;

/**
 * Largo máximo de la etiqueta de una arista. Se dibuja suelta sobre la línea,
 * sin caja que la acote: pasada esa longitud invade los nodos vecinos y, con
 * varias aristas juntas, se convierte en una mancha ilegible. El detalle largo
 * va en la descripción de la relación.
 */
export const MAX_EDGE_LABEL_CHARS = 30;

/**
 * Alto que se reserva abajo en un contenedor elíptico para su nombre: el lienzo
 * lo dibuja sobre el borde inferior y sin este aire pisaría al hijo más bajo.
 */
const ETIQUETA_BLOB = 24;

/**
 * Vocabulario ÚNICO del estado comparativo de un elemento. Se exporta porque la
 * puerta MCP (`add_node`, `add_container`, `update_element`) declara su enum
 * desde acá: una segunda lista a mano se desincroniza en el primer estado nuevo.
 */
export const ESTADOS = ["nuevo", "modificado", "sin_cambios", "existente", "eliminado"] as const;
export type Estado = (typeof ESTADOS)[number];

export interface DiagramMeta {
  nombre_proyecto: string;
  notation: NotationId;
  descripcion?: string;
  version?: string;
  fecha_analisis?: string;
  /** Con qué densidad y estrategia se dibujó por última vez (ver `layout-presets`). */
  layout?: { density: LayoutDensity; strategy: LayoutStrategy };
  /**
   * Zonas del modelo que hay que discutir (los "hotspots" del Event Storming).
   * Viajan a `big_picture.hotspots`, que es lo que muestra la app.
   */
  hotspots?: string[];
  /** Quién responde por el modelo (va a `GraphData.responsables`). */
  responsables?: string[];
  /**
   * Notas del humano sobre el proyecto. NO reemplazan el resumen de
   * ambigüedades: en `toGraphData` van primero y el resumen se agrega debajo.
   * Antes este campo no existía y `notas` era sólo el resumen, así que exportar
   * de nuevo borraba lo que el humano había escrito en la app.
   */
  notas?: string;
}

/** Nodo en construcción. `container` = NOMBRE del contenedor padre (o vacío). */
export interface BuilderNode {
  id: string;
  nombre: string;
  tipo_elemento: string;
  descripcion?: string;
  /**
   * Cita de DÓNDE sale el elemento en el material fuente ("PRD §3.2 (p. 7)",
   * "acta 12-mar", "src/pagos/service.ts"). Sostiene la revisión humana: el
   * revisor compara elemento ↔ fuente en vez de confiar en el modelo.
   */
  source?: string;
  /**
   * Referencias y datos externos de la caja: DÓNDE VIVE de verdad (repositorio,
   * wiki, tablero, dueño). Distinto de `source`: la cita justifica el modelado,
   * el metadato apunta al artefacto vivo y sobrevive el ida y vuelta como dato
   * (la cita se dobla en la descripción, ver `toDomainNode`).
   */
  metadata?: ElementMetadata[];
  /**
   * Especificación del elemento: qué debe hacer y cómo se verifica (ver
   * `src/lib/element-spec.ts`). La escribe la ficha de la app o un agente por
   * MCP; en las dos direcciones pasa por `sanitizeSpec`.
   */
  spec?: ElementSpec;
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

/**
 * Decisión de diseño que la fuente NO cierra (alternativas sin decidir,
 * contradicciones, vacíos que cambian la topología). Vive en el modelo para que
 * no se diluya en la conversación del agente: se pregunta una vez, se resuelve
 * y lo que quede pendiente llega al humano en la entrega.
 */
export interface Ambiguity {
  id: string;
  pregunta: string;
  /** Alternativas tal como las nombra la fuente. */
  opciones?: string[];
  /** Qué parte del diagrama cambia según la respuesta. */
  afecta?: string;
  /** Cita de dónde nace la duda. */
  source?: string;
  /** Respuesta del humano; mientras esté vacía, la ambigüedad está pendiente. */
  resolucion?: string;
}

export interface DiagramModel {
  meta: DiagramMeta;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  ambiguities?: Ambiguity[];
  /**
   * Modelos de lectura (proyecciones). No son nodos del lienzo: son la vista de
   * datos que la app lista aparte, así que viven en el modelo y no en `nodes`.
   */
  readModels?: ReadModel[];
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

/**
 * Busca por id EXACTO y, si no hay, por el id tal como se dibuja en la vista
 * previa Mermaid: es de ahí de donde el agente los copia, y ahí los guiones se
 * vuelven guiones bajos. Un id saneado que corresponde a UN solo elemento se
 * resuelve; si corresponde a varios se lanza, porque adivinar cuál sería peor
 * que fallar (issue #149).
 */
const findNode = (model: DiagramModel, id: string): BuilderNode | undefined => {
  const exacto = model.nodes.find((n) => n.id === id);
  if (exacto) return exacto;

  const porMermaid = model.nodes.filter((n) => mermaidSafeId(n.id) === id);
  if (porMermaid.length === 1) return porMermaid[0];
  if (porMermaid.length > 1) {
    throw new Error(
      `"${id}" es como se dibuja en Mermaid más de un elemento (${porMermaid
        .map((n) => `"${n.id}"`)
        .join(", ")}). Usa el id real, el que devuelve add_node o get_diagram.`
    );
  }
  return undefined;
};

/** Ids reales de los elementos, para poner opciones en un mensaje de error. */
const idsDisponibles = (model: DiagramModel): string =>
  model.nodes.length ? model.nodes.map((n) => `"${n.id}"`).join(", ") : "(ninguno)";

const isContainerNode = (n: BuilderNode): boolean => isNotationContainer(n.tipo_elemento);

// =============================================================================
// Construcción (funciones inmutables: devuelven un modelo NUEVO)
// =============================================================================

export function emptyDiagram(meta: DiagramMeta): DiagramModel {
  return { meta: { ...meta }, nodes: [], edges: [] };
}

/**
 * Metadatos declarados al crear una caja: se validan y deduplican por clave acá,
 * no al guardarlos. Un agente que manda una clave vacía tiene que enterarse en la
 * llamada, no dejar el diagrama con basura silenciosa.
 * @throws con el motivo (clave/valor obligatorios, topes).
 */
function metadataDeEntrada(lista: ElementMetadata[] | undefined): ElementMetadata[] | undefined {
  if (!lista?.length) return undefined;
  return upsertVarios(undefined, lista);
}

/**
 * Mensaje del intento de anidar contenedores. Vive acá —y no en el servidor—
 * porque es la ÚNICA salida documentada (ADR 0002: la profundidad se modela con
 * vistas, no anidando) y un mensaje que sólo dice "no se puede" deja al agente
 * inventando bandas hermanas que mienten sobre la jerarquía.
 */
export const SIN_ANIDAMIENTO =
  "Un contenedor no puede colgar de otro: el formato de proyecto es de UN nivel (ADR 0002). " +
  "Para el nivel de abajo —los Componentes de un Contenedor en C4, un subproceso dentro de un " +
  "carril en BPMN— creá OTRA VISTA con ese detalle y enlazala desde el elemento padre con " +
  "`viewRef` (export_as_view). Meterlo como banda hermana en el mismo lienzo dice que son del " +
  "mismo rango, que es justo lo que no son.";

/** Añade un CONTENEDOR (Agregado, Pool, Límite, Paquete…). Lanza si el tipo no es contenedor. */
export function addContainer(
  model: DiagramModel,
  input: Omit<BuilderNode, "id" | "container"> & { id?: string; container?: string }
): { model: DiagramModel; id: string } {
  if (!isNotationContainer(input.tipo_elemento)) {
    throw new Error(
      `"${input.tipo_elemento}" no es un tipo contenedor. Contenedores válidos: ${[...allContainerTypes()].join(", ")}.`
    );
  }
  // El intento natural del agente es pasar `container`: que ahí aprenda la salida.
  if (input.container?.trim()) throw new Error(SIN_ANIDAMIENTO);
  const id = input.id ?? uniqueId(model, input.nombre);
  // Por id EXACTO: `findNode` resuelve también el id tal como se dibuja en
  // Mermaid, y con eso un id nuevo chocaba contra otro que sólo se le parece.
  if (model.nodes.some((n) => n.id === id)) throw new Error(`Ya existe un elemento con id "${id}".`);
  const node: BuilderNode = { ...input, id, container: "", metadata: metadataDeEntrada(input.metadata) };
  if (!node.metadata) delete node.metadata;
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
  // Por id EXACTO: `findNode` resuelve también el id tal como se dibuja en
  // Mermaid, y con eso un id nuevo chocaba contra otro que sólo se le parece.
  if (model.nodes.some((n) => n.id === id)) throw new Error(`Ya existe un elemento con id "${id}".`);
  const node: BuilderNode = { ...input, id, metadata: metadataDeEntrada(input.metadata) };
  if (!node.metadata) delete node.metadata;
  return { model: { ...model, nodes: [...model.nodes, node] }, id };
}

/** Conecta dos elementos por id. Ambos extremos deben existir. */
export function addEdge(model: DiagramModel, input: BuilderEdge): DiagramModel {
  const fuente = findNode(model, input.fuente);
  if (!fuente) {
    throw new Error(`La fuente "${input.fuente}" no existe. Los que hay: ${idsDisponibles(model)}.`);
  }
  const destino = findNode(model, input.destino);
  if (!destino) {
    throw new Error(`El destino "${input.destino}" no existe. Los que hay: ${idsDisponibles(model)}.`);
  }
  // Se guardan los ids REALES: una arista con el id dibujado quedaría colgando.
  input = { ...input, fuente: fuente.id, destino: destino.id };
  return { ...model, edges: [...model.edges, { ...input }] };
}

/**
 * Corrige un elemento existente (nombre, descripción, cita, tags) conservando su
 * id y sus relaciones. Sin esto, acortar un nombre obligaba a borrar y recrear el
 * nodo —perdiendo sus aristas—, así que en la práctica nadie corregía nada.
 * Renombrar un CONTENEDOR arrastra la referencia de sus hijos.
 */
export function updateNode(
  model: DiagramModel,
  id: string,
  patch: Partial<Pick<BuilderNode, "nombre" | "descripcion" | "source" | "tags_tecnologia" | "tipo_elemento" | "estado_comparativo">> & {
    /** Metadatos a agregar o reemplazar POR CLAVE (no reemplaza la lista entera). */
    metadata?: ElementMetadata[];
    /** Claves de metadatos a borrar. */
    metadataRemove?: string[];
  }
): DiagramModel {
  const target = findNode(model, id);
  if (!target) {
    throw new Error(`No existe el elemento "${id}". Los que hay: ${idsDisponibles(model)}.`);
  }
  // Cambiar de familia (nodo↔contenedor) dejaría hijos colgando o un contenedor
  // sin marco: eso es rehacer el diagrama, no corregirlo.
  if (patch.tipo_elemento && isNotationContainer(patch.tipo_elemento) !== isContainerNode(target)) {
    throw new Error(
      `"${target.tipo_elemento}" y "${patch.tipo_elemento}" no son de la misma familia: un contenedor no se convierte en nodo (ni al revés). Borralo y recrealo si es lo que querés.`
    );
  }
  const nuevoNombre = patch.nombre?.trim();
  if (nuevoNombre && nuevoNombre !== target.nombre && model.nodes.some((n) => n.nombre === nuevoNombre && isContainerNode(n))) {
    throw new Error(`Ya hay un contenedor llamado "${nuevoNombre}".`);
  }
  // Los metadatos se aplican POR CLAVE: reemplazar la lista entera borraría en
  // silencio las referencias que otra pasada del agente ya había puesto.
  const { metadata: metaUpsert, metadataRemove, ...campos } = patch;
  let metadata = target.metadata;
  if (metadataRemove?.length) {
    const quedan = quitarMetadata(metadata, metadataRemove);
    metadata = quedan.length ? quedan : undefined;
  }
  if (metaUpsert?.length) metadata = upsertVarios(metadata, metaUpsert);

  const renombraContenedor = isContainerNode(target) && nuevoNombre && nuevoNombre !== target.nombre;
  const nodes = model.nodes.map((n) => {
    if (n.id === target.id) {
      const actualizado: BuilderNode = { ...n, ...campos, nombre: nuevoNombre || n.nombre };
      if (metadata?.length) actualizado.metadata = metadata;
      else delete actualizado.metadata;
      return actualizado;
    }
    // Los hijos referencian al contenedor por NOMBRE: hay que arrastrarlos.
    if (renombraContenedor && n.container === target.nombre) return { ...n, container: nuevoNombre };
    return n;
  });
  return { ...model, nodes };
}

/**
 * Corrige una relación existente por sus extremos: etiqueta, estilo o dirección.
 * `label` vacío borra la etiqueta (en C4 eso deja la relación sin explicar, y
 * `qualityFindings` lo reporta).
 */
export function updateEdge(
  model: DiagramModel,
  from: string,
  to: string,
  patch: Partial<Pick<BuilderEdge, "descripcion" | "dashed" | "arrow" | "routing" | "color">>
): DiagramModel {
  // Los extremos pueden llegar como se dibujan en Mermaid (ver `findNode`).
  const f = findNode(model, from)?.id ?? from;
  const t = findNode(model, to)?.id ?? to;
  const idx = model.edges.findIndex((e) => e.fuente === f && e.destino === t);
  if (idx === -1) throw new Error(`No existe una relación de "${from}" a "${to}".`);
  const edges = model.edges.map((e, i) => (i === idx ? { ...e, ...patch } : e));
  return { ...model, edges };
}

/**
 * Elimina UNA relación por sus extremos, sin tocar los elementos. Hacía falta
 * para reconectar: corregir un atajo (política → evento) obliga a quitar la
 * arista vieja, y borrar el nodo para eso se llevaba por delante el resto.
 */
export function removeEdge(model: DiagramModel, from: string, to: string): DiagramModel {
  // Los extremos pueden llegar como se dibujan en Mermaid (ver `findNode`).
  const f = findNode(model, from)?.id ?? from;
  const t = findNode(model, to)?.id ?? to;
  const idx = model.edges.findIndex((e) => e.fuente === f && e.destino === t);
  if (idx === -1) throw new Error(`No existe una relación de "${from}" a "${to}".`);
  return { ...model, edges: model.edges.filter((_, i) => i !== idx) };
}

/** Elimina un nodo/contenedor y las aristas que lo tocan. */
export function removeNode(model: DiagramModel, id: string): DiagramModel {
  const node = findNode(model, id);
  // Antes filtraba sin comprobar y la herramienta contestaba "eliminado" igual:
  // un borrado que dice haber ocurrido y no ocurrió es peor que un error, porque
  // el agente sigue adelante creyendo que limpió el diagrama (issue #149).
  if (!node) {
    throw new Error(
      `No existe el elemento "${id}". Los que hay: ${idsDisponibles(model)}.`
    );
  }
  const real = node.id;
  const nodes = model.nodes.filter((n) => n.id !== real);
  // Si era contenedor, sus hijos quedan sueltos (container vacío).
  const orphaned = node && isContainerNode(node)
    ? nodes.map((n) => (n.container === node.nombre ? { ...n, container: "" } : n))
    : nodes;
  const edges = model.edges.filter((e) => e.fuente !== real && e.destino !== real);
  return { ...model, nodes: orphaned, edges };
}

// =============================================================================
// Ambigüedades (decisiones que la fuente no cierra)
// =============================================================================

/** Registra una ambigüedad pendiente. El id se deriva de la pregunta. */
export function recordAmbiguity(
  model: DiagramModel,
  input: Omit<Ambiguity, "id"> & { id?: string }
): { model: DiagramModel; id: string } {
  const existing = model.ambiguities ?? [];
  const base = input.id ?? slugify(input.pregunta).slice(0, 40);
  const taken = new Set(existing.map((a) => a.id));
  let id = base || "ambiguedad";
  let i = 2;
  while (taken.has(id)) id = `${base}-${i++}`;
  return { model: { ...model, ambiguities: [...existing, { ...input, id }] }, id };
}

/** Tope de elementos en las listas del proyecto: una lista larga no se lee. */
export const MAX_LISTA_PROYECTO = 30;

/**
 * Declara (reemplazando) los campos del proyecto que el humano edita en
 * «Metadatos del proyecto»: hotspots, responsables y notas. Sólo se toca lo que
 * viene: pasar `undefined` deja el valor anterior; pasar lista vacía o texto
 * vacío lo borra a propósito.
 * @throws si una lista pasa el tope (el agente se entera en la llamada).
 */
export function setProjectMeta(
  model: DiagramModel,
  input: { hotspots?: string[]; responsables?: string[]; notas?: string }
): DiagramModel {
  const lista = (valor: string[] | undefined, campo: string) => {
    if (valor === undefined) return undefined;
    const limpia = Array.from(new Set(valor.map((v) => v.trim()).filter(Boolean)));
    if (limpia.length > MAX_LISTA_PROYECTO) {
      throw new Error(
        `Demasiados elementos en ${campo}: ${limpia.length} (máximo ${MAX_LISTA_PROYECTO}). Deja los que el humano tiene que discutir.`
      );
    }
    return limpia;
  };
  const meta = { ...model.meta };
  const hs = lista(input.hotspots, "hotspots");
  if (hs !== undefined) meta.hotspots = hs.length ? hs : undefined;
  const rs = lista(input.responsables, "responsables");
  if (rs !== undefined) meta.responsables = rs.length ? rs : undefined;
  if (input.notas !== undefined) meta.notas = input.notas.trim() || undefined;
  return { ...model, meta };
}

/**
 * Añade (o reemplaza por nombre) un modelo de lectura. Reemplazar en vez de
 * duplicar: dos proyecciones con el mismo nombre en la vista de datos no se
 * distinguen y el humano no sabe cuál manda.
 */
export function addReadModel(
  model: DiagramModel,
  input: { nombre: string; descripcion?: string; proyecta?: string[]; ui_policies?: string[]; tecnologias?: string[] }
): { model: DiagramModel; reemplazado: boolean } {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El read model necesita un nombre.");
  const limpia = (v: string[] | undefined) =>
    Array.from(new Set((v ?? []).map((x) => x.trim()).filter(Boolean)));
  const nuevo: ReadModel = {
    nombre,
    descripcion: input.descripcion?.trim() || "",
    proyecta: limpia(input.proyecta),
    ui_policies: limpia(input.ui_policies),
    tecnologias: limpia(input.tecnologias),
  };
  const actuales = model.readModels ?? [];
  const i = actuales.findIndex((r) => r.nombre === nombre);
  const readModels = i >= 0 ? actuales.map((r, k) => (k === i ? nuevo : r)) : [...actuales, nuevo];
  return { model: { ...model, readModels }, reemplazado: i >= 0 };
}

/** Quita un modelo de lectura por nombre. Lanza con las opciones si no existe. */
export function removeReadModel(model: DiagramModel, nombre: string): DiagramModel {
  const actuales = model.readModels ?? [];
  const buscado = nombre.trim();
  if (!actuales.some((r) => r.nombre === buscado)) {
    throw new Error(
      actuales.length
        ? `No hay un read model "${buscado}". Disponibles: ${actuales.map((r) => r.nombre).join(" · ")}`
        : `No hay un read model "${buscado}": el diagrama no tiene ninguno.`
    );
  }
  return { ...model, readModels: actuales.filter((r) => r.nombre !== buscado) };
}

/** Cierra una ambigüedad con la respuesta del humano. Lanza si el id no existe. */
export function resolveAmbiguity(
  model: DiagramModel,
  id: string,
  resolucion: string
): DiagramModel {
  const existing = model.ambiguities ?? [];
  if (!existing.some((a) => a.id === id)) {
    throw new Error(
      `No hay una ambigüedad con id "${id}". Pendientes: ${
        pendingAmbiguities(model).map((a) => a.id).join(", ") || "ninguna"
      }.`
    );
  }
  return {
    ...model,
    ambiguities: existing.map((a) => (a.id === id ? { ...a, resolucion } : a)),
  };
}

/** Ambigüedades sin respuesta: bloquean la entrega "limpia" y se declaran al humano. */
export function pendingAmbiguities(model: DiagramModel): Ambiguity[] {
  return (model.ambiguities ?? []).filter((a) => !a.resolucion?.trim());
}

/**
 * Resumen de ambigüedades en texto (va a `GraphData.notas`, que la app muestra):
 * lo que quedó sin decidir y las decisiones que se tomaron con el humano.
 */
export function ambiguityNotes(model: DiagramModel): string {
  const all = model.ambiguities ?? [];
  if (!all.length) return "";
  const pending = all.filter((a) => !a.resolucion?.trim());
  const resolved = all.filter((a) => a.resolucion?.trim());
  const parts: string[] = [];
  if (pending.length) {
    parts.push(
      "## Pendiente en la fuente\n" +
        pending
          .map(
            (a) =>
              `- ${a.pregunta}${a.opciones?.length ? ` (opciones: ${a.opciones.join(" | ")})` : ""}${
                a.afecta ? ` — afecta: ${a.afecta}` : ""
              }`
          )
          .join("\n")
    );
  }
  if (resolved.length) {
    parts.push(
      "## Decisiones tomadas\n" +
        resolved.map((a) => `- ${a.pregunta} → ${a.resolucion}`).join("\n")
    );
  }
  return parts.join("\n\n");
}

// =============================================================================
// Validación
// =============================================================================

/**
 * Avisos de trazabilidad: nodos sin `source` cuando el diagrama YA declara
 * fuentes. Si NINGÚN nodo la declara, el diagrama no se está trazando contra un
 * documento (p. ej. se modeló de una conversación) y avisar sería ruido.
 */
export function traceabilityWarnings(model: DiagramModel): string[] {
  const withSource = model.nodes.filter((n) => n.source?.trim());
  if (!withSource.length) return [];
  return model.nodes
    .filter((n) => !n.source?.trim())
    .map(
      (n) =>
        `"${n.nombre}" (${n.id}) no cita fuente; el revisor no puede contrastarlo con el documento. Añade \`source\` o quítalo.`
    );
}

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

/** Primera notación cuyo catálogo incluye `type` (para pistas de validación). */
function notationOwningType(type: string): NotationId | undefined {
  for (const id of ["ddd", "bpmn", "c4", "uml"] as NotationId[]) {
    if (getNotation(id).elements.some((e) => e.type === type)) return id;
  }
  return undefined;
}

/**
 * Valida el diagrama. `errors` rompen la importación; `warnings` no, pero avisan
 * (p. ej. nodos aislados que el procesador del grafo descarta del lienzo).
 */
/**
 * Avisos de FLUJO propios de BPMN. Es el error de modelado más común y ninguna
 * validación genérica lo ve: en BPMN cada Pool es un proceso independiente, así
 * que entre participantes solo va **flujo de mensaje** (arista `dashed`); dentro
 * de un pool —y entre sus Carriles, que solo dicen QUIÉN ejecuta— va **flujo de
 * secuencia** (continuo).
 *
 * Solo aplica a `notation: "bpmn"`: en UML una arista punteada significa otra
 * cosa (retorno, dependencia) y avisar ahí sería ruido.
 */
export function bpmnFlowWarnings(model: DiagramModel): string[] {
  if (model.meta.notation !== "bpmn") return [];
  const warnings: string[] = [];

  const containers = model.nodes.filter(isContainerNode);
  const typeOfContainer = new Map(containers.map((c) => [c.nombre, c.tipo_elemento]));

  // Un Carril es una subdivisión de un Pool: suelto, no es BPMN.
  const lanes = containers.filter((c) => c.tipo_elemento === "Carril");
  if (lanes.length > 0 && !containers.some((c) => c.tipo_elemento === "Pool")) {
    warnings.push(
      `Hay Carriles (${lanes.map((l) => `"${l.nombre}"`).join(", ")}) sin ningún Pool: un carril es una subdivisión de un participante, añade el Pool que los contiene.`
    );
  }

  for (const e of model.edges) {
    const from = findNode(model, e.fuente);
    const to = findNode(model, e.destino);
    if (!from || !to) continue; // aristas colgantes: ya las reporta validate()
    const fromPool = from.container && typeOfContainer.get(from.container) === "Pool" ? from.container : null;
    const toPool = to.container && typeOfContainer.get(to.container) === "Pool" ? to.container : null;
    if (!fromPool || !toPool) continue; // sin dos pools identificables no hay regla que aplicar

    if (fromPool !== toPool && !e.dashed) {
      warnings.push(
        `"${from.nombre}" → "${to.nombre}" cruza de "${fromPool}" a "${toPool}" con flujo de secuencia; entre Pools solo va flujo de MENSAJE (usa dashed).`
      );
    }
    if (fromPool === toPool && e.dashed) {
      warnings.push(
        `"${from.nombre}" → "${to.nombre}" usa flujo de mensaje dentro de "${fromPool}"; dentro de un Pool el flujo es de SECUENCIA (continuo).`
      );
    }
  }

  return warnings;
}

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
    // Tipo desconocido para la notación → warning (un grafo puede mezclar
    // notaciones a propósito). Se indica a qué notación pertenece el tipo para
    // que sea fácil corregir un mezclado accidental.
    if (!validTypes.has(n.tipo_elemento)) {
      const owner = notationOwningType(n.tipo_elemento);
      const hint = owner
        ? ` (ese tipo es de la notación "${owner}"; ¿querías otro tipo, o crear el diagrama en "${owner}"?)`
        : "";
      warnings.push(
        `"${n.nombre}" usa el tipo "${n.tipo_elemento}", que no pertenece a la notación "${model.meta.notation}"${hint}.`
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

  // Propiedades canónicas: dónde vive y por dónde se le habla. Es un ERROR, no
  // un aviso: un diagrama de servicios sin repositorio ni puerto obliga a quien
  // construye a buscar esos datos a mano, que es justo lo que el diagrama
  // debería ahorrarle. Lo que no se sabe todavía se declara "pendiente".
  for (const p of problemasDePropiedades(model)) errors.push(p.detalle);

  // Reglas de flujo propias de la notación (hoy BPMN: pools vs carriles).
  warnings.push(...bpmnFlowWarnings(model));
  // Trazabilidad contra la fuente (sostiene la revisión humana).
  warnings.push(...traceabilityWarnings(model));

  return { ok: errors.length === 0, errors, warnings };
}

// =============================================================================
// Layout automático (asigna geometría a lo que no la tenga)
// =============================================================================

// --- Origen del lienzo (el resto de la geometría sale del preset) ---
const X0 = 60;
const Y0 = 60;

/**
 * Rango (columna) por flujo: longest-path sobre el DAG de aristas entre nodos
 * NO contenedor. Las aristas de retorno (ciclos, p. ej. reintentos) se detectan
 * con DFS y se ignoran para el ranking, así el flujo avanza de izquierda a
 * derecha sin colapsar por un bucle.
 */
function rankByFlow(ids: string[], edges: BuilderEdge[]): Map<string, number> {
  const idSet = new Set(ids);
  const succ = new Map<string, string[]>();
  ids.forEach((id) => succ.set(id, []));
  for (const e of edges) {
    if (!idSet.has(e.fuente) || !idSet.has(e.destino) || e.fuente === e.destino) continue;
    succ.get(e.fuente)!.push(e.destino);
  }
  // Back-edges (aristas que cierran ciclo) vía coloreo DFS.
  const backEdges = new Set<string>();
  const color = new Map<string, 0 | 1 | 2>();
  ids.forEach((id) => color.set(id, 0));
  const stack: Array<{ u: string; i: number }> = [];
  for (const start of ids) {
    if (color.get(start) !== 0) continue;
    stack.push({ u: start, i: 0 });
    color.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const kids = succ.get(top.u)!;
      if (top.i < kids.length) {
        const v = kids[top.i++];
        const c = color.get(v);
        if (c === 1) backEdges.add(`${top.u}->${v}`);
        else if (c === 0) {
          color.set(v, 1);
          stack.push({ u: v, i: 0 });
        }
      } else {
        color.set(top.u, 2);
        stack.pop();
      }
    }
  }
  // Longest-path por orden topológico (Kahn) sobre el DAG sin back-edges.
  const indeg = new Map<string, number>();
  ids.forEach((id) => indeg.set(id, 0));
  for (const [u, vs] of succ)
    for (const v of vs) if (!backEdges.has(`${u}->${v}`)) indeg.set(v, (indeg.get(v) ?? 0) + 1);
  const rank = new Map<string, number>();
  ids.forEach((id) => rank.set(id, 0));
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of succ.get(u)!) {
      if (backEdges.has(`${u}->${v}`)) continue;
      rank.set(v, Math.max(rank.get(v) ?? 0, (rank.get(u) ?? 0) + 1));
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if ((indeg.get(v) ?? 0) === 0) queue.push(v);
    }
  }
  return rank;
}

/** Orden de lectura de los roles cuando la notación no tiene flujo (C4, DDD). */
const ROLES_ARRIBA: ElementRole[] = ["actor"];
const ROLES_ABAJO: ElementRole[] = ["system", "datastore", "external", "command", "event", "policy", "rule"];

/** Opciones de disposición: densidad y estrategia (ver `layout-presets`). */
export interface LayoutOptions {
  density?: LayoutDensity;
  strategy?: LayoutStrategy;
}

/**
 * Medidas derivadas de un preset y del tamaño de nodo de la notación: todo el
 * layout se calcula con esto. El tamaño entra como parámetro porque C4 dibuja
 * fichas de 220×104 y con el paso del nodo de 160 las columnas se solapaban.
 */
function metrics(preset: LayoutPreset, size: { w: number; h: number }) {
  const colStep = size.w + preset.hGap;
  return {
    preset,
    colStep,
    colX: (r: number) => X0 + preset.lanePadX + r * colStep,
    laneHeight: (rows: number) =>
      preset.lanePadTop + Math.max(1, rows) * (size.h + preset.vGap) - preset.vGap + preset.lanePadBottom,
    laneWidthFor: (cols: number) =>
      preset.lanePadX + (Math.max(1, cols) - 1) * colStep + size.w + preset.lanePadX,
  };
}

/**
 * En BPMN una arista `dashed` entre participantes es flujo de MENSAJE: conecta
 * dos procesos independientes y NO ordena columnas. Incluirla en el ranking era
 * la causa de que un pool empujara al vecino hasta bandas de 5520 px.
 * Sólo aplica donde el rol `pool` existe: en UML `dashed` significa retorno.
 */
function isMessageEdge(model: DiagramModel, e: BuilderEdge): boolean {
  return Boolean(e.dashed) && typesWithRole(model.meta.notation, "pool").length > 0;
}

/**
 * Layout de FLUJO (swimlane), para notaciones con inicio y fin (BPMN, UML de
 * actividad/estados): cada contenedor es una banda horizontal cuyos elementos
 * fluyen de izquierda a derecha. El rango se calcula POR BANDA y sólo con las
 * aristas internas de secuencia, así el diagrama mide lo que mide su carril más
 * largo y no la suma de todos.
 */
function layoutPorFlujo(model: DiagramModel, preset: LayoutPreset): DiagramModel {
  const sz = nodeSizeForNotation(model.meta.notation);
  const { colX, laneHeight, laneWidthFor } = metrics(preset, sz);
  const containers = model.nodes.filter(isContainerNode);
  const nodes = model.nodes.filter((n) => !isContainerNode(n));
  const containerNames = new Set(containers.map((c) => c.nombre));
  const { notation } = model.meta;

  const esInicio = (n: BuilderNode) => hasRole(notation, n.tipo_elemento, "start");
  const esFin = (n: BuilderNode) => hasRole(notation, n.tipo_elemento, "end");

  // Coloca un grupo (una banda o los sueltos) empezando en `top`.
  const placeGroup = (
    groupNodes: BuilderNode[],
    top: number
  ): { laid: BuilderNode[]; height: number; cols: number } => {
    if (!groupNodes.length) return { laid: [], height: laneHeight(1), cols: 1 };

    const ids = new Set(groupNodes.map((n) => n.id));
    // Sólo aristas INTERNAS al grupo y de secuencia: un mensaje saliente no
    // debe mover ninguna columna (FR-002).
    const internas = model.edges.filter(
      (e) => ids.has(e.fuente) && ids.has(e.destino) && !isMessageEdge(model, e)
    );
    const rank = rankByFlow(groupNodes.map((n) => n.id), internas);

    // Inicio abre y fin cierra su propia banda (FR-004): un evento de fin en
    // mitad del carril es el síntoma más visible del ranking global.
    const maxRank = Math.max(0, ...groupNodes.map((n) => rank.get(n.id) ?? 0));
    for (const n of groupNodes) {
      if (esInicio(n)) rank.set(n.id, 0);
      else if (esFin(n)) rank.set(n.id, maxRank);
    }

    const byRank = new Map<number, BuilderNode[]>();
    for (const n of groupNodes) {
      const r = rank.get(n.id) ?? 0;
      (byRank.get(r) ?? byRank.set(r, []).get(r)!).push(n);
    }
    let maxRows = 0;
    const laid: BuilderNode[] = [];
    for (const [r, group] of byRank) {
      maxRows = Math.max(maxRows, group.length);
      group.forEach((n, j) => {
        laid.push({
          ...n,
          x: colX(r),
          y: top + preset.lanePadTop + j * (sz.h + preset.vGap),
          width: sz.w,
          height: sz.h,
        });
      });
    }
    return { laid, height: laneHeight(maxRows), cols: maxRank + 1 };
  };

  const out: BuilderNode[] = [];
  let cursorY = Y0;

  const loose = nodes.filter((n) => !n.container || !containerNames.has(n.container));
  if (loose.length) {
    const { laid, height } = placeGroup(loose, cursorY);
    out.push(...laid);
    cursorY += height + preset.laneGap;
  }

  // Las bandas comparten ancho: el de la más larga de ESTE diagrama. Escalonadas
  // se leen como cajas sueltas; alineadas, como participantes comparables. Es
  // distinto del bug original, donde el ancho venía del rango global acumulado.
  const bandas = containers.map((c) => ({
    c,
    laneNodes: nodes.filter((n) => n.container === c.nombre),
  }));
  const anchoComun = laneWidthFor(
    Math.max(
      1,
      ...bandas.map(({ laneNodes }) => {
        const ids = new Set(laneNodes.map((n) => n.id));
        const internas = model.edges.filter(
          (e) => ids.has(e.fuente) && ids.has(e.destino) && !isMessageEdge(model, e)
        );
        const r = rankByFlow(laneNodes.map((n) => n.id), internas);
        return Math.max(1, ...laneNodes.map((n) => (r.get(n.id) ?? 0) + 1));
      })
    )
  );

  for (const { c, laneNodes } of bandas) {
    const { laid, height } = placeGroup(laneNodes, cursorY);
    out.push(...laid);
    out.push({ ...c, x: X0, y: cursorY, width: anchoComun, height });
    cursorY += height + preset.laneGap;
  }

  return { ...model, nodes: out };
}

/**
 * Layout por ROL, para notaciones sin flujo (C4, DDD): un longest-path sobre
 * relaciones de arquitectura no significa nada y producía filas arbitrarias con
 * huecos verticales. Aquí se lee por capas —quién usa el sistema, qué contiene,
 * de qué depende— y dentro de cada capa se reparte en rejilla.
 */
function layoutPorRol(model: DiagramModel, preset: LayoutPreset): DiagramModel {
  const sz = nodeSizeForNotation(model.meta.notation);
  const { colX, laneWidthFor } = metrics(preset, sz);
  const containers = model.nodes.filter(isContainerNode);
  const nodes = model.nodes.filter((n) => !isContainerNode(n));
  const containerNames = new Set(containers.map((c) => c.nombre));
  const { notation } = model.meta;

  const out: BuilderNode[] = [];
  let cursorY = Y0;

  /** Reparte un grupo en filas de hasta MAX_COLS_POR_FILA. Devuelve alto y columnas. */
  const grid = (group: BuilderNode[], top: number, padTop: number) => {
    const laid: BuilderNode[] = [];
    let filas = 0;
    group.forEach((n, i) => {
      const fila = Math.floor(i / preset.colsPerRow);
      filas = Math.max(filas, fila + 1);
      laid.push({
        ...n,
        x: colX(i % preset.colsPerRow),
        y: top + padTop + fila * (sz.h + preset.vGap),
        width: sz.w,
        height: sz.h,
      });
    });
    return {
      laid,
      filas,
      cols: Math.min(preset.colsPerRow, group.length),
      height: padTop + Math.max(1, filas) * (sz.h + preset.vGap) - preset.vGap + preset.lanePadBottom,
    };
  };

  // Igual que en el layout de flujo: las bandas comparten ancho para leerse como
  // capas comparables (aquí, contextos o límites de sistema).
  const anchoComun = laneWidthFor(
    Math.max(
      1,
      ...containers.map((c) =>
        Math.min(preset.colsPerRow, nodes.filter((n) => n.container === c.nombre).length)
      )
    )
  );

  const sueltos = nodes.filter((n) => !n.container || !containerNames.has(n.container));
  const porRol = (roles: ElementRole[]) =>
    roles.flatMap((r) => sueltos.filter((n) => roleOfType(notation, n.tipo_elemento) === r));

  const arriba = porRol(ROLES_ARRIBA);
  const abajo = porRol(ROLES_ABAJO);
  const colocados = new Set([...arriba, ...abajo].map((n) => n.id));
  const resto = sueltos.filter((n) => !colocados.has(n.id));

  // 1 · Quién usa el sistema (actores) arriba de todo.
  if (arriba.length) {
    const { laid, height } = grid(arriba, cursorY, 0);
    out.push(...laid);
    cursorY += height + preset.laneGap;
  }

  // 2 · Los contenedores (límites, contextos) con su contenido en rejilla.
  for (const c of containers) {
    const dentro = nodes.filter((n) => n.container === c.nombre);
    const { laid, height } = grid(dentro, cursorY, preset.lanePadTop);
    out.push(...laid);
    out.push({ ...c, x: X0, y: cursorY, width: anchoComun, height });
    cursorY += height + preset.laneGap;
  }

  // 3 · De qué depende (sistemas externos, almacenes) y el resto, abajo.
  for (const grupo of [abajo, resto]) {
    if (!grupo.length) continue;
    const { laid, height } = grid(grupo, cursorY, 0);
    out.push(...laid);
    cursorY += height + preset.laneGap;
  }

  return { ...model, nodes: out };
}

/**
 * Layout RADIAL, para notaciones que son un MAPA DE CONCEPTOS y no un proceso
 * (DDD): el concepto más conectado va al centro y el resto se acomoda en anillos
 * concéntricos según a cuántos saltos de relación está de él. Es la forma en que
 * se dibuja el mapa de patrones de Evans, y hace visible lo que una rejilla
 * esconde: qué es el núcleo del modelo y qué cuelga de qué.
 *
 * Reglas del algoritmo (todas determinísticas, sin azar):
 *  - centro = mayor grado; a igual grado gana el declarado primero.
 *  - anillo k = distancia en saltos al centro (BFS sobre aristas sin dirección).
 *  - lo que no alcanza el centro (islas) va al anillo exterior.
 *  - dentro de un anillo mandan, en ese orden, el contenedor —para que un
 *    Contexto Delimitado ocupe un sector CONTIGUO y no se intercale con el
 *    vecino— y después el ángulo del padre, que deja a cada hijo cerca de quien
 *    lo trajo y evita que las líneas se crucen. Ojo: contiguo no quiere decir
 *    disjunto; la caja de un blob se infla ×√2 y dos sectores opuestos pueden
 *    llegar a tocarse.
 *  - el radio crece con el anillo, pero nunca menos de lo que exige el perímetro
 *    para que quepan sus nodos sin tocarse.
 */
function layoutRadial(model: DiagramModel, preset: LayoutPreset): DiagramModel {
  const containers = model.nodes.filter(isContainerNode);
  const nodes = model.nodes.filter((n) => !isContainerNode(n));
  if (!nodes.length) return layoutPorRol(model, preset);
  const sz = nodeSizeForNotation(model.meta.notation);

  // 1 · Adyacencia sin dirección (una relación acerca, apunte donde apunte).
  const vecinos = new Map<string, string[]>();
  for (const n of nodes) vecinos.set(n.id, []);
  for (const e of model.edges) {
    if (!vecinos.has(e.fuente) || !vecinos.has(e.destino)) continue;
    vecinos.get(e.fuente)!.push(e.destino);
    vecinos.get(e.destino)!.push(e.fuente);
  }
  const grado = (id: string) => vecinos.get(id)?.length ?? 0;

  // 2 · Centro y anillos por BFS.
  const centro = nodes.reduce((mejor, n) => (grado(n.id) > grado(mejor.id) ? n : mejor), nodes[0]);
  const anillo = new Map<string, number>([[centro.id, 0]]);
  const padre = new Map<string, string>();
  const cola = [centro.id];
  while (cola.length) {
    const id = cola.shift()!;
    for (const v of vecinos.get(id)!) {
      if (anillo.has(v)) continue;
      anillo.set(v, anillo.get(id)! + 1);
      padre.set(v, id);
      cola.push(v);
    }
  }
  const ultimoConectado = Math.max(0, ...anillo.values());
  for (const n of nodes) if (!anillo.has(n.id)) anillo.set(n.id, ultimoConectado + 1);

  // 3 · Ángulo por nodo, anillo por anillo, heredando el del padre.
  const orden = new Map(nodes.map((n, i) => [n.id, i]));
  const angulo = new Map<string, number>([[centro.id, 0]]);
  const radio = new Map<number, number>([[0, 0]]);
  const paso = sz.w + preset.hGap;
  const arcoMin = sz.w + preset.vGap;
  const maxAnillo = Math.max(...anillo.values());

  for (let k = 1; k <= maxAnillo; k++) {
    const enAnillo = nodes
      .filter((n) => anillo.get(n.id) === k)
      .sort((a, b) => {
        // El CONTENEDOR ordena primero: su caja se calcula por los extremos de
        // sus hijos, así que si dos se intercalan en el mismo anillo cada elipse
        // termina envolviendo nodos del vecino. Dentro de un mismo contenedor manda el ángulo del
        // padre, que es lo que evita que las líneas se crucen.
        const ca = a.container ?? "";
        const cb = b.container ?? "";
        if (ca !== cb) return ca < cb ? -1 : 1;
        const pa = angulo.get(padre.get(a.id) ?? "") ?? 0;
        const pb = angulo.get(padre.get(b.id) ?? "") ?? 0;
        if (pa !== pb) return pa - pb;
        return orden.get(a.id)! - orden.get(b.id)!;
      });
    if (!enAnillo.length) continue;
    // El perímetro manda: con muchos nodos el anillo se abre en vez de apretarlos.
    radio.set(k, Math.max(k * paso, (enAnillo.length * arcoMin) / (2 * Math.PI)));
    enAnillo.forEach((n, i) => angulo.set(n.id, (2 * Math.PI * i) / enAnillo.length));
  }

  // 4 · A coordenadas. El centro del lienzo se normaliza después.
  const puestos: BuilderNode[] = nodes.map((n) => {
    const r = radio.get(anillo.get(n.id)!) ?? 0;
    const a = angulo.get(n.id) ?? 0;
    return {
      ...n,
      x: Math.round(r * Math.cos(a) - sz.w / 2),
      y: Math.round(r * Math.sin(a) - sz.h / 2),
      width: sz.w,
      height: sz.h,
    };
  });

  // 5 · Los contenedores envuelven a sus hijos (su sector es contiguo por el
  // orden del anillo). Sin hijos no hay caja que calcular: van a un lado.
  const cajas: BuilderNode[] = [];
  const bajoTodo = Math.max(...puestos.map((n) => n.y! + sz.h)) + preset.laneGap;
  let sinHijosX = Math.min(...puestos.map((n) => n.x!));
  for (const c of containers) {
    const dentro = puestos.filter((n) => n.container === c.nombre);
    if (!dentro.length) {
      cajas.push({ ...c, x: sinHijosX, y: bajoTodo, width: sz.w, height: sz.h });
      sinHijosX += sz.w + preset.hGap;
      continue;
    }
    let x0 = Math.min(...dentro.map((n) => n.x!)) - preset.lanePadX;
    let y0 = Math.min(...dentro.map((n) => n.y!)) - preset.lanePadTop;
    let x1 = Math.max(...dentro.map((n) => n.x! + sz.w)) + preset.lanePadX;
    let y1 = Math.max(...dentro.map((n) => n.y! + sz.h)) + preset.lanePadBottom;
    if (isBlobContainer(c.tipo_elemento)) {
      // Una elipse INSCRITA en la caja de sus hijos los deja afuera por las
      // esquinas. La elipse mínima que contiene un rectángulo mide √2 veces sus
      // semiejes: se agranda la caja en esa proporción, alrededor de su centro.
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = ((x1 - x0) / 2) * Math.SQRT2;
      const ry = ((y1 - y0) / 2) * Math.SQRT2 + ETIQUETA_BLOB;
      x0 = cx - rx;
      x1 = cx + rx;
      y0 = cy - ry;
      y1 = cy + ry;
    }
    cajas.push({ ...c, x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) });
  }

  // 6 · Normalizar: el lienzo no dibuja coordenadas negativas.
  const todos = [...cajas, ...puestos];
  const minX = Math.min(...todos.map((n) => n.x!));
  const minY = Math.min(...todos.map((n) => n.y!));
  const movidos = todos.map((n) => ({ ...n, x: n.x! - minX + X0, y: n.y! - minY + Y0 }));

  // `movidos` conserva el orden contenedores→nodos: el lienzo pinta las cajas
  // debajo de sus hijos.
  return { ...model, nodes: movidos };
}

/**
 * Descarta la geometría y vuelve a calcularla. Necesario porque `layout()`
 * respeta un modelo ya posicionado: un diagrama construido antes de una mejora
 * de layout —o importado desde la app, que siempre trae x/y— se quedaría con la
 * disposición vieja para siempre. No toca nodos, aristas ni notación (FR-010).
 */
/**
 * Reordena las BANDAS del diagrama según una propuesta (por ejemplo la de la IA)
 * y recalcula la geometría. La propuesta es una lista de NOMBRES: lo que no
 * exista se ignora y lo que falte conserva su orden actual, así que ninguna
 * respuesta —por rara que sea— puede perder o duplicar un contenedor.
 */
export function reorderLanes(
  model: DiagramModel,
  orden: string[],
  opts: LayoutOptions = {}
): DiagramModel {
  const containers = model.nodes.filter(isContainerNode);
  const posicion = new Map<string, number>();
  orden.forEach((nombre, i) => {
    if (containers.some((c) => c.nombre === nombre) && !posicion.has(nombre)) posicion.set(nombre, i);
  });
  const rank = (c: BuilderNode) => posicion.get(c.nombre) ?? Number.MAX_SAFE_INTEGER;

  const ordenados = [...containers].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    // Empate (ninguno mencionado) → se respeta el orden original.
    return ra === rb ? containers.indexOf(a) - containers.indexOf(b) : ra - rb;
  });

  const resto = model.nodes.filter((n) => !isContainerNode(n));
  return relayout({ ...model, nodes: [...ordenados, ...resto] }, opts);
}

export function relayout(model: DiagramModel, opts: LayoutOptions = {}): DiagramModel {
  const desnudos = model.nodes.map(({ x, y, width, height, ...n }) => n);
  // Sin opciones explícitas, se repite la disposición con la que se dibujó.
  return layout({ ...model, nodes: desnudos }, { ...model.meta.layout, ...opts });
}

/**
 * Asigna geometría al modelo. Elige la estrategia por los ROLES que declara la
 * notación, no por su id: una notación nueva con inicio y fin hereda el layout
 * de flujo sin tocar este archivo (P6). Respeta un modelo ya posicionado
 * (`relayout()` fuerza el recálculo).
 */
export function layout(model: DiagramModel, opts: LayoutOptions = {}): DiagramModel {
  const allPlaced = model.nodes.every(
    (n) => typeof n.x === "number" && typeof n.y === "number"
  );
  if (allPlaced) return model;

  // El aire se escala al tamaño de nodo de la notación (ver `scalePreset`).
  const preset = scalePreset(getPreset(opts.density), nodeSizeForNotation(model.meta.notation));
  const strategy = resolveStrategy(opts.strategy, model.meta.notation);
  const dispuesto =
    strategy === "flujo"
      ? layoutPorFlujo(model, preset)
      : strategy === "radial"
        ? layoutRadial(model, preset)
        : layoutPorRol(model, preset);
  // El modelo recuerda cómo se dibujó: el menú marca el actual y el agente puede
  // repetir por MCP exactamente la disposición que ve el humano.
  return { ...dispuesto, meta: { ...dispuesto.meta, layout: { density: preset.id, strategy } } };
}

// =============================================================================
// Serialización a GraphData (formato que la app importa)
// =============================================================================

function toDomainNode(n: BuilderNode): Omit<GraphNode, "agregado"> {
  // La cita de la fuente se anexa a la descripción: es el único campo que la app
  // muestra al abrir el nodo, y es justo lo que el revisor humano necesita ver.
  const descripcion = n.source?.trim()
    ? [n.descripcion?.trim(), `Fuente: ${n.source.trim()}`].filter(Boolean).join("\n\n")
    : n.descripcion;
  return {
    id: n.id,
    nombre: n.nombre,
    tipo_elemento: n.tipo_elemento as GraphNode["tipo_elemento"],
    descripcion,
    metadata: n.metadata,
    spec: sanitizeSpec(n.spec),
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
    metadata: c.metadata,
    spec: sanitizeSpec(c.spec),
    // Un contenedor también documenta lo que YA existe: sin esto el estado que
    // declara el agente moría en la serialización (sólo lo llevaban los nodos).
    estado_comparativo: c.estado_comparativo,
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
    const sa = containerOf(e.fuente);
    const ta = containerOf(e.destino);
    const arista = {
      fuente: e.fuente,
      destino: e.destino,
      descripcion: e.descripcion || "",
      color: e.color,
      dashed: e.dashed,
      arrow: e.arrow,
      // Una relación que cruza de una banda a otra en línea recta atraviesa el
      // diagrama en diagonal y pasa por encima de todo. Ortogonal por defecto;
      // si el modelo ya trae un ruteo explícito, manda el suyo.
      routing: e.routing ?? (sa !== ta ? ("orthogonal" as const) : undefined),
    };
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
      // Declarados con set_project_meta. Antes eran `[]` fijo: lo que el humano
      // escribía en la app se perdía en el siguiente export.
      hotspots: [...(meta.hotspots ?? [])],
      nodos: bigNodos,
      aristas: bigAristas,
    },
    agregados,
    read_models: (model.readModels ?? []).map((r) => ({ ...r })),
    politicas_inter_agregados: policies,
    responsables: [...(meta.responsables ?? [])],
    // Las decisiones y lo pendiente viajan con el modelo: el humano que revisa en
    // la app ve por qué el diagrama dice lo que dice sin releer el documento.
    // Las notas del humano van PRIMERO; el resumen de ambigüedades se suma.
    notas: mergeNotas(meta.notas, ambiguityNotes(model)),
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
      estado_comparativo: agg.estado_comparativo,
      color: (agg as any).color,
      borderColor: (agg as any).borderColor,
      metadata: normalizarLista(agg.metadata),
      spec: sanitizeSpec((agg as any).spec),
      x: agg.x,
      y: agg.y,
      width: agg.width,
      height: agg.height,
    });
    for (const n of agg.nodos || []) {
      nodes.push({
        ...(n as any),
        container: agg.nombre_agregado,
        metadata: normalizarLista((n as any).metadata),
        spec: sanitizeSpec((n as any).spec),
      });
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
    nodes.push({
      ...(n as any),
      container: "",
      metadata: normalizarLista((n as any).metadata),
      spec: sanitizeSpec((n as any).spec),
    });
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
      // Se recuperan o se pierden: `export_to_app` REEMPLAZA el proyecto, así
      // que lo que no vuelva por acá desaparece del trabajo del humano.
      hotspots: textosDeEntrada(data.big_picture?.hotspots),
      responsables: textosDeEntrada(data.responsables),
      notas: data.notas?.trim() ? data.notas : undefined,
    },
    nodes,
    edges,
    readModels: readModelsDeEntrada(data.read_models),
  };
}

/** Lista de textos limpia (sin vacíos ni repetidos); `undefined` si no queda nada. */
function textosDeEntrada(lista: unknown): string[] | undefined {
  if (!Array.isArray(lista)) return undefined;
  const limpios = Array.from(
    new Set(lista.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))
  );
  return limpios.length ? limpios : undefined;
}

/** Read models válidos (con nombre); los campos de lista se normalizan a array. */
function readModelsDeEntrada(lista: unknown): ReadModel[] | undefined {
  if (!Array.isArray(lista)) return undefined;
  const limpios = lista
    .filter((r): r is Partial<ReadModel> => !!r && typeof r === "object" && !!(r as any).nombre?.trim?.())
    .map((r) => ({
      nombre: String(r.nombre).trim(),
      descripcion: r.descripcion ?? "",
      proyecta: textosDeEntrada(r.proyecta) ?? [],
      ui_policies: textosDeEntrada(r.ui_policies) ?? [],
      tecnologias: textosDeEntrada(r.tecnologias) ?? [],
    }));
  return limpios.length ? limpios : undefined;
}

/**
 * Notas del humano + resumen de ambigüedades. El resumen se regenera en cada
 * export; las notas no se tocan. Si el humano ya había pegado el resumen (venía
 * de un export anterior), no se duplica.
 */
export function mergeNotas(humano: string | undefined, resumen: string): string {
  const propio = (humano ?? "").trim();
  const auto = resumen.trim();
  if (!auto) return propio;
  if (!propio) return auto;
  if (propio.includes(auto)) return propio;
  // Quita de las notas del humano un resumen viejo (todo desde su encabezado)
  // para no ir acumulando copias en cada export.
  const marca = propio.indexOf(MARCA_AMBIGUEDADES);
  const soloHumano = (marca >= 0 ? propio.slice(0, marca) : propio).trimEnd();
  return soloHumano ? `${soloHumano}\n\n${MARCA_AMBIGUEDADES}\n${auto}` : `${MARCA_AMBIGUEDADES}\n${auto}`;
}

/** Encabezado que separa lo escrito por el humano de lo que genera el arnés. */
export const MARCA_AMBIGUEDADES = "<!-- ambigüedades registradas por el agente -->";
