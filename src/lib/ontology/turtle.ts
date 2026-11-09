/**
 * @fileOverview El conocimiento en Turtle (spec 027 · T31, FR-040/042) — PURO.
 *
 * IRIs completas entre `<…>` para lo propio (`pf:`, `kb:`): sus nombres locales
 * llevan barras (`ddd/comando`, `pedidos/v-es/pagar`), que un nombre con
 * prefijo de Turtle no admite sin escapar. Los vocabularios estándar van con
 * prefijo. Los literales salen con escape JSON, que es un subconjunto válido
 * del de Turtle.
 *
 * Turtle no tiene grafos nombrados: lo deducido va en un SEGUNDO bloque,
 * después de un encabezado que lo declara (decisión del plan, R-08). Quien
 * necesite separarlo por máquina usa el JSON-LD, donde es un grafo nombrado.
 */

import type { Conocimiento } from "./conocimiento";
import { PREFIJOS, RDF_TYPE, esLiteral, expandir } from "./iri";
import { tripletasExport, type OpcionesExport } from "./rdf";
import type { Tripleta } from "./types";

const ESTANDAR = ["rdf", "rdfs", "owl", "schema"] as const;

function termino(t: string): string {
  if (esLiteral(t)) return t;
  if (t === RDF_TYPE) return "a";
  const pre = t.slice(0, t.indexOf(":"));
  if ((ESTANDAR as readonly string[]).includes(pre) && /^[a-z]+:[A-Za-z][A-Za-z0-9_]*$/.test(t)) return t;
  return `<${expandir(t)}>`;
}

/** Tripletas agrupadas por sujeto: `s p o ; p o .` */
function bloque(ts: Tripleta[]): string {
  const porSujeto = new Map<string, Tripleta[]>();
  for (const t of ts) porSujeto.set(t[0], [...(porSujeto.get(t[0]) ?? []), t]);
  return [...porSujeto.entries()]
    .map(([s, xs]) => `${termino(s)}\n${xs.map(([, p, o]) => `    ${termino(p)} ${termino(o)}`).join(" ;\n")} .`)
    .join("\n\n");
}

export function aTurtle(k: Conocimiento, opts: OpcionesExport = { deducidos: false }): string {
  const x = tripletasExport(k, opts);
  const cabeza = ESTANDAR.map((p) => `@prefix ${p}: <${PREFIJOS[p]}> .`).join("\n");
  const partes = [
    `# Conocimiento exportado por Processflow Architect: reglamento + lo dibujado.`,
    cabeza,
    bloque(x.afirmadas),
  ];
  if (opts.deducidos && x.deducidas.length)
    partes.push(
      `# ── Deducidos por el razonador (${x.deducidas.length}) ──────────────────────\n` +
        `# No los dibujó nadie: se siguen de lo de arriba y del reglamento. En JSON-LD\n` +
        `# van en el grafo nombrado <${expandir(x.grafoDeducidos)}>.`,
      bloque(x.deducidas)
    );
  return partes.join("\n\n") + "\n";
}
