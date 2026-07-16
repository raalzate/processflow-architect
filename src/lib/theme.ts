/**
 * @fileOverview Tema claro/oscuro — DATOS Y LÓGICA PURA.
 *
 * Tailwind está en `darkMode: ['class']`: el tema oscuro se activa poniendo la
 * clase `.dark` en el elemento raíz (los tokens viven en globals.css). Aquí no
 * se toca React ni el DOM directamente; `applyThemeClass` recibe el destino para
 * poder probarse en entorno `node` (sin jsdom). El hook `useTheme` orquesta.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE = "pf_theme";
/** Por defecto seguimos al sistema operativo (coherente con una app de escritorio). */
export const DEFAULT_THEME: Theme = "system";

const THEMES: readonly Theme[] = ["light", "dark", "system"];

/** Tema elegido por el usuario (renderer). Defensivo si no hay localStorage. */
export function getStoredTheme(): Theme {
  try {
    const v = localStorage?.getItem?.(THEME_STORAGE) as Theme | null;
    return THEMES.includes(v as Theme) ? (v as Theme) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE, theme);
  } catch {
    /* ignore */
  }
}

/** Resuelve `system` contra la preferencia del SO; los explícitos pasan tal cual. */
export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

/** Interfaz mínima de destino: sólo necesitamos `classList.toggle`. */
export interface ClassTarget {
  classList: { toggle(cls: string, force: boolean): void };
}

/** Aplica/quita `.dark` en el raíz según el tema resuelto. */
export function applyThemeClass(root: ClassTarget, resolved: ResolvedTheme): void {
  root.classList.toggle("dark", resolved === "dark");
}
