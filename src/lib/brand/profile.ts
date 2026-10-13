/**
 * @fileOverview Perfil de marca (PURO, spec 023 · ADR 0006).
 *
 * Un perfil es un mapa de TOKENS de la skin editorial (papel, tinta, atenuado,
 * suave, regla, acento, enlace) con valores propios de una organización, más
 * una familia tipográfica y el RECIBO de dónde salió cada valor. Se aplica
 * redefiniendo las variables `--ed-*` sobre el lienzo (`cssVarsDePerfil`), así
 * que la skin entera lo sigue sin tocar el JSX, y sólo en editorial: la
 * canónica es notación y no se viste.
 *
 * El contraste manda: `validarPerfil` mide cada token contra el papel DEL
 * PERFIL (no contra el del tema de la app) y `ajustarAlUmbral` propone el valor
 * más cercano que cumple, moviendo la luminosidad y conservando el tono. Es el
 * contrato de diagram-design («la tinta sobre el papel clara 4,5:1») con el
 * medidor de la spec 018.
 */

import { EDITORIAL_TOKENS } from "../skin";
import { medirContraste, resolverColor, UMBRAL_NO_TEXTO, UMBRAL_TEXTO, type Rgb } from "../a11y/contrast";

export type TokenDeMarca = (typeof EDITORIAL_TOKENS)[number];

/** Valor de un token tal como vive en el CSS: `h s% l%`. */
export type Triplete = string;

export interface PerfilDeMarca {
  id: string;
  /** Organización que viste; `null` = perfil por defecto (proyectos sin organización). */
  orgId: string | null;
  nombre: string;
  tokens: Partial<Record<TokenDeMarca, Triplete>>;
  /** Familia tipográfica declarada; se usa si está instalada, si no la pila de respaldo. */
  fuente?: string;
  recibo: string[];
  /** ISO (YYYY-MM-DD). */
  fecha: string;
}

export const PERFIL_POR_DEFECTO_ID = "default";

/** Tokens que se usan como TEXTO (4,5:1) y los que son MARCAS esenciales (3:1). */
export const TOKENS_TEXTO: readonly TokenDeMarca[] = ["ink", "muted", "soft", "accent", "link"];
export const TOKENS_MARCA: readonly TokenDeMarca[] = ["rule-solid", "accent", "link"];

/**
 * Los valores con que nace la skin (los mismos de `globals.css`; el test lo
 * exige). Sirven de papel cuando un perfil no lo declara y de relleno para
 * los tokens que una extracción no encontró.
 */
export const TOKENS_POR_DEFECTO: Record<"light" | "dark", Record<TokenDeMarca, Triplete>> = {
  light: {
    paper: "0 0% 96%",
    "paper-2": "0 0% 93%",
    ink: "229 19% 22%",
    muted: "218 19% 38%",
    soft: "223 17% 43%",
    "rule-solid": "220 6% 55%",
    accent: "14 71% 44%",
    link: "218 57% 42%",
  },
  dark: {
    paper: "229 19% 22%",
    "paper-2": "228 19% 27%",
    ink: "0 0% 96%",
    muted: "0 1% 75%",
    soft: "220 16% 64%",
    "rule-solid": "224 8% 50%",
    accent: "19 83% 65%",
    link: "216 63% 66%",
  },
};

// --- Color ------------------------------------------------------------------

const NOMBRES_CSS: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
  gray: "#808080",
  grey: "#808080",
  silver: "#c0c0c0",
  navy: "#000080",
  orange: "#ffa500",
};

export function rgbAHsl({ r, g, b }: Rgb): Triplete {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Partes numéricas de un triplete; `null` si no lo es. */
export function partesDeTriplete(t: string): { h: number; s: number; l: number } | null {
  const m = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(t ?? "");
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/**
 * Cualquier color que una persona pegue → triplete `h s% l%`, o `null` si no
 * se puede medir. Hex (3/6), `rgb()`, `hsl()`, el triplete mismo y unos pocos
 * nombres CSS; nunca entra un color sin pasar por acá.
 */
export function normalizarColor(texto: string): Triplete | null {
  const v = (texto ?? "").trim().toLowerCase();
  if (!v) return null;
  if (partesDeTriplete(v)) return v.replace(/\s+/g, " ");
  // Un color translúcido no es un token: `rgba(0,0,0,0)` es «lo que haya
  // debajo», no negro. Sin eso un reset de fondo entraba como papel negro.
  const alfa = /^(?:rgba|hsla)\([^)]*[,/]\s*([\d.]+%?)\s*\)$/.exec(v)?.[1];
  if (alfa !== undefined) {
    const a = alfa.endsWith("%") ? Number(alfa.slice(0, -1)) / 100 : Number(alfa);
    if (!Number.isFinite(a) || a < 1) return null;
  }
  const rgbM = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/.exec(v);
  if (rgbM) return rgbAHsl({ r: Number(rgbM[1]), g: Number(rgbM[2]), b: Number(rgbM[3]) });
  const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  const hexCompleto = hex3 ? `#${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}` : NOMBRES_CSS[v] ?? v;
  const rgb = resolverColor(hexCompleto);
  return rgb ? rgbAHsl(rgb) : null;
}

/** Tema que implica un papel: claro si es claro, oscuro si no. */
export function temaDePapel(papel: Triplete): "light" | "dark" {
  const p = partesDeTriplete(papel);
  return !p || p.l >= 50 ? "light" : "dark";
}

// --- Contraste ---------------------------------------------------------------

export interface MedidaDeToken {
  token: TokenDeMarca;
  valor: Triplete;
  umbral: number;
  ratio: number | null;
  ok: boolean;
  /** Valor ajustado que cumple, si el original no; `null` si no se encontró. */
  propuesta: Triplete | null;
  ratioPropuesta: number | null;
}

const ratioDe = (color: Triplete, papel: Triplete): number | null => medirContraste(color, papel, 1).ratio;

/**
 * Mueve la luminosidad del color —alejándola del papel, en pasos de 1 %— hasta
 * cumplir el umbral. Tono y saturación se conservan: sigue siendo «su» color,
 * más oscuro o más claro. `null` si ni el extremo alcanza.
 */
export function ajustarAlUmbral(color: Triplete, papel: Triplete, umbral: number): { valor: Triplete; ratio: number } | null {
  const c = partesDeTriplete(color);
  const p = partesDeTriplete(papel);
  if (!c || !p) return null;
  const direccion = p.l >= 50 ? -1 : 1;
  for (let l = c.l; l >= 0 && l <= 100; l += direccion) {
    const candidato = `${c.h} ${c.s}% ${l}%`;
    const r = ratioDe(candidato, papel);
    if (r !== null && r >= umbral) return { valor: candidato, ratio: r };
  }
  return null;
}

/** Mide cada token presente contra el papel del perfil (o el del tema que implique). */
export function validarPerfil(tokens: Partial<Record<TokenDeMarca, Triplete>>): MedidaDeToken[] {
  const papel = tokens.paper ?? TOKENS_POR_DEFECTO.light.paper;
  const out: MedidaDeToken[] = [];
  for (const token of EDITORIAL_TOKENS) {
    const valor = tokens[token];
    if (!valor || token === "paper" || token === "paper-2") continue;
    const esTexto = TOKENS_TEXTO.includes(token);
    const esMarca = TOKENS_MARCA.includes(token);
    if (!esTexto && !esMarca) continue;
    const umbral = esTexto ? UMBRAL_TEXTO : UMBRAL_NO_TEXTO;
    const ratio = ratioDe(valor, papel);
    const ok = ratio !== null && ratio >= umbral;
    const ajuste = ok ? null : ajustarAlUmbral(valor, papel, umbral);
    out.push({ token, valor, umbral, ratio, ok, propuesta: ajuste?.valor ?? null, ratioPropuesta: ajuste?.ratio ?? null });
  }
  return out;
}

/** Tokens que faltan, derivados de los que hay: papel-2 del papel, suave y regla de la tinta/atenuado. */
export function completarTokens(tokens: Partial<Record<TokenDeMarca, Triplete>>): Record<TokenDeMarca, Triplete> {
  const papel = tokens.paper ?? TOKENS_POR_DEFECTO.light.paper;
  const base = TOKENS_POR_DEFECTO[temaDePapel(papel)];
  const p = partesDeTriplete(papel) ?? partesDeTriplete(base.paper)!;
  const oscuro = p.l < 50;
  const derivado = (t: Triplete | undefined, dl: number): Triplete | undefined => {
    const x = t ? partesDeTriplete(t) : null;
    return x ? `${x.h} ${x.s}% ${Math.min(100, Math.max(0, x.l + dl))}%` : undefined;
  };
  return {
    paper: papel,
    "paper-2": tokens["paper-2"] ?? derivado(papel, oscuro ? 5 : -3) ?? base["paper-2"],
    ink: tokens.ink ?? base.ink,
    muted: tokens.muted ?? base.muted,
    soft: tokens.soft ?? derivado(tokens.muted, oscuro ? -10 : 5) ?? base.soft,
    "rule-solid": tokens["rule-solid"] ?? derivado(tokens.muted, oscuro ? -25 : 17) ?? base["rule-solid"],
    accent: tokens.accent ?? base.accent,
    link: tokens.link ?? tokens.accent ?? base.link,
  };
}

// --- Aplicación ----------------------------------------------------------------

/** Variables CSS que el lienzo pone sobre su raíz en editorial. Sin perfil, nada. */
export function cssVarsDePerfil(perfil: PerfilDeMarca | null | undefined): Record<string, string> {
  if (!perfil) return {};
  const out: Record<string, string> = {};
  for (const token of EDITORIAL_TOKENS) {
    const v = perfil.tokens[token];
    if (v) out[`--ed-${token}`] = v;
  }
  return out;
}

/** El perfil que viste a un proyecto: el de su organización, si no el por defecto, si no ninguno. */
export function perfilVigente(orgId: string | null | undefined, perfiles: readonly PerfilDeMarca[]): PerfilDeMarca | null {
  if (orgId) {
    const propio = perfiles.find((p) => p.orgId === orgId);
    if (propio) return propio;
  }
  return perfiles.find((p) => p.orgId === null) ?? null;
}
