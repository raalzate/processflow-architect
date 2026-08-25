/**
 * @fileOverview Fusión de los METADATOS DE PROYECTO al recibir una vista.
 *
 * `export_to_app` reemplaza el proyecto entero y sus notas/hotspots/responsables
 * viajan con él. `export_as_view` no: entrega una PESTAÑA, y una vista no tiene
 * dónde guardar esos campos —son del proyecto—, así que las ambigüedades que el
 * agente registró se quedaban en el chat. Justo el punto donde el arnés pierde
 * su razón de ser: lo declarado-no-inventado no llegaba al humano.
 *
 * Acá se decide qué se suma al proyecto activo. PURO: sin React ni Electron.
 */

import type { GraphData } from "../types";
import { mergeNotas } from "./diagram-builder";

/** Qué se sumó de verdad al proyecto (para decírselo al humano en el aviso). */
export interface MetaAgregada {
  hotspots: string[];
  responsables: string[];
  /** true si las notas del proyecto cambiaron. */
  notas: boolean;
}

export interface MergeProyectoResult {
  graph: GraphData;
  agregado: MetaAgregada;
  /** false → nada que guardar; no vale la pena tocar el proyecto. */
  cambio: boolean;
}

/** Lista limpia (sin vacíos ni repetidos), respetando el orden de llegada. */
function limpia(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const x of lista) {
    const t = typeof x === "string" ? x.trim() : "";
    if (!t || vistos.has(t)) continue;
    vistos.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Suma al proyecto los metadatos que trae una vista. NO pisa nada: los hotspots
 * y responsables se agregan sólo si no estaban (comparados por texto exacto), y
 * las notas se anexan con la misma regla que el export (`mergeNotas`), que no
 * duplica un resumen ya pegado ni borra lo que escribió el humano.
 */
export function mergeProjectMeta(project: GraphData, incoming: GraphData): MergeProyectoResult {
  const hotspotsActuales = limpia(project.big_picture?.hotspots);
  const responsablesActuales = limpia(project.responsables);
  const hotspotsNuevos = limpia(incoming.big_picture?.hotspots).filter(
    (h) => !hotspotsActuales.includes(h)
  );
  const responsablesNuevos = limpia(incoming.responsables).filter(
    (r) => !responsablesActuales.includes(r)
  );

  const notasEntrantes = (incoming.notas ?? "").trim();
  const notasActuales = project.notas ?? "";
  const notasFinales = notasEntrantes ? mergeNotas(notasActuales, notasEntrantes) : notasActuales;
  const notasCambian = notasFinales.trim() !== notasActuales.trim();

  const cambio = hotspotsNuevos.length > 0 || responsablesNuevos.length > 0 || notasCambian;
  if (!cambio) {
    return { graph: project, agregado: { hotspots: [], responsables: [], notas: false }, cambio };
  }

  return {
    graph: {
      ...project,
      big_picture: {
        ...project.big_picture,
        hotspots: [...hotspotsActuales, ...hotspotsNuevos],
      },
      responsables: [...responsablesActuales, ...responsablesNuevos],
      notas: notasFinales,
    },
    agregado: {
      hotspots: hotspotsNuevos,
      responsables: responsablesNuevos,
      notas: notasCambian,
    },
    cambio,
  };
}

/** Frase corta para el aviso de la app («2 hotspots · 1 responsable · notas»). */
export function describeMetaAgregada(a: MetaAgregada): string {
  const partes: string[] = [];
  if (a.hotspots.length) partes.push(`${a.hotspots.length} hotspot${a.hotspots.length > 1 ? "s" : ""}`);
  if (a.responsables.length)
    partes.push(`${a.responsables.length} responsable${a.responsables.length > 1 ? "s" : ""}`);
  if (a.notas) partes.push("notas");
  return partes.join(" · ");
}
