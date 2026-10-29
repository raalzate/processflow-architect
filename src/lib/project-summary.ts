/**
 * @fileOverview Resumen de un proyecto guardado para la galería de una organización (PURO).
 *
 * Elegir una organización en el header dejaba el selector en «Seleccionar proyecto…» y el
 * lienzo mostrando lo de antes: el humano no veía qué había en esa organización sin abrir
 * el desplegable. La galería muestra cada proyecto como una tarjeta, y lo que dice cada
 * tarjeta se decide acá: cuánto hay, de qué tipo y de qué trata, sin abrir el proyecto.
 */

import { getNotation } from "./notations";
import type { SavedFile } from "./types";
import { collectGraphNodes } from "./view-nodes";

/** Largo máximo de la descripción en la tarjeta: más que eso no se lee de un vistazo. */
export const MAX_DESCRIPCION = 180;

/** Cuántos tipos de elemento se nombran en la tarjeta. */
export const MAX_TIPOS = 3;

export interface ResumenProyecto {
  id: string;
  nombre: string;
  fecha: string;
  notacion: string;
  /** De qué trata: la descripción de la big picture o, si falta, las notas. */
  descripcion: string | null;
  elementos: number;
  relaciones: number;
  contenedores: number;
  hotspots: number;
  responsables: string[];
  tiposPrincipales: { tipo: string; cantidad: number }[];
}

function recortar(texto: string | undefined): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  return t.length <= MAX_DESCRIPCION ? t : `${t.slice(0, MAX_DESCRIPCION - 1).trimEnd()}…`;
}

export function resumirProyecto(file: SavedFile): ResumenProyecto {
  // Un archivo de antes, o importado a medias, puede no traer las listas: el resumen
  // no es el lugar donde la galería entera se cae.
  const g = file.content ?? ({} as SavedFile["content"]);
  const nodos = collectGraphNodes(g);
  const agregados = g.agregados ?? [];

  const conteo = new Map<string, number>();
  for (const n of nodos) {
    if (!n.tipo_elemento) continue;
    conteo.set(n.tipo_elemento, (conteo.get(n.tipo_elemento) ?? 0) + 1);
  }
  const tiposPrincipales = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TIPOS)
    .map(([tipo, cantidad]) => ({ tipo, cantidad }));

  const relaciones =
    (g.big_picture?.aristas?.length ?? 0) +
    agregados.reduce((s, a) => s + (a.aristas?.length ?? 0), 0) +
    (g.politicas_inter_agregados?.length ?? 0);

  return {
    id: file.id,
    nombre: g.nombre_proyecto?.trim() || file.name,
    fecha: g.fecha_analisis ?? "",
    notacion: getNotation(g.notation).label,
    descripcion: recortar(g.big_picture?.descripcion) ?? recortar(g.notas),
    elementos: nodos.length,
    relaciones,
    contenedores: agregados.length,
    hotspots: g.big_picture?.hotspots?.length ?? 0,
    responsables: g.responsables ?? [],
    tiposPrincipales,
  };
}

/** Resúmenes de varios proyectos, el analizado más recientemente primero. */
export function resumirProyectos(files: SavedFile[]): ResumenProyecto[] {
  return files.map(resumirProyecto).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
