/**
 * @fileOverview Identificadores estables de la ontología (spec 027 · R-06) — PURO.
 *
 * La identidad de un elemento es su id —no su nombre ni su posición— para que
 * renombrar o mover una caja no la convierta en otra (FR-009). Los términos se
 * manejan COMPACTOS (`kb:p1/v1/n7`) porque son claves de índice y se imprimen
 * a la IA; `expandir` los lleva a IRI completa sólo al exportar.
 */

import type { ClaseGeneral, ElementRole, NotationId } from "../notations";
import { deRegistro } from "../registro";
import type { Termino } from "./types";

/** Vocabulario propio (TBox): clases, roles, tipos y predicados. */
export const PF = "https://processflow.app/ontology#";
/** Base de los individuos (ABox): elementos de un proyecto. */
export const KB = "https://processflow.app/kb/";

/** Prefijos conocidos para expandir términos compactos. */
export const PREFIJOS: Readonly<Record<string, string>> = Object.freeze({
  pf: PF,
  kb: KB,
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#",
  schema: "https://schema.org/",
});

/** Términos del vocabulario estándar que usa el razonador. */
export const RDF_TYPE = "rdf:type";
export const RDFS_LABEL = "rdfs:label";
export const RDFS_SUBCLASS = "rdfs:subClassOf";
/** La clase raíz: todo elemento lo es, aunque su tipo ya no exista (edge case). */
export const ELEMENTO = "pf:Elemento";

/** Slug determinista de un tipo de notación: sin acentos, minúsculas, guiones. */
export function slugTipo(tipo: string): string {
  return (
    tipo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tipo"
  );
}

/** Un segmento de IRI seguro: lo que no es URL-safe se escapa (la barra también). */
const segmento = (s: string): string => encodeURIComponent(s);

export const iriElemento = (proyecto: string, vista: string, nodo: string): Termino =>
  `kb:${segmento(proyecto)}/${segmento(vista)}/${segmento(nodo)}`;

export const iriTipo = (notation: NotationId, tipo: string): Termino => `pf:${notation}/${slugTipo(tipo)}`;
export const iriRol = (rol: ElementRole): Termino => `pf:rol/${rol}`;
export const iriGeneral = (g: ClaseGeneral): Termino => `pf:${g}`;
export const iriPredicado = (id: string): Termino => `pf:${id}`;

/** Id del predicado detrás de su IRI (`pf:dispara` → `dispara`); undefined si no es uno. */
export const idDePredicado = (t: Termino): string | undefined =>
  /^pf:[a-z][a-z0-9_]*$/.test(t) ? t.slice(3) : undefined;

/** Literal: el texto va entre comillas JSON, así nunca se confunde con un IRI. */
export const literal = (texto: string): Termino => JSON.stringify(texto);
export const esLiteral = (t: Termino): boolean => t.startsWith('"');
export const valorLiteral = (t: Termino): string => {
  try {
    return JSON.parse(t) as string;
  } catch {
    return t;
  }
};

/** IRI completa de un término compacto (los ya completos y los literales pasan igual). */
export function expandir(t: Termino): string {
  if (esLiteral(t)) return t;
  const i = t.indexOf(":");
  if (i <= 0) return t;
  // El prefijo viene de afuera (un término que mandó el agente): `"toString:x"`
  // no puede resolverse a una función (#282).
  const base = deRegistro(PREFIJOS, t.slice(0, i));
  return base ? base + t.slice(i + 1) : t;
}
