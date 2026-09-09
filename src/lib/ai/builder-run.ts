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

/**
 * Una opción de una pregunta al humano. `accion` es lo que la app hace ADEMÁS de
 * devolver la elección al agente: hoy, abrir Ajustes o cortar la corrida.
 */
export interface BuilderOption {
  id: string;
  label: string;
  /** Pista para la UI. Sin esto, elegir sólo devuelve el id al agente. */
  accion?: "abrir-ajustes-ia" | "cancelar";
  /** Texto de apoyo bajo la opción (por qué elegirla). */
  detalle?: string;
}

export interface BuilderQuestion {
  texto: string;
  opciones: BuilderOption[];
  /**
   * Presente cuando la pregunta es la confirmación de una acción destructiva: el
   * «sí» ejecuta esta llamada. Confirmar dejó de ser un mecanismo aparte (#321).
   */
  call?: BuilderCall;
}

export interface BuilderRunState {
  pasos: BuilderStep[];
  /** Cambios REALES aplicados al modelo, en palabras, para el resumen final. */
  cambios: string[];
  /** Pregunta abierta: mientras esté, la corrida está detenida esperando al humano. */
  pregunta?: BuilderQuestion;
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

/** Detiene la corrida con una pregunta concreta. No gasta paso: todavía no pasó nada. */
export function askUser(state: BuilderRunState, pregunta: BuilderQuestion): BuilderRunState {
  return { ...state, pregunta };
}

/**
 * La elección del humano. Una opción que no está en la lista NO se acepta: si el
 * agente pudiera inventar respuestas por él, la pausa no serviría de nada.
 */
export function answerUser(
  state: BuilderRunState,
  opcionId: string
): { state: BuilderRunState; eleccion?: BuilderOption } {
  const pregunta = state.pregunta;
  const eleccion = pregunta?.opciones.find((o) => o.id === opcionId);
  if (!pregunta || !eleccion) return { state };
  if (eleccion.accion === "cancelar") {
    return { state: { ...state, pregunta: undefined, cancelada: true }, eleccion };
  }
  return { state: { ...state, pregunta: undefined }, eleccion };
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
    pregunta: undefined,
  };
}

/**
 * Confirmar un destructivo es preguntar con dos opciones. Se mantiene la función
 * por lo que significa —esto NO es una pregunta cualquiera— pero por dentro es
 * el mismo mecanismo que el resto de las pausas (#321).
 */
export function pendingConfirmation(
  state: BuilderRunState,
  call: BuilderCall,
  alcance: string
): BuilderRunState {
  return askUser(state, {
    texto: `${alcance}\n\n¿Lo hago?`,
    opciones: [
      { id: "si", label: "Sí, hacelo" },
      { id: "no", label: "No" },
    ],
    call,
  });
}

export function resolveConfirmation(
  state: BuilderRunState,
  aceptada: boolean
): { state: BuilderRunState; ejecutar?: BuilderCall } {
  const pregunta = state.pregunta;
  const call = pregunta?.call;
  if (!pregunta || !call) return { state };
  if (aceptada) {
    return { state: { ...state, pregunta: undefined }, ejecutar: call };
  }
  return {
    state: {
      ...state,
      pregunta: undefined,
      // El alcance es la primera línea del texto: es lo que el humano leyó.
      rechazos: [...state.rechazos, pregunta.texto.split("\n")[0]],
    },
  };
}

export function cancelRun(state: BuilderRunState): BuilderRunState {
  return { ...state, cancelada: true, pregunta: undefined };
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
