/**
 * @fileOverview Motor del agente constructor (PURO). 014 (#308).
 *
 * El constructor NO trae política de ruteo propia: su turno es una `AiTask`
 * (`builderTurnTask`, en `tasks.ts`) y quien elige motor sigue siendo el router
 * (§P5). Lo que vive acá es lo que el router no puede saber: si el pedido le
 * entra al motor local ANTES de arrancar una corrida que se cortaría a la mitad.
 */

import { budgetFromWindow } from "./agent-run";

/**
 * Techo de entrada del turno para el motor local. Por encima, en modo híbrido el
 * router manda el turno a la nube; en modo local hay que avisar (no hay a dónde ir).
 */
export const BUILDER_LOCAL_MAX_CHARS = 6_000;

/** ¿El pedido entra en la ventana real del modelo local (Ajustes → máx. tokens)? */
export function cabeEnMotorLocal(chars: number, maxTokens: number | undefined): boolean {
  return chars <= budgetFromWindow(maxTokens);
}

/** Aviso con salida: partir el pedido o encender la nube. Nunca "falló y ya". */
export function avisoPedidoGrande(): string {
  return (
    "El pedido es más grande de lo que sostiene la IA local en una corrida. " +
    "Partilo en pasos (por ejemplo, una vista por vez) o activá la IA remota en Ajustes."
  );
}
