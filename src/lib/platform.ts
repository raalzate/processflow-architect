/**
 * @fileOverview Plataforma y teclas modificadoras (PURO).
 *
 * La app corre en macOS y en Windows, y cada uno tiene su tecla: ⌘ en Mac, Ctrl
 * en el resto. Esto vivía duplicado y desalineado —dos detecciones distintas en
 * el mismo archivo, y la paleta de acciones sin ninguna—, así que un atajo nuevo
 * no tenía de dónde tomar el criterio.
 *
 * `navigator.platform`, que es lo que se usaba, está DEPRECADO: la especificación
 * lo marca como obsoleto y los navegadores lo van congelando. Se consulta
 * primero `userAgentData.platform`, que es su reemplazo, y se cae a los dos
 * anteriores para no depender de una sola señal.
 *
 * Recibe el `navigator` por parámetro para poder probarse sin DOM.
 */

/** Lo que se necesita de `navigator`; se pasa entero o se toma del global. */
export interface PlatformSource {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

function fuente(nav?: PlatformSource): PlatformSource {
  if (nav) return nav;
  return typeof navigator !== "undefined" ? (navigator as PlatformSource) : {};
}

/** true en macOS (incluye el iPad, que se anuncia como Mac). */
export function isMacPlatform(nav?: PlatformSource): boolean {
  const n = fuente(nav);
  const señales = [n.userAgentData?.platform, n.platform, n.userAgent];
  return señales.some((s) => typeof s === "string" && /mac/i.test(s));
}

/** Cómo se ESCRIBE el modificador en la interfaz: `⌘` o `Ctrl`. */
export function modifierLabel(nav?: PlatformSource): "⌘" | "Ctrl" {
  return isMacPlatform(nav) ? "⌘" : "Ctrl";
}

/**
 * true si el evento trae el modificador de ESTA plataforma. Es estricto a
 * propósito: aceptar los dos parecería más cómodo, pero en macOS `Ctrl+letra`
 * ya significa algo del sistema dentro de un campo de texto (Ctrl+K borra hasta
 * el final de la línea), y pisarlo rompe lo que el usuario espera del sistema
 * operativo, no de la app.
 */
export function hasPlatformModifier(
  e: { metaKey?: boolean; ctrlKey?: boolean },
  nav?: PlatformSource,
): boolean {
  return isMacPlatform(nav) ? !!e.metaKey : !!e.ctrlKey;
}
