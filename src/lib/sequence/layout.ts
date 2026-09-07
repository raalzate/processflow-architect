/**
 * @fileOverview Dónde cae cada cosa en una secuencia (feature 013, T2 y T12).
 *
 * La altura de un mensaje es DERIVADA de su orden: no se guarda y no se
 * arrastra (FR-002). Si se guardara **y** existiera el orden, habría dos
 * fuentes de verdad para lo mismo y una tendría que ganarle a la otra en
 * silencio — que es exactamente el defecto que hizo perder tiempo en #259,
 * donde dos frenos medían la misma cosa y no coincidían.
 *
 * Las medidas viven acá y no en el componente por la misma razón que los topes
 * de los paneles: son decisiones con prueba, no literales perdidos en un JSX.
 * El botón «Organizar» y el lienzo llaman a esta misma función, así que no
 * pueden discrepar.
 */

/** Medidas de una secuencia, en coordenadas del lienzo. */
export const SECUENCIA_LAYOUT = {
  /** Alto de la caja del participante (el nombre). Espeja `LIFELINE_HEAD`. */
  altoCabecera: 44,
  /** Aire entre la cabecera y el primer mensaje. */
  aireBajoCabecera: 40,
  /** Separación entre dos mensajes consecutivos. */
  pasoMensaje: 60,
  /** Aire por debajo del último mensaje, para que el pie no quede pegado. */
  aireFinal: 60,
  /** Columna del primer participante. */
  primeraColumna: 80,
  /** Separación entre participantes. */
  pasoParticipante: 320,
} as const;

/** Un índice o un orden utilizable; lo roto cae al primero (SC-008). */
const sano = (n: number, minimo: number): number =>
  Number.isFinite(n) && n >= minimo ? Math.floor(n) : minimo;

/**
 * A qué altura se dibuja el mensaje número `orden`.
 *
 * Arranca por debajo de la cabecera: un mensaje sobre ella taparía el nombre
 * del participante. Un orden roto cae al primero en vez de mandar la flecha
 * fuera del lienzo.
 */
export function alturaDeMensaje(orden: number): number {
  const n = sano(orden, 1);
  const { altoCabecera, aireBajoCabecera, pasoMensaje } = SECUENCIA_LAYOUT;
  return altoCabecera + aireBajoCabecera + (n - 1) * pasoMensaje;
}

/**
 * Alto que necesita la línea de vida para que entren `cantidad` mensajes.
 *
 * Con cero mensajes igual devuelve alto: un participante recién puesto tiene
 * que verse, o el usuario cree que no se creó.
 */
export function altoNecesario(cantidad: number): number {
  const n = sano(cantidad, 0);
  return alturaDeMensaje(Math.max(1, n)) + SECUENCIA_LAYOUT.aireFinal;
}

/** Columna (x) del participante número `indice`, contando desde 0. */
export function columnaDeParticipante(indice: number): number {
  const i = sano(indice, 0);
  return SECUENCIA_LAYOUT.primeraColumna + i * SECUENCIA_LAYOUT.pasoParticipante;
}

/** Un participante colocado por el preset. */
export interface ParticipantePuesto {
  id: string;
  x: number;
  y: number;
  height: number;
}

/**
 * Coloca los participantes en fila y les da el alto que necesita la secuencia
 * (T12). Comparte `alturaDeMensaje` con el lienzo a propósito: si el botón
 * «Organizar» calculara la altura por su cuenta, los dos podrían discrepar y
 * nadie vería el desacuerdo hasta que el diagrama quedara torcido.
 *
 * Todos arrancan en la MISMA `y`: en una secuencia el tiempo es uno solo, y
 * participantes a distinta altura sugieren que empiezan en momentos distintos.
 */
export function ordenarParticipantes(
  ids: readonly string[],
  cantidadMensajes: number
): ParticipantePuesto[] {
  const height = altoNecesario(cantidadMensajes);
  return ids.map((id, i) => ({ id, x: columnaDeParticipante(i), y: 0, height }));
}
