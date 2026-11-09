/**
 * @fileOverview Qué SIGNIFICA una flecha (spec 027 · US2, R-07) — PURO, sin IA.
 *
 * La etiqueta sigue siendo libre («emite», «Escribe en [SQL]»); el predicado es
 * su lectura canónica. Se propone de forma DETERMINISTA: sinónimos del catálogo
 * filtrados por el dominio y el rango que admiten los tipos de los extremos.
 * Si la lectura no es segura, cae al genérico «relacionado_con»: un predicado
 * inventado es peor que uno honesto (US2-AC3).
 */

import type { EdgeRelationKind } from "../edge-relations";
import type { NotationId, PredicadoDecl } from "../notations";
import { admite, describirTerminos, predicadoDe, tboxDe, type Tbox } from "./tbox";
import type { Hallazgo } from "./types";

/** El predicado genérico: sin dominio ni rango, nunca miente. */
export const GENERICO = "relacionado_con";

export type Confianza = "confirmado" | "alta" | "media" | "generica";

export interface Sugerencia {
  id: string;
  confianza: Confianza;
  /** Ids de los predicados que admiten estos extremos (específicos primero). */
  compatibles: string[];
}

/** Lo que importa de una arista para leerla. */
export interface AristaLeible {
  descripcion?: string;
  relation?: EdgeRelationKind;
  predicado?: string;
}

const SUFIJOS = ["ando", "iendo", "aron", "ieron", "an", "en", "ar", "er", "ir", "r", "a", "e", "o", "n", "s"];

/** Raíz pobre pero estable: «emiten», «emitir» y «emite» dan lo mismo. */
function raiz(palabra: string): string {
  for (const s of SUFIJOS) {
    if (palabra.endsWith(s) && palabra.length - s.length >= 3) return palabra.slice(0, -s.length);
  }
  return palabra;
}

/**
 * Etiqueta → raíces de sus palabras. Se tira lo que va entre corchetes (la
 * tecnología de C4: «Usa [HTTPS]»), los acentos y la puntuación.
 */
export function normalizarEtiqueta(texto: string | undefined): string[] {
  return (texto ?? "")
    .replace(/\[[^\]]*\]/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, " ")
    .trim()
    .split(/\s+/)
    // «emite:» es «emite»; el «:» sólo vale por dentro («1:n»).
    .map((w) => w.replace(/^:+|:+$/g, ""))
    .filter(Boolean)
    .map(raiz);
}

/** ¿Las raíces del sinónimo son un prefijo de las de la etiqueta? */
const empiezaCon = (etiqueta: string[], sinonimo: string[]): boolean =>
  sinonimo.length > 0 && sinonimo.length <= etiqueta.length && sinonimo.every((w, i) => etiqueta[i] === w);

const esEspecifico = (p: PredicadoDecl) => !!(p.dominio?.length || p.rango?.length);

function compatiblesEn(t: Tbox, tipoOrigen: string, tipoDestino: string): PredicadoDecl[] {
  const ok = t.predicados.filter((p) => admite(t, p, tipoOrigen, "dominio") && admite(t, p, tipoDestino, "rango"));
  // Específicos primero; el genérico, al final de todo.
  return [
    ...ok.filter(esEspecifico),
    ...ok.filter((p) => !esEspecifico(p) && p.id !== GENERICO),
    ...ok.filter((p) => p.id === GENERICO),
  ];
}

/** Predicados que admiten esos extremos (US2-AC2: lo que se ofrece al corregir). */
export function predicadosCompatibles(
  tipoOrigen: string,
  tipoDestino: string,
  notation: NotationId | string | undefined
): PredicadoDecl[] {
  return compatiblesEn(tboxDe(notation), tipoOrigen, tipoDestino);
}

/** Propone el predicado de una arista (FR-011). */
export function sugerirPredicado(
  arista: AristaLeible,
  origen: { tipo_elemento: string },
  destino: { tipo_elemento: string },
  notation: NotationId | string | undefined
): Sugerencia {
  const t = tboxDe(notation);
  const compatibles = compatiblesEn(t, origen.tipo_elemento, destino.tipo_elemento);
  const ids = compatibles.map((p) => p.id);

  // Lo que confirmó una persona no se discute acá (la validación lo avisa aparte).
  if (arista.predicado && predicadoDe(t, arista.predicado))
    return { id: arista.predicado, confianza: "confirmado", compatibles: ids };

  // La relación UML/MER ya ES el significado (FR-005).
  if (arista.relation) {
    const porRelacion = compatibles.find((p) => p.relacion === arista.relation);
    if (porRelacion) return { id: porRelacion.id, confianza: "alta", compatibles: ids };
  }

  const etiqueta = normalizarEtiqueta(arista.descripcion);
  if (etiqueta.length) {
    let mejor = 0;
    let candidatos = new Set<string>();
    for (const p of compatibles) {
      for (const s of p.sinonimos) {
        const raices = normalizarEtiqueta(s);
        if (!empiezaCon(etiqueta, raices)) continue;
        if (raices.length > mejor) {
          mejor = raices.length;
          candidatos = new Set([p.id]);
        } else if (raices.length === mejor) candidatos.add(p.id);
      }
    }
    if (candidatos.size === 1) return { id: [...candidatos][0], confianza: "alta", compatibles: ids };
    return { id: GENERICO, confianza: "generica", compatibles: ids };
  }

  // Sin etiqueta: sólo si los roles dejan UNA lectura posible (R-07).
  const porRoles = compatibles.filter((p) => p.dominio?.length && p.rango?.length);
  if (porRoles.length === 1) return { id: porRoles[0].id, confianza: "media", compatibles: ids };
  return { id: GENERICO, confianza: "generica", compatibles: ids };
}

/**
 * ¿Ese predicado vale entre esos tipos? Hallazgo de dominio/rango con los
 * compatibles como sugerencia (US2-AC2), o `null` si cumple.
 */
export function validarPredicado(
  id: string,
  tipoOrigen: string,
  tipoDestino: string,
  notation: NotationId | string | undefined
): Hallazgo | null {
  const t = tboxDe(notation);
  const compatibles = compatiblesEn(t, tipoOrigen, tipoDestino).map((p) => p.id);
  const p = predicadoDe(t, id);
  if (!p)
    return {
      forma: "PREDICADO-DESCONOCIDO",
      severidad: "error",
      mensaje: `«${id}» no es un predicado de esta notación.`,
      sugerencia: `Compatibles: ${compatibles.join(", ")}.`,
    };
  const okDominio = admite(t, p, tipoOrigen, "dominio");
  const okRango = admite(t, p, tipoDestino, "rango");
  if (okDominio && okRango) return null;
  const lado = !okDominio ? `el origen (${tipoOrigen})` : `el destino (${tipoDestino})`;
  return {
    forma: "DOMINIO-RANGO",
    severidad: "aviso",
    mensaje: `«${p.id}» no admite ${lado}: va de ${describirTerminos(t, p.dominio)} a ${describirTerminos(t, p.rango)}.`,
    esperado: `${describirTerminos(t, p.dominio)} → ${describirTerminos(t, p.rango)}`,
    encontrado: `${tipoOrigen} → ${tipoDestino}`,
    sugerencia: `Compatibles: ${compatibles.join(", ")}.`,
  };
}
