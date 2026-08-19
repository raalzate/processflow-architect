/**
 * @fileOverview Herramientas para trabajar un documento LARGO: índice de
 * encabezados, estadísticas y búsqueda/reemplazo (PURO).
 *
 * El visor servía para un artefacto de veinte líneas: un `textarea` y a mirar.
 * Con un documento de verdad (drivers de un sistema real, propuesta técnica) no
 * se puede navegar ni encontrar nada, así que el editor necesita índice, contador
 * y búsqueda. Todo eso son funciones de texto: viven acá con prueba y el
 * componente sólo las llama (§P3).
 *
 * Regla que atraviesa el módulo: **lo que está dentro de una valla ``` no es
 * documento**. Un `#` en un bloque de código no es un encabezado y una palabra
 * de Mermaid no cuenta como palabra del texto.
 */

/** Encabezado Markdown con su posición, para saltar el cursor ahí. */
export interface Heading {
  level: number;
  text: string;
  /** Línea (0-based). */
  line: number;
  /** Offset absoluto del inicio de la línea en el texto. */
  offset: number;
}

/** Offsets del inicio de cada línea (índice = número de línea, 0-based). */
export function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

/** ¿Esta línea abre o cierra una valla de código? */
const esValla = (linea: string) => /^\s*(```|~~~)/.test(linea);

/**
 * Índice del documento. Soporta `#`…`######`; ignora los que caen dentro de una
 * valla de código y las líneas de subrayado (`===`), que no son encabezados
 * ATX y no aparecen en lo que genera el agente.
 */
export function documentOutline(text: string): Heading[] {
  const lineas = (text ?? "").split("\n");
  const offsets = lineOffsets(text ?? "");
  const out: Heading[] = [];
  let dentroDeValla = false;
  lineas.forEach((linea, i) => {
    if (esValla(linea)) {
      dentroDeValla = !dentroDeValla;
      return;
    }
    if (dentroDeValla) return;
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(linea);
    if (!m) return;
    out.push({ level: m[1].length, text: m[2].trim(), line: i, offset: offsets[i] });
  });
  return out;
}

export interface DocStats {
  words: number;
  chars: number;
  lines: number;
  headings: number;
  /** Minutos de lectura a 200 palabras/minuto, mínimo 1 si hay texto. */
  readingMinutes: number;
}

/** Palabras del documento, sin contar el interior de las vallas de código. */
function palabrasDeProsa(text: string): number {
  const lineas = (text ?? "").split("\n");
  let dentro = false;
  let total = 0;
  for (const linea of lineas) {
    if (esValla(linea)) {
      dentro = !dentro;
      continue;
    }
    if (dentro) continue;
    // Se descuentan los marcadores de Markdown: no son palabras del texto.
    const limpia = linea
      .replace(/`[^`]*`/g, " ")
      .replace(/[*_#>|~\-]+/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    // Un token sin letras ni dígitos (un "." que quedó suelto al limpiar los
    // marcadores) no es una palabra: inflaba la cuenta del documento.
    const palabras = limpia.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
    total += palabras.length;
  }
  return total;
}

export function documentStats(text: string): DocStats {
  const t = text ?? "";
  const words = palabrasDeProsa(t);
  return {
    words,
    chars: t.length,
    lines: t ? t.split("\n").length : 0,
    headings: documentOutline(t).length,
    readingMinutes: words ? Math.max(1, Math.round(words / 200)) : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Búsqueda y reemplazo                                                       */
/* -------------------------------------------------------------------------- */

export interface Match {
  start: number;
  end: number;
}

export interface SearchOptions {
  caseSensitive?: boolean;
}

/**
 * Todas las coincidencias literales de `query`. Literal a propósito: quien edita
 * un documento busca "SLA 99,9 %", no una expresión regular, y un `(` suelto no
 * puede reventar la búsqueda.
 */
export function findMatches(text: string, query: string, opts: SearchOptions = {}): Match[] {
  const q = query ?? "";
  if (!q) return [];
  const heno = opts.caseSensitive ? (text ?? "") : (text ?? "").toLowerCase();
  const aguja = opts.caseSensitive ? q : q.toLowerCase();
  const out: Match[] = [];
  let desde = 0;
  for (;;) {
    const i = heno.indexOf(aguja, desde);
    if (i === -1) break;
    out.push({ start: i, end: i + aguja.length });
    desde = i + aguja.length; // sin solapamiento: es lo que espera un editor
  }
  return out;
}

/** Índice de la coincidencia siguiente a partir del cursor (cíclico). */
export function nextMatchIndex(matches: Match[], cursor: number, backwards = false): number {
  if (!matches.length) return -1;
  if (backwards) {
    // `end <= cursor`: con el cursor DENTRO de una coincidencia, «anterior» es la
    // de antes, no la que está ocupando el cursor.
    for (let i = matches.length - 1; i >= 0; i--) if (matches[i].end <= cursor) return i;
    return matches.length - 1;
  }
  for (let i = 0; i < matches.length; i++) if (matches[i].start >= cursor) return i;
  return 0;
}

/** Reemplaza UNA coincidencia (la del rango dado). */
export function replaceMatch(text: string, match: Match, replacement: string): string {
  return text.slice(0, match.start) + replacement + text.slice(match.end);
}

/**
 * Reemplaza todas. Se recorre al revés para que los offsets de las siguientes
 * sigan siendo válidos mientras el texto cambia de largo.
 */
export function replaceAllMatches(
  text: string,
  query: string,
  replacement: string,
  opts: SearchOptions = {}
): { text: string; count: number } {
  const matches = findMatches(text, query, opts);
  let out = text ?? "";
  for (let i = matches.length - 1; i >= 0; i--) out = replaceMatch(out, matches[i], replacement);
  return { text: out, count: matches.length };
}
