/**
 * @fileOverview Arrastrar el tablero con el mouse (#763) — PURO.
 *
 * El lienzo se desplaza con el scroll nativo de su contenedor. Con touchpad eso
 * basta (dos dedos scrollean en 2D), pero con mouse la rueda sólo va en vertical
 * y arrastrar el fondo abre el marco de selección: no había forma natural de
 * moverse a los lados. Se adopta la convención de las pizarras (Figma, Miro):
 *
 * - clic central (la rueda) + arrastrar → mueve el tablero;
 * - Espacio + arrastrar con clic izquierdo → mueve el tablero;
 * - Shift + rueda → desplazamiento horizontal.
 *
 * El clic izquierdo sobre el fondo SIN Espacio sigue siendo selección por marco.
 * Acá vive la decisión; el componente sólo aplica el scroll.
 */

/** `MouseEvent.button` del clic izquierdo. */
export const BOTON_PRINCIPAL = 0;
/** `MouseEvent.button` del clic central (pulsar la rueda). */
export const BOTON_CENTRAL = 1;

/** Píxeles por línea cuando la rueda reporta `deltaMode` = 1 (líneas). */
export const LINEA_PX = 16;
/** Píxeles por página cuando la rueda reporta `deltaMode` = 2 (páginas). */
const PAGINA_PX = 800;

/** ¿Este botón, con o sin Espacio pulsado, empieza a arrastrar el tablero? */
export function iniciaPaneo(boton: number, espacioPulsado: boolean): boolean {
  if (boton === BOTON_CENTRAL) return true;
  return boton === BOTON_PRINCIPAL && espacioPulsado;
}

/** Dónde arrancó el arrastre: el puntero (px de pantalla) y el scroll del contenedor. */
export interface InicioPaneo {
  x: number;
  y: number;
  left: number;
  top: number;
}

/**
 * Scroll del contenedor con el puntero en `actual`. El tablero sigue a la mano:
 * mover el mouse a la derecha trae a la vista lo que estaba a la izquierda.
 */
export function scrollTrasArrastre(inicio: InicioPaneo, actual: { x: number; y: number }): { left: number; top: number } {
  return { left: inicio.left - (actual.x - inicio.x), top: inicio.top - (actual.y - inicio.y) };
}

/** Lo que importa de un `WheelEvent` para decidir. */
export interface Rueda {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Píxeles a desplazar en horizontal por Shift + rueda, o `null` para dejarle el
 * evento al navegador. Sólo actúa cuando el evento llega como rueda vertical:
 * si el sistema ya lo convirtió en `deltaX` (macOS) o viene de un touchpad, el
 * navegador lo resuelve solo y sumarle otro desplazamiento lo duplicaría.
 * Con Ctrl/⌘ la rueda es zoom: tampoco se toca.
 */
export function ruedaHorizontal(e: Rueda): number | null {
  if (!e.shiftKey || e.ctrlKey || e.metaKey) return null;
  if (e.deltaX !== 0 || e.deltaY === 0) return null;
  const escala = e.deltaMode === 1 ? LINEA_PX : e.deltaMode === 2 ? PAGINA_PX : 1;
  return e.deltaY * escala;
}

/**
 * ¿La tecla (por `KeyboardEvent.code`) activa el modo arrastre? Escribiendo en
 * un campo, Espacio es un espacio.
 */
export function esTeclaDePaneo(code: string, escribiendo: boolean): boolean {
  return code === "Space" && !escribiendo;
}
