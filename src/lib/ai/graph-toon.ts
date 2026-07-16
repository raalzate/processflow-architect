/**
 * @fileOverview Codificador TOON (Token-Oriented Object Notation) para el modelo
 * de dominio.
 *
 * El grafo (`GraphData`) se inyecta como contexto a la IA. En JSON gasta muchos
 * tokens: repite las claves en cada nodo/arista y arrastra geometría del lienzo
 * (x/y/anchos/colores/anclas) que a la IA no le dice nada. Aquí hacemos dos cosas
 * para optimizar el contexto (idea similar a toonifyit.com):
 *
 *   1. PODAR el ruido de presentación (layout, colores, internos de d3). Solo
 *      sobrevive lo semántico: id, nombre, tipo, descripción, relaciones…
 *   2. CODIFICAR en TOON: los arrays uniformes de objetos se vuelven una tabla
 *      `campo[N]{col1,col2}:` + filas CSV, en vez de repetir llaves y comillas.
 *
 * Es lógica pura (sin React/Electron) y por tanto testeable en `__tests__`.
 */

/**
 * Claves puramente visuales o internas del motor de simulación (d3) que NO
 * aportan significado al razonamiento de la IA. Se eliminan en cualquier nivel
 * de anidamiento. `source`/`target` además son referencias (posiblemente
 * circulares) al nodo — se descartan porque `fuente`/`destino` ya llevan el id.
 */
const NOISE_KEYS = new Set<string>([
  // Geometría del lienzo
  "x", "y", "width", "height", "_initialDragX", "_initialDragY",
  // Internos de la simulación d3 (SimulationNodeDatum/LinkDatum)
  "vx", "vy", "fx", "fy", "index",
  // Presentación
  "color", "borderColor", "isGroup", "routing", "arrow",
  // Anclas y quiebres de las aristas (coordenadas del lienzo)
  "sourceAnchor", "targetAnchor", "midpoint", "midpoints",
  // Referencias circulares al nodo (duplican fuente/destino)
  "source", "target",
]);

const INDENT = "  ";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isScalar(v: unknown): boolean {
  return v === null || v === undefined || typeof v !== "object";
}

/**
 * Poda recursiva: clona el valor descartando las claves de `NOISE_KEYS` y los
 * valores `undefined`/función. No muta la entrada.
 */
export function pruneNoise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(pruneNoise);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (NOISE_KEYS.has(k)) continue;
      if (v === undefined || typeof v === "function") continue;
      out[k] = pruneNoise(v);
    }
    return out;
  }
  return value;
}

/** Serializa un escalar; entrecomilla si hay caracteres que romperían el formato. */
function scalarToToon(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const s = String(v);
  // Entrecomilla si: vacío, tiene coma/dos puntos/comilla/salto, o espacios al borde.
  if (s === "" || /[",:\n]/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
  }
  return s;
}

/** ¿Es un array de objetos planos con las MISMAS claves y valores escalares? */
function tabularKeys(arr: unknown[]): string[] | null {
  if (arr.length === 0 || !arr.every(isPlainObject)) return null;
  const keys = Object.keys(arr[0] as object);
  if (keys.length === 0) return null;
  const same = arr.every((o) => {
    const ok = Object.keys(o as object);
    return (
      ok.length === keys.length &&
      keys.every((k) => k in (o as object)) &&
      keys.every((k) => isScalar((o as Record<string, unknown>)[k]))
    );
  });
  return same ? keys : null;
}

function encodeArrayEntry(key: string, arr: unknown[], indent: number): string[] {
  const pad = INDENT.repeat(indent);
  if (arr.length === 0) return [`${pad}${key}[0]:`];

  // Array de escalares → en línea.
  if (arr.every(isScalar)) {
    return [`${pad}${key}[${arr.length}]: ${arr.map(scalarToToon).join(",")}`];
  }

  // Array uniforme de objetos planos → tabla TOON.
  const cols = tabularKeys(arr);
  if (cols) {
    const rowPad = INDENT.repeat(indent + 1);
    const header = `${pad}${key}[${arr.length}]{${cols.join(",")}}:`;
    const rows = arr.map(
      (o) => rowPad + cols.map((c) => scalarToToon((o as Record<string, unknown>)[c])).join(",")
    );
    return [header, ...rows];
  }

  // Mixto/anidado → lista con marcador "-" y bloque indentado por elemento.
  const itemPad = INDENT.repeat(indent + 1);
  const out = [`${pad}${key}[${arr.length}]:`];
  for (const el of arr) {
    if (isPlainObject(el)) {
      out.push(`${itemPad}-`);
      out.push(...encodeObject(el, indent + 2));
    } else if (Array.isArray(el)) {
      out.push(...encodeArrayEntry("-", el, indent + 1));
    } else {
      out.push(`${itemPad}- ${scalarToToon(el)}`);
    }
  }
  return out;
}

function encodeObject(obj: Record<string, unknown>, indent: number): string[] {
  const pad = INDENT.repeat(indent);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      lines.push(...encodeArrayEntry(k, v, indent));
    } else if (isPlainObject(v)) {
      lines.push(`${pad}${k}:`);
      lines.push(...encodeObject(v, indent + 1));
    } else {
      lines.push(`${pad}${k}: ${scalarToToon(v)}`);
    }
  }
  return lines;
}

/**
 * Codifica cualquier valor a TOON (sin podar). Útil para pruebas y para vistas.
 */
export function encodeToon(value: unknown): string {
  if (Array.isArray(value)) return encodeArrayEntry("root", value, 0).join("\n");
  if (isPlainObject(value)) return encodeObject(value, 0).join("\n");
  return scalarToToon(value);
}

/**
 * Convierte el grafo de dominio a TOON optimizado para contexto de IA: primero
 * poda el ruido de presentación, luego codifica. Devuelve "" si no hay datos.
 */
/**
 * Tope del campo `transcript`: es prosa cruda del workshop (baja densidad) y los
 * documentos adjuntos ya se inyectan aparte. Sin este tope, un transcript largo
 * puede ahogar a los nodos/aristas dentro del recorte global del contexto.
 */
export const TRANSCRIPT_BUDGET = 1500;

export function graphToToon(graph: unknown): string {
  if (!graph || typeof graph !== "object") return "";
  const pruned = pruneNoise(graph);
  if (isPlainObject(pruned) && typeof pruned.transcript === "string" && pruned.transcript.length > TRANSCRIPT_BUDGET) {
    pruned.transcript = pruned.transcript.slice(0, TRANSCRIPT_BUDGET) + "…";
  }
  return encodeToon(pruned);
}

/**
 * Igual que `graphToToon` pero NUNCA lanza: ante cualquier fallo (dato raro,
 * ciclo inesperado) degrada a JSON compacto. Es lo que deben usar los sitios que
 * arman el prompt, para no romper el turno del agente por un grafo mal formado.
 */
export function safeGraphToToon(graph: unknown): string {
  try {
    return graphToToon(graph);
  } catch {
    try {
      return JSON.stringify(graph);
    } catch {
      return "";
    }
  }
}

/**
 * Leyenda de UNA línea para que el modelo (incluido el LiteRT local, pequeño)
 * sepa leer el formato tabular. Se inyecta una sola vez en el contexto.
 */
export const TOON_LEGEND =
  "Formato TOON — `campo[N]{col1,col2}:` es una tabla con N filas CSV indentadas (un elemento por fila, en el orden de las columnas); `campo[N]: a,b,c` es una lista de N escalares; el resto es `clave: valor`.";
