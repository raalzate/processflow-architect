/**
 * @fileOverview En qué MODO se atiende el pedido (PURO). Feature 015, T7 (#343).
 *
 * El constructor tenía un solo modo —un ReAct que encadena llamadas MCP— y con
 * el motor local eso no alcanza para crear un diagrama: 63 pasos y el lienzo
 * vacío (#332). Ahora hay dos, y cuál corresponde lo decide el PEDIDO:
 *
 *  - `creativo`: «hacéme un diagrama de X», «completá esto». Una inferencia
 *    devuelve el diagrama entero en Mermaid.
 *  - `editor`: «agregá X», «invertí esa flecha», «borrá Y». El arnés resuelve
 *    los argumentos con consultas deterministas y llama UNA herramienta.
 *  - `ambiguo`: no se sabe. Se pregunta con opciones; suponer es cómo el agente
 *    terminaba creando un diagrama nuevo cuando le pedían tocar el que había.
 *
 * Lo clasifica el CÓDIGO y no el modelo: gastar una inferencia en decidir el
 * modo es gastar un cuarto de la corrida local, y la respuesta está en el verbo.
 */

import { plano } from "../mcp/tipo-notacion";

export type ModoConstructor = "creativo" | "editor" | "ambiguo";

/** Qué quiere hacerse con el modelo (sólo tiene sentido en modo editor). */
export type AccionEditor = "crear" | "modificar" | "reemplazar" | "eliminar";

/** Lo que el arnés sabe de la vista en curso cuando llega el pedido. */
export interface ResumenVista {
  /** Cuántos elementos tiene hoy (0 = vista vacía). */
  elementos: number;
  /** Tipos de la notación de la vista, para reconocerlos en el pedido. */
  tipos?: string[];
  nombre?: string;
}

export interface Intencion {
  modo: ModoConstructor;
  accion?: AccionEditor;
  /** Lo que el pedido nombra: la caja, su tipo, o los dos extremos de una relación. */
  objetivo?: { nombre?: string; tipo?: string; desde?: string; hasta?: string };
  /** Por qué se eligió este modo. Va a la traza: el humano ve qué se decidió y con qué. */
  motivo: string;
}

/**
 * Los verbos se reconocen por su RAÍZ, no por su forma. En el chat conviven el
 * imperativo rioplatense y el peninsular —«agregá» y «agrega», «invertí» e
 * «invierte»— y una lista de formas conjugadas deja afuera la mitad de los
 * pedidos reales: «añadí una caja» caía en «ambiguo» y el agente preguntaba lo
 * que el humano ya había dicho.
 */
const CREATIVO = [
  "crea", "hac", "haz", "gener", "model", "disen", "dibuj", "arm",
  "complet", "enriquec", "esboz", "propon",
];

/** Raíces que piden UN cambio sobre lo que ya está. */
const EDITOR: { verbos: string[]; accion: AccionEditor }[] = [
  { verbos: ["agreg", "anad", "sum", "pon", "conect", "relacion", "incorpor", "inclu"], accion: "crear" },
  { verbos: ["cambi", "renombr", "correg", "corrig", "invert", "inviert", "edit", "actualiz", "mov", "ajust"], accion: "modificar" },
  { verbos: ["reemplaz", "sustitu"], accion: "reemplazar" },
  { verbos: ["borr", "elimin", "quit", "sac"], accion: "eliminar" },
];

/** Palabras que dicen «un diagrama entero», no «una caja». */
const TODO_EL_DIAGRAMA = ["diagrama", "modelo", "ejemplo", "arquitectura", "vista completa", "todo el"];

/** Palabras que dicen «una pieza»: una caja, una flecha. */
const UNA_PIEZA = ["elemento", "caja", "nodo", "flecha", "relacion", "arista", "conexion", "contenedor"];

const contiene = (texto: string, palabras: string[]) =>
  palabras.some((p) => new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(texto));

/**
 * El primer verbo del pedido gana. Barrer todo el texto buscando raíces era
 * confundir el sustantivo con la acción: «eliminá la RELACIÓN entre A y B»
 * caía en «crear» porque «relacion» es raíz de «relacionar».
 */
function primerVerbo<T>(texto: string, grupos: { raices: string[]; valor: T }[]): T | undefined {
  for (const palabra of texto.split(/[^a-z0-9]+/)) {
    if (!palabra) continue;
    const g = grupos.find((x) => x.raices.some((r) => palabra.startsWith(r)));
    if (g) return g.valor;
  }
  return undefined;
}

/** Determinantes y sustantivos de relleno: «borrá EL Servicio» nombra a Servicio. */
const RELLENO = /^(el|la|los|las|un|una|unos|unas|al|del|de|ese|esa|este|esta|mi|nuestro)\b/i;
const COSAS = /^(elemento|caja|nodo|contenedor|relacion|relación|flecha|arista|conexion|conexión|vista|diagrama)s?\b/i;

/**
 * El nombre que el pedido señala. Tres caminos, del más explícito al más
 * flojo: entre comillas, tras «llamado», o lo que queda después del verbo una
 * vez sacados los artículos y las palabras de relleno («borrá el Servicio»).
 *
 * El último es una conjetura, y por eso quien la usa la verifica contra el
 * grafo (`planEditorCall`): un nombre que no existe termina en una pregunta con
 * opciones, nunca en un borrado a ciegas.
 */
function nombreDelPedido(mensaje: string): string | undefined {
  const comillas = /["«“']([^"»”']{2,60})["»”']/.exec(mensaje);
  if (comillas) return comillas[1].trim();
  const llamado = /\bllamad[oa]s?\s+(.{2,60}?)\s*$/i.exec(mensaje);
  if (llamado) return llamado[1].trim().replace(/[.,;]$/, "");

  let resto = mensaje.trim().replace(/[.!?]+$/, "").split(/\s+/).slice(1).join(" ");
  for (let i = 0; i < 3 && resto; i++) {
    const antes = resto;
    resto = resto.replace(RELLENO, "").trim();
    resto = resto.replace(COSAS, "").trim();
    if (resto === antes) break;
  }
  return resto && resto.length <= 60 ? resto : undefined;
}

/** Los dos extremos: «entre A y B», y también «conectá A con B». */
function extremos(mensaje: string): { desde: string; hasta: string } | undefined {
  // La etiqueta dictada («… con "invoca"») no es un extremo: se saca antes.
  const limpio = mensaje
    .replace(/(?:\bcon\s+)?["«“][^"»”]{2,60}["»”]/g, " ")
    .trim()
    .replace(/[.!?]$/, "");
  const entre = /\bentre\s+(.{1,60}?)\s+y\s+(.{1,60}?)\s*$/i.exec(limpio);
  if (entre) return { desde: entre[1].trim(), hasta: entre[2].trim() };
  // «conectá X con Y»: el verbo ya dice que son dos extremos, sin «entre».
  const conecta = /^\s*\S*(?:conect|relacion|un[ií])\S*\s+(.{1,60}?)\s+(?:y|con)\s+(.{1,60}?)\s*$/i.exec(limpio);
  if (conecta) return { desde: conecta[1].trim(), hasta: conecta[2].trim() };
  return undefined;
}

/** El tipo de la notación que el pedido nombra, si nombra alguno. */
function tipoDelPedido(mensaje: string, tipos: string[] | undefined): string | undefined {
  const texto = plano(mensaje);
  // El más largo primero: «Sistema Externo» antes que «Sistema».
  return [...(tipos ?? [])]
    .sort((a, b) => b.length - a.length)
    .find((t) => contiene(texto, [plano(t)]));
}

/**
 * Clasifica el pedido. No pregunta al modelo y no mira el diagrama: mira el
 * verbo, el tamaño de lo pedido y si hay algo que editar.
 */
export function classifyIntent(mensaje: string, resumen: ResumenVista): Intencion {
  const texto = plano(mensaje ?? "");
  if (!texto) return { modo: "ambiguo", motivo: "El pedido llegó vacío." };

  // Un solo barrido con TODOS los verbos: el que aparece primero es el que manda.
  type Verbo = { clase: "editor"; accion: AccionEditor } | { clase: "creativo" };
  const verbo = primerVerbo<Verbo>(texto, [
    ...EDITOR.map((e) => ({ raices: e.verbos, valor: { clase: "editor", accion: e.accion } as Verbo })),
    { raices: CREATIVO, valor: { clase: "creativo" as const } },
  ]);
  const editor = verbo?.clase === "editor" ? { accion: verbo.accion } : undefined;
  const creativo = verbo?.clase === "creativo";
  const pieza = contiene(texto, UNA_PIEZA);
  const entero = contiene(texto, TODO_EL_DIAGRAMA);

  const objetivo = () => {
    const nombre = nombreDelPedido(mensaje);
    const tipo = tipoDelPedido(mensaje, resumen.tipos);
    const ext = extremos(mensaje);
    const o = { ...(nombre ? { nombre } : {}), ...(tipo ? { tipo } : {}), ...(ext ?? {}) };
    return Object.keys(o).length ? o : undefined;
  };

  // «agregá un elemento Persona llamado Cliente»: el verbo manda, aunque diga
  // «diagrama» de paso. Una pieza nombrada nunca es un diagrama entero.
  if (editor && (pieza || !entero || editor.accion !== "crear")) {
    return {
      modo: "editor",
      accion: editor.accion,
      objetivo: objetivo(),
      motivo: `El pedido dice qué cambiar (${editor.accion}) sobre lo que ya está.`,
    };
  }

  if (creativo || (editor?.accion === "crear" && entero)) {
    return {
      modo: "creativo",
      objetivo: objetivo(),
      motivo: resumen.elementos
        ? "Pide un diagrama completo sobre lo que ya hay: se le muestra lo existente en Mermaid."
        : "Pide un diagrama completo y la vista está vacía.",
    };
  }

  // Sin verbo reconocible: preguntar sale más barato que rehacer el diagrama
  // del humano porque se entendió mal (FR-010).
  return {
    modo: "ambiguo",
    objetivo: objetivo(),
    motivo: "El pedido no dice si hay que crear un diagrama o cambiar algo de lo que ya está.",
  };
}

/** Las dos salidas que se le ofrecen al humano cuando el pedido es ambiguo. */
export function opcionesDeModo(): { id: string; label: string; detalle?: string }[] {
  return [
    { id: "creativo", label: "Proponer el diagrama completo", detalle: "Lo dibujo entero y vos revisás." },
    { id: "editor", label: "Cambiar algo puntual", detalle: "Decime qué elemento o relación toco." },
  ];
}
