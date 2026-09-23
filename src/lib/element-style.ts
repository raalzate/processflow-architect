/**
 * @fileOverview Estilo visual de un elemento: tipografía, alineación y colores (PURO).
 *
 * El lienzo dibujaba cada caja con el tamaño de letra que decidía la silueta:
 * `text-sm` en la ficha, `text-xs` en el símbolo. Sirve mientras el nombre sea
 * corto; con «Gestión de Solicitudes de Reembolso» la caja recorta con «…» y no
 * hay nada que hacer. Y una lámina para el cliente casi siempre necesita alinear
 * a la izquierda o resaltar una caja concreta.
 *
 * Acá vive ese puñado de propiedades y, sobre todo, su TRADUCCIÓN a atributos de
 * dibujo. Dos cosas que no son obvias:
 *
 *  - **El estilo es un DIFF, no una hoja de estilos.** Sólo viaja lo que el
 *    usuario tocó; lo demás lo sigue decidiendo la notación. Por eso cada
 *    función devuelve un objeto con las claves presentes y nada más: una clave
 *    con `undefined` pisaría el valor de la clase de Tailwind al aplicarse en
 *    línea, y la caja perdería el estilo de su tipo.
 *  - **HTML y SVG no se pintan igual.** En el `foreignObject` el color del texto
 *    es `color`; en un `<text>` de SVG es `fill`. Es la razón de que haya dos
 *    traductores y no uno con un flag: quien dibuja no debería tener que
 *    acordarse de eso.
 *
 * El fondo y el borde ya existían sueltos en el nodo (`color`, `borderColor`) y
 * siguen leyéndose: un proyecto guardado antes de este módulo se abre igual.
 */

/** Alineación horizontal del texto dentro de la caja. */
export type AlineacionH = "izquierda" | "centro" | "derecha";

/** Alineación vertical del texto dentro de la caja. */
export type AlineacionV = "arriba" | "medio" | "abajo";

/**
 * Lo que el usuario puede cambiar de una caja. Todo opcional: lo que no está lo
 * decide la notación, y un elemento sin estilo se dibuja exactamente como antes
 * de que este módulo existiera.
 */
export interface ElementStyle {
  /** Familia tipográfica (valor CSS listo para usar). */
  fuente?: string;
  /** Tamaño de letra en px. */
  tamano?: number;
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  alineacion?: AlineacionH;
  alineacionVertical?: AlineacionV;
  /** Color del texto (hex). */
  colorTexto?: string;
  /** Color de relleno de la silueta (hex). */
  fondo?: string;
  /** Color del contorno de la silueta (hex). */
  borde?: string;
}

/**
 * Las familias que se ofrecen. Lista corta y con pilas de respaldo a propósito:
 * el SVG exportado se abre en otra máquina, y una fuente que allá no existe
 * cambia el diagrama sin avisar. `heredada` es el valor «no tocar».
 */
export const FUENTES: readonly { id: string; label: string; css: string }[] = [
  { id: "heredada", label: "La del diagrama", css: "" },
  { id: "sans", label: "Sans (Helvetica)", css: "Helvetica, Arial, sans-serif" },
  { id: "serif", label: "Serif (Georgia)", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Monoespaciada", css: "ui-monospace, 'SF Mono', Menlo, monospace" },
] as const;

/** Límites del tamaño de letra, en px. Debajo de 8 no se lee; encima de 72 no entra en la caja. */
export const TAMANO_MIN = 8;
export const TAMANO_MAX = 72;

/**
 * Tamaño válido a partir de lo que haya escrito el usuario (o traiga un archivo).
 * Devuelve `undefined` cuando no hay nada que aplicar, para que el campo no
 * viaje y la caja siga con el tamaño de su tipo.
 */
export function clampTamano(valor: unknown): number | undefined {
  // `Number("")` es 0 y el campo vacío del input terminaba fijando el mínimo:
  // borrar el tamaño tiene que devolver la caja al tamaño de su tipo.
  if (typeof valor === "string" && valor.trim() === "") return undefined;
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.min(TAMANO_MAX, Math.max(TAMANO_MIN, Math.round(n)));
}

/** true si el estilo no dice nada: no se persiste (igual criterio que la spec vacía). */
export function estiloVacio(estilo: ElementStyle | undefined): boolean {
  if (!estilo) return true;
  return Object.values(estilo).every((v) => v === undefined || v === null || v === "" || v === false);
}

/**
 * El estilo listo para guardar: sin claves vacías y sin el objeto entero si no
 * quedó nada. Un `false` tampoco viaja —«sin negrita» es la ausencia—, así los
 * proyectos existentes no cambian de forma al abrir la ficha.
 */
export function estiloParaGuardar(estilo: ElementStyle | undefined): ElementStyle | undefined {
  if (!estilo) return undefined;
  const out: ElementStyle = {};
  if (estilo.fuente) out.fuente = estilo.fuente;
  const tamano = clampTamano(estilo.tamano);
  if (tamano !== undefined) out.tamano = tamano;
  if (estilo.negrita) out.negrita = true;
  if (estilo.cursiva) out.cursiva = true;
  if (estilo.subrayado) out.subrayado = true;
  if (estilo.alineacion) out.alineacion = estilo.alineacion;
  if (estilo.alineacionVertical) out.alineacionVertical = estilo.alineacionVertical;
  if (estilo.colorTexto) out.colorTexto = estilo.colorTexto;
  if (estilo.fondo) out.fondo = estilo.fondo;
  if (estilo.borde) out.borde = estilo.borde;
  return estiloVacio(out) ? undefined : out;
}

/**
 * Lo que llega de un archivo o de un agente, normalizado. No se confía: un
 * `alineacion: "middle"` o un tamaño en texto vienen de fuera del lienzo.
 */
export function normalizarEstilo(valor: unknown): ElementStyle | undefined {
  if (!valor || typeof valor !== "object") return undefined;
  const v = valor as Record<string, unknown>;
  const alineacion = (["izquierda", "centro", "derecha"] as const).find((a) => a === v.alineacion);
  const alineacionVertical = (["arriba", "medio", "abajo"] as const).find(
    (a) => a === v.alineacionVertical
  );
  return estiloParaGuardar({
    fuente: typeof v.fuente === "string" ? v.fuente : undefined,
    tamano: clampTamano(v.tamano),
    negrita: v.negrita === true,
    cursiva: v.cursiva === true,
    subrayado: v.subrayado === true,
    alineacion,
    alineacionVertical,
    colorTexto: typeof v.colorTexto === "string" ? v.colorTexto : undefined,
    fondo: typeof v.fondo === "string" ? v.fondo : undefined,
    borde: typeof v.borde === "string" ? v.borde : undefined,
  });
}

/**
 * Propiedades de dibujo, con el mismo nombre que en React. No se usa
 * `CSSProperties` porque este módulo es puro y no importa React (P3/PUREZA);
 * las claves son las mismas, así que el componente las pasa tal cual a `style`.
 */
export interface EstiloCss {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: string;
  textDecoration?: string;
  color?: string;
  fill?: string;
  textAlign?: "left" | "center" | "right";
  justifyContent?: "flex-start" | "center" | "flex-end";
  alignItems?: "flex-start" | "center" | "flex-end";
}

const ALINEACION_CSS: Record<AlineacionH, "left" | "center" | "right"> = {
  izquierda: "left",
  centro: "center",
  derecha: "right",
};

const FLEX_H: Record<AlineacionH, "flex-start" | "center" | "flex-end"> = {
  izquierda: "flex-start",
  centro: "center",
  derecha: "flex-end",
};

const FLEX_V: Record<AlineacionV, "flex-start" | "center" | "flex-end"> = {
  arriba: "flex-start",
  medio: "center",
  abajo: "flex-end",
};

/** Sólo la decoración del texto que esté activa (`underline`), o nada. */
const decoracion = (estilo: ElementStyle): string | undefined =>
  estilo.subrayado ? "underline" : undefined;

/**
 * Tipografía para el texto de un `foreignObject` (HTML). Se aplica al párrafo
 * del nombre: en línea gana sobre la clase de Tailwind que trae la silueta.
 */
export function estiloTextoHtml(estilo: ElementStyle | undefined): EstiloCss {
  if (!estilo) return {};
  const out: EstiloCss = {};
  if (estilo.fuente) out.fontFamily = estilo.fuente;
  if (estilo.tamano !== undefined) out.fontSize = estilo.tamano;
  if (estilo.negrita !== undefined) out.fontWeight = estilo.negrita ? 700 : 400;
  if (estilo.cursiva) out.fontStyle = "italic";
  const deco = decoracion(estilo);
  if (deco) out.textDecoration = deco;
  if (estilo.colorTexto) out.color = estilo.colorTexto;
  if (estilo.alineacion) out.textAlign = ALINEACION_CSS[estilo.alineacion];
  return out;
}

/**
 * Tipografía para un `<text>` de SVG. Mismo estilo, pero el color es `fill`: en
 * SVG `color` no pinta nada y el texto caía a negro.
 */
export function estiloTextoSvg(estilo: ElementStyle | undefined): EstiloCss {
  const { color, textAlign, ...resto } = estiloTextoHtml(estilo);
  return color ? { ...resto, fill: color } : resto;
}

/**
 * Colocación del bloque de texto dentro de la caja, para los contenedores que
 * son `flex flex-col`: en columna, el eje principal es el VERTICAL, así que la
 * alineación vertical va en `justifyContent` y la horizontal en `alignItems`.
 */
export function estiloBloque(estilo: ElementStyle | undefined): EstiloCss {
  if (!estilo) return {};
  const out: EstiloCss = {};
  if (estilo.alineacionVertical) out.justifyContent = FLEX_V[estilo.alineacionVertical];
  if (estilo.alineacion) {
    out.alignItems = FLEX_H[estilo.alineacion];
    out.textAlign = ALINEACION_CSS[estilo.alineacion];
  }
  return out;
}

/**
 * Relleno y contorno de la silueta. Toma el estilo y, si no dice nada, los
 * campos sueltos que ya existían (`color`, `borderColor`) para que un proyecto
 * guardado antes siga viéndose igual. El contorno no se aplica cuando la caja
 * está seleccionada: ahí manda el azul de selección.
 */
export function estiloSilueta(
  estilo: ElementStyle | undefined,
  legado: { color?: string; borderColor?: string },
  opciones: { conBorde: boolean }
): { fill?: string; stroke?: string } {
  const out: { fill?: string; stroke?: string } = {};
  const fill = estilo?.fondo ?? legado.color;
  const stroke = estilo?.borde ?? legado.borderColor;
  if (fill) out.fill = fill;
  if (opciones.conBorde && stroke) out.stroke = stroke;
  return out;
}
