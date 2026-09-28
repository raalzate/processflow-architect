/**
 * @fileOverview Archivo del TABLERO: proyecto + todas sus vistas (PURO).
 *
 * El `.json` que exporta la app llevaba SÓLO el `GraphData` de la vista built-in
 * «Modelo»; las vistas custom (las tabs) viven aparte en `ViewsContext` y nunca
 * viajaban en el archivo (#428). Al exportar e importar se perdían todas las
 * vistas salvo el Modelo.
 *
 * Este módulo define el formato del tablero completo y su ida y vuelta:
 *  - `packBoard` arma el objeto exportable (proyecto + vistas).
 *  - `parseBoardFile` lo lee, y —clave— sigue aceptando el formato VIEJO (un
 *    `GraphData` plano de una sola vista) para no romper los archivos ya
 *    exportados: en ese caso devuelve el catálogo de vistas vacío.
 *
 * Es puro (sin React, sin Electron, sin localStorage): la orquestación
 * —de dónde salen las vistas al exportar y a dónde van al importar— vive en
 * `ViewsContext`/`useFileHandlers`. Acá sólo se decide la FORMA del archivo.
 */

import type { GraphData } from "./types";
import { validateGraphData } from "./import-diagram";
import { emptyPersistedViews, type DesignView, type PersistedViews } from "./views-types";

/** Marca de formato del archivo del tablero. Versionada para poder migrar. */
export const BOARD_FORMAT = "processflow-board/v1";

/** El archivo del tablero completo: el proyecto (vista Modelo) y sus vistas. */
export interface BoardFile {
  formato: string;
  proyecto: GraphData;
  vistas: PersistedViews;
}

/** Resultado de leer un archivo importado, venga en formato tablero o viejo. */
export interface ParsedBoard {
  /** Nombre propuesto para el proyecto. */
  name: string;
  /** GraphData de la vista «Modelo». */
  content: GraphData;
  /** Vistas custom + estado de la tira. Vacío si el archivo era del formato viejo. */
  vistas: PersistedViews;
}

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const soloStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];

/**
 * Sanea el catálogo de vistas que llega de afuera (archivo, otro proyecto). Es
 * lenient a propósito: descarta lo que no tiene forma de vista en vez de rechazar
 * el archivo entero, igual que hace `sanitizeSpec` con las specs. Una vista mínima
 * necesita `id` y `name`; el resto de campos viajan tal cual.
 */
export function sanitizeViews(raw: unknown): PersistedViews {
  if (!esObjeto(raw)) return emptyPersistedViews();
  const customViews = (Array.isArray(raw.customViews) ? raw.customViews : [])
    .filter(esObjeto)
    .filter((v) => typeof v.id === "string" && v.id && typeof v.name === "string")
    .map((v) => v as unknown as DesignView);
  const activeViewId = typeof raw.activeViewId === "string" && raw.activeViewId ? raw.activeViewId : "design";
  return {
    customViews,
    activeViewId,
    injectedViewIds: soloStrings(raw.injectedViewIds),
    openViewIds: soloStrings(raw.openViewIds),
  };
}

/** Empaqueta el tablero completo para exportar: proyecto + vistas saneadas. */
export function packBoard(proyecto: GraphData, vistas: PersistedViews): BoardFile {
  return { formato: BOARD_FORMAT, proyecto, vistas: sanitizeViews(vistas) };
}

/** ¿El objeto parseado es un archivo de tablero (y no un GraphData plano)? */
function esTablero(data: unknown): data is Record<string, unknown> {
  return esObjeto(data) && typeof data.formato === "string" && esObjeto(data.proyecto);
}

/**
 * Lee un archivo importado. Acepta el formato TABLERO (proyecto + vistas) y, por
 * compatibilidad, un `GraphData` plano de una sola vista (los `.json` exportados
 * antes de #428): ahí las vistas vuelven vacías. Valida el proyecto con la misma
 * regla que `parseDiagramJson`.
 * @throws Error en español si no es JSON o el proyecto no parece un diagrama.
 */
export function parseBoardFile(raw: string, fileName = ""): ParsedBoard {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  if (esTablero(data)) {
    const { name, content } = validateGraphData(data.proyecto, fileName);
    return { name, content, vistas: sanitizeViews(data.vistas) };
  }
  // Formato viejo: un GraphData plano (una sola vista).
  const { name, content } = validateGraphData(data, fileName);
  return { name, content, vistas: emptyPersistedViews() };
}
