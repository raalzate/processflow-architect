/**
 * @fileOverview Estado de UNA corrida del agente constructor (PURO). 014 (#308).
 *
 * El analista tiene `agent-run.ts`; esto es su equivalente para el agente que
 * ESCRIBE, y por eso lo que fija es distinto: cuántos pasos quedan (una corrida
 * sin tope escribe hasta que la matan), qué confirmación está esperando al
 * humano, y —lo importante— QUÉ CAMBIÓ de verdad en el modelo, para que el
 * cierre no sea la palabra del modelo sino la lista de herramientas que
 * efectivamente se aplicaron.
 *
 * Ninguna función ejecuta nada ni muta su entrada: devuelven estado nuevo.
 */

import type { BuilderCall } from "./builder-tools";

/** Resultado de haber llamado a una herramienta (lo trae el adaptador). */
export interface ToolObservation {
  ok: boolean;
  texto: string;
}

export interface BuilderStep {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  texto: string;
}

export interface BuilderRunState {
  pasos: BuilderStep[];
  /** Cambios REALES aplicados al modelo, en palabras, para el resumen final. */
  cambios: string[];
  pendiente?: { call: BuilderCall; alcance: string };
  restantes: number;
  cancelada?: boolean;
  /** El humano dijo que no a algo: se recuerda para no fingir que se hizo. */
  rechazos: string[];
}

/**
 * Tope de pasos. Doce alcanza para orientarse, construir una vista de tamaño
 * humano y cerrarla; más que eso, con un modelo local, es divagar caro.
 */
export const MAX_BUILDER_STEPS = 12;

/** Herramientas que cambian el modelo (las demás sólo miran). */
const ESCRIBEN = new Set([
  "create_diagram",
  "add_container",
  "add_node",
  "add_edge",
  "update_element",
  "update_edge",
  "relayout_diagram",
  "remove_element",
  "remove_edge",
  "delete_view",
  "rename_view",
  "export_as_view",
]);

/** Qué cambió, en una línea que el humano pueda leer sin abrir la traza. */
function frase(call: BuilderCall): string {
  const nombre = String(call.args.name ?? call.args.id ?? "");
  switch (call.tool) {
    case "add_node":
      return `Elemento "${nombre}" agregado${call.args.type ? ` (${String(call.args.type)})` : ""}.`;
    case "add_container":
      return `Contenedor "${nombre}" agregado.`;
    case "add_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} agregada.`;
    case "update_element":
      return `Elemento "${nombre}" modificado.`;
    case "update_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} modificada.`;
    case "remove_element":
      return `Elemento "${nombre}" eliminado.`;
    case "remove_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} eliminada.`;
    case "delete_view":
      return `Vista "${nombre}" eliminada.`;
    case "rename_view":
      return `Vista "${nombre}" renombrada a "${String(call.args.newName ?? "")}".`;
    case "export_as_view":
      return `Vista "${nombre}" publicada en el lienzo.`;
    case "create_diagram":
      return `Diagrama "${nombre}" creado.`;
    case "relayout_diagram":
      return "Diagrama reacomodado.";
    default:
      return `${call.tool} aplicado.`;
  }
}

export function startRun(): BuilderRunState {
  return { pasos: [], cambios: [], restantes: MAX_BUILDER_STEPS, rechazos: [] };
}

export function applyObservation(
  state: BuilderRunState,
  call: BuilderCall,
  obs: ToolObservation
): BuilderRunState {
  const paso: BuilderStep = { tool: call.tool, args: call.args, ok: obs.ok, texto: obs.texto };
  return {
    ...state,
    pasos: [...state.pasos, paso],
    // Un cambio se anota cuando la herramienta VOLVIÓ bien: lo contrario es
    // prometerle al humano un cambio que el MCP rechazó.
    cambios: obs.ok && ESCRIBEN.has(call.tool) ? [...state.cambios, frase(call)] : state.cambios,
    restantes: Math.max(0, state.restantes - 1),
    pendiente: undefined,
  };
}

/** Deja la llamada esperando el sí del humano. No gasta paso: todavía no pasó nada. */
export function pendingConfirmation(
  state: BuilderRunState,
  call: BuilderCall,
  alcance: string
): BuilderRunState {
  return { ...state, pendiente: { call, alcance } };
}

export function resolveConfirmation(
  state: BuilderRunState,
  aceptada: boolean
): { state: BuilderRunState; ejecutar?: BuilderCall } {
  const pendiente = state.pendiente;
  if (!pendiente) return { state };
  if (aceptada) {
    return { state: { ...state, pendiente: undefined }, ejecutar: pendiente.call };
  }
  return {
    state: {
      ...state,
      pendiente: undefined,
      rechazos: [...state.rechazos, pendiente.alcance],
    },
  };
}

export function cancelRun(state: BuilderRunState): BuilderRunState {
  return { ...state, cancelada: true, pendiente: undefined };
}

export function runFinished(state: BuilderRunState): boolean {
  return Boolean(state.cancelada) || state.restantes <= 0;
}

/** El cierre: qué cambió, qué se rechazó y por qué terminó. */
export function summarizeRun(state: BuilderRunState): string {
  const partes: string[] = [];
  if (state.cambios.length) {
    partes.push(["Cambios aplicados:", ...state.cambios.map((c) => `- ${c}`)].join("\n"));
  } else {
    partes.push("Sin cambios: el modelo quedó como estaba.");
  }
  if (state.rechazos.length) {
    partes.push(
      ["No se hizo (lo rechazaste):", ...state.rechazos.map((r) => `- ${r}`)].join("\n")
    );
  }
  if (state.cancelada) partes.push("Corrida cancelada.");
  else if (state.restantes <= 0) partes.push("Se agotó el tope de pasos de la corrida.");
  return partes.join("\n\n");
}
