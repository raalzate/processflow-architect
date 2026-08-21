/**
 * @fileOverview Renombrar el proyecto activo (PURO).
 *
 * El nombre del proyecto se leía en la cabecera y sólo se editaba en «Metadatos
 * del proyecto», dentro del lienzo: el menú Proyecto ofrecía «Eliminar» pero no
 * «Renombrar» (issue #127). Renombrar toca DOS cosas que tienen que moverse
 * juntas —`content.nombre_proyecto` (lo que muestra el selector) y `name` (el
 * archivo que se descarga)— y ninguna otra: version, notas y el resto de los
 * metadatos del documento se conservan. Eso es lo que decide este módulo.
 */
import type { SavedFile } from "./types";

/** Tope del nombre: entra en el selector de la cabecera sin volverse ilegible. */
export const PROJECT_NAME_MAX = 120;

export type ProjectNameResult =
  | { ok: true; nombre: string }
  | { ok: false; motivo: string };

/**
 * Nombre válido para un proyecto: sin bordes en blanco, no vacío y acotado. El
 * motivo se muestra tal cual al usuario, así que dice qué falta y cuál es el tope.
 */
export function normalizeProjectName(raw: string | undefined | null): ProjectNameResult {
  const nombre = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, motivo: "El nombre del proyecto no puede quedar vacío." };
  if (nombre.length > PROJECT_NAME_MAX)
    return {
      ok: false,
      motivo: `El nombre no puede pasar de ${PROJECT_NAME_MAX} caracteres (tiene ${nombre.length}).`,
    };
  return { ok: true, nombre };
}

/** Nombre de archivo del proyecto: lo que se descarga y lo que dice el toast. */
export function projectFileName(nombre: string): string {
  return `${nombre}.json`;
}

/**
 * Aplica el nombre nuevo al proyecto guardado. Devuelve el MISMO objeto si el
 * nombre no cambia (así el estado no se reescribe por un renombrado a lo mismo)
 * y `null` si el nombre no es válido: quién llama decide cómo avisar.
 */
export function renameSavedFile(file: SavedFile, raw: string): SavedFile | null {
  const res = normalizeProjectName(raw);
  if (!res.ok) return null;
  if (file.content.nombre_proyecto === res.nombre) return file;
  return {
    ...file,
    name: projectFileName(res.nombre),
    content: { ...file.content, nombre_proyecto: res.nombre },
  };
}
