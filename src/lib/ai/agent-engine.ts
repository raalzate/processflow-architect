/**
 * @fileOverview Motor del agente constructor (PURO). 014 (#308).
 *
 * El constructor NO trae política de ruteo propia: su turno es una `AiTask`
 * (`builderTurnTask`, en `tasks.ts`) y quien elige motor sigue siendo el router
 * (§P5). Lo que vive acá es lo que el router no puede saber: que esta tarea en
 * particular nunca se le da al motor local, sea cual sea el modo (#666).
 */

import type { AiMode } from "./remote-settings";

/**
 * Techo de entrada para el motor local de las tareas `light` conversacionales
 * (el chat de la ficha). Por encima, en modo híbrido el router manda el turno a
 * la nube.
 */
export const BUILDER_LOCAL_MAX_CHARS = 6_000;

/**
 * Motor con el que corre el constructor (#666). NUNCA el local: el constructor
 * escribe sobre el modelo del humano, y el modelo local chico se equivoca seguido
 * en eso —con un error que no tiene vuelta atrás—. Corre con el arnés (el CLI del
 * usuario) o con la API remota.
 *
 * En `local` y `cli` el humano no encendió la nube, así que sin CLI no se la
 * enciende por él (§P4): se bloquea y se le dice cómo destrabarlo. En `hybrid` y
 * `remote` la nube ya es opt-in.
 */
export type MotorDelConstructor =
  | { kind: "ok"; mode: "cli" | "remote"; motivo: string }
  | { kind: "bloqueado"; texto: string };

export function motorDelConstructor(
  mode: AiMode,
  disponible: { cli: boolean }
): MotorDelConstructor {
  if (mode === "remote" || mode === "hybrid") {
    return { kind: "ok", mode: "remote", motivo: "el constructor corre con la IA remota" };
  }
  if (disponible.cli) {
    return { kind: "ok", mode: "cli", motivo: "el constructor corre con el CLI del usuario, no con la IA local" };
  }
  return { kind: "bloqueado", texto: avisoSinMotor() };
}

/** Aviso con salida para cuando no hay arnés ni nube encendida. */
export function avisoSinMotor(): string {
  return (
    "El agente constructor no corre con la IA local: cambia tu modelo y un error del modelo chico no tiene vuelta atrás. " +
    "Instalá Claude Code o Codex (modo CLI) o activá la IA remota (modo híbrido o remoto) en Ajustes."
  );
}
