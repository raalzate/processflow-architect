"use client";

/**
 * @fileOverview Hook de tema claro/oscuro (renderer).
 *
 * Orquesta la lógica pura de `src/lib/theme.ts` con el DOM: aplica la clase
 * `.dark` en <html> y, cuando el usuario elige "system", reacciona a los cambios
 * de preferencia del SO en vivo. La persistencia vive en localStorage.
 */

import { useCallback, useEffect, useState } from "react";
import {
  applyThemeClass,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

const MEDIA = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.(MEDIA).matches === true;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Lee la preferencia persistida una vez montado (evita divergencia SSR/cliente).
  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  // Aplica al DOM ante cualquier cambio de tema o de la preferencia del SO.
  useEffect(() => {
    const apply = () => {
      const r = resolveTheme(theme, prefersDark());
      applyThemeClass(document.documentElement, r);
      setResolved(r);
    };
    apply();

    // En modo "system" seguimos al SO en vivo; en explícito no hace falta escuchar.
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia(MEDIA);
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setStoredTheme(next);
    setThemeState(next);
  }, []);

  return { theme, resolved, setTheme };
}
