/**
 * @fileOverview Validación por FORMAS (spec 027 · US4, R-05) — PURO.
 *
 * Validar es consultar el reglamento: cada forma declarada en el registro
 * (`NOTATION_SHAPES`) se evalúa sobre el conocimiento ya razonado, en MUNDO
 * CERRADO —lo que falta, falta (FR-024)—. Este módulo no conoce un solo tipo
 * de notación: pregunta por roles y clases, que es lo que dicen las formas.
 *
 * Dos fuentes, a propósito:
 * - el STORE (explícitos + deducidos) para el significado: qué clase tiene un
 *   elemento, qué predicados lo unen a otro;
 * - el ÍNDICE de lo dibujado (`k.elementos`, `k.aristas`) para lo que una
 *   tripleta no guarda: orden de lectura, etiqueta de cada flecha, flechas
 *   repetidas. `predicado: "*"` cuenta flechas dibujadas; así las formas que
 *   heredaron una regla de calidad dicen exactamente lo mismo que ella.
 */

import {
  getNotation,
  notationShapes,
  typesWithRole,
  type ClaseGeneral,
  type ElementRole,
  type FormaDecl,
  type NotationId,
  type RestriccionForma,
} from "../notations";
import { citaDe, resolveCita } from "../source-docs";
import type { AristaAbox, ElementoAbox, VistaAbox } from "./abox";
import type { Conocimiento } from "./conocimiento";
import { RDFS_LABEL, RDF_TYPE, esLiteral, iriPredicado, slugTipo, valorLiteral } from "./iri";
import { iriDeTermino } from "./tbox";
import type { Hallazgo, Termino } from "./types";

export interface OpcionesValidar {
  /** Formas a evaluar; por defecto, las del registro para la notación de cada vista. */
  formas?: FormaDecl[] | ((n: NotationId) => FormaDecl[]);
  /** Sólo esta vista. */
  vista?: string;
}

/** Texto aplanado: sin acentos, minúsculas, sólo palabras (para contar y comparar). */
export const plana = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Predicado del store detrás de un atributo de forma. */
function iriAtributo(atributo: string): Termino {
  if (atributo === "nombre") return RDFS_LABEL;
  if (atributo === "descripcion" || atributo === "fuente" || atributo === "tecnologia") return `pf:${atributo}`;
  return `pf:atributo/${slugTipo(atributo)}`;
}

type Vars = Record<string, string | number | undefined>;

/** Rellena los marcadores en una pasada: un valor con llaves no se vuelve a expandir. */
function rellenar(plantilla: string, vars: Vars, notation: NotationId): string {
  return plantilla.replace(/\{([a-z0-9]+)(?::([a-z]+))?\}/g, (todo, clave: string, rol?: string) => {
    if (clave === "tipos" && rol) return typesWithRole(notation, rol as ElementRole).join(" o ");
    const v = vars[clave];
    return v === undefined ? todo : String(v);
  });
}

const lista3 = (nombres: string[]) => `${nombres.slice(0, 3).join(", ")}${nombres.length > 3 ? "…" : ""}`;

/** Bloques de formas consecutivas (mismo `bloque`, o mismo id si no declara). */
function bloquesDe(formas: FormaDecl[]): FormaDecl[][] {
  const out: FormaDecl[][] = [];
  for (const f of formas) {
    const ultimo = out[out.length - 1];
    const clave = (x: FormaDecl) => x.bloque ?? x.id;
    if (ultimo && clave(ultimo[0]) === clave(f)) ultimo.push(f);
    else out.push([f]);
  }
  return out;
}

export function validar(k: Conocimiento, opts: OpcionesValidar = {}): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const v of k.vistas) {
    if (opts.vista !== undefined && v.vista !== opts.vista) continue;
    const formas =
      typeof opts.formas === "function" ? opts.formas(v.notation) : (opts.formas ?? notationShapes(v.notation));
    out.push(...validarVista(k, v, formas));
  }
  return out;
}

function validarVista(k: Conocimiento, v: VistaAbox, formas: FormaDecl[]): Hallazgo[] {
  const notation = getNotation(v.notation).id;
  const deVista = <T extends { proyecto: string; vista: string }>(x: T) => x.proyecto === v.proyecto && x.vista === v.vista;
  const elementos = k.elementos.filter(deVista);
  const aristas = k.aristas.filter(deVista);
  const porIri = new Map(elementos.map((e) => [e.iri, e]));
  const nombrePorId = new Map(elementos.map((e) => [e.id, e.nombre]));
  const nombre = (iri: Termino) => porIri.get(iri)?.nombre ?? iri;

  const sale = new Map<Termino, AristaAbox[]>();
  const entra = new Map<Termino, AristaAbox[]>();
  for (const a of aristas) {
    (sale.get(a.s) ?? sale.set(a.s, []).get(a.s)!).push(a);
    (entra.get(a.o) ?? entra.set(a.o, []).get(a.o)!).push(a);
  }

  const clases = new Map<Termino, Set<Termino>>();
  const clasesDe = (iri: Termino): Set<Termino> => {
    let c = clases.get(iri);
    if (!c) clases.set(iri, (c = new Set(k.store.match(iri, RDF_TYPE).map((h) => h.o))));
    return c;
  };
  const es = (iri: Termino, lista: (ElementRole | ClaseGeneral)[]) => {
    const c = clasesDe(iri);
    return lista.some((t) => c.has(iriDeTermino(t)));
  };
  const valor = (iri: Termino, atributo: string): string | undefined => {
    const h = k.store.match(iri, iriAtributo(atributo))[0];
    return h && esLiteral(h.o) ? valorLiteral(h.o) : undefined;
  };

  const sinContenedores = elementos.filter((e) => !e.contenedor);
  const aplica = (f: FormaDecl) =>
    (!f.aplicaSi?.declara || typesWithRole(notation, f.aplicaSi.declara).length > 0) &&
    (!f.aplicaSi?.hay || sinContenedores.some((e) => es(e.iri, [f.aplicaSi!.hay!])));

  const apunta = (f: FormaDecl, e: ElementoAbox): boolean => {
    const o = f.objetivo;
    if (o === "*") return true;
    if (o === "contenedor") return e.contenedor;
    if (o === "diagrama" || o === "relacion") return false;
    return es(e.iri, Array.isArray(o) ? o : [o]);
  };

  const hallazgo = (f: FormaDecl, mensaje: string, vars: Vars, extra: Partial<Hallazgo> = {}): Hallazgo => {
    const h: Hallazgo = { forma: f.id, severidad: f.severidad, vista: v.vista, mensaje: rellenar(mensaje, vars, notation), ...extra };
    if (f.sugerencia) h.sugerencia = rellenar(f.sugerencia, vars, notation);
    return h;
  };

  /** Lo que cuenta una restricción de cardinalidad: los OTROS extremos que califican. */
  const contar = (e: ElementoAbox, r: Extract<RestriccionForma, { tipo: "minCount" | "maxCount" }>): Termino[] => {
    const otros: { iri: Termino; etiqueta?: string }[] =
      r.predicado === "*"
        ? (r.direccion === "sale" ? sale : entra).get(e.iri)?.map((a) => ({ iri: r.direccion === "sale" ? a.o : a.s, etiqueta: a.etiqueta })) ?? []
        : (r.direccion === "sale"
            ? k.store.match(e.iri, iriPredicado(r.predicado))
            : k.store.match(undefined, iriPredicado(r.predicado), e.iri)
          )
            .filter((h) => !r.soloDibujado || h.origen === "explicito")
            .map((h) => ({ iri: r.direccion === "sale" ? h.o : h.s }));
    return otros
      .filter((x) => !r.claseObjeto || es(x.iri, r.claseObjeto))
      .filter((x) => !r.sinEtiqueta || !x.etiqueta?.trim())
      .filter((x) => !r.soloElementos || porIri.get(x.iri)?.contenedor === false)
      .map((x) => x.iri);
  };

  /** Evalúa una forma sobre un elemento: el hallazgo, o null si cumple. */
  const evaluar = (f: FormaDecl, e: ElementoAbox): Hallazgo | null => {
    const r = f.restriccion;
    const base: Vars = { nombre: e.nombre, id: e.id, tipo: e.tipo };
    const en = { nodo: e.id };
    switch (r.tipo) {
      case "minCount":
      case "maxCount": {
        const otros = contar(e, r);
        const n = otros.length;
        if (r.tipo === "minCount" ? n >= r.n : n <= r.n) return null;
        const nombres = otros.map(nombre);
        return hallazgo(f, f.mensaje, { ...base, esperado: r.n, encontrado: n, lista: nombres.join(", "), lista3: lista3(nombres) }, {
          ...en,
          esperado: r.n,
          encontrado: n,
        });
      }
      case "atributoRequerido":
        return valor(e.iri, r.atributo)?.trim() ? null : hallazgo(f, f.mensajeVacio ?? f.mensaje, base, { ...en, esperado: r.atributo, encontrado: "nada" });
      case "minPalabras": {
        const d = valor(e.iri, r.atributo)?.trim() ?? "";
        const palabras = plana(d).split(" ").filter(Boolean).length;
        const otro = r.distintoDe ? (valor(e.iri, r.distintoDe) ?? "") : undefined;
        if (palabras >= r.n && (otro === undefined || plana(d) !== plana(otro))) return null;
        return hallazgo(f, d ? f.mensaje : (f.mensajeVacio ?? f.mensaje), { ...base, valor: d }, { ...en, esperado: r.n, encontrado: palabras });
      }
      case "patron": {
        const x = valor(e.iri, r.atributo) ?? "";
        return new RegExp(r.regex).test(x) ? null : hallazgo(f, f.mensaje, { ...base, valor: x }, { ...en, esperado: r.regex, encontrado: x });
      }
      case "sinCita": {
        const cita = citaDe(valor(e.iri, r.atributo));
        return cita ? hallazgo(f, f.mensaje, { ...base, valor: cita }, { ...en, encontrado: cita }) : null;
      }
      case "prohibido": {
        const n = k.store.match(e.iri, iriPredicado(r.predicado)).filter((h) => es(h.o, r.claseObjeto)).length;
        return n ? hallazgo(f, f.mensaje, { ...base, esperado: 0, encontrado: n }, { ...en, esperado: 0, encontrado: n }) : null;
      }
      default:
        return null;
    }
  };

  /** Formas sobre el diagrama entero. */
  const delDiagrama = (f: FormaDecl): Hallazgo[] => {
    const r = f.restriccion;
    if (r.tipo === "existe")
      return sinContenedores.some((e) => es(e.iri, [r.rol])) ? [] : [hallazgo(f, f.mensaje, {}, { esperado: 1, encontrado: 0 })];
    if (r.tipo === "fuentesAdjuntas") {
      const faltan = new Map<string, string[]>();
      for (const e of elementos) {
        const c = resolveCita(v.documentos, e.fuente);
        if (c.estado !== "falta") continue;
        (faltan.get(c.doc) ?? faltan.set(c.doc, []).get(c.doc)!).push(e.nombre);
      }
      return [...faltan].map(([doc, nombres]) =>
        hallazgo(f, f.mensaje, { doc, encontrado: nombres.length, lista: nombres.join(", "), lista3: lista3(nombres) }, { encontrado: doc })
      );
    }
    return [];
  };

  /** Formas sobre cada relación dibujada. */
  const deRelaciones = (f: FormaDecl): Hallazgo[] =>
    f.restriccion.tipo !== "etiquetaRequerida"
      ? []
      : aristas
          .filter((a) => !a.etiqueta?.trim())
          .map((a) =>
            hallazgo(f, f.mensaje, {
              origen: nombrePorId.get(a.fuente) ?? a.fuente,
              destino: nombrePorId.get(a.destino) ?? a.destino,
            })
          );

  const out: Hallazgo[] = [];
  for (const bloque of bloquesDe(formas.filter(aplica))) {
    for (const f of bloque) {
      if (f.objetivo === "diagrama") out.push(...delDiagrama(f));
      else if (f.objetivo === "relacion") out.push(...deRelaciones(f));
    }
    const porElemento = bloque.filter((f) => f.objetivo !== "diagrama" && f.objetivo !== "relacion");
    if (!porElemento.length) continue;
    // Elemento por elemento, en el orden del diagrama: así se lee la revisión.
    for (const e of elementos) {
      const señaladas = new Set<string>();
      for (const f of porElemento) {
        if (!apunta(f, e)) continue;
        if (f.unaPorElemento && señaladas.has(f.id)) continue;
        const h = evaluar(f, e);
        if (!h) continue;
        out.push(h);
        señaladas.add(f.id);
      }
    }
  }
  return out;
}
