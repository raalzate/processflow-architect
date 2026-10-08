/**
 * @fileOverview Con qué motor habla el chat de la ficha (PURO). #459.
 *
 * El tab «Agente» nació para Claude Code y Codex (020). Sin ninguno instalado
 * quedaba mudo; ahora ofrece también la IA de la APP (el motor de Ajustes:
 * local, híbrido, remoto o Claude Code como motor) y cae a ella sola cuando el
 * CLI elegido no está. La IA de la app no tiene las tools MCP: razona sobre la
 * ficha que le pasa la app y contesta; no escribe en el lienzo.
 */

import { CLI_IDS, CLI_INFO, type CliId, type CliStatus } from "./types";

export type ChatEngine = CliId | "app";

export const CHAT_ENGINES: readonly ChatEngine[] = [...CLI_IDS, "app"] as const;

export const engineLabel = (e: ChatEngine): string => (e === "app" ? "IA de la app" : CLI_INFO[e].label);

export const esCli = (e: ChatEngine): e is CliId => e !== "app";

export interface EngineChoice {
  /** El motor que de verdad atiende. */
  engine: ChatEngine;
  /** true cuando se eligió un CLI que no está y se cayó a la IA de la app. */
  fallback: boolean;
}

/**
 * Motor efectivo. `estados` null = todavía no se sabe qué hay: se respeta la
 * elección (no se cae antes de saber, o el selector parpadearía al abrir).
 */
/**
 * CLIs habilitados en el chat. Codex queda FUERA hasta verificar una barrera
 * de herramientas (#461, revisión): a Claude se le pasa una allowlist del MCP y
 * el CLI deniega el resto (verificado en vivo con `delete_view`); a Codex no hay
 * forma verificada de restringirlo, y con `codex exec` podría llamar tools
 * destructivas sin confirmación. Seguimiento en #462.
 */
export const CHAT_CLIS_HABILITADOS: readonly CliId[] = ["claude"] as const;

export const engineHabilitado = (e: ChatEngine): boolean => !esCli(e) || CHAT_CLIS_HABILITADOS.includes(e);

export function resolveChatEngine(elegido: ChatEngine, estados: CliStatus[] | null): EngineChoice {
  // Un CLI deshabilitado cae a la IA de la app aunque esté instalado.
  if (!engineHabilitado(elegido)) return { engine: "app", fallback: true };
  if (!esCli(elegido) || estados === null) return { engine: elegido, fallback: false };
  const instalado = estados.some((s) => s.cli === elegido && s.installed);
  return instalado ? { engine: elegido, fallback: false } : { engine: "app", fallback: true };
}

/**
 * Nombre visible de una carpeta adjunta (#460): la última parte de la ruta, en
 * POSIX o Windows. La ruta entera va en el tooltip; la etiqueta tiene que caber.
 */
export function nombreCarpeta(ruta: string): string {
  const partes = ruta.split(/[\\/]+/).filter(Boolean);
  return partes[partes.length - 1] ?? ruta;
}

/** Aviso cuando hubo caída, para que el humano sepa quién le contesta. */
export function fallbackNotice(elegido: ChatEngine): string {
  const motivo = engineHabilitado(elegido)
    ? `${engineLabel(elegido)} no está instalado`
    : `${engineLabel(elegido)} todavía no está habilitado en el chat (falta verificar que no pueda usar herramientas que borran)`;
  return `${motivo}: te contesta la IA de la app (no escribe en el lienzo; aplicá lo que te proponga desde el tab Spec).`;
}
