/**
 * @fileOverview Edición manual de artefactos: helpers puros del editor Markdown
 * (barra de acciones, pegado en el cursor), nombre de archivo para descargar y
 * la traducción del texto editado al payload del artefacto.
 *
 * Vive en `lib/` porque es la parte con reglas: qué pasa cuando el humano edita
 * un artefacto estructurado (drivers, propuesta…) o borra la valla del Mermaid.
 * El diálogo sólo llama a estas funciones (§P3).
 */

import type { Artifact, ArtifactRender } from "../agent-types";

/* -------------------------------------------------------------------------- */
/* Barra de acciones del editor                                               */
/* -------------------------------------------------------------------------- */

/** Acciones de la barra: envoltura en línea o prefijo de línea. */
export type MarkdownAction =
  | "bold"
  | "italic"
  | "code"
  | "heading"
  | "bullet"
  | "numbered"
  | "quote"
  | "link"
  | "table";

/** Selección del textarea y resultado de una acción (texto + selección nueva). */
export interface EditSelection {
  start: number;
  end: number;
}
export interface EditResult extends EditSelection {
  text: string;
}

const ENVOLTURAS: Partial<Record<MarkdownAction, { open: string; close: string; placeholder: string }>> = {
  bold: { open: "**", close: "**", placeholder: "texto" },
  italic: { open: "*", close: "*", placeholder: "texto" },
  code: { open: "`", close: "`", placeholder: "codigo" },
};

/** Prefijos de línea. `numbered` se numera al aplicar. */
const PREFIJOS: Partial<Record<MarkdownAction, string>> = {
  heading: "## ",
  bullet: "- ",
  quote: "> ",
  numbered: "1. ",
};

const TABLA = "| Columna | Columna |\n| --- | --- |\n|  |  |";

/** Escapa un literal para meterlo en un RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampSel(text: string, sel: EditSelection): EditSelection {
  const max = text.length;
  const start = Math.max(0, Math.min(sel.start ?? 0, max));
  const end = Math.max(start, Math.min(sel.end ?? start, max));
  return { start, end };
}

/** Límites de las líneas que toca la selección (para los prefijos). */
function lineRange(text: string, sel: EditSelection): EditSelection {
  const inicio = text.lastIndexOf("\n", sel.start - 1) + 1;
  const corte = text.indexOf("\n", sel.end);
  return { start: inicio, end: corte === -1 ? text.length : corte };
}

/**
 * Aplica una acción de la barra sobre la selección. Es idempotente: volver a
 * pulsar «Lista» sobre líneas que ya son lista las desmarca, y lo mismo con la
 * negrita, que es lo que espera quien viene de cualquier editor.
 */
export function applyMarkdownAction(
  text: string,
  sel: EditSelection,
  action: MarkdownAction
): EditResult {
  const s = clampSel(text, sel);
  const wrap = ENVOLTURAS[action];
  if (wrap) {
    const elegido = text.slice(s.start, s.end);
    const cuerpo = elegido || wrap.placeholder;
    const yaEsta =
      elegido.startsWith(wrap.open) &&
      elegido.endsWith(wrap.close) &&
      elegido.length > wrap.open.length + wrap.close.length;
    const nuevo = yaEsta
      ? elegido.slice(wrap.open.length, elegido.length - wrap.close.length)
      : `${wrap.open}${cuerpo}${wrap.close}`;
    return {
      text: text.slice(0, s.start) + nuevo + text.slice(s.end),
      start: s.start + (yaEsta ? 0 : wrap.open.length),
      end: s.start + (yaEsta ? nuevo.length : wrap.open.length + cuerpo.length),
    };
  }

  if (action === "link") {
    const elegido = text.slice(s.start, s.end) || "texto";
    const nuevo = `[${elegido}](https://)`;
    return {
      text: text.slice(0, s.start) + nuevo + text.slice(s.end),
      start: s.start + 1,
      end: s.start + 1 + elegido.length,
    };
  }

  if (action === "table") {
    const salto = s.start > 0 && text[s.start - 1] !== "\n" ? "\n\n" : "";
    return insertAtSelection(text, s, `${salto}${TABLA}\n`);
  }

  const prefijo = PREFIJOS[action]!;
  const r = lineRange(text, s);
  const lineas = text.slice(r.start, r.end).split("\n");
  const numerada = /^\d+\.\s/;
  const marca = (l: string) => (action === "numbered" ? numerada.test(l) : l.startsWith(prefijo));
  const todas = lineas.every((l) => marca(l) || !l.trim());
  const quitar = action === "numbered" ? numerada : new RegExp(`^${escapeRe(prefijo)}`);
  const nuevas = lineas.map((l, i) => {
    if (!l.trim()) return l;
    if (todas) return l.replace(quitar, "");
    return `${action === "numbered" ? `${i + 1}. ` : prefijo}${l}`;
  });
  const bloque = nuevas.join("\n");
  return {
    text: text.slice(0, r.start) + bloque + text.slice(r.end),
    start: r.start,
    end: r.start + bloque.length,
  };
}

/** Inserta texto en el cursor (es lo que hace «Pegar» sin depender del foco). */
export function insertAtSelection(text: string, sel: EditSelection, insert: string): EditResult {
  const s = clampSel(text, sel);
  const cursor = s.start + insert.length;
  return { text: text.slice(0, s.start) + insert + text.slice(s.end), start: cursor, end: cursor };
}

/* -------------------------------------------------------------------------- */
/* Descarga                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Nombre del `.md` que se descarga: título en kebab-case + revisión cuando hay
 * historia (dos descargas del mismo artefacto no deben pisarse en Descargas).
 */
export function artifactFileName(a: Pick<Artifact, "title" | "revision">, ext = "md"): string {
  const base =
    (a.title ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "artefacto";
  const rev = a.revision && a.revision > 1 ? `-v${a.revision}` : "";
  return `${base}${rev}.${ext}`;
}

/* -------------------------------------------------------------------------- */
/* Texto editado → payload                                                    */
/* -------------------------------------------------------------------------- */

/** Código de un texto que es SÓLO una valla ```mermaid (o null si no lo es). */
export function mermaidOnly(text: string): string | null {
  const m = (text ?? "").trim().match(/^```(?:mermaid)?[ \t]*\n([\s\S]*?)\n?```$/);
  if (!m) return null;
  const code = m[1].trim();
  return code && !code.includes("```") ? code : null;
}

/**
 * Payload de la revisión que crea una edición manual.
 *
 * Un diagrama sigue siendo diagrama mientras el texto sea su valla Mermaid; si
 * el humano escribió prosa alrededor, pasa a Markdown (con la valla adentro) en
 * vez de romper el render del lienzo. Un artefacto ESTRUCTURADO (drivers,
 * propuesta, roadmap…) editado a mano se congela como Markdown: su payload es
 * un objeto que ya no se reconstruye desde el texto, y perder la edición del
 * humano es peor que perder la estructura.
 */
export function editedArtifactPayload(
  a: Pick<Artifact, "render" | "payload">,
  text: string
): { render: ArtifactRender; payload: any } {
  if (a.render === "mermaid") {
    const code = mermaidOnly(text);
    if (code) {
      const caption = a.payload?.caption;
      return { render: "mermaid", payload: caption ? { code, caption } : { code } };
    }
  }
  return { render: "markdown", payload: { markdown: text } };
}
