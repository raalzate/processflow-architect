/**
 * @fileOverview El ORDEN de los mensajes de una secuencia (feature 013, T1).
 *
 * Un diagrama de secuencia sin tiempo no es un diagrama de secuencia: dos
 * mensajes entre los mismos participantes salían a la misma altura y se
 * pisaban. El orden vive EN la arista (`orden`), no en una lista aparte del
 * proyecto: una lista paralela se desincroniza sola —borrás la arista y queda
 * un id colgado— y el diagrama miente sin que nadie lo vea.
 *
 * La regla dura de este módulo: **se normaliza al LEER**. Lo guardado puede
 * venir con huecos, duplicados, negativos o `NaN` —de una versión vieja, de un
 * agente, de una edición a mano— y ninguna de esas cosas puede dejar el lienzo
 * sin dibujar (P8, SC-008). Normalizar es determinista: la misma entrada da
 * siempre la misma salida, porque desempata la posición en el array.
 */

/** Lo mínimo que este módulo necesita de un mensaje. */
export interface MensajeOrdenable {
  id: string;
  /** Lugar en la secuencia, denso desde 1. Ausente = todavía no lo tiene. */
  orden?: number;
}

/**
 * Un mensaje que YA tiene su lugar. Es el tipo que devuelven las operaciones de
 * este módulo: dicen en la firma lo que garantizan, para que quien las use no
 * tenga que volver a preguntarse si el orden puede faltar.
 */
export type ConOrden<T extends MensajeOrdenable> = T & { orden: number };

/** El primer lugar de la secuencia. Arranca en 1: «el primero» es el 1. */
export const PRIMER_ORDEN = 1;

/**
 * ¿Este número sirve como lugar en la secuencia? Sólo enteros positivos: un
 * `0`, un negativo o un `NaN` no dicen dónde va el mensaje, así que el mensaje
 * se trata como si no tuviera lugar (va al final) en vez de descartarlo.
 */
const ordenUtilizable = (n: number | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= PRIMER_ORDEN;

/**
 * Devuelve la lista con el orden denso desde 1, en el orden en que se lee.
 *
 * Criterio de desempate, en cascada: primero el número guardado (los que no
 * tienen uno utilizable van al final), después la posición original en el
 * array. Esa segunda parte es lo que hace la operación determinista con datos
 * rotos: dos mensajes con el mismo número siempre salen en el mismo orden.
 *
 * No muta la entrada.
 */
export function normalizarOrden<T extends MensajeOrdenable>(
  mensajes: readonly T[]
): ConOrden<T>[] {
  return mensajes
    .map((mensaje, indice) => ({ mensaje, indice }))
    .sort((a, b) => {
      const oa = ordenUtilizable(a.mensaje.orden) ? a.mensaje.orden : Number.POSITIVE_INFINITY;
      const ob = ordenUtilizable(b.mensaje.orden) ? b.mensaje.orden : Number.POSITIVE_INFINITY;
      return oa === ob ? a.indice - b.indice : oa - ob;
    })
    .map(({ mensaje }, i) => ({ ...mensaje, orden: PRIMER_ORDEN + i }));
}

/** El lugar que le toca a un mensaje nuevo: el final de la secuencia. */
export function ordenSiguiente(mensajes: readonly MensajeOrdenable[]): number {
  return PRIMER_ORDEN + mensajes.length;
}

/**
 * Mueve un mensaje al lugar `destino`, empujando al resto.
 *
 * El resto conserva su orden RELATIVO (H1.2): mover uno no puede reacomodar los
 * demás entre sí, o reordenar dejaría de ser una operación y pasaría a ser una
 * apuesta. Un destino fuera de rango se recorta —sacar al mensaje de la lista
 * sería peor que ponerlo en la punta—, y un id que no existe deja todo igual.
 */
export function moverMensaje<T extends MensajeOrdenable>(
  mensajes: readonly T[],
  id: string,
  destino: number
): ConOrden<T>[] {
  const lista = normalizarOrden(mensajes);
  const desde = lista.findIndex((m) => m.id === id);
  if (desde === -1) return lista;
  const hasta = Math.min(lista.length - 1, Math.max(0, destino - PRIMER_ORDEN));
  const [movido] = lista.splice(desde, 1);
  lista.splice(hasta, 0, movido);
  return lista.map((m, i) => ({ ...m, orden: PRIMER_ORDEN + i }));
}

/**
 * Quita mensajes y RENUMERA lo que queda.
 *
 * Es lo que pasa al eliminar un participante: se van sus mensajes (FR-017). Sin
 * renumerar quedaría un hueco, y un hueco parece que significa algo.
 */
export function quitarMensajes<T extends MensajeOrdenable>(
  mensajes: readonly T[],
  ids: readonly string[]
): ConOrden<T>[] {
  const fuera = new Set(ids);
  return normalizarOrden(mensajes.filter((m) => !fuera.has(m.id)));
}
