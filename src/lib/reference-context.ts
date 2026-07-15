// =============================================================================
// Contexto de referencia del proyecto.
//
// Documentos que el usuario sube (o pega) para que la IA LOCAL los use como
// referencia de dominio al SUGERIR nombres, descripciones, tipos y etiquetas en
// el diseñador. No tiene nada que ver con el contexto del chat del agente.
//
// Aquí vive sólo la lógica PURA (tipos + armado del texto acotado). La lectura
// de archivos (PDF/txt) y la persistencia viven fuera (pdf-text.ts / contexto).
// =============================================================================

export interface ReferenceDoc {
  id: string;
  /** Nombre visible (archivo o "Texto pegado"). */
  name: string;
  /** Origen: archivo subido o texto pegado a mano. */
  kind: "file" | "text";
  /** Texto plano ya extraído (para PDF, el texto de sus páginas). */
  text: string;
  /** Nº de caracteres del texto (para mostrar tamaño). */
  chars: number;
  addedAt: string; // ISO
}

/** Tope de caracteres inyectados a la IA local (los prompts deben ser breves). */
export const MAX_REFERENCE_CHARS = 12000;

/** Normaliza texto crudo: colapsa espacios/saltos excesivos y recorta. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Arma el bloque de referencia a partir de los documentos, acotado a `maxChars`.
 * Devuelve "" si no hay material, para que el prompt no incluya nada.
 */
export function buildReferenceText(
  docs: ReferenceDoc[],
  maxChars: number = MAX_REFERENCE_CHARS
): string {
  const blocks = docs
    .filter((d) => d.text.trim().length > 0)
    .map((d) => `### ${d.name}\n${d.text.trim()}`);
  if (blocks.length === 0) return "";
  const joined = blocks.join("\n\n");
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars).trimEnd()}\n…(referencia truncada)`;
}

/** Crea un ReferenceDoc con id y metadatos, normalizando el texto. */
export function makeReferenceDoc(
  name: string,
  kind: ReferenceDoc["kind"],
  rawText: string,
  now: string,
  id: string
): ReferenceDoc {
  const text = normalizeText(rawText);
  return { id, name, kind, text, chars: text.length, addedAt: now };
}
