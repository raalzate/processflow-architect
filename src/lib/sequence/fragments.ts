/**
 * @fileOverview Fragmentos combinados de una secuencia: loop, alt, opt, par (T7).
 *
 * «No tiene cómo crear loops» era la queja. Existía un elemento «Fragmento»,
 * pero era un contenedor genérico: un rectángulo punteado con un nombre. Sin
 * operador no dice qué hace, sin guarda no dice cuándo, y sin operandos un
 * `alt` no tiene «si no».
 *
 * La decisión de diseño que sostiene el módulo: **un fragmento encierra un
 * RANGO DE ORDEN, no un rectángulo**. Los mensajes ya están ordenados, así que
 * decir «del 2 al 5» los identifica sin ambigüedad. Con geometría, sacar un
 * mensaje del fragmento sería arrastrarlo fuera de una caja —y la altura del
 * mensaje ya no se arrastra (FR-002)—; con rangos, sacarlo es reordenarlo, que
 * es la operación que el usuario ya tiene.
 */

/** Los operadores que UML define y esta app soporta. */
export type FragmentOp = "loop" | "alt" | "opt" | "par";

export interface FragmentOpStyle {
  /** Lo que se dibuja en la pestaña del fragmento. */
  etiqueta: string;
  /** Nombre largo, para el selector. */
  label: string;
  /** true → admite varios operandos (el «si no» de un alt). */
  variosOperandos: boolean;
  hint: string;
}

export const FRAGMENT_OPS: Record<FragmentOp, FragmentOpStyle> = {
  loop: {
    etiqueta: "loop",
    label: "Repetición (loop)",
    variosOperandos: false,
    hint: "Lo que encierra se repite mientras se cumpla la condición",
  },
  alt: {
    etiqueta: "alt",
    label: "Alternativa (alt)",
    variosOperandos: true,
    hint: "Se ejecuta el primer caso cuya condición se cumple; los casos se separan",
  },
  opt: {
    etiqueta: "opt",
    label: "Opcional (opt)",
    variosOperandos: false,
    hint: "Lo que encierra ocurre sólo si se cumple la condición",
  },
  par: {
    etiqueta: "par",
    label: "Paralelo (par)",
    variosOperandos: true,
    hint: "Los casos ocurren a la vez, sin orden entre sí",
  },
};

export const FRAGMENT_OPS_LIST = Object.keys(FRAGMENT_OPS) as FragmentOp[];

/** ¿Es un operador conocido? Lo guardado puede traer cualquier cosa. */
export const esOperador = (v: unknown): v is FragmentOp =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(FRAGMENT_OPS, v);

/**
 * Un operando: una parte del fragmento, con su condición y el tramo de la
 * secuencia que abarca. `desde` y `hasta` son órdenes, ambos inclusive.
 */
export interface FragmentPart {
  guarda: string;
  desde: number;
  hasta: number;
}

/**
 * Normaliza los operandos de un fragmento.
 *
 * Lo guardado puede venir con rangos invertidos, negativos o solapados. Nada de
 * eso puede dejar el lienzo sin dibujar (P8, SC-008), así que se arregla en vez
 * de rechazarse: un rango invertido se da vuelta, los valores se recortan a la
 * secuencia real, y los solapes se resuelven en orden —el operando anterior
 * cede—, porque dos partes que reclaman el mismo mensaje no se pueden dibujar.
 *
 * Un fragmento de operador sin varios operandos se queda con el primero: un
 * `opt` con dos «si no» no significa nada.
 */
export function normalizarOperandos(
  partes: readonly FragmentPart[] | undefined,
  op: FragmentOp,
  totalMensajes: number
): FragmentPart[] {
  const tope = Math.max(0, Math.floor(totalMensajes));
  if (tope === 0) return [];
  const sanas = (partes ?? [])
    .map((p) => {
      const a = Number.isFinite(p.desde) ? Math.round(p.desde) : 1;
      const b = Number.isFinite(p.hasta) ? Math.round(p.hasta) : a;
      const desde = Math.min(Math.max(1, Math.min(a, b)), tope);
      const hasta = Math.min(Math.max(1, Math.max(a, b)), tope);
      return { guarda: p.guarda ?? "", desde, hasta };
    })
    .sort((x, y) => x.desde - y.desde);

  const salida: FragmentPart[] = [];
  let ultimo = 0;
  for (const p of sanas) {
    const desde = Math.max(p.desde, ultimo + 1);
    if (desde > p.hasta) continue; // el solape se lo comió entero
    salida.push({ ...p, desde });
    ultimo = p.hasta;
  }
  return FRAGMENT_OPS[op].variosOperandos ? salida : salida.slice(0, 1);
}

/** ¿El mensaje con este orden cae dentro del fragmento? */
export function contieneOrden(partes: readonly FragmentPart[], orden: number): boolean {
  return partes.some((p) => orden >= p.desde && orden <= p.hasta);
}

/** El operando que contiene ese orden, o `null`. Sirve para pintar la guarda. */
export function operandoDe(
  partes: readonly FragmentPart[],
  orden: number
): FragmentPart | null {
  return partes.find((p) => orden >= p.desde && orden <= p.hasta) ?? null;
}

/** El tramo completo que abarca el fragmento, o `null` si no abarca nada. */
export function rangoDe(partes: readonly FragmentPart[]): { desde: number; hasta: number } | null {
  if (!partes.length) return null;
  return {
    desde: Math.min(...partes.map((p) => p.desde)),
    hasta: Math.max(...partes.map((p) => p.hasta)),
  };
}

/** ¿`interior` queda enteramente dentro de `exterior`? Para fragmentos anidados. */
export function estaAnidado(
  interior: readonly FragmentPart[],
  exterior: readonly FragmentPart[]
): boolean {
  const i = rangoDe(interior);
  const e = rangoDe(exterior);
  if (!i || !e) return false;
  return i.desde >= e.desde && i.hasta <= e.hasta;
}
