/**
 * @fileOverview Qué hace el LIENZO con el orden de los mensajes (T4).
 *
 * El modelo temporal y la geometría estaban, pero nada asignaba el orden al
 * crear un enlace: la feature quedaba inerte en la app. Acá vive esa costura,
 * pura y con prueba, porque el error de olvidarla no se ve —el diagrama se
 * dibuja igual, sólo que sin tiempo.
 *
 * Un mensaje de secuencia se reconoce por sus EXTREMOS: une dos líneas de vida.
 * No por la notación de la vista, porque en UML conviven clases, estados y
 * secuencia en la misma paleta.
 */

import { normalizarOrden, ordenSiguiente, type MensajeOrdenable } from "./order";

/** Lo mínimo que el lienzo expone de un enlace para esta decisión. */
export interface EnlaceDeLienzo extends MensajeOrdenable {
  sourceId: string;
  targetId: string;
}

/** ¿Este enlace es un mensaje de secuencia? Lo dicen sus dos extremos. */
export function esMensajeDeSecuencia(
  enlace: Pick<EnlaceDeLienzo, "sourceId" | "targetId">,
  esLineaDeVida: (nodeId: string) => boolean
): boolean {
  return esLineaDeVida(enlace.sourceId) && esLineaDeVida(enlace.targetId);
}

/** Los mensajes de secuencia que hay hoy, en orden. */
export function mensajesDe<T extends EnlaceDeLienzo>(
  enlaces: readonly T[],
  esLineaDeVida: (nodeId: string) => boolean
): T[] {
  return normalizarOrden(enlaces.filter((e) => esMensajeDeSecuencia(e, esLineaDeVida)));
}

/**
 * El orden que le toca a un enlace RECIÉN creado, o `undefined` si no es un
 * mensaje de secuencia.
 *
 * `undefined` y no `0`: en las demás notaciones el campo no significa nada, y
 * escribirlo igual ensuciaría todos los diagramas del repo con un dato muerto.
 */
export function ordenParaNuevo(
  nuevo: Pick<EnlaceDeLienzo, "sourceId" | "targetId">,
  existentes: readonly EnlaceDeLienzo[],
  esLineaDeVida: (nodeId: string) => boolean
): number | undefined {
  if (!esMensajeDeSecuencia(nuevo, esLineaDeVida)) return undefined;
  return ordenSiguiente(mensajesDe(existentes, esLineaDeVida));
}

/**
 * Renumera los mensajes que quedan después de borrar algo.
 *
 * Devuelve SÓLO los que cambian, para que el llamador no reescriba enlaces que
 * no tocó: un parche mínimo es más fácil de razonar que un reemplazo total, y
 * evita marcar como modificado medio diagrama.
 */
export function renumerar<T extends EnlaceDeLienzo>(
  enlaces: readonly T[],
  esLineaDeVida: (nodeId: string) => boolean
): Array<{ id: string; orden: number }> {
  return mensajesDe(enlaces, esLineaDeVida)
    .map((m) => ({ id: m.id, orden: m.orden as number }))
    .filter((m) => {
      const antes = enlaces.find((e) => e.id === m.id)?.orden;
      return antes !== m.orden;
    });
}
