/**
 * @fileOverview Extraer la marca de un sitio (PURO, spec 023).
 *
 * Recibe el HTML y las hojas de estilo de una página (las trae el proceso
 * principal: acá no hay red) y devuelve una PROPUESTA de tokens con su
 * evidencia: de qué selector y propiedad salió cada color. Son heurísticas
 * de texto —ni se renderiza ni se ejecuta nada— y por eso valen sin IA: la IA
 * (spec 023, `brandFromSiteTask`) sólo mejora el mapeo sobre estos candidatos,
 * nunca inventa un color que la página no tenga.
 */

import { normalizarColor, partesDeTriplete, type TokenDeMarca, type Triplete } from "./profile";

export interface FuenteDeSitio {
  html: string;
  css: string[];
  url: string;
  urlFinal?: string;
}

export interface Candidato {
  color: Triplete;
  veces: number;
  /** `selector · propiedad`, de los primeros sitios donde apareció. */
  contextos: string[];
}

export interface Extraccion {
  tokens: Partial<Record<TokenDeMarca, Triplete>>;
  fuente?: string;
  candidatos: Candidato[];
  /** Una línea por decisión: «papel ← body { background-color }». */
  evidencia: string[];
}

const COLOR = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;

interface Declaracion {
  selector: string;
  prop: string;
  valor: string;
}

/** `<style>` del HTML más las hojas, en declaraciones `selector · prop: valor`. */
export function declaracionesDe(f: FuenteDeSitio): Declaracion[] {
  const estilos = [...f.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const todo = [...estilos, ...f.css].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Declaracion[] = [];
  // Bloques `selector { decl; decl }`; los @media se abren y su contenido cae
  // en el mismo barrido, así que las reglas internas se leen igual.
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of todo.matchAll(re)) {
    const selector = m[1].trim().replace(/\s+/g, " ").slice(0, 160);
    if (selector.startsWith("@")) continue;
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      out.push({ selector, prop: d.slice(0, i).trim().toLowerCase(), valor: d.slice(i + 1).trim() });
    }
  }
  // Estilos en línea del HTML también cuentan (sitios con todo inline).
  for (const m of f.html.matchAll(/<([a-z0-9]+)[^>]*\sstyle="([^"]*)"/gi)) {
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      out.push({ selector: `${m[1].toLowerCase()}[style]`, prop: d.slice(0, i).trim().toLowerCase(), valor: d.slice(i + 1).trim() });
    }
  }
  return out;
}

const esFondo = (p: string) => p === "background" || p === "background-color";
const esTexto = (p: string) => p === "color";
const PAPEL_SEL = /^(html|body|:root|\.page|#root|main)\b/;
const TINTA_SEL = /^(html|body|:root|p|main|article|\.content)\b/;
const ACENTO_SEL = /(button|\.btn|\.cta|primary|accent|brand)/i;
const ENLACE_SEL = /(^|[\s,>])a(\b|[:.])/;
const ATENUADO_SEL = /(muted|secondary|caption|small|footer|subtitle|meta)/i;

const luminosidad = (t: Triplete) => partesDeTriplete(t)?.l ?? 50;
const saturacion = (t: Triplete) => partesDeTriplete(t)?.s ?? 0;

/** Candidatos por frecuencia, con contexto; variables `--x: color` incluidas. */
export function candidatosDe(decls: Declaracion[]): Candidato[] {
  const porColor = new Map<string, Candidato>();
  for (const d of decls) {
    for (const crudo of d.valor.match(COLOR) ?? []) {
      const t = normalizarColor(crudo);
      if (!t) continue;
      const c = porColor.get(t) ?? { color: t, veces: 0, contextos: [] };
      c.veces++;
      if (c.contextos.length < 4) c.contextos.push(`${d.selector} · ${d.prop}`);
      porColor.set(t, c);
    }
  }
  return [...porColor.values()].sort((a, b) => b.veces - a.veces);
}

/** Un selector en LISTA (`.x, body, p`) coincide si cualquiera de sus partes coincide. */
const coincide = (selector: string, re: RegExp): boolean => selector.split(",").some((s) => re.test(s.trim()));

function primero(decls: Declaracion[], sel: RegExp, prop: (p: string) => boolean): { color: Triplete; d: Declaracion } | null {
  for (const d of decls) {
    if (!coincide(d.selector, sel) || !prop(d.prop)) continue;
    const crudo = d.valor.match(COLOR)?.[0];
    const t = crudo ? normalizarColor(crudo) : null;
    if (t) return { color: t, d };
  }
  return null;
}

/** Variable CSS `--primary`/`--accent`/`--brand` con color, si la hay. */
function variableDeMarca(decls: Declaracion[]): { color: Triplete; d: Declaracion } | null {
  for (const d of decls) {
    if (!/^--(primary|accent|brand|cta)(-color)?$/.test(d.prop)) continue;
    const crudo = d.valor.match(COLOR)?.[0];
    const t = crudo ? normalizarColor(crudo) : null;
    if (t) return { color: t, d };
  }
  return null;
}

function familia(decls: Declaracion[]): { fuente: string; d: Declaracion } | null {
  for (const d of decls) {
    if (d.prop !== "font-family" || !coincide(d.selector, TINTA_SEL)) continue;
    const f = d.valor.split(",")[0].replace(/["']/g, "").trim();
    if (f && !/^(inherit|initial|var\()/i.test(f)) return { fuente: f, d };
  }
  return null;
}

/** La extracción: tokens, fuente, candidatos y evidencia. Lo que no se encuentra, no se inventa. */
export function extraerMarca(f: FuenteDeSitio): Extraccion {
  const decls = declaracionesDe(f);
  const candidatos = candidatosDe(decls);
  const tokens: Partial<Record<TokenDeMarca, Triplete>> = {};
  const evidencia: string[] = [];
  const anotar = (token: TokenDeMarca, hit: { color: Triplete; d: Declaracion } | null, motivo?: string) => {
    if (!hit) return false;
    tokens[token] = hit.color;
    evidencia.push(`${token} ← ${hit.d.selector} { ${hit.d.prop} }${motivo ? ` (${motivo})` : ""}`);
    return true;
  };

  if (!anotar("paper", primero(decls, PAPEL_SEL, esFondo))) {
    const claro = candidatos.find((c) => luminosidad(c.color) >= 85 && saturacion(c.color) <= 15);
    if (claro) {
      tokens.paper = claro.color;
      evidencia.push(`paper ← color claro más frecuente (${claro.veces} usos: ${claro.contextos[0] ?? ""})`);
    }
  }
  if (!anotar("ink", primero(decls, TINTA_SEL, esTexto))) {
    const oscuro = candidatos.find((c) => luminosidad(c.color) <= 35);
    if (oscuro) {
      tokens.ink = oscuro.color;
      evidencia.push(`ink ← color oscuro más frecuente (${oscuro.veces} usos: ${oscuro.contextos[0] ?? ""})`);
    }
  }
  anotar("muted", primero(decls, ATENUADO_SEL, esTexto));

  const acento = primero(decls, ACENTO_SEL, esFondo) ?? variableDeMarca(decls);
  if (!anotar("accent", acento)) {
    const vivo = candidatos.find(
      (c) => saturacion(c.color) >= 40 && c.color !== tokens.paper && c.color !== tokens.ink && luminosidad(c.color) > 15 && luminosidad(c.color) < 85
    );
    if (vivo) {
      tokens.accent = vivo.color;
      evidencia.push(`accent ← color saturado más frecuente (${vivo.veces} usos: ${vivo.contextos[0] ?? ""})`);
    }
  }
  anotar("link", primero(decls, ENLACE_SEL, esTexto));

  const fam = familia(decls);
  let fuente: string | undefined;
  if (fam) {
    fuente = fam.fuente;
    evidencia.push(`fuente ← ${fam.d.selector} { font-family }: ${fam.fuente}`);
  }
  if (!Object.keys(tokens).length) evidencia.push("la página no declara colores legibles en su CSS: nada que proponer");
  return { tokens, fuente, candidatos, evidencia };
}
