/**
 * @fileOverview Lo que el reglamento ya decide sobre el paso siguiente (#766) — PURO.
 *
 * `suggest-next` y `link-label` le pedían al modelo algo que la TBox muchas
 * veces ya sabe: después de un Evento del Event Storming sólo cabe una Política
 * (`activa`); una flecha Comando → Evento sólo puede significar `dispara`. Acá
 * se responde eso sin modelo, y cuando hay varias lecturas se devuelven como
 * opciones cerradas para el prompt. Sólo cuentan los predicados ESPECÍFICOS
 * (con dominio y rango): los universales («relacionado con») valen entre
 * cualquier par y no dicen nada.
 */

import { notationTypes, type NotationId, type PredicadoDecl } from "../notations";
import { admite, tboxDe, type Tbox } from "./tbox";

export interface PasoPosible {
  /** Tipo de elemento destino, tal como lo nombra la notación. */
  tipo: string;
  predicado: string;
  /** Cómo se lee la flecha: el rótulo natural. */
  etiqueta: string;
}

const especificos = (t: Tbox): PredicadoDecl[] => t.predicados.filter((p) => p.dominio?.length && p.rango?.length);

/**
 * Tipos que pueden seguir a `tipo` según el reglamento, con el predicado que
 * los une. Un tipo aparece una sola vez (con el primer predicado declarado que
 * lo admite) para que la lista sirva de opciones cerradas.
 */
export function siguientesPosibles(tipo: string, notation: NotationId | string | undefined): PasoPosible[] {
  const t = tboxDe(notation);
  const tipos = notationTypes(notation as NotationId);
  const out: PasoPosible[] = [];
  const vistos = new Set<string>();
  for (const p of especificos(t)) {
    if (!admite(t, p, tipo, "dominio")) continue;
    for (const destino of tipos) {
      if (vistos.has(destino) || !admite(t, p, destino, "rango")) continue;
      vistos.add(destino);
      out.push({ tipo: destino, predicado: p.id, etiqueta: p.etiqueta });
    }
  }
  return out;
}

/** El rótulo de la flecha si el par de tipos admite UN solo predicado específico; si no, `null`. */
export function rotuloDeterminista(tipoOrigen: string, tipoDestino: string, notation: NotationId | string | undefined): string | null {
  const ok = rotulosAdmitidos(tipoOrigen, tipoDestino, notation);
  return ok.length === 1 ? ok[0] : null;
}

/** Rótulos de los predicados específicos que admite el par: las opciones cerradas del prompt. */
export function rotulosAdmitidos(tipoOrigen: string, tipoDestino: string, notation: NotationId | string | undefined): string[] {
  const t = tboxDe(notation);
  return especificos(t)
    .filter((p) => admite(t, p, tipoOrigen, "dominio") && admite(t, p, tipoDestino, "rango"))
    .map((p) => p.etiqueta);
}
