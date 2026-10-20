/**
 * @fileOverview De la respuesta del agente (markdown) a texto que se puede leer
 * en voz alta, partido en frases.
 *
 * El agente responde en markdown: leído tal cual, Kokoro pronuncia asteriscos,
 * almohadillas y URLs. Además el fonematizador sólo entiende letras, así que los
 * números van en palabras y las siglas deletreadas. Partir en frases hace que el
 * primer audio salga en cuanto está la primera, sin esperar la respuesta entera.
 */

import { deletrear } from "./g2p-es";

const UNIDADES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
  "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
  "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis",
  "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

function menorQueMil(n: number): string {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 30) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]);
    }
  }
  return partes.join(" ");
}

/** «uno» se apocopa delante de «mil» y «millones»: «veintiún mil», «un millón». */
const apocopar = (s: string) => s.replace(/uno$/, "ún").replace(/^ún$/, "un");

/** Entero no negativo en palabras (hasta los cientos de millones). */
export function numeroEnPalabras(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  n = Math.floor(n);
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? "un millón" : `${apocopar(menorQueMil(millones))} millones`);
  if (miles) partes.push(miles === 1 ? "mil" : `${apocopar(menorQueMil(miles))} mil`);
  if (resto) partes.push(menorQueMil(resto));
  return partes.join(" ");
}

/** Número del texto («3», «2,5», «1.000», «40%») en palabras. */
function numeroDelTexto(crudo: string): string {
  const pct = crudo.endsWith("%");
  let s = pct ? crudo.slice(0, -1) : crudo;
  let decimal = "";
  // «2,5» y «2.5» son decimales; «1.000» y «1,000» (tres cifras) son miles.
  const m = s.match(/^(\d+)[.,](\d{1,2})$/);
  if (m) {
    s = m[1];
    decimal = ` coma ${m[2].startsWith("0") ? "cero " : ""}${numeroEnPalabras(Number(m[2]))}`;
  } else s = s.replace(/[.,]/g, "");
  return `${numeroEnPalabras(Number(s))}${decimal}${pct ? " por ciento" : ""}`;
}

/** Cierra la línea con una pausa si no la trae. */
const conPausa = (linea: string) => (/[.!?…:;,]$/.test(linea) ? linea : `${linea}.`);

export function textoHablable(markdown: string): string {
  const sinBloques = markdown.replace(/```[\s\S]*?(```|$)/g, "\n");
  const lineas = sinBloques
    .split(/\n+/)
    .map((l) =>
      l
        // Separador de tabla: no dice nada.
        .replace(/^\s*\|?[\s:-]*\|[\s|:-]*$/, "")
        .replace(/^\s*\|(.*)\|\s*$/, (_, c: string) => c.split("|").map((x) => x.trim()).join(", "))
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*>\s?/, "")
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/https?:\/\/\S+/g, "un enlace")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
        .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
        .replace(/\d+(?:[.,]\d+)*%?/g, numeroDelTexto)
        // Siglas: 2 a 6 mayúsculas seguidas, como palabra suelta.
        .replace(/\b[A-ZÑ]{2,6}\b/g, (s) => deletrear(s))
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean);
  return lineas.map(conPausa).join(" ");
}

/**
 * Frases de hasta `max` caracteres. Kokoro admite ~510 fonemas por pasada, y una
 * frase más corta también suena antes. Lo que no entra se corta en comas, y si
 * aun así no entra, en espacios; una palabra imposible se corta a la fuerza.
 */
export function partirEnFrases(texto: string, max = 240): string[] {
  const frases = texto.match(/[^.!?…]+[.!?…]*/g)?.map((f) => f.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  for (const f of frases) {
    if (f.length <= max) {
      out.push(f);
      continue;
    }
    let actual = "";
    for (const pieza of f.split(/(?<=[,;:])\s+|\s+/)) {
      const junto = actual ? `${actual} ${pieza}` : pieza;
      if (junto.length <= max) {
        actual = junto;
        continue;
      }
      if (actual) out.push(actual);
      let resto = pieza;
      while (resto.length > max) {
        out.push(resto.slice(0, max));
        resto = resto.slice(max);
      }
      actual = resto;
    }
    if (actual) out.push(actual);
  }
  return out;
}
