/**
 * @fileOverview El REGLAMENTO de una notación (TBox, spec 027 · US1) — PURO.
 *
 * No declara nada: lo DERIVA del registro (`notations.ts`). Tres niveles de
 * clase —general → rol → tipo— más el catálogo de predicados. Este módulo no
 * contiene un solo literal de tipo de notación (P6): si una regla necesita un
 * tipo, lo encuentra por su rol.
 */

import {
  CLASES_GENERALES,
  CLASE_GENERAL_LIST,
  ELEMENT_ROLE_LIST,
  ROLE_GENERAL,
  ROLE_LABELS,
  getNotation,
  notationPredicates,
  notationRoles,
  type ClaseGeneral,
  type ElementRole,
  type Notation,
  type NotationId,
  type PredicadoDecl,
} from "../notations";
import { enRegistro } from "../registro";
import { ELEMENTO, iriGeneral, iriRol, iriTipo } from "./iri";
import type { Termino } from "./types";

export interface Clase {
  id: Termino;
  etiqueta: string;
  nivel: "raiz" | "general" | "rol" | "tipo";
  /** Superclases directas (subClassOf). */
  padres: Termino[];
}

export interface Tbox {
  notation: NotationId;
  clases: Clase[];
  /** Universales + propios de la notación. */
  predicados: PredicadoDecl[];
  /** Pares de clases que no pueden compartir individuo. */
  disjuntas: [Termino, Termino][];
}

/** Lo mínimo para derivar un reglamento: la notación, sus roles y su catálogo. */
export interface EntradaTbox {
  notation: Pick<Notation, "id" | "elements">;
  roles: Partial<Record<ElementRole, string[]>>;
  /** Predicados PROPIOS: los universales se suman siempre. */
  predicados: PredicadoDecl[];
}

const esGeneral = (t: string): t is ClaseGeneral => enRegistro(CLASES_GENERALES, t);
const esRol = (t: string): t is ElementRole => enRegistro(ROLE_GENERAL, t);

/** IRI de un término de dominio/rango (rol o clase general). */
export const iriDeTermino = (t: ElementRole | ClaseGeneral): Termino =>
  esGeneral(t) ? iriGeneral(t) : iriRol(t);

export function construirTbox({ notation, roles, predicados }: EntradaTbox): Tbox {
  const rolDe = new Map<string, ElementRole>();
  for (const r of ELEMENT_ROLE_LIST) for (const tipo of roles[r] ?? []) rolDe.set(tipo, r);

  const clases: Clase[] = [{ id: ELEMENTO, etiqueta: "Elemento", nivel: "raiz", padres: [] }];
  for (const g of CLASE_GENERAL_LIST)
    clases.push({ id: iriGeneral(g), etiqueta: CLASES_GENERALES[g], nivel: "general", padres: [ELEMENTO] });
  for (const r of ELEMENT_ROLE_LIST) {
    if (!roles[r]?.length) continue;
    clases.push({ id: iriRol(r), etiqueta: ROLE_LABELS[r], nivel: "rol", padres: [iriGeneral(ROLE_GENERAL[r])] });
  }

  // Rol heredado por la cadena de padres, para no repetir el rol del padre.
  const porTipo = new Map(notation.elements.map((e) => [e.type, e]));
  const rolProfundo = (tipo: string | undefined, visto = new Set<string>()): ElementRole | undefined => {
    if (!tipo || visto.has(tipo)) return undefined;
    visto.add(tipo);
    return rolDe.get(tipo) ?? rolProfundo(porTipo.get(tipo)?.parent, visto);
  };

  for (const e of notation.elements) {
    const padres: Termino[] = [];
    if (e.parent) padres.push(iriTipo(notation.id, e.parent));
    const propio = rolDe.get(e.type);
    if (propio && (!e.parent || rolProfundo(e.parent) !== propio)) padres.push(iriRol(propio));
    if (!padres.length) padres.push(ELEMENTO);
    clases.push({ id: iriTipo(notation.id, e.type), etiqueta: e.type, nivel: "tipo", padres });
  }

  const disjuntas: [Termino, Termino][] = [];
  CLASE_GENERAL_LIST.forEach((a, i) =>
    CLASE_GENERAL_LIST.slice(i + 1).forEach((b) => disjuntas.push([iriGeneral(a), iriGeneral(b)]))
  );

  return { notation: notation.id, clases, predicados: [...notationPredicates("general"), ...predicados], disjuntas };
}

// El registro es estático: el reglamento de cada notación se deriva una vez.
// Sugerir el predicado de cada arista de un proyecto grande lo pide miles de veces.
const CACHE = new Map<NotationId, Tbox>();

/** Reglamento de una notación del registro (cae a la de por defecto si el id no existe). */
export function tboxDe(id: NotationId | string | undefined): Tbox {
  const n = getNotation(id);
  const hecho = CACHE.get(n.id);
  if (hecho) return hecho;
  const t = derivar(n);
  CACHE.set(n.id, t);
  return t;
}

function derivar(n: Notation): Tbox {
  return construirTbox({
    notation: n,
    roles: notationRoles(n.id),
    predicados: notationPredicates(n.id).slice(notationPredicates("general").length),
  });
}

/** Clase de un tipo; la raíz si el tipo no existe en la notación (edge case: tipo desconocido). */
export function claseDeTipo(t: Tbox, tipo: string): Termino {
  const iri = iriTipo(t.notation, tipo);
  return t.clases.some((c) => c.id === iri && c.nivel === "tipo") ? iri : ELEMENTO;
}

/** Superclases de una clase, de la más cercana a la raíz (cierre de subClassOf, sin ella misma). */
export function superclases(t: Tbox, clase: Termino): Termino[] {
  let memo = SUPER.get(t);
  if (!memo) SUPER.set(t, (memo = new Map()));
  const hecho = memo.get(clase);
  if (hecho) return hecho;
  const out = calcularSuperclases(t, clase);
  memo.set(clase, out);
  return out;
}

const SUPER = new WeakMap<Tbox, Map<Termino, Termino[]>>();

function calcularSuperclases(t: Tbox, clase: Termino): Termino[] {
  const porId = new Map(t.clases.map((c) => [c.id, c]));
  const out: Termino[] = [];
  const visto = new Set<Termino>([clase]);
  let frontera = [clase];
  while (frontera.length) {
    const sig: Termino[] = [];
    for (const c of frontera)
      for (const p of porId.get(c)?.padres ?? []) {
        if (visto.has(p)) continue;
        visto.add(p);
        out.push(p);
        sig.push(p);
      }
    frontera = sig;
  }
  return out;
}

export const predicadoDe = (t: Tbox, id: string): PredicadoDecl | undefined =>
  t.predicados.find((p) => p.id === id);

/** ¿El tipo cumple el dominio (o el rango) del predicado? Sin restricción, todo cumple. */
export function admite(t: Tbox, p: PredicadoDecl, tipo: string, lado: "dominio" | "rango"): boolean {
  const lista = p[lado];
  if (!lista?.length) return true;
  const clase = claseDeTipo(t, tipo);
  const arriba = new Set([clase, ...superclases(t, clase)]);
  return lista.some((x) => arriba.has(iriDeTermino(x)));
}

/** Coherencia del reglamento (FR-006). Vacío = coherente. */
export function checkTbox(t: Tbox): string[] {
  const errores: string[] = [];
  const clases = new Map(t.clases.map((c) => [c.id, c]));

  for (const c of t.clases)
    for (const p of c.padres)
      if (!clases.has(p)) errores.push(`La clase «${c.etiqueta}» declara un padre inexistente: ${p}.`);

  // Ciclos de subclase: DFS con colores.
  const estado = new Map<Termino, 1 | 2>();
  const dfs = (id: Termino, camino: Termino[]): void => {
    if (estado.get(id) === 2) return;
    if (estado.get(id) === 1) {
      errores.push(`Ciclo de subclase: ${[...camino, id].join(" ⊂ ")}.`);
      return;
    }
    estado.set(id, 1);
    for (const p of clases.get(id)?.padres ?? []) if (clases.has(p)) dfs(p, [...camino, id]);
    estado.set(id, 2);
  };
  for (const c of t.clases) dfs(c.id, []);

  const ids = new Map<string, number>();
  for (const p of t.predicados) ids.set(p.id, (ids.get(p.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) errores.push(`Predicado duplicado en la notación: ${id} (${n} veces).`);
  const porId = new Map(t.predicados.map((p) => [p.id, p]));

  for (const p of t.predicados) {
    for (const x of [...(p.dominio ?? []), ...(p.rango ?? [])])
      if (!esGeneral(x) && !esRol(x)) errores.push(`«${p.id}» usa un dominio/rango inexistente: ${x}.`);
    if (p.inversa) {
      const inv = porId.get(p.inversa);
      if (!inv) errores.push(`«${p.id}» declara una inversa inexistente: ${p.inversa}.`);
      else if (inv.inversa !== p.id) errores.push(`La inversa de «${p.id}» (${p.inversa}) no es recíproca.`);
    }
    for (const s of p.subDe ?? []) if (!porId.has(s)) errores.push(`«${p.id}» es subpropiedad de un predicado inexistente: ${s}.`);
    if (p.funcional && p.transitiva) errores.push(`«${p.id}» no puede ser funcional y transitiva a la vez.`);
  }

  // Ciclos de subpropiedad.
  const subEstado = new Map<string, 1 | 2>();
  const subDfs = (id: string): boolean => {
    if (subEstado.get(id) === 2) return false;
    if (subEstado.get(id) === 1) return true;
    subEstado.set(id, 1);
    const ciclo = (porId.get(id)?.subDe ?? []).some((s) => porId.has(s) && subDfs(s));
    subEstado.set(id, 2);
    return ciclo;
  };
  for (const p of t.predicados) if (subDfs(p.id)) errores.push(`Ciclo de subpropiedad que pasa por «${p.id}».`);

  return errores;
}

// =============================================================================
// Lectura humana (FR-007): árbol de clases y markdown del reglamento
// =============================================================================

export interface NodoArbol {
  id: Termino;
  etiqueta: string;
  nivel: Clase["nivel"];
  hijos: NodoArbol[];
}

/** La jerarquía como árbol desde la raíz (un tipo con dos padres cuelga del primero). */
export function arbolDeClases(t: Tbox): NodoArbol {
  const hijos = new Map<Termino, Clase[]>();
  for (const c of t.clases) {
    const p = c.padres[0];
    if (!p) continue;
    (hijos.get(p) ?? hijos.set(p, []).get(p)!).push(c);
  }
  const armar = (c: Clase, visto: Set<Termino>): NodoArbol => ({
    id: c.id,
    etiqueta: c.etiqueta,
    nivel: c.nivel,
    hijos: visto.has(c.id) ? [] : (hijos.get(c.id) ?? []).map((h) => armar(h, new Set([...visto, c.id]))),
  });
  return armar(t.clases[0], new Set());
}

/** Tipos de la notación que caen bajo un término de dominio/rango. */
function tiposBajo(t: Tbox, termino: ElementRole | ClaseGeneral): string[] {
  const iri = iriDeTermino(termino);
  return t.clases.filter((c) => c.nivel === "tipo" && superclases(t, c.id).includes(iri)).map((c) => c.etiqueta);
}

/** «Intención (Comando)»: el rol o la clase general con los tipos que la cumplen. */
export function describirTerminos(t: Tbox, lista: (ElementRole | ClaseGeneral)[] | undefined): string {
  if (!lista?.length) return "cualquiera";
  return lista
    .map((x) => {
      // Una clase general abarca media notación: listar sus tipos es ruido.
      if (esGeneral(x)) return CLASES_GENERALES[x];
      const etiqueta = ROLE_LABELS[x];
      const tipos = tiposBajo(t, x);
      return tipos.length ? `${etiqueta} (${tipos.join(", ")})` : etiqueta;
    })
    .join(" | ");
}

/** Propiedades lógicas de un predicado, en palabras. */
export function propiedadesDe(p: PredicadoDecl): string[] {
  const out: string[] = [];
  if (p.transitiva) out.push("transitiva");
  if (p.simetrica) out.push("simétrica");
  if (p.funcional) out.push("funcional");
  if (p.inversa) out.push(`inversa de ${p.inversa}`);
  if (p.subDe?.length) out.push(`especializa ${p.subDe.join(", ")}`);
  if (p.relacion) out.push(`relación UML/MER «${p.relacion}»`);
  return out;
}

/** El reglamento en Markdown: lo que devuelve `get_ontology` y lo que lee la ayuda. */
export function tboxMarkdown(t: Tbox): string {
  const lineas: string[] = [`# Ontología de ${getNotation(t.notation).label}`, "", "## Jerarquía de clases", ""];
  const pintar = (n: NodoArbol, nivel: number) => {
    // Los tipos sueltos bajo la raíz (sin rol) se listan aparte: son decorativos para las reglas.
    lineas.push(`${"  ".repeat(nivel)}- ${n.etiqueta}${n.nivel === "rol" ? " _(rol)_" : ""}`);
    for (const h of n.hijos) if (!(n.nivel === "raiz" && h.nivel === "tipo")) pintar(h, nivel + 1);
  };
  const arbol = arbolDeClases(t);
  pintar(arbol, 0);
  const sueltos = arbol.hijos.filter((h) => h.nivel === "tipo").map((h) => h.etiqueta);
  if (sueltos.length) lineas.push("", `Sin rol (sólo reglas universales): ${sueltos.join(", ")}.`);

  lineas.push("", "## Predicados", "");
  for (const p of t.predicados) {
    const props = propiedadesDe(p);
    lineas.push(
      `- **${p.id}** («${p.etiqueta}»): ${describirTerminos(t, p.dominio)} → ${describirTerminos(t, p.rango)}` +
        (props.length ? ` · ${props.join(" · ")}` : "") +
        (p.sinonimos.length ? ` · sinónimos: ${p.sinonimos.join(", ")}` : "")
    );
  }
  lineas.push("", "## Clases disjuntas", "", CLASE_GENERAL_LIST.map((g) => CLASES_GENERALES[g]).join(" · ") + " (de a pares)");
  return lineas.join("\n");
}
