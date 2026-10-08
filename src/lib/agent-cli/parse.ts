/**
 * @fileOverview Del stream JSON de cada CLI a eventos de chat (PURO). Feature 020.
 *
 * Cada CLI escribe un JSON por línea con su propio vocabulario. Acá se traduce
 * a `ChatEvent`, que es lo único que el panel conoce: sumar un CLI es sumar una
 * rama acá, no tocar la UI. Una línea que no se entiende se ignora (es ruido de
 * progreso), salvo que sea un error declarado.
 */

import type { ChatEvent, CliId } from "./types";

const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** Texto plano de un `tool_result` (el CLI lo manda como string o como bloques). */
function textOfResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (c && c.type === "text" ? str(c.text) : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseClaude(j: any): ChatEvent[] {
  switch (j.type) {
    case "system":
      // `init` trae el session_id (con `--resume` se repite el mismo).
      return j.subtype === "init" && j.session_id ? [{ type: "session", sessionId: j.session_id }] : [];
    case "stream_event": {
      // Deltas de texto: es lo que hace que la respuesta se vea escribirse.
      const d = j.event?.delta;
      return d?.type === "text_delta" && d.text ? [{ type: "text", delta: d.text }] : [];
    }
    case "assistant": {
      // El texto completo ya llegó por deltas; acá sólo interesan las tools.
      const bloques = Array.isArray(j.message?.content) ? j.message.content : [];
      return bloques
        .filter((c: any) => c?.type === "tool_use")
        .map((c: any) => ({ type: "tool_use" as const, name: str(c.name), input: c.input }));
    }
    case "user": {
      const bloques = Array.isArray(j.message?.content) ? j.message.content : [];
      return bloques
        .filter((c: any) => c?.type === "tool_result")
        .map((c: any) => ({ type: "tool_result" as const, text: textOfResult(c.content) }));
    }
    case "result":
      return [
        {
          type: "result",
          ok: j.subtype === "success" && !j.is_error,
          text: str(j.result),
          ...(typeof j.num_turns === "number" ? { turns: j.num_turns } : {}),
          ...(typeof j.total_cost_usd === "number" ? { costUsd: j.total_cost_usd } : {}),
          ...(j.session_id ? { sessionId: j.session_id } : {}),
        },
      ];
    default:
      return [];
  }
}

function parseCodex(j: any): ChatEvent[] {
  switch (j.type) {
    case "thread.started":
      return j.thread_id ? [{ type: "session", sessionId: j.thread_id }] : [];
    case "item.completed": {
      const it = j.item ?? {};
      if (it.type === "agent_message") return it.text ? [{ type: "text", delta: str(it.text) }] : [];
      if (it.type === "mcp_tool_call") {
        return [
          { type: "tool_use", name: `${str(it.server)}.${str(it.tool)}`, input: it.arguments },
          ...(it.result !== undefined ? [{ type: "tool_result" as const, text: textOfResult(it.result?.content ?? it.result) }] : []),
        ];
      }
      return [];
    }
    case "turn.completed":
      return [{ type: "result", ok: true, text: "" }];
    case "turn.failed":
      return [{ type: "result", ok: false, text: str(j.error?.message ?? j.error) }];
    case "error":
      return [{ type: "error", message: str(j.message ?? j.error) }];
    default:
      return [];
  }
}

/** Una línea del stdout del CLI → cero o más eventos. Nunca lanza. */
export function parseLine(cli: CliId, line: string): ChatEvent[] {
  const l = line.trim();
  if (!l) return [];
  let j: any;
  try {
    j = JSON.parse(l);
  } catch {
    return [];
  }
  if (!j || typeof j !== "object") return [];
  return cli === "claude" ? parseClaude(j) : parseCodex(j);
}

/**
 * Texto final de una corrida de TEXTO PURO (feature 021) a partir de todo el
 * stdout: con `--output-format json` Claude escribe UN objeto `result`; Codex
 * escribe líneas `item.completed` con `agent_message`. Devuelve `{ text }` o
 * `{ error }` con el motivo que dio el CLI, para que el router lo muestre tal
 * cual en vez de degradar en silencio.
 */
export function resultText(
  cli: CliId,
  stdout: string
): { text: string; costUsd?: number } | { error: string; costUsd?: number } {
  if (cli === "claude") {
    const inicio = stdout.indexOf("{");
    if (inicio === -1) return { error: "Claude Code no devolvió una respuesta." };
    // Con `stream-json` (#462) llegan varios eventos, uno por línea, y el que
    // cuenta es el ÚLTIMO de tipo `result`. Con `json` llega un solo objeto,
    // que puede venir en varias líneas: si ninguna línea es un `result`, se lee
    // el texto entero.
    let j: any;
    for (const linea of stdout.split("\n")) {
      try {
        const o = JSON.parse(linea.trim());
        if (o && o.type === "result") j = o;
      } catch {
        /* línea parcial o de otro evento */
      }
    }
    if (!j) {
      try {
        j = JSON.parse(stdout.slice(inicio));
      } catch {
        return { error: "La respuesta de Claude Code no es JSON." };
      }
    }
    const costo = typeof j.total_cost_usd === "number" ? { costUsd: j.total_cost_usd } : {};
    if (j.is_error || (j.subtype && j.subtype !== "success")) {
      return { error: str(j.result) || `Claude Code terminó con ${str(j.subtype) || "error"}.`, ...costo };
    }
    return { text: str(j.result).trim(), ...costo };
  }
  const partes: string[] = [];
  let error = "";
  for (const line of stdout.split("\n")) {
    for (const e of parseLine("codex", line)) {
      if (e.type === "text") partes.push(e.delta);
      if (e.type === "error") error = e.message;
      if (e.type === "result" && !e.ok) error = e.text || "Codex terminó con error.";
    }
  }
  if (partes.length) return { text: partes.join("\n").trim() };
  return { error: error || "Codex no devolvió una respuesta." };
}

/**
 * Acumula stdout por trozos (un `data` del proceso puede cortar una línea a la
 * mitad) y devuelve las líneas completas. El resto queda para el próximo trozo.
 */
export function splitLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const todo = buffer + chunk;
  const partes = todo.split("\n");
  const rest = partes.pop() ?? "";
  return { lines: partes, rest };
}
