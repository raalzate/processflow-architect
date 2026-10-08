/**
 * @fileOverview Estado del hilo del chat de la ficha (PURO). #462.
 *
 * Cómo un evento del CLI cambia el hilo vivía dentro del componente React, sin
 * ninguna prueba (el repo no tiene librería para probar componentes y no se
 * agrega una). Acá queda como función pura: el componente sólo la llama.
 */

import type { ChatEvent } from "./types";

export interface ToolCall {
  name: string;
  input: unknown;
  result?: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolCall[];
  error?: string;
  /** Turnos y costo que reporta el CLI al cerrar. */
  meta?: { turns?: number; costUsd?: number };
}

/** Aplica un evento al ÚLTIMO mensaje (el del agente en curso). Sin mensajes, no hace nada. */
export function aplicarEvento(msgs: readonly ChatMsg[], e: ChatEvent): ChatMsg[] {
  if (!msgs.length || e.type === "session") return msgs as ChatMsg[];
  const copia = [...msgs];
  const m = copia[copia.length - 1];
  switch (e.type) {
    case "text":
      copia[copia.length - 1] = { ...m, text: m.text + e.delta };
      break;
    case "tool_use":
      copia[copia.length - 1] = { ...m, tools: [...m.tools, { name: e.name, input: e.input }] };
      break;
    case "tool_result": {
      // El resultado es de la PRIMERA tool todavía sin resultado (llegan en orden).
      const i = m.tools.findIndex((t) => t.result === undefined);
      if (i === -1) return copia;
      const tools = [...m.tools];
      tools[i] = { ...tools[i], result: e.text };
      copia[copia.length - 1] = { ...m, tools };
      break;
    }
    case "result":
      copia[copia.length - 1] = {
        ...m,
        // Codex manda el texto completo en `result`; Claude ya lo mandó por deltas.
        text: m.text || e.text,
        meta: { turns: e.turns, costUsd: e.costUsd },
        ...(e.ok ? {} : { error: e.text || "El agente terminó con error." }),
      };
      break;
    case "error":
      copia[copia.length - 1] = { ...m, error: [m.error, e.message].filter(Boolean).join("\n") };
      break;
  }
  return copia;
}

/** La sesión que trae un evento (para `--resume`), si trae una. */
export const sesionDeEvento = (e: ChatEvent): string | undefined =>
  e.type === "session" ? e.sessionId : e.type === "result" ? e.sessionId : undefined;
