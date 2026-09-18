/**
 * @fileOverview Adjuntos de UNA CAJA: el material con el que se construye (PURO).
 *
 * Una caja ya dice **qué es** (nombre, tipo), **dónde vive** (`element-properties.ts`)
 * y **qué debe hacer** (`element-spec.ts`). Lo que no podía decir es **con qué se
 * construye**: el contrato OpenAPI del servicio, el PDF del proveedor, el `.json`
 * de ejemplo, el `.md` de la decisión. Ese material terminaba en una URL que el
 * agente externo no puede abrir, en el chat de quien pidió el trabajo, o en los
 * documentos FUENTE del proyecto (`source-docs.ts`), que responden otra pregunta:
 * de dónde SALIÓ el modelo, no qué NECESITA una caja concreta.
 *
 * Acá vive todo lo que decide sobre ese material: qué se guarda (y qué se
 * recorta), de qué tipo es, cómo se lee un trozo y cómo se busca un término. El
 * texto viaja DENTRO del proyecto, igual que un documento fuente: un adjunto que
 * sólo existe en la máquina de quien lo cargó no es material, es una promesa.
 *
 * Dos reglas que no son simétricas, y es a propósito:
 *
 *  - Al agente **externo** (Claude Code por MCP) se le da el ÍNDICE en cada
 *    lectura de la caja, y el contenido cuando lo pide. El índice es barato y es
 *    lo único que le permite decidir que hay algo que pedir.
 *  - Al agente **interno** (motor local, ventana de 4 096 tokens) no se le
 *    inyecta NUNCA: sólo la marca `{docs:N}`. Inyectar un OpenAPI mata la corrida
 *    —es literalmente el incidente #358— y recortarlo sería peor: un contrato
 *    recortado miente.
 */

import { MAX_FRAGMENTO_CHARS } from "./source-docs";

export { MAX_FRAGMENTO_CHARS };

/**
 * De qué tipo es el material. No es cosmético: es lo que le dice al agente
 * externo cómo tratarlo (un `openapi` se lee como contrato, un `json` como
 * ejemplo).
 */
export type ElementDocTipo = "pdf" | "markdown" | "json" | "openapi" | "imagen" | "texto";

/** Un documento adjunto a una caja. */
export interface ElementDoc {
  /** Único por caja (se coteja sin distinguir mayúsculas). */
  nombre: string;
  tipo: ElementDocTipo;
  /** De dónde salió, para el humano ("PDF del proveedor"). */
  origen?: string;
  /** Ruta original, cuando el binario NO viajó por pasarse del tope. */
  origenRuta?: string;
  /** Texto extraído. Es lo que hace útil al resto (búsqueda, lectura, contrato). */
  texto: string;
  /** Binario en base64, sólo si entra en el tope. */
  binario?: string;
  /** Tamaño ORIGINAL en bytes: dice cuánto se perdió al recortar. */
  bytes: number;
  /** `true` si el texto se recortó al guardarlo (el tope se avisa, no se esconde). */
  truncado?: boolean;
  /** ISO. Desempata la fusión de dos grafos (`graph-merge.ts`). */
  addedAt: string;
}

/**
 * Topes. Un adjunto es material de consulta, no un almacén: sin tope, el `.json`
 * del proyecto se vuelve lento de abrir y de exportar. Se RECORTA el texto y se
 * avisa —nunca se rechaza, por lo mismo que `sanitizeSpec`: lo que llega puede
 * ser un proyecto ya guardado—, y el binario que no entra simplemente no viaja:
 * queda el texto y la referencia al original.
 */
export const MAX_DOCS_POR_CAJA = 10;
export const MAX_TEXTO_DOC = 60_000;
export const MAX_BINARIO_BYTES = 2_000_000;
export const MAX_BINARIO_PROYECTO = 20_000_000;

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const TIPOS: readonly ElementDocTipo[] = ["pdf", "markdown", "json", "openapi", "imagen", "texto"];

const POR_EXTENSION: Record<string, ElementDocTipo> = {
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  json: "json",
  yaml: "texto",
  yml: "texto",
  png: "imagen",
  jpg: "imagen",
  jpeg: "imagen",
  gif: "imagen",
  webp: "imagen",
  svg: "imagen",
  txt: "texto",
  csv: "texto",
};

/**
 * Detecta el tipo por el CONTENIDO primero y por la extensión después: un
 * `.yaml` o un `.txt` con `openapi:`/`swagger:` es un contrato, y tratarlo como
 * texto suelto es justamente perder el dato que sirve.
 */
export function detectarTipoDoc(nombre: string, cuerpo: string): ElementDocTipo {
  const cabeza = (cuerpo ?? "").slice(0, 400);
  if (/^\s*["']?(openapi|swagger)["']?\s*:/m.test(cabeza)) return "openapi";
  const ext = /\.([A-Za-z0-9]+)$/.exec(nombre ?? "")?.[1]?.toLowerCase();
  return (ext && POR_EXTENSION[ext]) || "texto";
}

/** Lo que hace falta para adjuntar. `bytes` ausente ⇒ el tamaño del texto. */
export interface EntradaDoc {
  nombre: string;
  texto: string;
  tipo?: ElementDocTipo;
  origen?: string;
  origenRuta?: string;
  binario?: string;
  bytes?: number;
  addedAt?: string;
}

/** Normaliza UNA entrada con la política de topes. `null` si no es un adjunto. */
function normalizar(entrada: EntradaDoc): ElementDoc | null {
  const nombre = texto(entrada.nombre).trim();
  const cuerpo = texto(entrada.texto);
  const binario = texto(entrada.binario);
  // Sin nombre no hay cómo citarlo; sin texto NI binario no hay material: una
  // imagen sin texto reconocible sigue siendo material, un archivo vacío no.
  if (!nombre || (!cuerpo.trim() && !binario)) return null;

  const recortado = cuerpo.length > MAX_TEXTO_DOC;
  const bytes = typeof entrada.bytes === "number" && entrada.bytes >= 0 ? entrada.bytes : cuerpo.length;
  const tipo =
    entrada.tipo && TIPOS.includes(entrada.tipo) ? entrada.tipo : detectarTipoDoc(nombre, cuerpo);

  const doc: ElementDoc = {
    nombre,
    tipo,
    texto: recortado ? cuerpo.slice(0, MAX_TEXTO_DOC) : cuerpo,
    bytes,
    addedAt: texto(entrada.addedAt).trim() || new Date().toISOString(),
  };
  const origen = texto(entrada.origen).trim();
  if (origen) doc.origen = origen;
  const ruta = texto(entrada.origenRuta).trim();
  if (ruta) doc.origenRuta = ruta;
  // El binario sólo viaja bajo tope. Pasado eso queda el texto extraído y la
  // referencia al original, que es lo que permite ir a buscarlo.
  if (binario && bytes <= MAX_BINARIO_BYTES) doc.binario = binario;
  if (recortado) doc.truncado = true;
  return doc;
}

/**
 * Normaliza lo que llega de afuera (archivo guardado, MCP, import). Descarta lo
 * que no es un adjunto y recorta al tope marcando `truncado`.
 */
export function sanitizeElementDocs(valor: unknown): ElementDoc[] {
  if (!Array.isArray(valor)) return [];
  const salida: ElementDoc[] = [];
  const vistos = new Set<string>();
  for (const bruto of valor) {
    if (!bruto || typeof bruto !== "object") continue;
    const d = bruto as Record<string, unknown>;
    const doc = normalizar({
      nombre: texto(d.nombre),
      texto: texto(d.texto),
      tipo: TIPOS.includes(d.tipo as ElementDocTipo) ? (d.tipo as ElementDocTipo) : undefined,
      origen: texto(d.origen),
      origenRuta: texto(d.origenRuta),
      binario: texto(d.binario),
      bytes: typeof d.bytes === "number" ? d.bytes : undefined,
      addedAt: texto(d.addedAt),
    });
    if (!doc) continue;
    const clave = doc.nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    if (d.truncado === true) doc.truncado = true;
    salida.push(doc);
    if (salida.length >= MAX_DOCS_POR_CAJA) break;
  }
  return salida;
}

/**
 * Adjunta (o REEMPLAZA por nombre) material a una caja. Reemplazar en vez de
 * duplicar es lo que hace que volver a cargar un contrato corregido no deje dos
 * versiones peleando por el mismo nombre.
 *
 * @throws si la entrada no es un adjunto, o si ya se llegó al tope por caja.
 */
export function attachElementDoc(docs: readonly ElementDoc[], entrada: EntradaDoc): ElementDoc[] {
  const doc = normalizar(entrada);
  if (!doc)
    throw new Error("Un adjunto necesita un nombre y algo que leer (texto extraído o binario).");
  const clave = doc.nombre.toLowerCase();
  const i = docs.findIndex((d) => d.nombre.toLowerCase() === clave);
  if (i >= 0) {
    const copia = [...docs];
    copia[i] = doc;
    return copia;
  }
  if (docs.length >= MAX_DOCS_POR_CAJA)
    throw new Error(
      `La caja ya tiene ${MAX_DOCS_POR_CAJA} adjuntos (el tope). Quitá uno antes de adjuntar "${doc.nombre}".`
    );
  return [...docs, doc];
}

/** Quita un adjunto por nombre (sin distinguir mayúsculas). */
export function removeElementDoc(docs: readonly ElementDoc[], nombre: string): ElementDoc[] {
  const clave = texto(nombre).trim().toLowerCase();
  return docs.filter((d) => d.nombre.toLowerCase() !== clave);
}

/** Busca un adjunto por nombre: exacto, y si no, por el final de la ruta. */
export function findElementDoc(docs: readonly ElementDoc[], nombre: string): ElementDoc | undefined {
  const t = texto(nombre).trim().toLowerCase();
  if (!t) return undefined;
  return (
    docs.find((d) => d.nombre.toLowerCase() === t) ??
    docs.find((d) => {
      const n = d.nombre.toLowerCase();
      return n.endsWith(`/${t}`) || t.endsWith(`/${n}`);
    })
  );
}

export type LecturaDoc =
  | { ok: false; error: string; disponibles: string[] }
  | { ok: true; doc: string; texto: string; truncado: boolean };

/**
 * Lee un trozo de un adjunto por líneas, con el MISMO tope que cualquier otra
 * lectura del agente (`MAX_FRAGMENTO_CHARS`): un adjunto no compra más ventana
 * por ser adjunto.
 */
export function readElementDocRange(
  docs: readonly ElementDoc[],
  nombre: string,
  desde?: number,
  hasta?: number,
  limite = MAX_FRAGMENTO_CHARS
): LecturaDoc {
  const doc = findElementDoc(docs, nombre);
  if (!doc)
    return {
      ok: false,
      error: `No hay ningún adjunto llamado "${nombre}" en este elemento.`,
      disponibles: docs.map((d) => d.nombre),
    };
  const lineas = doc.texto.split("\n");
  const inicio = Math.max(1, Math.floor(desde ?? 1));
  const fin = Math.min(lineas.length, Math.floor(hasta ?? lineas.length));
  const trozo = inicio > lineas.length ? "" : lineas.slice(inicio - 1, Math.max(inicio, fin)).join("\n");
  const truncado = trozo.length > limite;
  return {
    ok: true,
    doc: doc.nombre,
    texto: truncado ? `${trozo.slice(0, limite)}\n…(recortado)` : trozo || "(no hay texto en ese rango)",
    truncado,
  };
}

/** Un elemento visto por la búsqueda: sólo lo que hace falta para nombrarlo. */
export interface ElementoConDocs {
  id: string;
  nombre: string;
  adjuntos?: ElementDoc[];
}

export interface HitDoc {
  elemento: string;
  elementoId: string;
  doc: string;
  linea: number;
  texto: string;
}

/**
 * Busca un término en el texto de todos los adjuntos. Devuelve DÓNDE está
 * (elemento · adjunto · línea) y la línea, no el documento: es lo que convierte
 * el material en consultable sin traerlo entero.
 */
export function searchElementDocs(
  elementos: readonly ElementoConDocs[],
  termino: string,
  maxHits = 50
): HitDoc[] {
  const t = texto(termino).trim().toLowerCase();
  if (!t) return [];
  const hits: HitDoc[] = [];
  for (const el of elementos) {
    for (const doc of el.adjuntos ?? []) {
      const lineas = doc.texto.split("\n");
      for (let i = 0; i < lineas.length; i++) {
        if (!lineas[i].toLowerCase().includes(t)) continue;
        hits.push({
          elemento: el.nombre,
          elementoId: el.id,
          doc: doc.nombre,
          linea: i + 1,
          texto: lineas[i].trim().slice(0, 200),
        });
        if (hits.length >= maxHits) return hits;
      }
    }
  }
  return hits;
}

/**
 * Índice para el agente y para la ficha: qué hay y cuánto pesa, SIN una línea
 * del contenido. Es lo que permite decidir qué pedir.
 */
export function formatDocsIndex(docs: readonly ElementDoc[]): string {
  if (!docs.length) return "";
  return docs
    .map((d) => {
      const lineas = d.texto ? d.texto.split("\n").length : 0;
      const partes = [d.tipo, `${lineas} líneas`, `${d.bytes} bytes`];
      if (d.truncado) partes.push("recortado al adjuntar");
      if (!d.binario && d.origenRuta) partes.push(`original no incluido (${d.origenRuta})`);
      if (d.origen) partes.push(d.origen);
      return `- "${d.nombre}" (${partes.join(", ")})`;
    })
    .join("\n");
}

/** Bytes de binario que de verdad viajan dentro del proyecto. */
export function binarioUsado(docs: readonly ElementDoc[]): number {
  return docs.reduce((n, d) => n + (d.binario ? d.bytes : 0), 0);
}
