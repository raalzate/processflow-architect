/**
 * @fileOverview Chrome de la ventana: qué barra de título dibuja cada plataforma. PURO.
 *
 * El buscador vivía en el header, compitiendo por el mismo ancho que el selector de
 * proyecto, el chip de organización y el menú. Se muda a la BARRA DE TÍTULO —el espacio
 * que hoy sólo tiene un nombre— como hace VS Code.
 *
 * Eso obliga a ocultar la barra nativa, y ahí está el riesgo: los controles de ventana
 * son la ÚNICA forma de cerrar la app. Por eso ninguna plataforma los dibuja la app:
 *  - macOS: `hiddenInset` deja los semáforos nativos y libera el resto de la franja.
 *  - Windows/Linux: `titleBarOverlay` hace que el SISTEMA pinte minimizar/maximizar/
 *    cerrar sobre la página. Si nuestro código falla, los botones siguen siendo del SO
 *    y la ventana no queda atrapada.
 *
 * Lo que sí desaparece en Windows/Linux es la barra de MENÚ (Archivo, Diseño, …), que
 * vivía en el marco: por eso la barra propia lleva un botón que abre ese mismo menú.
 */

/** Plataformas tal como las nombra `process.platform`. */
export type Plataforma = "darwin" | "win32" | "linux" | string;

/** Alto de la barra de título, en px. Lo comparten el main y el renderer. */
export const TITLEBAR_HEIGHT = 40;

/** Colores del overlay nativo. La app es siempre oscura (spec 003). */
const OVERLAY_FONDO = "#0b0f14";
const OVERLAY_SIMBOLO = "#e5e7eb";

export interface TitleBarOptions {
  titleBarStyle: "hiddenInset" | "hidden";
  trafficLightPosition?: { x: number; y: number };
  titleBarOverlay?: { color: string; symbolColor: string; height: number };
}

/** Opciones de `BrowserWindow` para la barra de título de esta plataforma. */
export function titleBarOptions(plataforma: Plataforma): TitleBarOptions {
  if (plataforma === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      // Centrados en la franja: con la barra más alta, los semáforos en su sitio
      // por defecto quedan pegados al borde de arriba.
      trafficLightPosition: { x: 14, y: (TITLEBAR_HEIGHT - 16) / 2 },
    };
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: { color: OVERLAY_FONDO, symbolColor: OVERLAY_SIMBOLO, height: TITLEBAR_HEIGHT },
  };
}

/**
 * ¿El SISTEMA dibuja los controles de ventana sobre la página? En Windows/Linux sí
 * (overlay), así que la barra propia tiene que dejarles el hueco de la derecha libre o
 * quedan tapados por nuestros controles.
 */
export function reservaControlesDerecha(plataforma: Plataforma): boolean {
  return plataforma !== "darwin";
}

/**
 * ¿La barra propia necesita el botón de menú? Sólo donde el menú vivía en el marco que
 * acabamos de ocultar. En macOS el menú es de la barra del sistema y sigue ahí.
 */
export function necesitaBotonDeMenu(plataforma: Plataforma): boolean {
  return plataforma !== "darwin";
}

/**
 * Hueco a la IZQUIERDA para no pisar los semáforos de macOS. Sin esto, el primer
 * control de la barra queda debajo de los botones del sistema y no se puede pulsar.
 */
export function reservaIzquierda(plataforma: Plataforma): number {
  return plataforma === "darwin" ? 78 : 0;
}
