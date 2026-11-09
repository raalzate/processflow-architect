/**
 * @fileOverview El conocimiento en JSON-LD (spec 027 · T31, FR-040/041/042) — PURO.
 *
 * `@context` INLINE (sin red: el export se lee offline) y los términos en su
 * forma compacta, que el contexto expande. Lo deducido, con la opción, va en
 * un GRAFO NOMBRADO aparte dentro de `@graph`: así una herramienta RDF lo
 * separa de lo afirmado sin heurísticas (US7-AC2).
 */

import type { Conocimiento } from "./conocimiento";
import { PREFIJOS, RDF_TYPE, esLiteral, valorLiteral } from "./iri";
import { tripletasExport, type OpcionesExport } from "./rdf";
import type { Tripleta } from "./types";

type Valor = { "@id": string } | string;
type Nodo = { "@id": string; "@type"?: string[] } & Record<string, unknown>;

export const CONTEXTO_JSONLD: Record<string, string> = Object.fromEntries(
  (["pf", "kb", "rdf", "rdfs", "owl", "schema"] as const).map((p) => [p, PREFIJOS[p]])
);

function nodos(ts: Tripleta[]): Nodo[] {
  const porSujeto = new Map<string, Nodo>();
  for (const [s, p, o] of ts) {
    let n = porSujeto.get(s);
    if (!n) porSujeto.set(s, (n = { "@id": s }));
    if (p === RDF_TYPE && !esLiteral(o)) {
      (n["@type"] ??= []).push(o);
      continue;
    }
    const v: Valor = esLiteral(o) ? valorLiteral(o) : { "@id": o };
    const lista = (n[p] as Valor[] | undefined) ?? [];
    lista.push(v);
    n[p] = lista;
  }
  return [...porSujeto.values()];
}

export function aJsonLd(k: Conocimiento, opts: OpcionesExport = { deducidos: false }): string {
  const x = tripletasExport(k, opts);
  const grafo: unknown[] = nodos(x.afirmadas);
  if (opts.deducidos && x.deducidas.length) grafo.push({ "@id": x.grafoDeducidos, "@graph": nodos(x.deducidas) });
  return JSON.stringify({ "@context": CONTEXTO_JSONLD, "@graph": grafo }, null, 2);
}
