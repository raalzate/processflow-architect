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
  /** Ancho de la caja del participante: deja aire para la etiqueta del mensaje. */
  anchoParticipante: 200,
  /** Aire del fragmento por encima de su primer mensaje: lo ocupa la pestaña del operador. */
  aireSobreFragmento: 36,
  /** Aire del fragmento por debajo de su último mensaje. */
  aireBajoFragmento: 20,
  /** Margen lateral del fragmento respecto de las líneas de vida que abarca. */
  margenFragmento: 24,
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

/** Lo que el layout necesita de un mensaje: su lugar y sus extremos. */
export interface MensajeAColocar {
  orden: number;
  fuente: string;
  destino: string;
}

/** Un fragmento a colocar: el tramo de orden que encierra. */
export interface FragmentoAColocar {
  id: string;
  desde: number;
  hasta: number;
  /** Ancho que pide su guarda para leerse entera (ver `anchoParaGuarda`). */
  anchoMinimo?: number;
}

export interface Caja {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Coloca una secuencia entera (#616): participantes en columnas con el alto que
 * pide la cantidad de mensajes, y cada fragmento sobre el tramo de tiempo que
 * encierra y sólo sobre las líneas de vida que participan de ese tramo.
 *
 * El fragmento se coloca por su RANGO porque el lienzo hace el camino inverso:
 * deriva el rango de la geometría (`rangoPorGeometria`). Una caja que no tapa la
 * altura de sus mensajes llega al lienzo encerrando nada —la «caja suelta debajo
 * de todo» de #616—. Las alturas salen de `alturaDeMensaje`, la misma que usa el
 * lienzo, así que no pueden discrepar.
 */
export function disponerSecuencia(
  participantes: readonly string[],
  mensajes: readonly MensajeAColocar[],
  fragmentos: readonly FragmentoAColocar[]
): Map<string, Caja> {
  const L = SECUENCIA_LAYOUT;
  const out = new Map<string, Caja>();
  const columna = new Map<string, number>();
  for (const p of ordenarParticipantes(participantes, mensajes.length)) {
    columna.set(p.id, p.x);
    out.set(p.id, { x: p.x, y: p.y, width: L.anchoParticipante, height: p.height });
  }
  if (!participantes.length) return out;

  const xs = [...columna.values()];
  const todo = { min: Math.min(...xs), max: Math.max(...xs) };
  for (const f of fragmentos) {
    const desde = sano(Math.min(f.desde, f.hasta), 1);
    const hasta = sano(Math.max(f.desde, f.hasta), 1);
    const cols = mensajes
      .filter((m) => m.orden >= desde && m.orden <= hasta)
      .flatMap((m) => [columna.get(m.fuente), columna.get(m.destino)])
      .filter((x): x is number => x !== undefined);
    const min = cols.length ? Math.min(...cols) : todo.min;
    const max = cols.length ? Math.max(...cols) : todo.max;
    const x = min - L.margenFragmento;
    const ancho = max + L.anchoParticipante + L.margenFragmento - x;
    // La guarda puede pedir más ancho, pero nunca más que la secuencia entera:
    // lo que no entra se recorta con «…» en el lienzo.
    const tope = todo.max + L.anchoParticipante + L.margenFragmento - x;
    const width = Math.max(ancho, Math.min(f.anchoMinimo ?? 0, tope));
    const y = alturaDeMensaje(desde) - L.aireSobreFragmento;
    const height = alturaDeMensaje(hasta) - alturaDeMensaje(desde) + L.aireSobreFragmento + L.aireBajoFragmento;
    out.set(f.id, { x, y, width, height });
  }
  return out;
}
