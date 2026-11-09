/**
 * @fileOverview Almacén de tripletas indexado (spec 027 · R-09b) — PURO.
 *
 * Tres índices (SPO, POS, OSP) para que cualquier patrón con huecos se responda
 * sin recorrer todo: el razonador hace miles de `match` por ronda en un proyecto
 * grande, y un `filter` sobre la lista entera es lo que rompe los 500 ms de
 * SC-003. Los términos se internan como enteros: el índice compara números, no
 * cadenas largas como `kb:proyecto/vista/nodo`.
 */

import type { Hecho, Justificacion, Termino, Tripleta } from "./types";

export interface TripleStore {
  /** Agrega el hecho; `false` si ya existía (el primero manda: un explícito no se vuelve deducido). */
  add(h: Hecho, j?: Justificacion): boolean;
  /** Hechos que encajan con el patrón; `undefined` = hueco. */
  match(s?: Termino, p?: Termino, o?: Termino): Hecho[];
  has(t: Tripleta): boolean;
  justificacion(t: Tripleta): Justificacion | undefined;
  readonly size: number;
}

type Indice = Map<number, Map<number, Set<number>>>;

function poner(ix: Indice, a: number, b: number, c: number): void {
  let nivel = ix.get(a);
  if (!nivel) ix.set(a, (nivel = new Map()));
  let hoja = nivel.get(b);
  if (!hoja) nivel.set(b, (hoja = new Set()));
  hoja.add(c);
}

export function crearStore(): TripleStore {
  const ids = new Map<Termino, number>();
  const terminos: Termino[] = [];
  const interna = (t: Termino): number => {
    let n = ids.get(t);
    if (n === undefined) {
      n = terminos.length;
      terminos.push(t);
      ids.set(t, n);
    }
    return n;
  };

  const spo: Indice = new Map();
  const pos: Indice = new Map();
  const osp: Indice = new Map();
  const hechos = new Map<string, Hecho>();
  const justificaciones = new Map<string, Justificacion>();
  const clave = (s: number, p: number, o: number) => `${s} ${p} ${o}`;

  const hecho = (s: number, p: number, o: number): Hecho => hechos.get(clave(s, p, o))!;

  return {
    add(h, j) {
      const s = interna(h.s);
      const p = interna(h.p);
      const o = interna(h.o);
      const k = clave(s, p, o);
      if (hechos.has(k)) return false;
      hechos.set(k, h);
      if (j) justificaciones.set(k, j);
      poner(spo, s, p, o);
      poner(pos, p, o, s);
      poner(osp, o, s, p);
      return true;
    },

    match(s, p, o) {
      // Un término que el store nunca vio no puede encajar: respuesta vacía, sin recorrer.
      const si = s === undefined ? undefined : ids.get(s);
      const pi = p === undefined ? undefined : ids.get(p);
      const oi = o === undefined ? undefined : ids.get(o);
      if ((s !== undefined && si === undefined) || (p !== undefined && pi === undefined) || (o !== undefined && oi === undefined))
        return [];
      const out: Hecho[] = [];

      if (si !== undefined) {
        const porP = spo.get(si);
        if (!porP) return out;
        if (pi !== undefined) {
          const os = porP.get(pi);
          if (!os) return out;
          if (oi !== undefined) return os.has(oi) ? [hecho(si, pi, oi)] : out;
          for (const x of os) out.push(hecho(si, pi, x));
          return out;
        }
        if (oi !== undefined) {
          const ps = osp.get(oi)?.get(si);
          if (ps) for (const x of ps) out.push(hecho(si, x, oi));
          return out;
        }
        for (const [x, os] of porP) for (const y of os) out.push(hecho(si, x, y));
        return out;
      }
      if (pi !== undefined) {
        const porO = pos.get(pi);
        if (!porO) return out;
        if (oi !== undefined) {
          const ss = porO.get(oi);
          if (ss) for (const x of ss) out.push(hecho(x, pi, oi));
          return out;
        }
        for (const [y, ss] of porO) for (const x of ss) out.push(hecho(x, pi, y));
        return out;
      }
      if (oi !== undefined) {
        const porS = osp.get(oi);
        if (porS) for (const [x, ps] of porS) for (const y of ps) out.push(hecho(x, y, oi));
        return out;
      }
      return [...hechos.values()];
    },

    has([s, p, o]) {
      const si = ids.get(s);
      const pi = ids.get(p);
      const oi = ids.get(o);
      return si !== undefined && pi !== undefined && oi !== undefined && hechos.has(clave(si, pi, oi));
    },

    justificacion([s, p, o]) {
      const si = ids.get(s);
      const pi = ids.get(p);
      const oi = ids.get(o);
      if (si === undefined || pi === undefined || oi === undefined) return undefined;
      return justificaciones.get(clave(si, pi, oi));
    },

    get size() {
      return hechos.size;
    },
  };
}
