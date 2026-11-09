/**
 * @fileOverview Lo que se exporta del conocimiento (spec 027 · US7, FR-040/041) — PURO.
 *
 * El export lleva el REGLAMENTO (clases, predicados con sus propiedades
 * lógicas, disjunciones y la alineación con schema.org) y el GRAFO del proyecto
 * (lo dibujado). Lo deducido va aparte y sólo si se pide: quien lo lea tiene
 * que poder distinguir lo que alguien afirmó de lo que se sigue de ello.
 * `jsonld.ts` y `turtle.ts` sólo cambian la sintaxis: las tripletas salen de acá.
 */

import type { ElementRole } from "../notations";
import type { Conocimiento } from "./conocimiento";
import { RDFS_LABEL, RDF_TYPE, iriPredicado, iriRol, literal } from "./iri";
import { iriDeTermino, tboxDe } from "./tbox";
import type { Termino, Tripleta } from "./types";

export const OWL_CLASS = "owl:Class";
export const OWL_OBJECT_PROPERTY = "owl:ObjectProperty";

/**
 * Alineación con vocabularios públicos (R-03, FR-041), declarada SÓLO en el
 * export con `owl:equivalentClass`. El Contexto no se alinea: es una frontera
 * lógica, no una organización.
 */
export const ALINEACION_PUBLICA: Partial<Record<ElementRole, string>> = {
  actor: "schema:Person",
  external: "schema:SoftwareApplication",
  system: "schema:SoftwareApplication",
  datastore: "schema:Dataset",
};
export const DOCUMENTO_PUBLICO = "schema:DigitalDocument";

export interface OpcionesExport {
  deducidos: boolean;
}

export interface TripletasExport {
  /** Reglamento + lo dibujado: lo que el proyecto AFIRMA. */
  afirmadas: Tripleta[];
  /** Lo que dedujo el razonador (vacío sin la opción). */
  deducidas: Tripleta[];
  /** IRI compacta del grafo nombrado de lo deducido. */
  grafoDeducidos: Termino;
}

const unicas = (ts: Tripleta[]): Tripleta[] => {
  const vistas = new Set<string>();
  return ts.filter((t) => {
    const k = t.join(" ");
    return vistas.has(k) ? false : (vistas.add(k), true);
  });
};

/** El reglamento de las notaciones presentes, como tripletas OWL/RDFS. */
function tripletasTbox(k: Conocimiento): Tripleta[] {
  const out: Tripleta[] = [];
  for (const n of k.notaciones) {
    const t = tboxDe(n);
    for (const c of t.clases) {
      out.push([c.id, RDF_TYPE, OWL_CLASS], [c.id, RDFS_LABEL, literal(c.etiqueta)]);
      for (const p of c.padres) out.push([c.id, "rdfs:subClassOf", p]);
    }
    for (const p of t.predicados) {
      const iri = iriPredicado(p.id);
      out.push([iri, RDF_TYPE, OWL_OBJECT_PROPERTY], [iri, RDFS_LABEL, literal(p.etiqueta)]);
      // Dominio y rango sólo con UNA clase: con varias, OWL leería la intersección (ver reasoner.ts).
      if (p.dominio?.length === 1) out.push([iri, "rdfs:domain", iriDeTermino(p.dominio[0])]);
      if (p.rango?.length === 1) out.push([iri, "rdfs:range", iriDeTermino(p.rango[0])]);
      if (p.inversa) out.push([iri, "owl:inverseOf", iriPredicado(p.inversa)]);
      if (p.transitiva) out.push([iri, RDF_TYPE, "owl:TransitiveProperty"]);
      if (p.simetrica) out.push([iri, RDF_TYPE, "owl:SymmetricProperty"]);
      if (p.funcional) out.push([iri, RDF_TYPE, "owl:FunctionalProperty"]);
      for (const s of p.subDe ?? []) out.push([iri, "rdfs:subPropertyOf", iriPredicado(s)]);
    }
    for (const [a, b] of t.disjuntas) out.push([a, "owl:disjointWith", b]);
    const roles = new Set(t.clases.map((c) => c.id));
    for (const [rol, publico] of Object.entries(ALINEACION_PUBLICA))
      if (roles.has(iriRol(rol as ElementRole))) out.push([iriRol(rol as ElementRole), "owl:equivalentClass", publico]);
  }
  return out;
}

/** Los documentos fuente de cada vista, como `schema:DigitalDocument` (FR-041). */
function tripletasDocumentos(k: Conocimiento): Tripleta[] {
  const out: Tripleta[] = [];
  for (const v of k.vistas)
    for (const d of v.documentos) {
      const iri = `kb:${encodeURIComponent(v.proyecto)}/${encodeURIComponent(v.vista)}/doc/${encodeURIComponent(d.nombre)}`;
      out.push([iri, RDF_TYPE, DOCUMENTO_PUBLICO], [iri, RDFS_LABEL, literal(d.nombre)]);
    }
  return out;
}

export function tripletasExport(k: Conocimiento, opts: OpcionesExport): TripletasExport {
  const hechos = k.store.match();
  const dibujado = hechos.filter((h) => h.origen !== "deducido").map((h): Tripleta => [h.s, h.p, h.o]);
  const deducidas = opts.deducidos ? hechos.filter((h) => h.origen === "deducido").map((h): Tripleta => [h.s, h.p, h.o]) : [];
  const proyecto = k.elementos[0]?.proyecto ?? "actual";
  return {
    afirmadas: unicas([...tripletasTbox(k), ...tripletasDocumentos(k), ...dibujado]),
    deducidas: unicas(deducidas),
    grafoDeducidos: `kb:${encodeURIComponent(proyecto)}/inferidos`,
  };
}
