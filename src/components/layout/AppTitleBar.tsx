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

/** Id del hueco del nombre del proyecto activo (portal, lo llena el header). */
export const TITLEBAR_TITLE_SLOT = "titlebar-title-slot";

/** Id del hueco de la DERECHA: indicadores que no necesitan el ancho del header. */
export const TITLEBAR_RIGHT_SLOT = "titlebar-right-slot";

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
      <div style={{ ...arrastrable, width: reservaIzquierda(plataforma) }} />

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

      {/* Nombre del proyecto: da contexto y hace que la franja no sea una caja
          flotando sola. Lo llena el header por portal; es texto, así que arrastra
          con la barra. */}
      <div
        id={TITLEBAR_TITLE_SLOT}
        className="max-w-[220px] truncate text-xs font-medium text-muted-foreground"
        style={arrastrable}
      />

      {/* Hueco del buscador. ARRASTRABLE: el `no-drag` es del campo (lo pone el
          header), no de este contenedor. Cuando lo tenía, ocupaba todo el centro y la
          ventana se quedaba sin superficie para moverse ni para maximizar con doble
          clic (#170). */}
      {/* `-webkit-app-region` NO se hereda: sin declararlo acá, este contenedor —que
          ocupa casi toda la franja— queda en `none` y la ventana sigue sin poder
          moverse. El `no-drag` lo pone el campo, no este hueco. */}
      <div
        id={TITLEBAR_SEARCH_SLOT}
        className="flex flex-1 items-center justify-center px-2"
        style={arrastrable}
      />

      {/* Indicadores de la derecha (estado del servidor MCP): el header ya no tiene
          ancho que gastar en ellos y acá sobra franja. */}
      <div id={TITLEBAR_RIGHT_SLOT} className="flex items-center gap-1" style={arrastrable} />

      <div style={{ ...arrastrable, width: reservaControlesDerecha(plataforma) ? ANCHO_CONTROLES : 8 }} />
    </div>
  );
}

export default AppTitleBar;
