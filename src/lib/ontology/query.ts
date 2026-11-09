/**
 * @fileOverview Consultas sobre el conocimiento (spec 027) — PURO.
 *
 * Tres preguntas al grafo: «¿por qué?» (`explicar`, FR-029), «¿qué encaja con
 * este patrón?» (`consultar`, FR-027) y «¿cómo se llega de A a B?» (`camino`,
 * FR-028). Las tres leen el store; ninguna le agrega hechos (el conocimiento
 * memorizado se comparte, ver `conocimiento.ts`).
 *
 * La identidad es el IRI, no el nombre: `resolver` traduce lo que escribe una
 * persona o la IA («Pagar», «dispara», «Evento») a TODOS los términos que
 * encajan, con su vista, y nunca elige uno por su cuenta (edge case: nombres
 * duplicados).
 */

import type { PredicadoDecl } from "../notations";
import { enRegistro } from "../registro";
import { ELEMENTO, PREFIJOS, RDFS_LABEL, RDF_TYPE, esLiteral, iriPredicado } from "./iri";
import type { TripleStore } from "./store";
import { tboxDe } from "./tbox";
import type { Hecho, Origen, ReglaId, Termino, Tripleta } from "./types";
import { plana } from "./validate";

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

// ── Consultas por patrón (FR-027) ────────────────────────────────────────────

/** Un término o una variable (`?x`). */
export type TerminoOVar = Termino | `?${string}`;
export type Patron = [TerminoOVar, TerminoOVar, TerminoOVar];

export interface Consulta {
  /** Se combinan por sus variables compartidas (join). */
  patrones: Patron[];
  /**
   * Qué hechos cuentan; por defecto todos. Una flecha con predicado propuesto en
   * memoria es `explicito` (con `sugerido`): la dibujó alguien.
   */
  origen?: Origen[] | "todos";
  /** Tope de filas (por defecto `LIMITE_FILAS`). */
  limite?: number;
}

/** Una respuesta: valor de cada variable, por su nombre sin el «?». */
export type Fila = Record<string, Termino>;

export const LIMITE_FILAS = 200;

const esVar = (t: string): t is `?${string}` => t.startsWith("?") && t.length > 1;

/** El conocimiento mínimo que leen las consultas. */
interface Lectura {
  store: TripleStore;
}

/**
 * Filas que satisfacen TODOS los patrones a la vez, sin repetir. El orden de
 * los patrones no cambia la respuesta: se resuelve primero el más atado (el
 * que tiene menos variables libres con lo ya ligado), que es el que filtra.
 */
export function consultar(k: Lectura, q: Consulta): Fila[] {
  const limite = q.limite ?? LIMITE_FILAS;
  const vale = q.origen && q.origen !== "todos" ? new Set(q.origen) : undefined;
  if (!q.patrones.length || limite <= 0) return [];

  const out: Fila[] = [];
  const vistas = new Set<string>();
  const libres = (pt: Patron, f: Fila) => pt.filter((t) => esVar(t) && !(t.slice(1) in f)).length;

  const buscar = (pendientes: Patron[], fila: Fila): boolean => {
    if (!pendientes.length) {
      const clave = JSON.stringify(Object.entries(fila).sort());
      if (!vistas.has(clave)) vistas.add(clave), out.push(fila);
      return out.length < limite;
    }
    let i = 0;
    for (let j = 1; j < pendientes.length; j++) if (libres(pendientes[j], fila) < libres(pendientes[i], fila)) i = j;
    const pt = pendientes[i];
    const resto = pendientes.filter((_, j) => j !== i);
    const atar = (t: TerminoOVar): Termino | undefined => (esVar(t) ? fila[t.slice(1)] : t);
    for (const h of k.store.match(atar(pt[0]), atar(pt[1]), atar(pt[2]))) {
      if (vale && !vale.has(h.origen)) continue;
      const sig: Fila = { ...fila };
      let ok = true;
      ([h.s, h.p, h.o] as Termino[]).forEach((valor, n) => {
        const t = pt[n];
        if (!esVar(t)) return;
        const v = t.slice(1);
        // `?x pf:usa ?x`: la misma variable dos veces en un patrón debe valer lo mismo.
        if (v in sig && sig[v] !== valor) ok = false;
        else sig[v] = valor;
      });
      if (ok && !buscar(resto, sig)) return false;
    }
    return true;
  };

  buscar(q.patrones, {});
  return out;
}

// ── Caminos (FR-028) ─────────────────────────────────────────────────────────

export interface Paso {
  s: Termino;
  p: Termino;
  o: Termino;
  origen: Origen;
}

export interface Camino {
  pasos: Paso[];
}

export interface OpcionesCamino {
  hasta?: Termino;
  /** Id (`provoca`) o IRI (`pf:provoca`): sólo pasos de ese predicado o de uno más específico. */
  predicado?: string;
  maxSaltos?: number;
}

export const MAX_SALTOS = 8;

/** Predicados que no son relaciones entre elementos: tipo, nombre y atributos. */
const esRelacion = (h: Hecho) => h.p !== RDF_TYPE && h.p !== RDFS_LABEL && !esLiteral(h.o) && h.o.startsWith("kb:");

/**
 * Caminos más cortos desde `desde` siguiendo las flechas hacia adelante.
 *
 * El camino debe CONTAR la cadena, no resumirla: un atajo deducido por
 * transitiva o por subpropiedad (`Pagar provoca FacturaEmitida`) es la
 * conclusión, no el camino, y se salta. Las deducciones que sí agregan una
 * flecha nueva —la inversa de «reacciona a», la simetría, la equivalencia—
 * cuentan como un paso más. Con `predicado`, sólo valen los pasos cuyo
 * predicado es ése o uno de sus subpredicados: «provoca» recorre dispara,
 * activa, emite e invoca.
 *
 * Con `hasta`, a lo sumo un camino; sin él, uno por cada elemento alcanzable.
 */
export function camino(k: Lectura & { notaciones?: readonly string[] }, desde: Termino, opts: OpcionesCamino = {}): Camino[] {
  const max = opts.maxSaltos ?? MAX_SALTOS;
  const admitidos = opts.predicado ? subpredicados(k.notaciones ?? [], opts.predicado) : undefined;

  const paso = (h: Hecho): boolean => {
    if (!esRelacion(h)) return false;
    if (admitidos && !admitidos.has(h.p)) return false;
    if (h.origen !== "deducido") return true;
    const regla = k.store.justificacion([h.s, h.p, h.o])?.regla;
    return regla !== "transitiva" && regla !== "subpropiedad";
  };

  const previo = new Map<Termino, Paso>();
  const visto = new Set<Termino>([desde]);
  let frontera = [desde];
  for (let salto = 0; salto < max && frontera.length; salto++) {
    const sig: Termino[] = [];
    for (const x of frontera)
      for (const h of k.store.match(x)) {
        if (visto.has(h.o) || !paso(h)) continue;
        visto.add(h.o);
        previo.set(h.o, { s: h.s, p: h.p, o: h.o, origen: h.origen });
        sig.push(h.o);
      }
    if (opts.hasta && visto.has(opts.hasta)) break;
    frontera = sig;
  }

  const armar = (fin: Termino): Camino => {
    const pasos: Paso[] = [];
    for (let p = previo.get(fin); p; p = p.s === desde ? undefined : previo.get(p.s)) pasos.unshift(p);
    return { pasos };
  };
  if (opts.hasta) return previo.has(opts.hasta) ? [armar(opts.hasta)] : [];
  return [...previo.keys()].map(armar);
}

/** El predicado y todos los que lo especializan (subDe, en cualquier nivel). */
function subpredicados(notaciones: readonly string[], predicado: string): Set<Termino> {
  const raiz = predicado.startsWith("pf:") ? predicado : iriPredicado(predicado);
  const decls: PredicadoDecl[] = (notaciones.length ? notaciones : [undefined]).flatMap((n) => tboxDe(n).predicados);
  const out = new Set<Termino>([raiz]);
  for (let crecio = true; crecio; ) {
    crecio = false;
    for (const d of decls) {
      const iri = iriPredicado(d.id);
      if (!out.has(iri) && (d.subDe ?? []).some((s) => out.has(iriPredicado(s)))) out.add(iri), (crecio = true);
    }
  }
  return out;
}

// ── Del texto al término ─────────────────────────────────────────────────────

export interface Coincidencia {
  termino: Termino;
  /** Cómo se lo nombra, para mostrar. */
  nombre: string;
  /** Vista del elemento (los términos del reglamento no tienen). */
  vista?: string;
  tipo: "elemento" | "predicado" | "clase" | "iri";
}

/** El conocimiento con lo que hace falta para nombrar (ver `Conocimiento`). */
interface ConNombres extends Lectura {
  notaciones: readonly string[];
  elementos: readonly { iri: string; nombre: string; vista: string }[];
}

const PREDICADO_TIPO = new Set(["es", "es un", "es una", "tipo", "tipo de"]);

/**
 * Todo lo que el texto puede nombrar. Un IRI o literal pasa tal cual; si no,
 * se busca por nombre aplanado (sin acentos ni mayúsculas) entre elementos,
 * predicados (id, etiqueta y sinónimos) y clases. Dos elementos con el mismo
 * nombre vuelven los dos, cada uno con su vista.
 */
export function resolver(k: ConNombres, texto: string): Coincidencia[] {
  const t = texto.trim();
  if (!t) return [];
  if (esLiteral(t)) return [{ termino: t, nombre: t, tipo: "iri" }];
  const pre = t.indexOf(":");
  if (pre > 0 && enRegistro(PREFIJOS, t.slice(0, pre)))
    return [{ termino: t, nombre: t, tipo: "iri" }];

  const buscado = plana(t);
  if (PREDICADO_TIPO.has(buscado)) return [{ termino: RDF_TYPE, nombre: "es", tipo: "predicado" }];
  const out: Coincidencia[] = [];
  for (const e of k.elementos)
    if (plana(e.nombre) === buscado) out.push({ termino: e.iri, nombre: e.nombre, vista: e.vista, tipo: "elemento" });

  const vistos = new Set<Termino>();
  const tboxes = (k.notaciones.length ? k.notaciones : [undefined]).map(tboxDe);
  // Por id o etiqueta primero; los sinónimos sólo si nada encajó así: «dispara»
  // es el predicado `dispara`, aunque sea también sinónimo de `activa` y `emite`.
  for (const exacto of [true, false]) {
    for (const p of tboxes.flatMap((tb) => tb.predicados)) {
      const iri = iriPredicado(p.id);
      const nombres = exacto ? [p.id.replace(/_/g, " "), p.etiqueta] : p.sinonimos;
      if (!vistos.has(iri) && nombres.some((x) => plana(x) === buscado)) {
        vistos.add(iri);
        out.push({ termino: iri, nombre: p.etiqueta, tipo: "predicado" });
      }
    }
    if (vistos.size) break;
  }
  for (const tb of tboxes) {
    for (const c of tb.clases)
      if (!vistos.has(c.id) && c.id !== ELEMENTO && plana(c.etiqueta) === buscado) {
        vistos.add(c.id);
        out.push({ termino: c.id, nombre: c.etiqueta, tipo: "clase" });
      }
  }
  return out;
}

/** Patrones escritos con nombres, ya traducidos: todas las combinaciones posibles. */
export interface PatronesResueltos {
  patrones: Patron[][];
  /** Lo que no nombra nada del modelo (mundo abierto: «desconocido», no «falso»). */
  sinResolver: string[];
  /** Los nombres repetidos daban más de `MAX_COMBINACIONES` lecturas: se probaron sólo las primeras. */
  truncado: boolean;
}

/** Cota de combinaciones: tres nombres repetidos ya son 27 consultas. */
export const MAX_COMBINACIONES = 64;

export function resolverPatrones(k: ConNombres, patrones: [string, string, string][]): PatronesResueltos {
  const sinResolver: string[] = [];
  const opciones = patrones.map((pt) =>
    pt.map((t): TerminoOVar[] => {
      const x = t.trim();
      if (esVar(x)) return [x];
      const r = [...new Set(resolver(k, x).map((c) => c.termino))];
      if (!r.length) sinResolver.push(x);
      return r;
    })
  );
  if (sinResolver.length) return { patrones: [], sinResolver: [...new Set(sinResolver)], truncado: false };
  let combos: Patron[][] = [[]];
  let truncado = false;
  for (const [s, p, o] of opciones) {
    const sig: Patron[][] = [];
    for (const c of combos)
      for (const a of s)
        for (const b of p)
          for (const d of o)
            if (sig.length < MAX_COMBINACIONES) sig.push([...c, [a, b, d]]);
            else truncado = true;
    combos = sig;
  }
  return { patrones: combos, sinResolver, truncado };
}

/** `consultar` con patrones escritos con nombres: la unión de todas las lecturas posibles. */
export function consultarPorNombre(
  k: ConNombres,
  patrones: [string, string, string][],
  opts: Omit<Consulta, "patrones"> = {}
): { filas: Fila[]; sinResolver: string[]; truncado: boolean } {
  const r = resolverPatrones(k, patrones);
  const limite = opts.limite ?? LIMITE_FILAS;
  const filas: Fila[] = [];
  const vistas = new Set<string>();
  for (const ps of r.patrones)
    for (const f of consultar(k, { ...opts, patrones: ps, limite })) {
      const clave = JSON.stringify(Object.entries(f).sort());
      if (vistas.has(clave) || filas.length >= limite) continue;
      vistas.add(clave);
      filas.push(f);
    }
  return { filas, sinResolver: r.sinResolver, truncado: r.truncado };
}

/**
 * Un patrón escrito en una línea («Pagar dispara ?x», «Facturar reacciona a
 * PagoRealizado») partido en sujeto · predicado · objeto. Los nombres tienen
 * espacios, así que se prueba cada corte y vale el primero cuyo medio es un
 * predicado y cuyos extremos nombran algo (o son variables). undefined si
 * ningún corte cierra. Con `laxo`, los extremos pueden no existir: el primer
 * corte cuyo medio es un predicado.
 */
export function patronDeTexto(
  k: ConNombres,
  texto: string,
  opts: { laxo?: boolean } = {}
): [string, string, string] | undefined {
  const t = texto.trim().split(/\s+/).filter(Boolean);
  // `laxo`: alcanza con que el medio sea un predicado. Así «Inventario dispara ?x»
  // se lee como patrón —con un nombre desconocido— y no como texto ilegible.
  const nombra = (x: string) => opts.laxo || esVar(x) || resolver(k, x).length > 0;
  for (let i = 1; i < t.length - 1; i++)
    for (let j = i + 1; j < t.length; j++) {
      const [s, p, o] = [t.slice(0, i).join(" "), t.slice(i, j).join(" "), t.slice(j).join(" ")];
      if ((esVar(p) || resolver(k, p).some((c) => c.tipo === "predicado")) && nombra(s) && nombra(o)) return [s, p, o];
    }
  return undefined;
}
