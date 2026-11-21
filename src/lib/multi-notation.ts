/**
 * Vista multinotación: una vista puede mezclar elementos de varias notaciones
 * (p. ej. un C4 con formas generales). Se guarda como `notation` (la PRINCIPAL,
 * la que ya leen la IA, la validación y el MCP) más `notacionesExtra`. Así lo
 * existente —proyectos guardados, pares de colaboración viejos, los ~150 lugares
 * que leen `notation`— sigue valiendo sin cambios, y lo nuevo se suma encima.
 *
 * Lógica pura: sin React. El registro (`notations.ts`) sigue siendo la única
 * fuente de verdad de qué notaciones existen.
 */
import {
  DEFAULT_NOTATION_ID,
  NOTATIONS,
  getNotation,
  notationTypes,
  type NotationId,
  type NotationPaletteGroup,
} from "./notations";
import { enRegistro } from "./registro";

const existe = (id: unknown): id is NotationId => enRegistro(NOTATIONS, id);

/**
 * Normaliza lo que reciben las funciones que antes aceptaban UNA notación y
 * ahora aceptan varias: una suelta o una lista → lista válida, la primera
 * primero. Así cada consumidor migra cambiando el tipo del parámetro, sin
 * duplicar la limpieza.
 */
export function listaDeNotaciones(
  n: string | readonly string[] | undefined
): NotationId[] {
  if (Array.isArray(n)) return notacionesDeVista(n[0], n.slice(1));
  return notacionesDeVista(n as string | undefined, undefined);
}

/**
 * Tipos válidos de una o varias notaciones: la unión, sin repetir, en el orden
 * de las notaciones (la principal primero, así un `defaultType` o un parecido
 * se resuelve primero en ella).
 */
export function tiposDeNotaciones(
  n: string | readonly string[] | undefined,
  opts: { includeContainers?: boolean } = {}
): string[] {
  const vistos = new Set<string>();
  for (const id of listaDeNotaciones(n)) {
    for (const t of notationTypes(id, opts)) vistos.add(t);
  }
  return [...vistos];
}

/** Notaciones de una vista, la principal primero, sin repetidos ni ids desconocidos. */
export function notacionesDeVista(
  principal: string | undefined,
  extras: readonly string[] | undefined
): NotationId[] {
  const lista: NotationId[] = [existe(principal) ? principal : DEFAULT_NOTATION_ID];
  for (const id of extras ?? []) {
    if (existe(id) && !lista.includes(id)) lista.push(id);
  }
  return lista;
}

/**
 * Marcar/desmarcar una notación. Nunca deja la lista vacía: una vista sin
 * notación no tendría paleta ni guía para la IA. Si se desmarca la principal,
 * la siguiente pasa a serlo.
 */
export function alternarNotacion(actuales: readonly NotationId[], id: NotationId): NotationId[] {
  if (!actuales.includes(id)) return [...actuales, id];
  if (actuales.length === 1) return [...actuales];
  return actuales.filter((n) => n !== id);
}

/** Lista → forma persistida. Sin extra, `extras` queda `undefined` (no se escribe). */
export function separarNotaciones(lista: readonly NotationId[]): {
  principal: NotationId;
  extras: NotationId[] | undefined;
} {
  const [principal = DEFAULT_NOTATION_ID, ...resto] = lista;
  return { principal, extras: resto.length ? resto : undefined };
}

/**
 * Nombre de la notación sin la aclaración entre paréntesis («BPMN (Procesos)» →
 * «BPMN»). En la paleta angosta el nombre entero cortaba el del grupo.
 */
export function nombreCorto(id: NotationId): string {
  return getNotation(id).label.replace(/\s*\(.*\)\s*$/, "");
}

/**
 * Paleta combinada. Con una notación es exactamente la suya; con varias, cada
 * grupo lleva la notación de prefijo, porque «Eventos» de BPMN y de DDD no son
 * lo mismo y en una paleta mezclada el humano tiene que saber de dónde sale.
 */
export function paletaDeNotaciones(lista: readonly NotationId[]): NotationPaletteGroup[] {
  if (lista.length <= 1) return getNotation(lista[0]).paletteGroups;
  return lista.flatMap((id) =>
    getNotation(id).paletteGroups.map((g) => ({
      label: `${nombreCorto(id)} · ${g.label}`,
      types: g.types,
    }))
  );
}

/** Texto del disparador del selector: el nombre de la principal y cuántas más. */
export function rotuloDeNotaciones(lista: readonly NotationId[]): string {
  const principal = getNotation(lista[0]).label;
  return lista.length > 1 ? `${principal} +${lista.length - 1}` : principal;
}
