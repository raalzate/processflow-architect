/**
 * @fileOverview Tipos de MENSAJE de una secuencia y su simbología (T5).
 *
 * «No tiene cómo devolver» era una de las quejas: el retorno existía sólo como
 * «acordate de poner la arista punteada a mano». Un concepto que depende de que
 * el usuario recuerde una convención no es un concepto, es una costumbre.
 *
 * Es el mismo patrón que `edge-relations.ts`: un registro que mapea la clase de
 * mensaje a su simbología, y reusa su `EdgeMarker`. **No** se mete DENTRO de
 * `EDGE_RELATIONS` a propósito: aquéllas son relaciones de diagrama de CLASES
 * —herencia, composición— y mezclarlas dejaría al usuario eligiendo
 * «composición» para un mensaje, que no quiere decir nada.
 *
 * Sobre P6 (el arnés es agnóstico de notación): `notations.ts` es la única
 * fuente de los TIPOS DE COMPONENTE. Un tipo de mensaje no es un componente
 * —igual que `EdgeRelationKind` no lo es— por eso vive acá. Si la regla NOTACION
 * del lint marcara este archivo, gana el lint y se busca otra forma: el freno no
 * se toca para que pase el código.
 */

import type { EdgeMarker } from "../edge-relations";
import { enRegistro } from "../registro";

/** Qué clase de mensaje es. `sync` es la caída: la llamada de siempre. */
export type SequenceMessageKind = "sync" | "async" | "return" | "create" | "destroy";

export interface SequenceMessageStyle {
  /** Etiqueta para el selector de la ficha. */
  label: string;
  /** Marca en la punta del DESTINO. */
  end: EdgeMarker;
  /** true → trazo discontinuo. */
  dashed: boolean;
  /** Qué dice el mensaje, para el tooltip. */
  hint: string;
}

/**
 * La tabla. Cada tipo tiene una combinación de punta y trazo DISTINTA de todas
 * las demás: si dos coincidieran, el diagrama no se podría leer sin abrir la
 * ficha, y el criterio de éxito pide justamente reconocerlos a simple vista.
 */
export const SEQUENCE_MESSAGES: Record<SequenceMessageKind, SequenceMessageStyle> = {
  sync: {
    label: "Llamada (espera respuesta)",
    end: "triangle",
    dashed: false,
    hint: "Llamada síncrona: quien la envía espera a que le respondan",
  },
  async: {
    label: "Llamada (no espera)",
    end: "arrow",
    dashed: false,
    hint: "Llamada asíncrona: quien la envía sigue sin esperar respuesta",
  },
  return: {
    label: "Retorno",
    end: "arrow",
    dashed: true,
    hint: "La respuesta a una llamada que esperaba: punteada, como manda UML",
  },
  create: {
    label: "Creación de participante",
    end: "diamond-open",
    dashed: true,
    hint: "Crea al participante del otro extremo, que nace en este punto",
  },
  destroy: {
    label: "Destrucción de participante",
    end: "diamond",
    dashed: false,
    hint: "Termina la vida del participante del otro extremo",
  },
};

/** El tipo de un mensaje que no lo declara: la llamada de siempre. */
export const SEQUENCE_MESSAGE_DEFAULT: SequenceMessageKind = "sync";

/** La lista, en el orden en que se ofrece al usuario. */
export const SEQUENCE_MESSAGE_KINDS = Object.keys(SEQUENCE_MESSAGES) as SequenceMessageKind[];

/**
 * ¿Es un tipo conocido? Lo guardado puede traer cualquier cosa.
 *
 * `enRegistro` y no `in`: `in` ve la cadena de prototipos, así que `"toString"`
 * pasaba por tipo de mensaje válido. Es el mismo agujero que apareció en
 * `canvas-nudge.ts` (que por eso usa un `Map`) y el que la regla REGISTRO del
 * lint ahora impide reponer (#282).
 */
export const esTipoDeMensaje = (v: unknown): v is SequenceMessageKind =>
  enRegistro(SEQUENCE_MESSAGES, v);

/** El estilo de un mensaje; un tipo desconocido cae a la llamada de siempre. */
export function estiloDeMensaje(kind: SequenceMessageKind | undefined): SequenceMessageStyle {
  return SEQUENCE_MESSAGES[esTipoDeMensaje(kind) ? kind : SEQUENCE_MESSAGE_DEFAULT];
}
