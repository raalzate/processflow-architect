/**
 * @fileOverview Cola de la lectura en voz alta (#612). PURO: sin AudioContext ni
 * worker; decide qué sintetizar primero, cuándo empezar a sonar y en qué instante
 * del reloj de audio va cada frase. Quien lo aplica es `src/hooks/useLeerEnVoz.ts`.
 *
 * Por qué hace falta: la versión de #605 sintetizaba UNA frase por adelantado y la
 * reproducía al terminar la anterior. Si sintetizar la siguiente tardaba más que
 * sonar la actual (WASM en CPU, peor con la IA local generando) quedaba silencio en
 * medio de la respuesta. Tres decisiones lo evitan:
 *
 *  - **Primera frase corta**: el primer audio sale antes, y mientras suena se
 *    sintetizan las demás.
 *  - **Encadenar en el reloj del AudioContext**: cada buffer se programa para
 *    empezar justo donde termina el anterior (`start(t)`), no al disparar
 *    `onended`, que llega tarde y deja un hueco audible.
 *  - **Juntar audio si la síntesis es lenta**: con el ritmo medido (segundos de
 *    síntesis por segundo de audio), no se empieza a sonar hasta tener en cola el
 *    audio que cubre lo que falta sintetizar.
 */

/** Cuántas frases se piden al worker por delante de la que suena. */
export const POR_ADELANTADO = 3;

/** Largo máximo de la primera frase: corta, para que el primer audio salga rápido. */
export const PRIMERA_MAX = 80;

/** Margen al programar en el reloj de audio: `start(t)` con `t` en el pasado suena tarde y cortado. */
export const MARGEN_S = 0.05;

/**
 * Parte la primera frase si es larga, por la última coma/pausa (o espacio) antes
 * de `max`. Las demás quedan igual: sólo la primera decide cuánto se espera.
 */
export function primeraCorta(frases: readonly string[], max = PRIMERA_MAX): string[] {
  if (!frases.length || frases[0].length <= max) return [...frases];
  const f = frases[0];
  const cabeza = f.slice(0, max + 1);
  const corte =
    Math.max(cabeza.lastIndexOf(", "), cabeza.lastIndexOf("; "), cabeza.lastIndexOf(": ")) + 1 ||
    cabeza.lastIndexOf(" ");
  if (corte <= 0) return [...frases];
  const a = f.slice(0, corte).trim();
  const b = f.slice(corte).trim();
  return [a, ...(b ? [b] : []), ...frases.slice(1)];
}

/** Una frase ya sintetizada: cuánto tardó y cuánto suena. */
export interface Muestra {
  caracteres: number;
  sintesisS: number;
  audioS: number;
}

/**
 * Segundos de síntesis por segundo de audio. `<= 1` significa que la síntesis va
 * más rápido que la reproducción y se puede sonar en cuanto hay algo. La primera
 * muestra no cuenta: lleva el arranque del motor (cargar el modelo, la voz) y con
 * ella cualquier lectura parecería lenta. Sin muestras útiles se asume 1: ni
 * optimista ni pesimista hasta medir.
 */
export function ritmoDeSintesis(todas: readonly Muestra[]): number {
  const muestras = todas.slice(1);
  const audio = muestras.reduce((s, m) => s + m.audioS, 0);
  if (audio <= 0) return 1;
  return muestras.reduce((s, m) => s + m.sintesisS, 0) / audio;
}

/** Segundos de audio que produce un carácter, medido; sin muestras, ~15 car/s del habla. */
export function segundosPorCaracter(muestras: readonly Muestra[]): number {
  const car = muestras.reduce((s, m) => s + m.caracteres, 0);
  if (car <= 0) return 1 / 15;
  return muestras.reduce((s, m) => s + m.audioS, 0) / car;
}

/**
 * ¿Ya se puede empezar a sonar? Mientras suena lo que hay en cola (`enColaS`), la
 * síntesis sigue con lo que falta (`faltaS` de audio, que tarda `ritmo · faltaS`).
 * No hay silencio si lo que falta se termina de sintetizar antes de que se acabe lo
 * que suena: `enColaS >= (ritmo - 1) · faltaS`. Si no falta nada, se suena ya.
 */
export function debeArrancar(enColaS: number, faltaS: number, ritmo: number): boolean {
  if (enColaS <= 0) return false;
  if (faltaS <= 0) return true;
  return enColaS >= Math.max(0, ritmo - 1) * faltaS;
}

/**
 * Instante del reloj de audio en que empieza el próximo buffer: donde termina el
 * anterior, o «ya» (más el margen) si el anterior ya terminó.
 */
export function inicioDelSiguiente(ahora: number, finProgramado: number, margen = MARGEN_S): number {
  return Math.max(ahora + margen, finProgramado);
}
