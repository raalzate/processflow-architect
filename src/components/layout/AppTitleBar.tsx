"use client";

import React, { useEffect, useState } from "react";
import { Menu as MenuIcon } from "lucide-react";
import { isMacPlatform } from "@/lib/platform";
import {
  TITLEBAR_HEIGHT,
  necesitaBotonDeMenu,
  reservaControlesDerecha,
  reservaIzquierda,
} from "@/lib/window-chrome";

/** Id del hueco donde el header inyecta su buscador (portal). */
export const TITLEBAR_SEARCH_SLOT = "titlebar-search-slot";

/** Ancho que se le deja al overlay nativo de Windows/Linux (3 botones). */
const ANCHO_CONTROLES = 140;

/**
 * Barra de título propia (issue #169). Ocupa la franja que antes tenía sólo el nombre
 * de la ventana y hospeda el buscador, como el command center de VS Code.
 *
 * Dos cuidados que no son opcionales:
 *  - La franja entera es `-webkit-app-region: drag` (si no, la ventana deja de moverse),
 *    y TODO control dentro necesita `no-drag` o deja de responder al clic.
 *  - Los botones de ventana los pinta el sistema: acá sólo se reserva su hueco
 *    —izquierda en macOS, derecha en Windows/Linux— para no quedar debajo.
 *
 * En el navegador no hay barra nativa que reemplazar: no se renderiza.
 */
export function AppTitleBar() {
  const [enElectron, setEnElectron] = useState(false);
  const [esMac, setEsMac] = useState(true);

  useEffect(() => {
    const hayBarra = typeof window !== "undefined" && !!window.electronAPI;
    setEnElectron(hayBarra);
    setEsMac(isMacPlatform());
    // `h-screen` mide 100vh e ignoraría esta franja: cada pantalla se pasaría de
    // largo y taparía los controles de ventana. El alto real se publica acá y lo
    // descuenta `globals.css`.
    if (hayBarra) document.body.dataset.titlebar = "on";
    return () => {
      delete document.body.dataset.titlebar;
    };
  }, []);

  if (!enElectron) return null;

  const plataforma = esMac ? "darwin" : "win32";
  const arrastrable = { WebkitAppRegion: "drag" } as React.CSSProperties;
  const clicable = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  return (
    <div
      className="flex flex-shrink-0 select-none items-center gap-2 border-b bg-card px-2"
      style={{ ...arrastrable, height: TITLEBAR_HEIGHT }}
    >
      <div style={{ width: reservaIzquierda(plataforma) }} />

      {necesitaBotonDeMenu(plataforma) && (
        // En Windows/Linux el menú vivía en el marco que ocultamos: sin este botón,
        // «Archivo», «Diseño» y «Ayuda» sólo quedarían accesibles por atajo.
        <button
          type="button"
          style={clicable}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Menú de la aplicación"
          aria-label="Menú de la aplicación"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            window.electronAPI?.windowMenuPopup?.(r.left, r.bottom);
          }}
        >
          <MenuIcon className="h-4 w-4" />
        </button>
      )}

      {/* Hueco del buscador: lo llena el header por portal cuando hay proyecto. */}
      <div id={TITLEBAR_SEARCH_SLOT} className="flex flex-1 justify-center" style={clicable} />

      <div style={{ width: reservaControlesDerecha(plataforma) ? ANCHO_CONTROLES : 8 }} />
    </div>
  );
}

export default AppTitleBar;
