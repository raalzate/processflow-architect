/**
 * @fileOverview Razonador de la ontología (spec 027 · US3, R-04) — PURO.
 *
 * Encadenamiento hacia adelante SEMI-NAIVE: cada ronda sólo combina los hechos
 * nuevos de la ronda anterior con el store, y termina cuando una ronda no
 * agrega nada (FR-015). Reglas: subclase, dominio, rango, inversa, transitiva,
 * simétrica, subpropiedad y equivalencia (sustitución por «es_mismo_que»).
 *
 * Tres decisiones que no son obvias:
 * - MUNDO ABIERTO (FR-019): dominio y rango sólo clasifican cuando declaran UNA
 *   clase. Con varias (`invoca`: actor | external) afirmar cualquiera sería
 *   adivinar, y OWL no tiene una clase nombrada para la unión.
 * - La equivalencia NO copia el tipo: el Contexto *Pagos* de la vista DDD y el
 *   Sistema *Pagos* de C4 comparten relaciones, pero cada uno conserva la clase
 *   de su notación. Copiarla volvería disjunto a todo vínculo entre notaciones.
 * - Nada que contradiga la disjunción entre clases generales se propaga: se
 *   reporta como hallazgo y el razonamiento sigue (edge case de la spec).
 */

import type { PredicadoDecl } from "../notations";
import { ELEMENTO, RDF_TYPE, esLiteral, iriPredicado } from "./iri";
import type { TripleStore } from "./store";
import { iriDeTermino, type Tbox } from "./tbox";
import type { Hallazgo, Hecho, Justificacion, ReglaId, Termino, Tripleta } from "./types";

export const MAX_RONDAS = 32;
export const MAX_HECHOS = 50_000;

const ES_MISMO_QUE = iriPredicado("es_mismo_que");

export interface OpcionesRazonador {
  maxRondas?: number;
  /** Tope sobre el TAMAÑO del store (explícitos + deducidos). */
  maxHechos?: number;
}

export interface ResultadoRazonador {
  /** Hechos agregados por esta corrida. */
  deducidos: number;
  rondas: number;
  topeAlcanzado: boolean;
  hallazgos: Hallazgo[];
}

/** El reglamento de varias notaciones fundido: un proyecto mezcla vistas DDD, BPMN y C4. */
interface Reglamento {
  padres: Map<Termino, Termino[]>;
  predicados: Map<Termino, PredicadoDecl>;
  generales: Set<Termino>;
  disjuntas: Set<string>;
  cierre: Map<Termino, Set<Termino>>;
}

function fundir(tboxes: Tbox[]): Reglamento {
  const padres = new Map<Termino, Termino[]>();
  const predicados = new Map<Termino, PredicadoDecl>();
  const generales = new Set<Termino>();
  const disjuntas = new Set<string>();
  for (const t of tboxes) {
    for (const c of t.clases) {
      if (!padres.has(c.id)) padres.set(c.id, c.padres);
      if (c.nivel === "general") generales.add(c.id);
    }
    // El primero manda: los universales y `flujo_a` son el mismo objeto en todas.
    for (const p of t.predicados) if (!predicados.has(iriPredicado(p.id))) predicados.set(iriPredicado(p.id), p);
    for (const [a, b] of t.disjuntas) {
      disjuntas.add(`${a}|${b}`);
      disjuntas.add(`${b}|${a}`);
    }
  }
  return { padres, predicados, generales, disjuntas, cierre: new Map() };
}

/** La clase y todas sus superclases. */
function cierreDe(r: Reglamento, clase: Termino): Set<Termino> {
  const hecho = r.cierre.get(clase);
  if (hecho) return hecho;
  const out = new Set<Termino>([clase]);
  const pila = [clase];
  while (pila.length) for (const p of r.padres.get(pila.pop()!) ?? []) if (!out.has(p)) out.add(p), pila.push(p);
  r.cierre.set(clase, out);
  return out;
}

/** Clase única que afirma un dominio/rango; undefined si no declara o declara varias. */
function claseUnica(lista: PredicadoDecl["dominio"]): Termino | undefined {
  return lista?.length === 1 ? iriDeTermino(lista[0]) : undefined;
}

export function razonar(store: TripleStore, tboxes: Tbox[], opts: OpcionesRazonador = {}): ResultadoRazonador {
  const maxRondas = opts.maxRondas ?? MAX_RONDAS;
  const maxHechos = opts.maxHechos ?? MAX_HECHOS;
  const r = fundir(tboxes);

  const hallazgos: Hallazgo[] = [];
  const reportados = new Set<string>();
  const reportar = (clave: string, h: Hallazgo) => {
    if (reportados.has(clave)) return;
    reportados.add(clave);
    hallazgos.push(h);
  };

  /** Clases generales de un individuo, por los tipos que ya tiene. */
  const generalesDe = (x: Termino): Set<Termino> => {
    const out = new Set<Termino>();
    for (const t of store.match(x, RDF_TYPE)) for (const c of cierreDe(r, t.o)) if (r.generales.has(c)) out.add(c);
    return out;
  };
  const chocan = (a: Iterable<Termino>, b: Set<Termino>): [Termino, Termino] | undefined => {
    for (const x of a) for (const y of b) if (r.disjuntas.has(`${x}|${y}`)) return [x, y];
    return undefined;
  };

  // Pares «es_mismo_que» que contradicen la disjunción: ni se agregan ni sustituyen.
  const bloqueados = new Set<string>();
  const bloquear = (a: Termino, b: Termino) => {
    bloqueados.add(`${a}|${b}`);
    bloqueados.add(`${b}|${a}`);
  };
  const equivalenciaRota = (a: Termino, b: Termino): boolean => {
    if (bloqueados.has(`${a}|${b}`)) return true;
    const choque = chocan(generalesDe(a), generalesDe(b));
    if (!choque) return false;
    bloquear(a, b);
    reportar(`eq|${[a, b].sort().join("|")}`, {
      forma: "EQUIVALENCIA-DISJUNTA",
      severidad: "error",
      nodo: a,
      esperado: "clases compatibles",
      encontrado: `${choque[0]} ≢ ${choque[1]}`,
      mensaje: `${a} y ${b} no pueden ser el mismo elemento: ${choque[0]} y ${choque[1]} son clases disjuntas. La equivalencia no se propaga.`,
      sugerencia: "Revisá el vínculo: quizá uno «realiza» al otro en vez de ser el mismo.",
    });
    return true;
  };

  let deducidos = 0;
  let tope = false;
  let ronda = 0;
  let nuevos: Hecho[] = [];

  const deducir = (s: Termino, p: Termino, o: Termino, regla: ReglaId, premisas: Tripleta[], axioma?: string) => {
    if (tope) return;
    // Triviales (FR-018): reflexivos, la clase raíz y hechos sobre el reglamento.
    if (s === o || s.startsWith("pf:") || esLiteral(s)) return;
    if (p === RDF_TYPE && o === ELEMENTO) return;
    if (p === ES_MISMO_QUE && equivalenciaRota(s, o)) return;
    if (store.has([s, p, o])) return;
    if (store.size >= maxHechos) {
      tope = true;
      return;
    }
    const h: Hecho = { s, p, o, origen: "deducido" };
    const j: Justificacion = { regla, premisas, ronda };
    if (axioma) j.axioma = axioma;
    store.add(h, j);
    nuevos.push(h);
    deducidos++;
  };

  /** Clasifica por dominio/rango salvo que la clase contradiga lo que el individuo ya es. */
  const clasificar = (x: Termino, clase: Termino, regla: "dominio" | "rango", h: Tripleta, decl: PredicadoDecl) => {
    if (esLiteral(x) || store.has([x, RDF_TYPE, clase])) return;
    const choque = chocan(cierreDe(r, clase), generalesDe(x));
    if (choque) {
      reportar(`dr|${x}|${clase}`, {
        forma: "DOMINIO-RANGO",
        severidad: "aviso",
        nodo: x,
        esperado: clase,
        encontrado: choque[1],
        mensaje: `«${decl.id}» pide ${clase} en su ${regla}, pero ${x} ya es ${choque[1]}: no se reclasifica.`,
        sugerencia: "Cambiá el significado de la relación por uno compatible con sus extremos.",
      });
      return;
    }
    deducir(x, RDF_TYPE, clase, regla, [h], `${decl.id} ${regla} ${clase}`);
  };

  const aplicar = (h: Hecho) => {
    const t: Tripleta = [h.s, h.p, h.o];

    if (h.p === RDF_TYPE) {
      for (const d of r.padres.get(h.o) ?? []) deducir(h.s, RDF_TYPE, d, "subclase", [t], `${h.o} ⊑ ${d}`);
      return;
    }

    const decl = r.predicados.get(h.p);
    if (!decl || esLiteral(h.o)) return;

    if (h.p === ES_MISMO_QUE) {
      if (equivalenciaRota(h.s, h.o)) return;
      // Sustitución: lo que vale para uno vale para el otro (sin el tipo, ver arriba).
      for (const f of store.match(h.s))
        if (f.p !== ES_MISMO_QUE && r.predicados.has(f.p)) deducir(h.o, f.p, f.o, "equivalencia", [t, [f.s, f.p, f.o]]);
      for (const f of store.match(undefined, undefined, h.s))
        if (f.p !== ES_MISMO_QUE && r.predicados.has(f.p)) deducir(f.s, f.p, h.o, "equivalencia", [t, [f.s, f.p, f.o]]);
    } else {
      // `equivalenciaRota` y no sólo `bloqueados`: el hecho puede llegar ANTES
      // que la equivalencia disjunta se procese, y entonces aún no está bloqueada.
      for (const e of store.match(h.s, ES_MISMO_QUE))
        if (!equivalenciaRota(h.s, e.o)) deducir(e.o, h.p, h.o, "equivalencia", [[e.s, e.p, e.o], t]);
      for (const e of store.match(h.o, ES_MISMO_QUE))
        if (!equivalenciaRota(h.o, e.o)) deducir(h.s, h.p, e.o, "equivalencia", [t, [e.s, e.p, e.o]]);
    }

    const dom = claseUnica(decl.dominio);
    if (dom) clasificar(h.s, dom, "dominio", t, decl);
    const ran = claseUnica(decl.rango);
    if (ran) clasificar(h.o, ran, "rango", t, decl);

    if (decl.inversa) deducir(h.o, iriPredicado(decl.inversa), h.s, "inversa", [t], `${decl.id} ≡ ${decl.inversa}⁻`);
    if (decl.simetrica) deducir(h.o, h.p, h.s, "simetrica", [t], `${decl.id} simétrica`);
    for (const sup of decl.subDe ?? [])
      deducir(h.s, iriPredicado(sup), h.o, "subpropiedad", [t], `${decl.id} ⊑ ${sup}`);
    if (decl.transitiva) {
      for (const d of store.match(h.o, h.p)) deducir(h.s, h.p, d.o, "transitiva", [t, [d.s, d.p, d.o]], `${decl.id} transitiva`);
      for (const a of store.match(undefined, h.p, h.s))
        deducir(a.s, h.p, h.o, "transitiva", [[a.s, a.p, a.o], t], `${decl.id} transitiva`);
    }
  };

  let pendientes = store.match();
  while (pendientes.length && !tope) {
    if (ronda >= maxRondas) {
      tope = true;
      break;
    }
    ronda++;
    nuevos = [];
    for (const h of pendientes) {
      aplicar(h);
      if (tope) break;
    }
    pendientes = nuevos;
  }

  if (tope)
    hallazgos.push({
      forma: "TOPE-RAZONADOR",
      severidad: "aviso",
      esperado: `≤ ${maxRondas} rondas y ≤ ${maxHechos} hechos`,
      encontrado: `${ronda} rondas, ${store.size} hechos`,
      mensaje: "El razonador llegó a su tope y cortó: lo deducido está incompleto.",
      sugerencia: "Razoná por vista, o partí el proyecto: suele haber una cadena transitiva desmedida.",
    });

  return { deducidos, rondas: ronda, topeAlcanzado: tope, hallazgos };
}
