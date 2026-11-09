/**
 * @fileOverview Consultas sobre el conocimiento (spec 027) — PURO.
 *
 * F2 trae `explicar` (FR-029): el «¿por qué?» de un hecho deducido, como árbol
 * de justificación que baja hasta lo que alguien dibujó. F3 suma acá las
 * consultas por patrón y los caminos.
 */

import type { TripleStore } from "./store";
import type { Origen, ReglaId, Tripleta } from "./types";

export interface Explicacion {
  hecho: Tripleta;
  origen: Origen;
  regla?: ReglaId;
  /** Axioma del reglamento que se aplicó, en texto. */
  axioma?: string;
  /** Ronda en que se dedujo (0 = explícito). */
  ronda?: number;
  /** Premisas, de la ronda más temprana a la más tardía (US3-AC2). */
  premisas: Explicacion[];
}

/**
 * Árbol de justificación de un hecho; undefined si el hecho no está en el grafo.
 *
 * Termina siempre: el razonador sólo guarda la PRIMERA derivación de cada hecho
 * y sus premisas ya estaban en el store, así que el árbol es acíclico. Igual se
 * corta un ciclo por si alguien arma un store a mano (defensa barata).
 */
export function explicar(k: { store: TripleStore }, hecho: Tripleta): Explicacion | undefined {
  const memo = new Map<string, Explicacion>();
  const armar = (t: Tripleta, camino: Set<string>): Explicacion | undefined => {
    const clave = t.join(" ");
    const hecho = memo.get(clave);
    if (hecho) return hecho;
    const h = k.store.match(t[0], t[1], t[2])[0];
    if (!h) return undefined;
    const j = h.origen === "deducido" ? k.store.justificacion(t) : undefined;
    if (!j || camino.has(clave)) return { hecho: t, origen: h.origen, ronda: 0, premisas: [] };
    const sig = new Set(camino).add(clave);
    const premisas = j.premisas
      .map((p) => armar(p, sig))
      .filter((p): p is Explicacion => !!p)
      .sort((a, b) => (a.ronda ?? 0) - (b.ronda ?? 0));
    const e: Explicacion = { hecho: t, origen: h.origen, regla: j.regla, ronda: j.ronda, premisas };
    if (j.axioma) e.axioma = j.axioma;
    memo.set(clave, e);
    return e;
  };
  return armar(hecho, new Set());
}

/** Las hojas del árbol: los hechos de partida (sin repetir). */
export function hojasDe(e: Explicacion): Explicacion[] {
  const out = new Map<string, Explicacion>();
  const visitar = (x: Explicacion) => {
    if (!x.premisas.length) out.set(x.hecho.join(" "), x);
    else x.premisas.forEach(visitar);
  };
  visitar(e);
  return [...out.values()];
}
