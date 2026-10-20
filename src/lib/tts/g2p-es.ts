/**
 * @fileOverview Fonematizador del español por reglas (texto → IPA para Kokoro).
 *
 * Kokoro no lee letras: lee fonemas en el formato de espeak-ng, con el que se
 * entrenaron sus voces. kokoro-js trae un espeak compilado SÓLO con inglés, y
 * espeak-ng con español es GPL-3 (este repo es Apache-2.0), así que se hace acá.
 * La ortografía del español es casi fonética: con reglas alcanza. Variante: seseo
 * (es-419), la de Latinoamérica: `z` y `ce/ci` suenan /s/.
 *
 * Lo que no copia de espeak: la ɛ abierta y el acento secundario ˌ. No cambian
 * el audio de forma audible y complican las reglas sin necesidad.
 */

import { deRegistro, enRegistro } from "@/lib/registro";

const ACENTUADAS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };
const FUERTES = new Set(["a", "e", "o", "á", "é", "í", "ó", "ú"]);
const VOCALES = new Set(["a", "e", "i", "o", "u", "á", "é", "í", "ó", "ú", "ü"]);

/** Átonas: llevarles acento las hace sonar enfáticas («el» como «él»). */
const ATONAS = new Set([
  "el", "la", "los", "las", "lo", "le", "les", "un", "una", "unos", "unas",
  "de", "del", "a", "al", "en", "con", "por", "para", "sin", "y", "e", "o", "u", "ni",
  "que", "se", "me", "te", "nos", "os", "mi", "mis", "tu", "tus", "su", "sus", "si",
]);

/** Símbolos que Kokoro admite además de los fonemas: la prosodia sale de ellos. */
const PUNTUACION = /[;:,.!?¡¿—…"«»“”()\s-]/;

interface Letra {
  /** La letra tal cual (minúscula, con tilde si la tiene). */
  c: string;
  /** Índice en la palabra original: para mirar vecinos. */
  i: number;
}

/**
 * Letras que suenan como vocal. La `u` de «que/qui/gue/gui» es muda y la `y`
 * final tras vocal («muy», «rey») es la semivocal de un diptongo.
 */
function esVocal(w: string, i: number): boolean {
  const c = w[i];
  if (c === "u" && (w[i - 1] === "q" || w[i - 1] === "g") && /[eiéí]/.test(w[i + 1] ?? "")) return false;
  if (c === "y") return i === w.length - 1 && i > 0 && VOCALES.has(w[i - 1]);
  return VOCALES.has(c);
}

/** Núcleos silábicos: cada uno es la lista de índices de sus vocales. */
function nucleos(w: string): number[][] {
  const out: number[][] = [];
  let grupo: number[] = [];
  const cerrar = () => {
    if (!grupo.length) return;
    // Dentro de un grupo de vocales, dos fuertes (o una débil con tilde) van en
    // sílabas distintas: es hiato. Lo demás es diptongo o triptongo.
    let actual: number[] = [grupo[0]];
    for (let k = 1; k < grupo.length; k++) {
      const prev = w[grupo[k - 1]];
      const cur = w[grupo[k]];
      if (FUERTES.has(prev) && FUERTES.has(cur)) {
        out.push(actual);
        actual = [grupo[k]];
      } else actual.push(grupo[k]);
    }
    out.push(actual);
    grupo = [];
  };
  for (let i = 0; i < w.length; i++) {
    if (esVocal(w, i)) grupo.push(i);
    else if (w[i] !== "h") cerrar(); // la h es muda: «ahora» es a-o-ra
  }
  cerrar();
  return out;
}

/** La vocal que manda en el núcleo: la fuerte; entre dos débiles, la segunda. */
function principal(w: string, nucleo: number[]): number {
  const fuerte = nucleo.find((i) => FUERTES.has(w[i]));
  if (fuerte !== undefined) return fuerte;
  const sinYFinal = nucleo.filter((i) => w[i] !== "y");
  return sinYFinal[sinYFinal.length - 1] ?? nucleo[nucleo.length - 1];
}

/** Índice de la vocal tónica, o -1 si la palabra es átona. */
function tonica(w: string, ns: number[][]): number {
  const tilde = [...w].findIndex((c) => enRegistro(ACENTUADAS, c));
  if (tilde >= 0) return tilde;
  if (ATONAS.has(w) || !ns.length) return -1;
  if (ns.length === 1) return principal(w, ns[0]);
  // Llana si termina en vocal, n o s; aguda si no.
  const llana = /[aeiouns]$/.test(w);
  return principal(w, ns[llana ? ns.length - 2 : ns.length - 1]);
}

const OCLUSIVA_TRAS = new Set(["m", "n"]);

/** IPA de UNA palabra (sólo letras). */
export function fonemasDePalabra(palabra: string): string {
  const w = palabra.toLowerCase();
  if (!w) return "";
  if (w === "y") return "i";
  const ns = nucleos(w);
  const tilde = tonica(w, ns);
  // Vocales que son semivocal (la débil que no manda en su núcleo).
  const semivocal = new Set<number>();
  for (const n of ns) {
    const p = principal(w, n);
    for (const i of n) if (i !== p && !FUERTES.has(w[i])) semivocal.add(i);
  }

  let out = "";
  /** Último sonido emitido: decide oclusiva vs. fricativa. */
  let antes = "";
  const emitir = (s: string) => {
    out += s;
    antes = s;
  };
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const sig = w[i + 1] ?? "";
    const inicio = out.replace(/ˈ/g, "") === "";
    if (esVocal(w, i)) {
      if (i === tilde) out += "ˈ";
      const base = deRegistro(ACENTUADAS, c) ?? (c === "ü" ? "u" : c === "y" ? "i" : c);
      if (semivocal.has(i)) emitir(base === "i" ? "j" : base === "u" ? "w" : base);
      else emitir(base);
      continue;
    }
    switch (c) {
      case "h":
      case "u":
        break; // muda: la h siempre, la u de «que/qui/gue/gui» («ch» se resuelve en la c)
      case "c":
        if (sig === "h") {
          emitir("tʃ");
          i++;
        } else emitir(/[eiéí]/.test(sig) ? "s" : "k");
        break;
      case "q":
        emitir("k"); // la u que sigue es muda (esVocal)
        break;
      case "z":
        emitir("s");
        break;
      case "j":
        emitir("x");
        break;
      case "g":
        if (/[eiéí]/.test(sig)) emitir("x");
        else emitir(inicio || antes === "n" || antes === "ŋ" ? "ɡ" : "ɣ");
        break;
      case "b":
      case "v":
        emitir(inicio || OCLUSIVA_TRAS.has(antes) ? "b" : "β");
        break;
      case "d":
        emitir(inicio || antes === "n" || antes === "l" || i === w.length - 1 ? "d" : "ð");
        break;
      case "l":
        if (sig === "l") {
          emitir("ʝ");
          i++;
        } else emitir("l");
        break;
      case "y":
        emitir("ʝ");
        break;
      case "ñ":
        emitir("ɲ");
        break;
      case "r":
        if (sig === "r") {
          emitir("r");
          i++;
        } else emitir(inicio || ["n", "l", "s"].includes(antes) ? "r" : "ɾ");
        break;
      case "n":
        // Nasal velar ante /k/ y /ɡ/: «tengo», «banco».
        emitir(/[gkq]/.test(sig) || (sig === "c" && !/[eiéí]/.test(w[i + 2] ?? "")) ? "ŋ" : "n");
        break;
      case "x":
        emitir("ks");
        break;
      default:
        if (/[a-z]/.test(c)) emitir(c);
    }
  }
  return out;
}

/**
 * Frase entera: las palabras pasan por `fonemasDePalabra` y la puntuación queda
 * tal cual. Lo que no es letra ni puntuación conocida se descarta: un símbolo
 * fuera del vocabulario de Kokoro lo hace balbucear.
 */
export function fonematizar(texto: string): string {
  let out = "";
  let palabra = "";
  const volcar = () => {
    if (palabra) out += fonemasDePalabra(palabra);
    palabra = "";
  };
  for (const ch of texto) {
    if (/[a-záéíóúüñ]/i.test(ch)) palabra += ch;
    else {
      volcar();
      if (PUNTUACION.test(ch)) out += /\s/.test(ch) ? " " : ch;
    }
  }
  volcar();
  return out.replace(/ {2,}/g, " ").trim();
}

/** Letra por letra, para siglas («UML» → «u eme ele»). */
const NOMBRE_DE_LETRA: Record<string, string> = {
  a: "a", b: "be", c: "se", d: "de", e: "e", f: "efe", g: "je", h: "ache", i: "i",
  j: "jota", k: "ka", l: "ele", m: "eme", n: "ene", ñ: "eñe", o: "o", p: "pe", q: "cu",
  r: "erre", s: "ese", t: "te", u: "u", v: "uve", w: "doble uve", x: "equis", y: "ye", z: "seta",
};

export function deletrear(sigla: string): string {
  return [...sigla.toLowerCase()].map((c) => deRegistro(NOMBRE_DE_LETRA, c) ?? "").filter(Boolean).join(" ");
}
