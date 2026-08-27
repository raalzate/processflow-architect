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

// -----------------------------------------------------------------------------
// Limpieza de lo VACÍO (#190)
// -----------------------------------------------------------------------------

/**
 * ¿Este valor no aporta nada al contexto? Una cadena en blanco, un `null`, una
 * lista o un objeto sin nada dentro. **El `0` y el `false` NO están acá**: son
 * respuestas, no ausencias (`puerto: 0` es un dato raro pero es un dato, y un
 * booleano en `false` contesta la pregunta).
 */
function esVacio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) return Object.keys(v).length === 0;
  return false;
}

/**
 * Poda de lo vacío, recursiva. Es la hermana de `pruneNoise`: aquélla saca lo que
 * NO significa (geometría, colores), ésta saca lo que **está pero no dice nada**.
 *
 * Existe porque el ruido no es neutral: una caja con `descripcion: ""`,
 * `tags_tecnologia: []` y una propiedad sin valor gasta tokens y —peor— invita al
 * modelo a inventar sobre campos que ve declarados y vacíos. Un metadato sin
 * clave o sin valor tampoco viaja: no es una propiedad, es una fila a medio
 * llenar.
 */
export function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(pruneEmpty).filter((v) => !esVacio(v));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (esVacio(k)) continue;
      const limpio = pruneEmpty(v);
      if (esVacio(limpio)) continue;
      out[k] = limpio;
    }
    // Una PROPIEDAD a medio llenar no es una propiedad: `{clave:"owner"}` sin
    // valor (o un valor sin clave) sobreviviría a la poda genérica —le queda una
    // clave— y llegaría al contexto como una fila que no dice nada.
    const esPropiedad = "clave" in value || "valor" in value;
    if (esPropiedad && (esVacio(out.clave) || esVacio(out.valor))) return {};
    return out;
  }
  return value;
}

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

/**
 * La especificación de un elemento, compactada para el CONTEXTO.
 *
 * La spec entera (con ids internos, campos vacíos y un objeto por escenario) son
 * miles de tokens en un diagrama de 20 cajas. Al agente le sirve el contenido:
 * de qué feature habla, qué historias hay con su prioridad, qué escenarios la
 * verifican —en UNA línea `dado → cuando → entonces`—, qué requisitos y qué
 * criterios. Los ids no le dicen nada y las marcas de «necesita aclaración» sí:
 * son justamente lo que tiene que preguntar.
 *
 * Vive acá y no en `element-spec.ts` porque es una decisión de contexto:
 * `element-spec` no tiene por qué saber que existe un agente.
 */
export function specToContext(spec: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(spec)) return undefined;
  const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isPlainObject) : []);

  const historias = lista(spec.stories)
    .map((h) => {
      const escenarios = lista(h.escenarios)
        .map((e) => {
          const partes = [texto(e.given), texto(e.when), texto(e.then)].filter(Boolean);
          return partes.length ? partes.join(" → ") : "";
        })
        .filter(Boolean);
      const titulo = texto(h.titulo);
      if (!titulo && !escenarios.length) return undefined;
      return {
        historia: [texto(h.prioridad), titulo].filter(Boolean).join(" "),
        porQue: texto(h.porQue),
        pruebaIndependiente: texto(h.pruebaIndependiente),
        escenarios,
      };
    })
    .filter(Boolean);

  const requisitos = lista(spec.requirements)
    .map((r) => {
      const t = texto(r.texto);
      // La marca viaja EN el texto: en una tabla TOON una columna booleana casi
      // siempre vacía cuesta más que estas dos palabras.
      return t ? `${t}${r.needsClarification ? " [por aclarar]" : ""}` : "";
    })
    .filter(Boolean);

  const compacta = {
    feature: texto(spec.featureName),
    estado: texto(spec.status),
    pedido: texto(spec.input),
    historias,
    casosLimite: (Array.isArray(spec.edgeCases) ? spec.edgeCases : []).map(texto).filter(Boolean),
    requisitos,
    entidades: lista(spec.entities)
      .map((e) => [texto(e.nombre), texto(e.descripcion)].filter(Boolean).join(": "))
      .filter(Boolean),
    criterios: lista(spec.criteria).map((c) => texto(c.texto)).filter(Boolean),
  };
  const limpia = pruneEmpty(compacta);
  // El estado por defecto solo no es una spec: sin nada más, no viaja.
  if (!isPlainObject(limpia)) return undefined;
  const claves = Object.keys(limpia).filter((k) => k !== "estado");
  return claves.length ? (limpia as Record<string, unknown>) : undefined;
}

/**
 * Reemplaza cada `spec` del grafo por su versión compacta, en cualquier nivel de
 * anidamiento (los nodos viven en `big_picture.nodos` y en `agregados[].nodos`).
 */
function compactarSpecs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactarSpecs);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = k === "spec" ? specToContext(v) : compactarSpecs(v);
    }
    return out;
  }
  return value;
}

export function graphToToon(graph: unknown): string {
  if (!graph || typeof graph !== "object") return "";
  // Tres pasos, en este orden: fuera lo que no significa (geometría), la spec a
  // su forma de contexto, y fuera lo que quedó vacío — incluidas las claves que
  // se vaciaron al compactar.
  const pruned = pruneEmpty(compactarSpecs(pruneNoise(graph))) as Record<string, unknown>;
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
