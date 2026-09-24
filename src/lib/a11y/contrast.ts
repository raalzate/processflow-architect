/**
 * @fileOverview Contraste WCAG entre dos colores del repo (PURO).
 *
 * Existe para que «se ve bien» deje de ser una opinión. Los colores de este repo
 * viven en tres formatos distintos y los tres tienen que poder medirse:
 *
 *  - **clase de Tailwind** (`fill-<familia>-<nivel>`, `text-white`), que es como
 *    el registro de notaciones declara la apariencia de cada tipo;
 *  - **`hsl(H S% L%)`**, que es como `globals.css` declara los tokens;
 *  - **hex**, que es lo que el usuario elige en la ficha de un elemento.
 *
 * Lo importante del diseño: un color que este módulo **no sepa resolver no se
 * ignora**. Devolver «no sé» y que el que llama lo cuente como aprobado
 * convertiría el freno en un adorno, que es exactamente el modo en que estas
 * verificaciones mueren. Por eso `resolverColor` devuelve `null` y los barridos
 * tratan ese `null` como falla.
 *
 * Umbrales (WCAG 2.1 AA): 4,5:1 para texto normal, 3:1 para texto grande y para
 * elementos no textuales (bordes, íconos).
 */

import colors from "tailwindcss/colors";

/** Umbral para texto normal. */
export const UMBRAL_TEXTO = 4.5;
/** Umbral para texto grande (≥ 18,66 px en negrita o ≥ 24 px) y para lo no textual. */
export const UMBRAL_NO_TEXTO = 3;

/**
 * Color resuelto: tres canales 0–255 y su opacidad. El alfa no es un adorno —el
 * lienzo usa rellenos translúcidos para que el contenedor deje ver a sus hijos—
 * y medir uno como si fuera opaco da un número que no ve nadie.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
  /** 0–1. Ausente = opaco. */
  a?: number;
}

/**
 * Un color translúcido sobre lo que tenga debajo. Es lo que el ojo ve, y por lo
 * tanto lo que hay que medir.
 */
export function componer(color: Rgb, debajo: Rgb): Rgb {
  const a = color.a ?? 1;
  if (a >= 1) return { r: color.r, g: color.g, b: color.b };
  const mezcla = (c: number, d: number) => Math.round(c * a + d * (1 - a));
  return { r: mezcla(color.r, debajo.r), g: mezcla(color.g, debajo.g), b: mezcla(color.b, debajo.b) };
}

const hexARgb = (hex: string): Rgb | null => {
  const h = hex.trim().replace(/^#/, "");
  const completo = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(completo)) return null;
  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16),
  };
};

/**
 * `hsl(220 13% 26%)` y sus variantes con comas o con `hsl()` implícito, que es
 * como se guardan los tokens: en `globals.css` el valor de la variable son los
 * tres números sueltos y el `hsl()` lo pone Tailwind.
 */
const hslARgb = (valor: string): Rgb | null => {
  const m = valor
    .trim()
    .replace(/^hsla?\(/, "")
    .replace(/\)$/, "")
    .match(/^(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (!m) return null;
  const h = ((Number(m[1]) % 360) + 360) % 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return {
    r: Math.round((r1 + m0) * 255),
    g: Math.round((g1 + m0) * 255),
    b: Math.round((b1 + m0) * 255),
  };
};

/**
 * Clase de Tailwind → color. Acepta cualquier prefijo de utilidad (`fill-`,
 * `text-`, `bg-`, `stroke-`, `border-`) y el prefijo de tema `dark:`, que se
 * descarta: qué tema es lo decide quien llama, no la clase.
 *
 * La opacidad (`/40`) viaja en el alfa del color: quien mida decide sobre qué
 * fondo componerla (`componer`). Medirla sin fondo sigue siendo un error, pero
 * el error lo reporta `medirContraste`, no este resolutor.
 */
const claseARgb = (clase: string): Rgb | null => {
  const sinTema = clase.trim().replace(/^dark:/, "");
  const [limpia, opacidad] = sinTema.split("/");
  const alfa = opacidad === undefined ? 1 : Number(opacidad) / 100;
  if (!Number.isFinite(alfa) || alfa < 0 || alfa > 1) return null;
  const conAlfa = (c: Rgb | null): Rgb | null => (c ? { ...c, a: alfa } : null);
  const m = limpia.match(/^[a-z-]+?-([a-z]+)(?:-(\d{2,3}))?$/);
  if (!m) return null;
  const [, familia, nivel] = m;
  if (familia === "white") return conAlfa(hexARgb("#ffffff"));
  if (familia === "black") return conAlfa(hexARgb("#000000"));
  // `transparent` sí se resuelve: es «lo que haya debajo», y componerlo da
  // exactamente eso. `currentColor` no, porque depende de quién herede.
  if (familia === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (familia === "current" || familia === "inherit") return null;
  const paleta = (colors as unknown as Record<string, unknown>)[familia];
  if (!paleta || typeof paleta !== "object") return null;
  const valor = (paleta as Record<string, string>)[nivel ?? "500"];
  return typeof valor === "string" ? conAlfa(hexARgb(valor)) : null;
};

/**
 * Cualquiera de los tres formatos → color, o `null` si no se sabe. El `null` es
 * información: significa «esto no se puede medir», y quien llama lo reporta.
 */
export function resolverColor(valor: string): Rgb | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  if (v.startsWith("#")) return hexARgb(v);
  if (v.startsWith("hsl")) return hslARgb(v);
  // Tres números sueltos: así viven los tokens en `globals.css`.
  if (/^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(v)) return hslARgb(v);
  return claseARgb(v);
}

/** Luminancia relativa (WCAG 2.1, 1.4.3). */
export function luminancia({ r, g, b }: Rgb): number {
  const canal = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Relación de contraste entre dos colores ya resueltos: de 1:1 a 21:1. */
export function relacion(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, oscuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

/** El resultado de medir un par, con lo necesario para un mensaje de fallo útil. */
export interface Medida {
  ok: boolean;
  /** `null` cuando alguno de los dos colores no se pudo resolver. */
  ratio: number | null;
  umbral: number;
  /** Qué pasó, en una frase lista para el mensaje del test. */
  detalle: string;
}

/**
 * Mide un par texto/fondo. Si alguno no se resuelve, la medida **falla**: el
 * color que no se puede medir es el que termina siendo ilegible.
 */
export function medirContraste(
  frente: string,
  fondo: string,
  umbral: number = UMBRAL_TEXTO,
  /**
   * Qué hay DEBAJO, para componer lo translúcido. Hace falta cuando alguno de
   * los dos colores no es opaco: sin esto no hay medida posible, sólo una
   * suposición.
   */
  base?: string
): Medida {
  const crudoA = resolverColor(frente);
  const crudoB = resolverColor(fondo);
  const debajo = base ? resolverColor(base) : null;
  const traslucido = (c: Rgb | null) => !!c && (c.a ?? 1) < 1;
  if ((traslucido(crudoA) || traslucido(crudoB)) && !debajo) {
    return {
      ok: false,
      ratio: null,
      umbral,
      detalle: `"${traslucido(crudoA) ? frente : fondo}" es translúcido y no se dijo qué hay debajo: sin eso la medida sería una suposición`,
    };
  }
  const b = crudoB && debajo ? componer(crudoB, debajo) : crudoB;
  // El texto se compone sobre su fondo YA compuesto, que es el orden en que se pinta.
  const a = crudoA && b ? componer(crudoA, b) : crudoA;
  if (!a || !b) {
    const cual = !a && !b ? `"${frente}" ni "${fondo}"` : !a ? `"${frente}"` : `"${fondo}"`;
    return {
      ok: false,
      ratio: null,
      umbral,
      detalle: `no se pudo resolver ${cual} a un color medible (¿opacidad, o una clase que este módulo no conoce?)`,
    };
  }
  const ratio = relacion(a, b);
  return {
    ok: ratio >= umbral,
    ratio,
    umbral,
    detalle: `${ratio.toFixed(2)}:1 contra un mínimo de ${umbral}:1`,
  };
}

/** Redondeo a dos decimales, para los mensajes. Expuesto porque los tests lo comparten. */
export const redondear = (n: number): number => Math.round(n * 100) / 100;
