/**
 * @fileOverview Validación de lo que el renderer manda por IPC al CLI (PURO). #461.
 *
 * El proceso main lanzaba el CLI con lo que llegara del renderer: un `cli`
 * desconocido reventaba con `TypeError`, y `mcpUrl` se metía sin escapar en el
 * `-c mcp_servers…url="…"` de Codex. Acá se decide qué entrada es lanzable; el
 * main rechaza el resto con un mensaje legible antes de tocar un proceso.
 */

import { CLI_IDS, type CliId } from "./types";
import type { GenerateInput, LaunchInput } from "./args";

/** El único servidor MCP al que el chat puede apuntar: el de la app, en loopback. */
/**
 * Con un `?focus=<id>` opcional (#462): el alcance del chat a la caja abierta.
 * El id va codificado (`encodeURIComponent`), así que sólo admite caracteres
 * seguros: nada de comillas ni espacios que pudieran romper el `-c` de Codex.
 */
const MCP_URL = /^http:\/\/127\.0\.0\.1:(\d{2,5})\/mcp(\?focus=[A-Za-z0-9%._~-]{1,256})?$/;
/** Ids de sesión de los CLI: uuid o similar, nunca algo con espacios o comillas. */
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export const esCliId = (x: unknown): x is CliId => typeof x === "string" && (CLI_IDS as readonly string[]).includes(x);

/**
 * @param permitidas Carpetas que emitió el selector NATIVO (#462). Si se pasa,
 *   cada carpeta pedida tiene que estar ahí: el renderer no puede adjuntar `/` ni
 *   `~` por su cuenta, sólo lo que el humano eligió en el diálogo del sistema.
 */
export function validarLaunch(
  x: unknown,
  permitidas?: ReadonlySet<string>
): { ok: true; input: LaunchInput } | { ok: false; error: string } {
  const i = (x ?? {}) as Record<string, unknown>;
  if (!esCliId(i.cli)) return { ok: false, error: `Agente desconocido: ${String(i.cli)}.` };
  if (typeof i.prompt !== "string" || !i.prompt.trim()) return { ok: false, error: "El mensaje está vacío." };
  if (typeof i.mcpUrl !== "string" || !MCP_URL.test(i.mcpUrl)) {
    return { ok: false, error: "La URL del servidor MCP no es la de la app (http://127.0.0.1:<puerto>/mcp)." };
  }
  const puerto = Number(MCP_URL.exec(i.mcpUrl)![1]);
  if (puerto < 1024 || puerto > 65535) return { ok: false, error: "Puerto del servidor MCP fuera de rango." };
  if (typeof i.systemPrompt !== "string") return { ok: false, error: "Falta el contexto de la caja." };
  if (i.sessionId !== undefined && (typeof i.sessionId !== "string" || !SESSION_ID.test(i.sessionId))) {
    return { ok: false, error: "Id de sesión inválido." };
  }
  if (i.dirs !== undefined && (!Array.isArray(i.dirs) || i.dirs.some((d) => typeof d !== "string"))) {
    return { ok: false, error: "Las carpetas adjuntas no tienen la forma esperada." };
  }
  if (permitidas && Array.isArray(i.dirs)) {
    const ajena = (i.dirs as string[]).find((d) => !permitidas.has(d));
    if (ajena) {
      return {
        ok: false,
        error: `La carpeta «${ajena}» no se eligió con «Adjuntar carpeta». Quitala y volvé a adjuntarla desde el botón.`,
      };
    }
  }
  if (
    i.maxTurns !== undefined &&
    (typeof i.maxTurns !== "number" || !Number.isInteger(i.maxTurns) || i.maxTurns < 1 || i.maxTurns > 100)
  ) {
    return { ok: false, error: "Tope de turnos inválido." };
  }
  return { ok: true, input: i as unknown as LaunchInput };
}

export function validarGenerate(x: unknown): { ok: true; input: GenerateInput } | { ok: false; error: string } {
  const i = (x ?? {}) as Record<string, unknown>;
  if (!esCliId(i.cli)) return { ok: false, error: `Agente desconocido: ${String(i.cli)}.` };
  if (typeof i.prompt !== "string" || !i.prompt.trim()) return { ok: false, error: "El pedido está vacío." };
  if (i.system !== undefined && typeof i.system !== "string") return { ok: false, error: "Prompt de sistema inválido." };
  return { ok: true, input: i as unknown as GenerateInput };
}
