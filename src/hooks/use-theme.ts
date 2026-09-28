"use client";

/**
 * @fileOverview Aplica la preferencia de tema al documento.
 *
 * La decisión (qué pintar) vive en `src/lib/theme.ts`, que es puro y está
 * probado; acá queda sólo lo que toca el navegador: leer y escribir
 * `localStorage`, poner la clase en el `<html>` y escuchar al sistema.
 *
 * El primer pintado NO lo hace este hook: lo hace el script en línea del layout
 * (`scriptAntiDestello`). Si esperáramos a React, se vería un fotograma del tema
 * contrario en cada arranque.
 */

import { useCallback, useEffect, useState } from "react";
import {
  THEME_DEFAULT,
  THEME_STORAGE_KEY,
  claseDelTema,
  leerPreferencia,
  resolverTema,
  type EffectiveTheme,
  type ThemePreference,
} from "@/lib/theme";

const CONSULTA_SISTEMA = "(prefers-color-scheme: dark)";

/** Lo guardado, o el default. Nunca lanza: el almacenamiento puede estar bloqueado. */
function preferenciaGuardada(): ThemePreference {
  try {
    return leerPreferencia(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return THEME_DEFAULT;
  }
}

const sistemaPrefiereOscuro = (): boolean => window.matchMedia(CONSULTA_SISTEMA).matches;

function aplicar(tema: EffectiveTheme): void {
  document.documentElement.classList.toggle("dark", claseDelTema(tema) === "dark");
}

export interface UseTheme {
  /** Lo que el usuario eligió. */
  preferencia: ThemePreference;
  /** Lo que se está pintando (con `system` ya resuelto). */
  tema: EffectiveTheme;
  elegir: (p: ThemePreference) => void;
}

export function useTheme(): UseTheme {
  // Arranca en el default y no en lo guardado: en el servidor no hay
  // `localStorage`, y pintar distinto en el servidor y en el cliente hace saltar
  // la hidratación. El valor real se lee en el primer efecto.
  const [preferencia, setPreferencia] = useState<ThemePreference>(THEME_DEFAULT);
  const [tema, setTema] = useState<EffectiveTheme>(resolverTema(THEME_DEFAULT, true));

  useEffect(() => {
    const p = preferenciaGuardada();
    setPreferencia(p);
    const efectivo = resolverTema(p, sistemaPrefiereOscuro());
    setTema(efectivo);
    aplicar(efectivo);
  }, []);

  // Sólo importa mientras la preferencia sea «seguir al sistema»: con un tema
  // elegido a mano, que el SO cambie no es asunto de la app.
  useEffect(() => {
    if (preferencia !== "system") return;
    const mq = window.matchMedia(CONSULTA_SISTEMA);
    const alCambiar = (e: MediaQueryListEvent) => {
      const efectivo = resolverTema("system", e.matches);
      setTema(efectivo);
      aplicar(efectivo);
    };
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [preferencia]);

  const elegir = useCallback((p: ThemePreference) => {
    setPreferencia(p);
    const efectivo = resolverTema(p, sistemaPrefiereOscuro());
    setTema(efectivo);
    aplicar(efectivo);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      // Sin almacenamiento el tema vale para esta sesión: mejor eso que romper.
    }
  }, []);

  return { preferencia, tema, elegir };
}
