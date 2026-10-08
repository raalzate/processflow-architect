/**
 * @fileOverview Tope de gasto del CLI por sesión de la app (PURO + estado de módulo). #462.
 *
 * En modo «Claude Code» cada tarea es una llamada al CLI (~US$ 0,10 y 3–13 s,
 * medido con 2.1.293), y el Constructor hace varias por pedido: sin tope ni
 * aviso, el humano se enteraba del gasto en su factura. Acá vive cuánto se
 * gastó en esta sesión de la app (el CLI lo informa en cada `result`) y el tope
 * que eligió el humano; el chat y el router consultan antes de llamar.
 *
 * Un módulo y no un contexto de React, igual que `capability.ts`: `providers.ts`
 * no es un componente.
 */

/** Tope por defecto: suficiente para una sesión de trabajo, corta una corrida desbocada. */
export const DEFAULT_COST_CAP_USD = 5;

const CAP_KEY = "agent_cli_cost_cap";

let gastado = 0;

/** Lo gastado por el CLI en esta sesión de la app, en USD. */
export const gastoSesion = (): number => gastado;

/** Suma un costo informado por el CLI. Ignora lo que no es un número finito ≥ 0. */
export function sumarGasto(usd: unknown): void {
  if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) gastado += usd;
}

/** Para las pruebas y para «reiniciar el contador» desde Ajustes. */
export function resetGasto(): void {
  gastado = 0;
}

/**
 * Tope guardado. `null` = sin tope (el humano lo desactivó a propósito). Un
 * valor ilegible vuelve al de por defecto: perder el tope en silencio sería
 * peor que pedirle al humano que lo vuelva a elegir.
 */
export function leerTope(storage: Pick<Storage, "getItem"> | undefined): number | null {
  try {
    const crudo = storage?.getItem(CAP_KEY);
    if (crudo === null || crudo === undefined) return DEFAULT_COST_CAP_USD;
    if (crudo === "none") return null;
    const n = Number(crudo);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_COST_CAP_USD;
  } catch {
    return DEFAULT_COST_CAP_USD;
  }
}

export function guardarTope(storage: Pick<Storage, "setItem"> | undefined, tope: number | null): void {
  try {
    storage?.setItem(CAP_KEY, tope === null ? "none" : String(tope));
  } catch {
    /* sin storage el tope vale para esta sesión */
  }
}

/** ¿Se puede hacer otra llamada? Con lo gastado ya en el tope o por encima, no. */
export const dentroDelTope = (gasto: number, tope: number | null): boolean => tope === null || gasto < tope;

export const formatoUsd = (usd: number): string => `US$ ${usd.toFixed(2)}`;

/** El motivo, dicho para el humano, de por qué no se llamó al CLI. */
export function mensajeTope(gasto: number, tope: number): string {
  return `Llegaste al tope de gasto de Claude Code de esta sesión (${formatoUsd(gasto)} de ${formatoUsd(tope)}). Subilo o desactivalo en Ajustes → Motor de IA, o reiniciá la app.`;
}
