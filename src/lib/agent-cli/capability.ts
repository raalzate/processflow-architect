/**
 * @fileOverview Qué CLI de agente hay en esta máquina (PURO). Feature 021.
 *
 * Espejo de `src/lib/ai/local-capability.ts`: el renderer lo pregunta UNA vez
 * al arrancar (IPC `agent-cli-status`) y lo publica acá; el router y la UI lo
 * leen en sincrónico. Un módulo y no un contexto de React a propósito:
 * `providers.ts` no es un componente y no puede usar hooks.
 */

import type { CliId, CliStatus } from "./types";

let estado: CliStatus[] | null = null;

/** Lo que se sabe de los CLI (null = todavía no se preguntó). */
export const estadoCli = (): CliStatus[] | null => estado;

/** Publica el estado (lo hace el renderer al arrancar). */
export function publicarEstadoCli(nuevo: CliStatus[]): void {
  estado = nuevo;
}

/** Para las pruebas. */
export function resetEstadoCli(): void {
  estado = null;
}

/** ¿Ese CLI está instalado según lo publicado? Sin publicar, no se afirma. */
export function cliInstalado(cli: CliId, estados: CliStatus[] | null = estado): boolean {
  return !!estados?.find((s) => s.cli === cli)?.installed;
}
