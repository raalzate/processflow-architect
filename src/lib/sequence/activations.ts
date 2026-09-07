/**
 * @fileOverview Activaciones: cuándo un participante está atendiendo (T9).
 *
 * La activación era un rectángulo suelto que había que alinear a ojo sobre el
 * eje, y se desalineaba al primer cambio. Acá se CALCULA: nace cuando un
 * participante recibe una llamada y termina cuando devuelve.
 *
 * No se persiste. Guardar algo que se puede derivar es crear una segunda fuente
 * de verdad que se desincroniza al primer reordenamiento — el mismo error que
 * el orden vino a evitar con la altura del mensaje.
 *
 * Las llamadas anidadas se resuelven con una PILA por participante: A llama a B,
 * B llama a C y C devuelve; el retorno de C cierra la activación de C, no la de
 * B. Sin pila, un retorno cerraba lo primero que encontrara.
 */

import type { SequenceMessageKind } from "./messages";

/** Un mensaje ya ordenado, con lo que hace falta para derivar activaciones. */
export interface MensajeParaActivar {
  id: string;
  orden: number;
  /** Quién envía. */
  fuente: string;
  /** Quién recibe: es el que queda activo. */
  destino: string;
  messageKind?: SequenceMessageKind;
}

/** Tramo en que un participante está atendiendo. Ambos órdenes inclusive. */
export interface Activacion {
  /** Participante que atiende. */
  participante: string;
  /** Orden del mensaje que la abre. */
  desde: number;
  /** Orden del mensaje que la cierra. */
  hasta: number;
}

/** Sólo una llamada que ESPERA respuesta abre una activación. */
const abre = (k: SequenceMessageKind | undefined) => k === undefined || k === "sync";

/**
 * Las activaciones que se desprenden de una lista de mensajes ordenada.
 *
 * Reglas, y el porqué de cada una:
 *
 * - Una llamada síncrona abre activación en **quien recibe**. La asíncrona no:
 *   quien la manda no espera, así que no hay un tramo de atención que dibujar.
 * - Un retorno cierra la activación **de quien lo envía** (el que estaba
 *   atendiendo devuelve).
 * - Un retorno sin llamada abierta **no inventa una activación**: es un
 *   diagrama a medio hacer, y dibujar una barra de la nada haría creer que el
 *   modelo dice algo que no dice.
 * - Una activación que nunca se cierra llega hasta el último mensaje: el
 *   participante quedó atendiendo, que es exactamente lo que el diagrama dice.
 */
export function activacionesDe(mensajes: readonly MensajeParaActivar[]): Activacion[] {
  const ordenados = [...mensajes].sort((a, b) => a.orden - b.orden);
  const ultimo = ordenados.length ? ordenados[ordenados.length - 1].orden : 0;
  /** Pila de aperturas pendientes por participante. */
  const pilas = new Map<string, number[]>();
  const salida: Activacion[] = [];

  for (const m of ordenados) {
    if (m.messageKind === "return") {
      // Devuelve el que estaba atendiendo: cierra SU activación más reciente.
      const pila = pilas.get(m.fuente);
      const desde = pila?.pop();
      if (desde === undefined) continue; // retorno huérfano: no se inventa nada
      salida.push({ participante: m.fuente, desde, hasta: m.orden });
      continue;
    }
    if (abre(m.messageKind)) {
      const pila = pilas.get(m.destino) ?? [];
      pila.push(m.orden);
      pilas.set(m.destino, pila);
    }
  }

  // Lo que quedó abierto llega al final: el participante quedó atendiendo.
  for (const [participante, pila] of pilas) {
    for (const desde of pila) salida.push({ participante, desde, hasta: ultimo });
  }
  return salida.sort((a, b) => a.desde - b.desde || a.participante.localeCompare(b.participante));
}
