/**
 * @fileOverview Persistencia de los perfiles de marca (PURO, spec 023).
 *
 * Viven en `localStorage` del equipo (como el tema y los archivos guardados):
 * es de quien mira, y es portable a la edición web. Lo guardado puede traer
 * basura de una versión anterior o de una mano torpe: leer es TOLERANTE y
 * nunca lanza; lo que no es un perfil se descarta en silencio.
 */

import { EDITORIAL_TOKENS } from "../skin";
import { normalizarColor, type PerfilDeMarca, type TokenDeMarca } from "./profile";

export const BRAND_STORAGE_KEY = "brand_profiles";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Un perfil válido a partir de cualquier cosa, o `null`. */
export function leerPerfil(v: unknown): PerfilDeMarca | null {
  if (!esObjeto(v) || typeof v.id !== "string" || !v.id.trim()) return null;
  const tokens: Partial<Record<TokenDeMarca, string>> = {};
  if (esObjeto(v.tokens)) {
    for (const t of EDITORIAL_TOKENS) {
      const n = typeof v.tokens[t] === "string" ? normalizarColor(v.tokens[t] as string) : null;
      if (n) tokens[t] = n;
    }
  }
  return {
    id: v.id.trim(),
    orgId: typeof v.orgId === "string" && v.orgId.trim() ? v.orgId.trim() : null,
    nombre: typeof v.nombre === "string" && v.nombre.trim() ? v.nombre.trim() : v.id.trim(),
    tokens,
    ...(typeof v.fuente === "string" && v.fuente.trim() ? { fuente: v.fuente.trim() } : {}),
    recibo: Array.isArray(v.recibo) ? v.recibo.filter((l): l is string => typeof l === "string") : [],
    fecha: typeof v.fecha === "string" ? v.fecha : "",
  };
}

/** Lista de perfiles desde el JSON guardado; basura → lista vacía. */
export function leerPerfiles(json: string | null | undefined): PerfilDeMarca[] {
  if (!json) return [];
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    const vistos = new Set<string>();
    const out: PerfilDeMarca[] = [];
    for (const v of data) {
      const p = leerPerfil(v);
      if (!p || vistos.has(p.id)) continue;
      vistos.add(p.id);
      out.push(p);
    }
    return out;
  } catch {
    return [];
  }
}

export function serializarPerfiles(perfiles: readonly PerfilDeMarca[]): string {
  return JSON.stringify(perfiles);
}

/** Reemplaza (o agrega) un perfil por id; devuelve la lista nueva. */
export function guardarPerfil(perfiles: readonly PerfilDeMarca[], perfil: PerfilDeMarca): PerfilDeMarca[] {
  const sin = perfiles.filter((p) => p.id !== perfil.id);
  return [...sin, perfil];
}

export function borrarPerfil(perfiles: readonly PerfilDeMarca[], id: string): PerfilDeMarca[] {
  return perfiles.filter((p) => p.id !== id);
}
