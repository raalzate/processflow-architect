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
