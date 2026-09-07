/**
 * @fileOverview Diagramas de secuencia guardados ANTES de que hubiera orden (T3).
 *
 * Un proyecto viejo tiene mensajes sin `orden` y retornos marcados a mano como
 * punteados. Nada de eso puede perderse al abrir (FR-015, SC-004): quien guardó
 * un diagrama hace tres meses no aceptó ninguna migración.
 *
 * Dos criterios que valen más que el código:
 *
 * 1. **Se resuelve al ABRIR, no con un script masivo.** Un diagrama que nadie
 *    abre nunca no se toca, y no hay un paso de migración que pueda fallar a
 *    mitad y dejar la mitad de los proyectos en un estado y la mitad en otro.
 * 2. **El orden se deriva de la `y`**, que es el criterio con el que el usuario
 *    venía colocando los mensajes: de arriba abajo. Inventar otro orden sería
 *    reescribirle el diagrama.
 */

import { normalizarOrden, type MensajeOrdenable } from "./order";
import { esTipoDeMensaje, type SequenceMessageKind } from "./messages";

/** Un mensaje como viene de un proyecto guardado, con lo que haga falta mirar. */
export interface MensajeGuardado extends MensajeOrdenable {
  /** Altura a la que se venía dibujando. Es de donde sale el orden. */
  y?: number;
  /** Trazo punteado puesto a mano: la vieja convención de «retorno». */
  dashed?: boolean;
  /** Tipo ya declarado, si el diagrama es nuevo. */
  messageKind?: SequenceMessageKind;
}

export interface MensajeMigrado extends MensajeOrdenable {
  orden: number;
  messageKind: SequenceMessageKind;
}

/** ¿Hay algo que migrar? Si todos tienen orden y tipo, no se toca nada. */
export function necesitaMigracion(mensajes: readonly MensajeGuardado[]): boolean {
  return mensajes.some((m) => m.orden === undefined || !esTipoDeMensaje(m.messageKind));
}

/**
 * Devuelve los mensajes con `orden` y `messageKind` resueltos.
 *
 * - **Orden**: el que ya tenga manda; el resto se ordena por su `y` de arriba
 *   abajo, y los que ni siquiera tienen `y` van al final en el orden en que
 *   estaban. `normalizarOrden` cierra dejándolo denso desde 1.
 * - **Tipo**: el declarado manda. Si no hay, un trazo punteado se lee como
 *   retorno —era la convención documentada— y todo lo demás es una llamada.
 */
export function migrarMensajes(mensajes: readonly MensajeGuardado[]): MensajeMigrado[] {
  const conOrden = mensajes.some((m) => m.orden !== undefined);
  // Sin NINGÚN orden guardado, la `y` es la única pista de qué pasó antes.
  const previos = conOrden
    ? mensajes
    : [...mensajes]
        .map((m, indice) => ({ m, indice }))
        .sort((a, b) => {
          const ya = Number.isFinite(a.m.y) ? (a.m.y as number) : Number.POSITIVE_INFINITY;
          const yb = Number.isFinite(b.m.y) ? (b.m.y as number) : Number.POSITIVE_INFINITY;
          return ya === yb ? a.indice - b.indice : ya - yb;
        })
        .map(({ m }, i) => ({ ...m, orden: i + 1 }));

  return normalizarOrden(previos).map((m) => ({
    ...m,
    messageKind: esTipoDeMensaje(m.messageKind)
      ? m.messageKind
      : m.dashed
        ? "return"
        : "sync",
  }));
}
