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

import { emptySpec } from "@/lib/element-spec";

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

/**
 * Campos que cambiaron AFUERA con la ficha abierta (un agente por MCP, #643) y
 * que el humano no tocó en el borrador: esos se adoptan; los que sí tocó se
 * respetan. Sin esto la ficha mostraba lo viejo hasta recargar, y el próximo
 * autoguardado lo devolvía al lienzo pisando lo que escribió el agente.
 * Devuelve `null` si no hay nada que adoptar.
 */
export function adoptarExternos<T extends object>(
  original: T,
  borrador: T,
  vivo: T
): { original: T; borrador: T } | null {
  const tocados = new Set(changedKeys(original, borrador));
  const externos = changedKeys(original, vivo).filter((k) => !tocados.has(k));
  const parche: Partial<T> = {};
  for (const k of externos) parche[k] = vivo[k];
  let nuevoOriginal = { ...original, ...parche };
  let nuevoBorrador = { ...borrador, ...parche };
  let cambio = externos.length > 0;
  // La spec tiene varios campos: escribir su nombre no significa haber tocado
  // también el flujo y los requisitos. Adoptar por el campo `spec` entero
  // ocultaba el contrato del MCP y el siguiente autoguardado lo borraba.
  const o = original as { spec?: object };
  const b = borrador as { spec?: object };
  const v = vivo as { spec?: object };
  if (b.spec && v.spec && !igual(o.spec, b.spec) && !igual(o.spec, v.spec)) {
    const base = { ...emptySpec(), ...o.spec };
    const local = { ...emptySpec(), ...b.spec };
    const remoto = { ...emptySpec(), ...v.spec };
    const editados = new Set(changedKeys(base, local));
    const adoptados = changedKeys(base, remoto).filter((k) => !editados.has(k));
    if (adoptados.length) {
      for (const k of adoptados) {
        Object.assign(base, { [k]: remoto[k] });
        Object.assign(local, { [k]: remoto[k] });
      }
      nuevoOriginal = { ...nuevoOriginal, spec: base };
      nuevoBorrador = { ...nuevoBorrador, spec: local };
      cambio = true;
    }
  }
  return cambio ? { original: nuevoOriginal, borrador: nuevoBorrador } : null;
}
