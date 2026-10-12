/**
 * @fileOverview Skin del lienzo: canónica o editorial (PURO, spec 022 · ADR 0006).
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

import { ALL_ELEMENTS, roleOfType, type NotationId, type Treatment } from "./notations";

export type SkinId = "canon" | "editorial";

export const SKIN_DEFAULT: SkinId = "canon";
export const SKIN_LIST: readonly { id: SkinId; label: string; description: string }[] = [
  { id: "canon", label: "Canónica", description: "Cada tipo con el color de su notación: la del trabajo diario." },
  {
    id: "editorial",
    label: "Editorial",
    description: "Tinta sobre papel y un solo acento en los hotspots: la de la lámina o el documento.",
  },
];

/** Lo que un archivo guardado diga de skin; cualquier cosa rara es la canónica. */
export function leerSkin(valor: unknown): SkinId {
  return valor === "editorial" ? "editorial" : SKIN_DEFAULT;
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
  focal: boolean
): TreatmentClasses | undefined {
  if (skin !== "editorial") return undefined;
  return TREATMENTS[focal ? "focal" : treatmentOf(notation, type)];
}

/** Trazo de una arista en una skin (`undefined` en la canónica). */
export function edgeTreatment(
  skin: SkinId,
  notation: NotationId | string | undefined,
  extremos: { tipo: string; focal: boolean }[]
): string | undefined {
  if (skin !== "editorial") return undefined;
  if (extremos.length >= 2 && extremos.every((e) => e.focal)) return EDGE_TREATMENT.focal;
  if (extremos.some((e) => treatmentOf(notation, e.tipo) === "external")) return EDGE_TREATMENT.link;
  return EDGE_TREATMENT.base;
}

/** Tokens de la skin editorial que el tema debe definir (los lee el test de contraste). */
export const EDITORIAL_TOKENS = ["paper", "paper-2", "ink", "muted", "soft", "rule-solid", "accent", "link"] as const;
