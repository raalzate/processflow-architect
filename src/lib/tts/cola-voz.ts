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
 * Cuánto pesa el ritmo de lecturas anteriores frente a lo que se mide ahora, en
 * segundos de audio: con 5 s medidos, lo nuevo y lo previo pesan igual; con un
 * minuto, manda lo nuevo. Así una frase atípica no tira por la borda lo aprendido.
 */
export const PESO_DEL_RITMO_PREVIO_S = 5;

/**
 * Segundos de síntesis por segundo de audio. `<= 1` significa que la síntesis va
 * más rápido que la reproducción y se puede sonar en cuanto hay algo.
 *
 * Sin `previo` (primera lectura de la sesión) la primera muestra no cuenta: lleva
 * el arranque del motor (cargar el modelo, la voz) y con ella cualquier lectura
 * parecería lenta; sin muestras útiles se asume 1.
 *
 * Con `previo` —el ritmo que se midió en lecturas anteriores (#637)— el motor ya
 * estaba caliente, así que cuenta todo y lo previo entra como peso inicial. Antes
 * cada lectura arrancaba asumiendo 1, empezaba a sonar con la primera frase sola
 * y, si la síntesis era más lenta que el habla, quedaba un silencio en cada frase.
 */
export function ritmoDeSintesis(todas: readonly Muestra[], previo?: number): number {
  const muestras = previo === undefined ? todas.slice(1) : todas;
  const audio = muestras.reduce((s, m) => s + m.audioS, 0);
  const sintesis = muestras.reduce((s, m) => s + m.sintesisS, 0);
  if (previo === undefined) return audio > 0 ? sintesis / audio : 1;
  return (sintesis + previo * PESO_DEL_RITMO_PREVIO_S) / (audio + PESO_DEL_RITMO_PREVIO_S);
}

/**
 * ¿Lo que se programó ya terminó (o está por terminar) cuando llega el buffer
 * siguiente? Entonces la síntesis se quedó atrás: en vez de sonar a saltos —una
 * frase, silencio, otra frase— conviene volver a juntar audio (#637). Si todavía
 * no se programó nada, no hay corte: es el arranque.
 */
export function seQuedaSinAudio(ahora: number, finProgramado: number, margen = MARGEN_S): boolean {
  return finProgramado > 0 && finProgramado < ahora + margen;
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
 *
 * Una frase sólo suena cuando está ENTERA. La frase j que falta (con `a_j` de audio
 * acumulado hasta ella inclusive y `d_j` propio) llega en `ritmo · a_j` y tiene que
 * empezar en `enColaS + a_j − d_j`, así que no hay silencio si
 * `enColaS ≥ (ritmo − 1) · a_j + d_j` para toda j. La cota que se usa es
 * `max(0, ritmo − 1) · faltaS + min(ritmo, 1) · fraseMaxS`. La versión de #612 no
 * sumaba la frase entera y la última llegaba tarde aun con el ritmo bien medido
 * (#637). Si no falta nada, se suena ya.
 */
export function debeArrancar(enColaS: number, faltaS: number, ritmo: number, fraseMaxS = 0): boolean {
  if (enColaS <= 0) return false;
  if (faltaS <= 0) return true;
  return enColaS >= Math.max(0, ritmo - 1) * faltaS + Math.min(ritmo, 1) * Math.min(fraseMaxS, faltaS);
}

/**
 * Instante del reloj de audio en que empieza el próximo buffer: donde termina el
 * anterior, o «ya» (más el margen) si el anterior ya terminó.
 */
export function inicioDelSiguiente(ahora: number, finProgramado: number, margen = MARGEN_S): number {
  return Math.max(ahora + margen, finProgramado);
}

/**
 * La decisión que se toma cada vez que llega una frase sintetizada: ¿se programa
 * lo que hay en cola o se sigue juntando? Mientras suena, se sigue sonando; si ya
 * se quedó sin audio, se vuelve a juntar hasta que el colchón cubra lo que falta
 * (`debeArrancar`). Es lo que aplica `useLeerEnVoz` frase por frase (#637).
 */
export function decidirSonar(p: {
  sonando: boolean;
  ahora: number;
  fin: number;
  enColaS: number;
  faltaS: number;
  /** Audio de la frase más larga que falta sintetizar. */
  fraseMaxS?: number;
  ritmo: number;
}): boolean {
  if (p.sonando && !seQuedaSinAudio(p.ahora, p.fin)) return true;
  return debeArrancar(p.enColaS, p.faltaS, p.ritmo, p.fraseMaxS);
}
