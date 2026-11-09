/**
 * @fileOverview GraphRAG local: el subgrafo del foco para la IA (spec 027 · T24, R-10) — PURO.
 *
 * El motor local tiene una ventana chica (4 096 tokens): mandarle el proyecto
 * entero no entra y, peor, lo que importa queda enterrado. Acá se parte de los
 * elementos que la pregunta nombra (el FOCO, que encuentra `searchModel` por
 * texto) y se recorre el grafo a k=2 saltos en ambas direcciones, sobre lo
 * dibujado y lo deducido (FR-033). Las filas van por cercanía al foco y,
 * dentro de cada distancia, lo dibujado antes que lo deducido; se cortan al
 * llegar al presupuesto, así que lo que se pierde es siempre lo más lejano
 * (US5-AC3).
 *
 * Los deducidos que sólo resumen una cadena (transitiva, subpropiedad) entran
 * después de todo lo demás de su distancia: dicen la conclusión, pero la
 * cadena ya está en las filas anteriores.
 */

import { encodeToon } from "../ai/graph-toon";
import type { Conocimiento } from "./conocimiento";
import { RDFS_LABEL, RDF_TYPE, esLiteral, idDePredicado, valorLiteral } from "./iri";
import type { Hecho, Termino } from "./types";
import { plana } from "./validate";

/** El mismo tope que el transcript: la prosa y el grafo compiten por la ventana. */
export const PRESUPUESTO_CONTEXTO = 1500;
export const SALTOS_CONTEXTO = 2;

export const LEYENDA_CONOCIMIENTO =
  "`hechos` son tripletas sujeto·predicado·objeto del grafo de conocimiento: `origen` d = dibujado, i = deducido por el razonador. Si una relación no aparece, el modelo NO la conoce (mundo abierto): no la inventes.";

const esRelacion = (h: Hecho) => h.p !== RDF_TYPE && h.p !== RDFS_LABEL && !esLiteral(h.o) && h.o.startsWith("kb:");

export function contextoParaIA(k: Conocimiento, foco: Termino[], presupuesto = PRESUPUESTO_CONTEXTO): string {
  const nombre = (t: Termino) => {
    const l = k.store.match(t, RDFS_LABEL)[0];
    return l ? valorLiteral(l.o) : t;
  };
  const resume = (h: Hecho) => {
    if (h.origen !== "deducido") return false;
    const r = k.store.justificacion([h.s, h.p, h.o])?.regla;
    return r === "transitiva" || r === "subpropiedad";
  };

  // Recorrido por capas: cada hecho queda con la distancia de su extremo más cercano.
  const distancia = new Map<Termino, number>(foco.map((f) => [f, 0]));
  const hechos = new Map<string, { h: Hecho; d: number }>();
  let capa = [...new Set(foco)];
  for (let d = 0; d < SALTOS_CONTEXTO && capa.length; d++) {
    const sig: Termino[] = [];
    for (const x of capa)
      for (const h of [...k.store.match(x), ...k.store.match(undefined, undefined, x)]) {
        if (!esRelacion(h)) continue;
        const clave = `${h.s} ${h.p} ${h.o}`;
        if (!hechos.has(clave)) hechos.set(clave, { h, d });
        // Un atajo entra como fila pero no acerca su otro extremo: si no,
        // «Pagar provoca FacturaEmitida» pondría el final de la cadena a un salto.
        if (resume(h)) continue;
        for (const y of [h.s, h.o])
          if (!distancia.has(y)) distancia.set(y, d + 1), sig.push(y);
      }
    capa = sig;
  }

  const filas = [...hechos.values()]
    .map(({ h, d }) => ({ h, d, orden: d * 3 + (h.origen === "deducido" ? (resume(h) ? 2 : 1) : 0) }))
    .sort((a, b) => a.orden - b.orden)
    .map(({ h }) => ({
      s: nombre(h.s),
      p: idDePredicado(h.p) ?? h.p,
      o: nombre(h.o),
      origen: h.origen === "deducido" ? "i" : "d",
    }));

  const cabeza = {
    foco: foco.map((f) => {
      const clase = k.store
        .match(f, RDF_TYPE)
        .map((h) => h.o)
        .find((c) => c.startsWith("pf:rol/"));
      return { nombre: nombre(f), rol: clase ? clase.slice("pf:rol/".length) : "" };
    }),
  };

  const armar = (n: number) => {
    const cuerpo = n ? encodeToon({ ...cabeza, hechos: filas.slice(0, n) }) : encodeToon(cabeza);
    return n < filas.length ? `${cuerpo}\n… ${filas.length - n} hechos más lejos del foco, fuera del presupuesto` : cuerpo;
  };

  if (!foco.length) return "";
  // Búsqueda binaria de cuántas filas entran: el texto crece con cada una.
  let lo = 0;
  let hi = filas.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (armar(mid).length <= presupuesto) lo = mid;
    else hi = mid - 1;
  }
  return armar(lo);
}

/** Cuántos elementos puede nombrar una pregunta como foco (más, y el subgrafo no entra). */
export const MAX_FOCO = 5;

/**
 * El punto de partida del recorrido: los elementos que la pregunta NOMBRA, por
 * palabra completa y sin acentos ni mayúsculas («¿qué provoca pagar?» → Pagar).
 * Los nombres más largos primero: «Pago Realizado» gana sobre «Pago».
 */
export function focoDeTexto(k: Pick<Conocimiento, "elementos">, texto: string): Termino[] {
  const t = ` ${plana(texto)} `;
  const out: Termino[] = [];
  const candidatos = k.elementos
    .map((e) => ({ iri: e.iri, n: plana(e.nombre) }))
    .filter((e) => e.n.length >= 3)
    .sort((a, b) => b.n.length - a.n.length);
  const tomados: string[] = [];
  for (const e of candidatos) {
    if (out.length >= MAX_FOCO) break;
    // «Pago» no entra si la pregunta lo nombra sólo dentro de «Pago Realizado».
    if (!t.includes(` ${e.n} `) || tomados.some((n) => ` ${n} `.includes(` ${e.n} `))) continue;
    out.push(e.iri);
    tomados.push(e.n);
  }
  return out;
}
