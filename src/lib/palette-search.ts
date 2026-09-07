/**
 * @fileOverview Buscador de la paleta de elementos del diseñador (PURO).
 *
 * UML tiene decenas de tipos repartidos en varios grupos colapsables: encontrar
 * «Interfaz Requerida» era bajar por la paleta a ojo. Acá vive la única decisión
 * del buscador —qué cuenta como coincidencia y qué grupos quedan— y el
 * componente sólo la dibuja.
 *
 * Se busca por tres campos, en ese orden de intención: el nombre del tipo (lo
 * que el usuario ve), la etiqueta del grupo (escribir «despliegue» trae la
 * sección entera) y el texto de ayuda del tipo (cuando no se recuerda el nombre
 * pero sí para qué sirve: «base de datos» → Cilindro).
 */

import { plano } from "./search-nodes";
import { NOTATION_HELP, type ElementHelp } from "./notation-help";
import type { NotationPaletteGroup } from "./notations";

/**
 * Mínimo de caracteres para filtrar. Una sola letra deja la paleta casi igual y
 * el usuario cree que el buscador no hizo nada; con dos ya recorta de verdad.
 */
export const MIN_PALETTE_QUERY = 2;

/** Resultado del filtro: los grupos que quedan y cuántos tipos hay en total. */
export interface PaletteFilterResult {
  /** Grupos con al menos un tipo que coincide (mismo orden que la notación). */
  grupos: NotationPaletteGroup[];
  /** Tipos que coinciden, sumando todos los grupos. */
  total: number;
  /** `true` si la consulta llegó al mínimo y el resultado está filtrado. */
  filtrando: boolean;
}

/** Campos por los que se busca un tipo, ya normalizados. */
function camposDe(
  type: string,
  etiquetaGrupo: string,
  help: Record<string, ElementHelp>
): string[] {
  const ayuda = help[type];
  return [type, etiquetaGrupo, ayuda?.description ?? "", ayuda?.example ?? ""].map(plano);
}

/**
 * Filtra la paleta por la consulta. Por debajo de `MIN_PALETTE_QUERY` devuelve
 * los grupos tal cual (`filtrando: false`): la paleta sin buscar es la paleta
 * completa, nunca vacía.
 *
 * `help` se inyecta para poder probar el filtro sin depender del catálogo real;
 * por defecto usa el del repo.
 */
export function filtrarPaleta(
  grupos: readonly NotationPaletteGroup[],
  query: string,
  help: Record<string, ElementHelp> = NOTATION_HELP
): PaletteFilterResult {
  const q = plano((query ?? "").trim());
  const todos = grupos.map((g) => ({ label: g.label, types: [...g.types] }));
  if (q.length < MIN_PALETTE_QUERY) {
    return {
      grupos: todos,
      total: todos.reduce((n, g) => n + g.types.length, 0),
      filtrando: false,
    };
  }
  const filtrados: NotationPaletteGroup[] = [];
  let total = 0;
  for (const grupo of grupos) {
    const types = grupo.types.filter((t) =>
      camposDe(t, grupo.label, help).some((campo) => campo.includes(q))
    );
    if (types.length === 0) continue;
    filtrados.push({ label: grupo.label, types });
    total += types.length;
  }
  return { grupos: filtrados, total, filtrando: true };
}
