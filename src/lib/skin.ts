/**
 * @fileOverview Skin del lienzo: canónica, editorial o plano (PURO, spec 022 · 026 · ADR 0006).
 *
 * La skin CANÓNICA es la de siempre: cada tipo con su color de notación
 * (naranja el Evento, azul el Comando). La EDITORIAL es la de la lámina: tinta
 * sobre papel, un tratamiento por ROL (servicio, almacén, externo, entrada,
 * opcional, seguridad) y UN acento reservado a lo que el equipo tiene que
 * discutir —los hotspots—. Todo lo que el lienzo necesita saber de una skin
 * está acá; el lienzo pregunta, no decide.
 *
 * Las clases van ESCRITAS COMPLETAS: Tailwind sólo emite las que ve, así que
 * concatenarlas las dejaría sin CSS. Y son clases sobre tokens (`ed-*`), no
 * tonos: el tema (claro/oscuro) y, mañana, un perfil de marca (spec 023) cambian
 * el valor del token y la skin entera los sigue.
 */

import { ALL_ELEMENTS, roleOfType, type NotationId, type PlanoCategory, type Treatment } from "./notations";

export type { PlanoCategory } from "./notations";

export type SkinId = "canon" | "editorial" | "plano";

export const SKIN_DEFAULT: SkinId = "canon";
export const SKIN_LIST: readonly { id: SkinId; label: string; description: string }[] = [
  { id: "canon", label: "Canónica", description: "Cada tipo con el color de su notación: la del trabajo diario." },
  {
    id: "editorial",
    label: "Editorial",
    description: "Tinta sobre papel y un solo acento en los hotspots: la de la lámina o el documento.",
  },
  {
    id: "plano",
    label: "Plano",
    description: "Lámina técnica oscura: borde de color por categoría, etiquetas en píldora y aristas en ángulo recto.",
  },
];

/** Lo que un archivo guardado diga de skin; cualquier cosa rara es la canónica. */
export function leerSkin(valor: unknown): SkinId {
  return valor === "editorial" || valor === "plano" ? valor : SKIN_DEFAULT;
}

/**
 * Focos que admite una lámina. Con más, el acento deja de señalar: es la regla
 * de diagram-design («el acento en 1–2 elementos, o no decidiste qué importa»).
 */
export const MAX_FOCAL = 2;

/** Clases de un tratamiento: relleno, contorno y texto del nodo, y su trazo. */
export interface TreatmentClasses {
  bg: string;
  border: string;
  text: string;
  /** Trazo discontinuo (`stroke-dasharray`), si el tratamiento lo pide. */
  dash?: string;
}

export const TREATMENTS: Record<Treatment, TreatmentClasses> = {
  focal: { bg: "fill-ed-accent/10", border: "stroke-ed-accent", text: "text-ed-accent" },
  backend: { bg: "fill-ed-paper", border: "stroke-ed-ink", text: "text-ed-ink" },
  store: { bg: "fill-ed-ink/5", border: "stroke-ed-muted", text: "text-ed-ink" },
  external: { bg: "fill-ed-ink/[0.03]", border: "stroke-ed-ink/30", text: "text-ed-soft" },
  input: { bg: "fill-ed-muted/10", border: "stroke-ed-soft", text: "text-ed-ink" },
  optional: { bg: "fill-ed-ink/[0.02]", border: "stroke-ed-ink/20", text: "text-ed-soft", dash: "4 3" },
  security: { bg: "fill-ed-accent/5", border: "stroke-ed-accent/50", text: "text-ed-ink", dash: "4 4" },
};

/** Contenedor en editorial: un marco que no tapa a sus hijos. */
export const CONTAINER_TREATMENT: TreatmentClasses = {
  bg: "fill-ed-paper-2/40",
  border: "stroke-ed-ink/15",
  text: "text-ed-muted",
};

/** Aristas en editorial: atenuadas por defecto, enlace para lo externo, acento entre focos. */
/**
 * La punta de flecha no va acá: el marcador es compartido y toma `--canvas-edge`,
 * que `[data-skin="editorial"]` redefine al atenuado en `globals.css`.
 */
export const EDGE_TREATMENT = {
  base: "stroke-ed-muted",
  link: "stroke-ed-link",
  focal: "stroke-ed-accent",
} as const;

/**
 * Tratamiento de un tipo en una notación: el declarado en el registro o el que
 * su rol implica. Un tipo sin rol ni declaración es un servicio: la caja neutra.
 */
export function treatmentOf(notation: NotationId | string | undefined, type: string): Treatment {
  const declarado = ALL_ELEMENTS[type]?.treatment;
  if (declarado) return declarado;
  switch (roleOfType(notation, type)) {
    case "datastore":
    case "entity":
      return "store";
    case "external":
      return "external";
    case "actor":
      return "input";
    default:
      return "backend";
  }
}

/**
 * Clases con que se dibuja un nodo suelto en una skin. En la canónica devuelve
 * `undefined`: el lienzo sigue con el color del registro, sin tocar nada.
 */
export function nodeTreatment(
  skin: SkinId,
  notation: NotationId | string | undefined,
  type: string,
  focal: boolean,
  /** Categoría fijada a mano en el elemento (sólo la lee «Plano»). */
  categoria?: unknown
): TreatmentClasses | undefined {
  if (skin === "plano") {
    const c = PLANO_CATEGORIES[categoriaDe(notation, type, categoria)];
    return { bg: focal ? c.bgFocal : c.bg, border: c.border, text: PLANO_INK };
  }
  if (skin !== "editorial") return undefined;
  return TREATMENTS[focal ? "focal" : treatmentOf(notation, type)];
}

/** Trazo de una arista en una skin (`undefined` en la canónica). */
export function edgeTreatment(
  skin: SkinId,
  notation: NotationId | string | undefined,
  extremos: { tipo: string; focal: boolean; categoria?: unknown }[]
): string | undefined {
  // En plano la arista es del color de su ORIGEN (el primer extremo).
  if (skin === "plano") return extremos.length ? PLANO_CATEGORIES[planoEdgeCategory(notation, extremos[0])].edge : undefined;
  if (skin !== "editorial") return undefined;
  if (extremos.length >= 2 && extremos.every((e) => e.focal)) return EDGE_TREATMENT.focal;
  if (extremos.some((e) => treatmentOf(notation, e.tipo) === "external")) return EDGE_TREATMENT.link;
  return EDGE_TREATMENT.base;
}

/** Tokens de la skin editorial que el tema debe definir (los lee el test de contraste). */
export const EDITORIAL_TOKENS = ["paper", "paper-2", "ink", "muted", "soft", "rule-solid", "accent", "link"] as const;

// ── Skin «Plano» (spec 026, #678) ───────────────────────────────────────────
//
// La lámina técnica: fondo oscuro con puntos, cada caja contorneada con el color
// de su CATEGORÍA (front, back, datos, nube, seguridad, mensajería, externo), la
// arista del color de su origen y una leyenda con lo presente. Es siempre
// oscura —es la estética de la lámina, no la vista de trabajo— y sus tokens
// `pl-*` se definen una sola vez; el contraste lo mide `skin-plano-contrast`.

/** Las siete categorías, en el orden en que las lee la leyenda. */
export const PLANO_CATEGORY_IDS: readonly PlanoCategory[] = [
  "frontend",
  "backend",
  "datos",
  "nube",
  "seguridad",
  "mensajeria",
  "externo",
];

/** Clases de una categoría. Escritas COMPLETAS: Tailwind sólo emite lo que ve. */
export interface PlanoCategoryClasses {
  label: string;
  /** Relleno tintado de la caja. */
  bg: string;
  /** Relleno del hotspot: el mismo tinte, más intenso (el foco no pierde su categoría). */
  bgFocal: string;
  border: string;
  /** Texto de la píldora de una arista que sale de esta categoría. */
  text: string;
  /** Trazo de la arista. */
  edge: string;
  /** Relleno de la punta de flecha y de la muestra de la leyenda. */
  fill: string;
}

export const PLANO_CATEGORIES: Record<PlanoCategory, PlanoCategoryClasses> = {
  frontend: { label: "Frontend", bg: "fill-pl-frontend/10", bgFocal: "fill-pl-frontend/30", border: "stroke-pl-frontend", text: "text-pl-frontend", edge: "stroke-pl-frontend", fill: "fill-pl-frontend" },
  backend: { label: "Backend", bg: "fill-pl-backend/10", bgFocal: "fill-pl-backend/30", border: "stroke-pl-backend", text: "text-pl-backend", edge: "stroke-pl-backend", fill: "fill-pl-backend" },
  datos: { label: "Base de datos", bg: "fill-pl-datos/10", bgFocal: "fill-pl-datos/30", border: "stroke-pl-datos", text: "text-pl-datos", edge: "stroke-pl-datos", fill: "fill-pl-datos" },
  // «Cloud» y no el nombre del tipo de formas generales: la categoría es la
  // infraestructura de nube, no la silueta (y el lint NOTACION lo exige).
  nube: { label: "Cloud",bg: "fill-pl-nube/10", bgFocal: "fill-pl-nube/30", border: "stroke-pl-nube", text: "text-pl-nube", edge: "stroke-pl-nube", fill: "fill-pl-nube" },
  seguridad: { label: "Seguridad", bg: "fill-pl-seguridad/10", bgFocal: "fill-pl-seguridad/30", border: "stroke-pl-seguridad", text: "text-pl-seguridad", edge: "stroke-pl-seguridad", fill: "fill-pl-seguridad" },
  mensajeria: { label: "Bus de mensajes", bg: "fill-pl-mensajeria/10", bgFocal: "fill-pl-mensajeria/30", border: "stroke-pl-mensajeria", text: "text-pl-mensajeria", edge: "stroke-pl-mensajeria", fill: "fill-pl-mensajeria" },
  externo: { label: "Externo", bg: "fill-pl-externo/10", bgFocal: "fill-pl-externo/30", border: "stroke-pl-externo", text: "text-pl-externo", edge: "stroke-pl-externo", fill: "fill-pl-externo" },
};

/** Texto de las cajas en plano: tinta clara sobre el tinte oscuro. */
export const PLANO_INK = "text-pl-ink";

/** Contenedor en plano: un marco tenue que no tapa a sus hijos ni es categoría. */
export const PLANO_CONTAINER: TreatmentClasses = {
  bg: "fill-pl-ink/[0.03]",
  border: "stroke-pl-ink/25",
  text: "text-pl-muted",
};

/** Tokens de la skin plano que el CSS debe definir (los lee el test). */
export const PLANO_TOKENS = ["bg", "grid", "ink", "muted", ...PLANO_CATEGORY_IDS] as const;

/** Lo que un archivo diga de categoría: una de las siete, o nada. */
export function leerCategoria(valor: unknown): PlanoCategory | undefined {
  return typeof valor === "string" && (PLANO_CATEGORY_IDS as readonly string[]).includes(valor)
    ? (valor as PlanoCategory)
    : undefined;
}

/**
 * Categoría de un elemento: la fijada a mano, la declarada en el registro, la
 * de su rol (un evento viaja por el bus), la de su tratamiento, o Backend. El
 * orden importa: lo explícito le gana a lo deducido.
 */
export function categoriaDe(
  notation: NotationId | string | undefined,
  type: string,
  fijada?: unknown
): PlanoCategory {
  const propia = leerCategoria(fijada);
  if (propia) return propia;
  const declarada = ALL_ELEMENTS[type]?.category;
  if (declarada) return declarada;
  if (roleOfType(notation, type) === "event") return "mensajeria";
  switch (treatmentOf(notation, type)) {
    case "store":
      return "datos";
    case "external":
      return "externo";
    case "input":
      return "frontend";
    case "security":
      return "seguridad";
    default:
      return "backend";
  }
}

/** Categoría que colorea una arista: la de su origen. */
export function planoEdgeCategory(
  notation: NotationId | string | undefined,
  origen: { tipo: string; categoria?: unknown }
): PlanoCategory {
  return categoriaDe(notation, origen.tipo, origen.categoria);
}

type Routing = "straight" | "curved" | "orthogonal";

/**
 * Enrutado efectivo según la skin. En plano, una arista sin trazo propio va en
 * ángulo recto; un mensaje de secuencia no (es un instante: horizontal). Las
 * otras skins no cambian nada: manda la notación.
 */
export function routingParaSkin(
  skin: SkinId,
  propio: Routing | undefined,
  deLaNotacion: Routing,
  opts: { secuencia?: boolean } = {}
): Routing {
  if (propio) return propio;
  if (skin === "plano" && !opts.secuencia) return "orthogonal";
  return deLaNotacion;
}

/** Medidas de la leyenda, en coordenadas del lienzo. */
export const PLANO_LEGEND = {
  /** Aire entre el contenido y la leyenda. */
  gap: 48,
  titulo: 18,
  alto: 44,
  muestra: 14,
  /** Ancho aproximado de un carácter monoespaciado a 12 px. */
  charPx: 7.4,
  separacion: 28,
} as const;

export interface PlanoLegendLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  items: { id: PlanoCategory; label: string; x: number }[];
}

/**
 * Leyenda de la lámina: sólo las categorías PRESENTES, en el orden canónico,
 * debajo del contenido y alineada a su izquierda. Sin categorías o sin
 * contenido, no hay leyenda.
 */
export function planoLegend(
  presentes: Iterable<PlanoCategory>,
  bounds: { minX: number; maxY: number } | null
): PlanoLegendLayout | null {
  if (!bounds) return null;
  const set = new Set(presentes);
  const ids = PLANO_CATEGORY_IDS.filter((c) => set.has(c));
  if (!ids.length) return null;
  const L = PLANO_LEGEND;
  let x = bounds.minX;
  const items = ids.map((id) => {
    const label = PLANO_CATEGORIES[id].label;
    const it = { id, label, x };
    x += L.muestra + 8 + label.length * L.charPx + L.separacion;
    return it;
  });
  return {
    x: bounds.minX,
    y: bounds.maxY + L.gap,
    width: x - L.separacion - bounds.minX,
    height: L.alto,
    items,
  };
}
