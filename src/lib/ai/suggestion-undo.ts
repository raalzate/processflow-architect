/**
 * @fileOverview Vuelta atrás de UNA sugerencia de IA, campo por campo. PURO.
 *
 * El problema (#352): los botones ✨ de la ficha PISAN lo que hay escrito y no
 * había cómo volver. El Deshacer del lienzo no sirve con la ficha abierta —el
 * atajo se corta cuando el foco está en un input, y el autoguardado vuelve a
 * escribir el borrador encima del snapshot restaurado—, así que la vuelta atrás
 * tiene que vivir en la ficha misma.
 *
 * El modelo es deliberadamente chico: un valor previo por campo, el último. No
 * es un historial; es "lo que había justo antes de que la IA escribiera". Se
 * olvida en cuanto el humano toca ese campo a mano: a partir de ahí el texto ya
 * es suyo y restaurarlo sería pisarle el trabajo, que es justo el bug.
 */

/** Valores previos vivos, indexados por campo de la ficha. */
export type PreviosIA = Readonly<Record<string, unknown>>;

/** Dos valores de campo son "el mismo" si coinciden como datos (tags = array). */
function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  // Un campo vacío y uno inexistente son lo mismo para el humano.
  const vacio = (v: unknown) => v === undefined || v === null || v === "";
  return vacio(a) && vacio(b);
}

/**
 * Anota el valor previo de `campo` antes de aplicar `valorNuevo`.
 * Si la sugerencia no cambia nada, no deja anotación: un botón "Deshacer" que
 * no deshace nada es ruido.
 */
export function anotarSugerencia(
  previos: PreviosIA,
  campo: string,
  valorPrevio: unknown,
  valorNuevo: unknown
): PreviosIA {
  if (igual(valorPrevio, valorNuevo)) return previos;
  return { ...previos, [campo]: valorPrevio };
}

/** Olvida el valor previo de un campo (el humano lo editó, o ya se revirtió). */
export function olvidarSugerencia(previos: PreviosIA, campo: string): PreviosIA {
  if (!(campo in previos)) return previos;
  const { [campo]: _, ...resto } = previos;
  return resto;
}

/** ¿Hay algo que devolver en este campo? */
export function tieneRevert(previos: PreviosIA, campo: string): boolean {
  return campo in previos;
}

/** El valor a restaurar, o `undefined` si no hay nada anotado. */
export function valorPrevio(previos: PreviosIA, campo: string): unknown {
  return previos[campo];
}

/** Se cambió de elemento (o se cerró la ficha): lo anotado ya no aplica. */
export const SIN_PREVIOS: PreviosIA = Object.freeze({});
