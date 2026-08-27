/**
 * @fileOverview Ancho de los paneles laterales: límites y persistencia.
 *
 * Flexible **hasta cierto límite**: un panel que se puede llevar a 20 px o a
 * media pantalla deja de ser un panel. Los topes viven acá —lógica pura, con
 * pruebas— y la UI sólo arrastra y pinta.
 */

/** Topes de un panel redimensionable, en píxeles. */
export interface PanelLimits {
  min: number;
  max: number;
  default: number;
}

/**
 * Paleta de elementos del diseñador (la columna «ELEMENTOS»).
 * `min` = cabe el nombre más largo de la paleta sin cortarlo a la mitad;
 * `max` = no se come el lienzo, que es el protagonista.
 */
export const TOOLBOX_LIMITS: PanelLimits = { min: 180, max: 420, default: 240 };

/** Clave de `localStorage` del ancho de la paleta. */
export const TOOLBOX_WIDTH_KEY = "designer_toolbox_width";

/** Recorta un ancho a los topes. Un valor no finito cae al default. */
export function clampPanelWidth(px: number, limits: PanelLimits): number {
  if (!Number.isFinite(px)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(px)));
}

/**
 * Lee el ancho guardado (string crudo de `localStorage`, que puede ser
 * cualquier cosa) y lo devuelve dentro de los topes. Sin valor válido: default.
 */
export function readPanelWidth(raw: string | null | undefined, limits: PanelLimits): number {
  if (raw == null || raw.trim() === "") return limits.default;
  const n = Number(raw);
  if (!Number.isFinite(n)) return limits.default;
  return clampPanelWidth(n, limits);
}

/** ¿El ancho está pegado a un tope? Lo usa la UI para avisar que no da más. */
export function isAtLimit(px: number, limits: PanelLimits): "min" | "max" | null {
  const w = clampPanelWidth(px, limits);
  if (w <= limits.min) return "min";
  if (w >= limits.max) return "max";
  return null;
}

// -----------------------------------------------------------------------------
// Ancho de la FICHA de elemento (drawer lateral) — #187
// -----------------------------------------------------------------------------

/**
 * La ficha era de ancho fijo (448 px). Con el tab «Spec» adentro —historias con
 * escenarios, requisitos, criterios— cada campo quedaba en una columna angosta.
 * En vez de un arrastre fino, tres anchos con nombre: se llega al que hace falta
 * con un clic y no hay que recordar un número.
 *
 * Se declaran ACÁ, no en el componente, por la misma razón que los topes de la
 * paleta: la medida es una decisión con pruebas, no un literal perdido en un JSX.
 */
export type InspectorWidthId = "normal" | "ancho" | "casi-completa";

export interface InspectorWidth {
  id: InspectorWidthId;
  /** Valor de `max-width` (unidad CSS). El drawer sólo lo aplica. */
  maxWidth: string;
  /** Rótulo del botón/tooltip: dice a qué ancho se PASA. */
  label: string;
}

/** Los tres anchos, en el orden en el que cicla el botón. */
export const INSPECTOR_WIDTHS: readonly InspectorWidth[] = [
  { id: "normal", maxWidth: "28rem", label: "Normal" },
  { id: "ancho", maxWidth: "55vw", label: "Ancho" },
  { id: "casi-completa", maxWidth: "85vw", label: "Casi completa" },
] as const;

/** Clave de `localStorage` del ancho elegido para la ficha. */
export const INSPECTOR_WIDTH_KEY = "designer_inspector_width";

/** El ancho de partida: el que la ficha tenía antes de que esto existiera. */
const INSPECTOR_DEFAULT: InspectorWidthId = "normal";

/** El siguiente ancho del ciclo. Un id desconocido arranca el ciclo de nuevo. */
export function nextInspectorWidth(actual: InspectorWidthId): InspectorWidthId {
  // Un id desconocido vale como Normal (es de donde parte la ficha), así que el
  // primer clic lleva a Ancho igual que si hubiera partido bien.
  const i = INSPECTOR_WIDTHS.findIndex((w) => w.id === readInspectorWidth(actual));
  return INSPECTOR_WIDTHS[(i + 1) % INSPECTOR_WIDTHS.length].id;
}

/** Lee lo guardado (crudo de `localStorage`): si no es uno de los tres, Normal. */
export function readInspectorWidth(raw: string | null | undefined): InspectorWidthId {
  const v = (raw ?? "").trim();
  return INSPECTOR_WIDTHS.some((w) => w.id === v) ? (v as InspectorWidthId) : INSPECTOR_DEFAULT;
}

/** El `max-width` a aplicar. Un id inválido no deja la ficha sin ancho. */
export function inspectorMaxWidth(id: InspectorWidthId): string {
  return (INSPECTOR_WIDTHS.find((w) => w.id === id) ?? INSPECTOR_WIDTHS[0]).maxWidth;
}
