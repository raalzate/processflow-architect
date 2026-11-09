/**
 * @fileOverview Exportar el conocimiento como archivo (spec 027 · T32) — PURO.
 *
 * Lo comparten el menú Exportar de la app y la tool MCP `export_knowledge`:
 * el formato decide la sintaxis, la extensión y el tipo MIME. No hay camino de
 * vuelta (US7-AC4): el export es para otras herramientas, no se reimporta.
 */

import type { Conocimiento } from "./conocimiento";
import { aJsonLd } from "./jsonld";
import { aTurtle } from "./turtle";

export type FormatoConocimiento = "jsonld" | "turtle";

export interface ArchivoConocimiento {
  contenido: string;
  nombre: string;
  mime: string;
}

export function exportarConocimiento(
  k: Conocimiento,
  formato: FormatoConocimiento,
  opts: { deducidos: boolean; base?: string }
): ArchivoConocimiento {
  const base = (opts.base || "conocimiento").replace(/[^\w.-]+/g, "_");
  const sufijo = opts.deducidos ? "-con-deducidos" : "";
  return formato === "jsonld"
    ? { contenido: aJsonLd(k, opts), nombre: `${base}${sufijo}.jsonld`, mime: "application/ld+json;charset=utf-8" }
    : { contenido: aTurtle(k, opts), nombre: `${base}${sufijo}.ttl`, mime: "text/turtle;charset=utf-8" };
}
