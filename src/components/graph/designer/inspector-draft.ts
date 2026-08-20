/**
 * @fileOverview Fusión del borrador del inspector con el estado vivo (PURO).
 *
 * La ficha de un elemento se guarda SOLA (no hay botón «Guardar»), y mientras
 * está abierta el lienzo sigue cambiando ese mismo elemento: se arrastra, se
 * redimensiona, se le mueve una punta de enlace. Guardar el borrador entero
 * pisaría esos cambios y el nodo saltaría a la posición que tenía al abrir la
 * ficha.
 *
 * Así que no se guarda el borrador: se guarda el DIFF. Sólo los campos que el
 * usuario tocó en la ficha se aplican sobre el estado actual del elemento; la
 * geometría, que la ficha no edita, queda como la dejó el lienzo.
 */

/** Comparación por valor, suficiente para los campos de la ficha (planos o arrays). */
const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** true si el borrador difiere de lo que se abrió (hay algo que guardar). */
export function hasDraftChanges<T extends object>(original: T, draft: T): boolean {
  return changedKeys(original, draft).length > 0;
}

/** Campos que el usuario tocó en la ficha (incluye los que borró). */
export function changedKeys<T extends object>(original: T, draft: T): (keyof T)[] {
  const claves = new Set<keyof T>([
    ...(Object.keys(original) as (keyof T)[]),
    ...(Object.keys(draft) as (keyof T)[]),
  ]);
  return [...claves].filter((k) => !igual(original[k], draft[k]));
}

/**
 * Los campos que el usuario tocó, listos para aplicarse sobre el estado ACTUAL
 * del elemento. Un campo que la ficha no edita (la geometría) no viaja, así que
 * lo que hizo el lienzo mientras la ficha estaba abierta se conserva.
 */
export function draftPatch<T extends object>(original: T, draft: T): Partial<T> {
  const patch: Partial<T> = {};
  for (const k of changedKeys(original, draft)) patch[k] = draft[k];
  return patch;
}

/**
 * Texto del campo «Tecnologías / etiquetas» → lista. Separa por coma, recorta y
 * descarta vacíos y repetidos, PRESERVANDO el resto del texto tal cual (`.netcore`,
 * `C#`, `Node 20`): la lista es del usuario, no un identificador normalizado.
 */
export function parseTagList(texto: string): string[] {
  const salida: string[] = [];
  for (const parte of texto.split(",")) {
    const t = parte.trim();
    if (t && !salida.includes(t)) salida.push(t);
  }
  return salida;
}
