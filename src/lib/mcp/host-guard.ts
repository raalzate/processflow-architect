/**
 * @fileOverview Protección del servidor MCP HTTP contra DNS rebinding (PURO). #462.
 *
 * El servidor escucha sólo en 127.0.0.1, pero eso no alcanza: una página web
 * puede hacer que su dominio resuelva a 127.0.0.1 (DNS rebinding) y hablarle al
 * puerto con su propio `Host`. Un cliente legítimo (Claude Code, Codex, el chat
 * de la app) siempre manda `Host: 127.0.0.1:<puerto>` o `localhost:<puerto>`;
 * cualquier otro se rechaza antes de tocar una herramienta.
 */

/** ¿Este `Host` es el del servidor local en ese puerto? */
export function hostPermitido(host: string | undefined, puerto: number): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  return h === `127.0.0.1:${puerto}` || h === `localhost:${puerto}` || h === `[::1]:${puerto}`;
}
