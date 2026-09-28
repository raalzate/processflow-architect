/**
 * @fileOverview El CROMO del lienzo: lo que se dibuja y no es un elemento (PURO).
 *
 * La apariencia de cada tipo vive en el registro de notaciones. Lo que queda
 * —la arista por defecto, su punta de flecha, la cuadrícula— no tiene tipo, y
 * estaba escrito con colores crudos dentro de los componentes que lo pintan.
 * Con un solo tema eso no molestaba; con dos, el color de una arista es una
 * decisión que hay que poder **medir**, y medirla exige que esté en un lugar
 * que no sea JSX.
 *
 * Por eso son tokens (`--canvas-edge`, `--canvas-grid`) y no clases de paleta:
 * el tema los cambia solo, y la verificación de contraste los lee del CSS, que
 * es donde están de verdad.
 *
 * La distinción que ordena este archivo:
 *
 *  - Una **arista es contenido**: si no se ve, el diagrama dice otra cosa. Entra
 *    en la verificación, con el umbral de lo no textual (3:1).
 *  - La **cuadrícula es decoración**: ayuda a alinear y nada más. Exigirle 3:1
 *    daría un enrejado que compite con el diagrama. Se declara acá igual —un
 *    solo lugar— pero no se le mide contraste, y el test dice por qué.
 */

/** Clase de cada trazo del lienzo. El color lo pone el token, o sea el tema. */
export const CANVAS_CHROME = {
  /** Arista sin color propio. */
  arista: "stroke-canvas-edge",
  /** Punta de flecha de esa arista. */
  flecha: "fill-canvas-edge",
  /** Punto de la cuadrícula (decoración). */
  cuadriculaPunto: "fill-canvas-grid",
  /** Línea mayor de la cuadrícula, cada cinco celdas (decoración). */
  cuadriculaLinea: "stroke-canvas-grid-major",
} as const;

/** El token del tema detrás de cada trazo, para poder medirlo contra el lienzo. */
export const TOKEN_DE_CROMO: Record<keyof typeof CANVAS_CHROME, string> = {
  arista: "canvas-edge",
  flecha: "canvas-edge",
  cuadriculaPunto: "canvas-grid",
  cuadriculaLinea: "canvas-grid-major",
};

/**
 * Lo que SÍ se mide contra el lienzo: lo que porta información. La cuadrícula
 * queda fuera a propósito (ver el encabezado del archivo).
 */
export const CROMO_CON_CONTRASTE: readonly (keyof typeof CANVAS_CHROME)[] = ["arista", "flecha"];
