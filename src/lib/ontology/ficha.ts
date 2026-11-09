/**
 * @fileOverview Lo deducido de un elemento, en palabras (spec 027 · T18) — PURO.
 *
 * La pestaña «Conocimiento» de la ficha muestra lo que el razonador dedujo de
 * una caja y, a pedido, por qué. Nada de esto se dibuja en el lienzo ni se
 * guarda (FR-017): se recalcula del conocimiento cada vez. Acá vive la lectura
 * legible —nombres en lugar de IRIs, etiquetas de predicado y de clase— para
 * que el componente sólo pinte.
 */

import type { Conocimiento } from "./conocimiento";
import { RDFS_LABEL, RDF_TYPE, esLiteral, idDePredicado, valorLiteral } from "./iri";
import { explicar, type Explicacion } from "./query";
import { predicadoDe, tboxDe } from "./tbox";
import type { ReglaId, Termino, Tripleta } from "./types";

export interface FilaDeducida {
  tripleta: Tripleta;
  tipo: "clase" | "relacion";
  texto: string;
}

export interface LineaExplicacion {
  nivel: number;
  texto: string;
  regla?: ReglaId;
  axioma?: string;
  /** Hecho de partida: alguien lo dibujó. */
  dibujado: boolean;
}

function nombreDe(k: Conocimiento, t: Termino): string {
  if (esLiteral(t)) return valorLiteral(t);
  const l = k.store.match(t, RDFS_LABEL)[0];
  if (l) return valorLiteral(l.o);
  // Una clase o un predicado del reglamento: su etiqueta en cualquiera de las notaciones presentes.
  for (const n of k.notaciones) {
    const tb = tboxDe(n);
    const c = tb.clases.find((x) => x.id === t);
    if (c) return c.etiqueta;
    const id = idDePredicado(t);
    const p = id ? predicadoDe(tb, id) : undefined;
    if (p) return p.etiqueta;
  }
  return t;
}

export function textoDeHecho(k: Conocimiento, [s, p, o]: Tripleta): string {
  return p === RDF_TYPE ? `${nombreDe(k, s)} es ${nombreDe(k, o)}` : `${nombreDe(k, s)} — ${nombreDe(k, p)} → ${nombreDe(k, o)}`;
}

/** Hechos deducidos en que participa el elemento: primero sus clases, después sus relaciones. */
export function deducidosDe(k: Conocimiento, iri: Termino): FilaDeducida[] {
  const propios = [...k.store.match(iri), ...k.store.match(undefined, undefined, iri)].filter(
    (h) => h.origen === "deducido"
  );
  const filas = propios.map(
    (h): FilaDeducida => ({
      tripleta: [h.s, h.p, h.o],
      tipo: h.p === RDF_TYPE ? "clase" : "relacion",
      texto: textoDeHecho(k, [h.s, h.p, h.o]),
    })
  );
  return [...filas.filter((f) => f.tipo === "clase"), ...filas.filter((f) => f.tipo === "relacion")];
}

/** El árbol de «¿por qué?» aplanado en viñetas con sangría; undefined si el hecho no está. */
export function explicacionLegible(k: Conocimiento, t: Tripleta): LineaExplicacion[] | undefined {
  const e = explicar(k, t);
  if (!e) return undefined;
  const out: LineaExplicacion[] = [];
  const visitar = (x: Explicacion, nivel: number) => {
    const l: LineaExplicacion = { nivel, texto: textoDeHecho(k, x.hecho), dibujado: x.origen === "explicito" };
    if (x.regla) l.regla = x.regla;
    if (x.axioma) l.axioma = x.axioma;
    out.push(l);
    for (const p of x.premisas) visitar(p, nivel + 1);
  };
  visitar(e, 0);
  return out;
}
