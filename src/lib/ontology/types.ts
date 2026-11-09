/**
 * @fileOverview Tipos de la ontología del modelo (spec 027) — PURO.
 *
 * Un HECHO es una tripleta sujeto · predicado · objeto. Los términos son IRIs
 * compactas (`kb:p1/v1/n7`, `pf:dispara`) o literales (`"texto"`, ver
 * `iri.ts`). Imports relativos a propósito: este módulo lo consume también el
 * proceso main (herramientas MCP), que no resuelve el alias `@/`.
 */

/** IRI compacta (`kb:…`, `pf:…`, `rdf:…`) o literal entre comillas. */
export type Termino = string;

/** De dónde sale un hecho: lo dibujó alguien, lo dedujo el razonador o lo propuso la IA. */
export type Origen = "explicito" | "deducido" | "propuesto";

/** Quién puso el hecho y con qué respaldo (US8: la IA propone, el humano acepta). */
export interface Procedencia {
  por: "humano" | "ia" | "mcp";
  fuente?: string;
  aceptadoPor?: string;
  fecha?: string;
}

export interface Hecho {
  s: Termino;
  p: Termino;
  o: Termino;
  origen: Origen;
  /** Vista de la que sale el hecho explícito. */
  vista?: string;
  /**
   * true → el predicado de la arista se PROPUSO en memoria y nadie lo confirmó
   * (FR-013): se razona con él, pero la ficha lo muestra como propuesta.
   */
  sugerido?: boolean;
  procedencia?: Procedencia;
}

/** Las reglas del razonador (perfil de R-04). */
export type ReglaId =
  | "subclase"
  | "dominio"
  | "rango"
  | "inversa"
  | "transitiva"
  | "simetrica"
  | "subpropiedad"
  | "equivalencia";

export type Tripleta = [Termino, Termino, Termino];

/** Por qué existe un hecho deducido: regla, premisas y ronda (FR-016). */
export interface Justificacion {
  regla: ReglaId;
  /** Hechos del grafo de los que sale (los explícitos o deducidos antes). */
  premisas: Tripleta[];
  ronda: number;
  /**
   * El axioma del reglamento que se aplicó («pf:dispara ⊑ pf:provoca»). La TBox
   * no vive en el store, así que no es una premisa navegable: se cita en texto.
   */
  axioma?: string;
}

/** Un hallazgo de la ontología: compatible con `QualityFinding` (level/rule/message). */
export interface Hallazgo {
  forma: string;
  severidad: "error" | "aviso" | "sugerencia";
  nodo?: string;
  vista?: string;
  esperado?: number | string;
  encontrado?: number | string;
  mensaje: string;
  sugerencia?: string;
}
