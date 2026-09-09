/**
 * @fileOverview Bucle del agente CONSTRUCTOR. 014 (#308).
 *
 * El analista razona sobre el modelo; éste lo CAMBIA. El bucle es el mismo ReAct
 * de siempre —una acción por turno— pero con dos diferencias que importan:
 *
 *  1. Las herramientas no las inventa el agente: son las del MCP de Processflow,
 *     ejecutadas por el transporte EN MEMORIA (el mismo que usa el playground de
 *     `/mcp`), así que no hace falta encender el servidor HTTP ni abrir un puerto.
 *  2. Nada destructivo se ejecuta sin el sí del humano: `judgeCall` devuelve
 *     `confirmar` y la corrida se detiene ahí, con su estado serializable, hasta
 *     que alguien responda (§P10).
 *
 * Todo lo que decide vive en `builder-tools.ts` y `builder-run.ts` (puro, con
 * test). Acá está lo que no se puede probar sin Electron: llamar al MCP y al
 * modelo. Por eso ambas cosas entran por `deps`, y los tests las sustituyen.
 */

import type { AgentStep } from "../agent-types";
import type { AiMode, RemoteProvider } from "./remote-settings";
import { route } from "./router";
import { builderTurnTask } from "./tasks";
import { avisoPedidoGrande, cabeEnMotorLocal } from "./agent-engine";
import {
  buildToolMenu,
  judgeCall,
  parseBuilderAction,
  type BuilderCall,
  type ToolSpec,
} from "./builder-tools";
import {
  applyObservation,
  cancelRun,
  pendingConfirmation,
  resolveConfirmation,
  runFinished,
  startRun,
  summarizeRun,
  type BuilderRunState,
} from "./builder-run";
import type { VistaConocida } from "../mcp/app-actions";

export interface BuilderDeps {
  listTools: () => Promise<ToolSpec[]>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ ok: boolean; texto: string }>;
  generate: (prompt: string, system: string, mode: AiMode, provider?: RemoteProvider, model?: string) => Promise<string>;
}

export interface BuilderAgentInput {
  message: string;
  vistas: VistaConocida[];
  notation?: string;
  /** Repertorio permitido (ids del perfil). */
  allow: string[];
  mode: AiMode;
  provider?: RemoteProvider;
  model?: string;
  maxTokens?: number;
  history?: { role: string; content: string }[];
  onStep?: (step: AgentStep) => void;
  deps?: Partial<BuilderDeps>;
}

export interface BuilderAgentResult {
  reply: string;
  steps: AgentStep[];
  state: BuilderRunState;
  /** Presente cuando la corrida quedó esperando el sí/no del humano. */
  pendiente?: { call: BuilderCall; alcance: string };
}

const electron = (): any =>
  typeof window !== "undefined" ? (window as any).electronAPI : undefined;

/** Herramientas y ejecución REALES: el transporte en memoria del proceso main. */
export const defaultBuilderDeps: BuilderDeps = {
  listTools: async () => {
    const api = electron();
    if (!api?.mcpPlaygroundListTools) throw new Error("El MCP sólo está disponible en la app de escritorio.");
    return (await api.mcpPlaygroundListTools()) as ToolSpec[];
  },
  callTool: async (name, args) => {
    const api = electron();
    const r = await api.mcpPlaygroundCall(name, args);
    return { ok: Boolean(r?.ok) && !r?.isError, texto: (r?.blocks ?? []).join("\n") };
  },
  generate: async (prompt, system, mode, provider, model) => {
    const r = await route(builderTurnTask, { prompt, system }, { mode, provider, model });
    return r.output;
  },
};

const SYSTEM = [
  "Sos el agente CONSTRUCTOR de Processflow Architect.",
  "Construís y modificás el modelo del usuario llamando herramientas, de a UNA por turno.",
  'Respondé SIEMPRE con UN objeto JSON: {"tool":"<nombre>","args":{…}} para actuar,',
  'o {"final":"<qué hiciste, en español>"} cuando la tarea esté terminada.',
  "Nunca inventes herramientas ni argumentos: usá sólo los del menú.",
  "Antes de construir, orientate (get_app_state / list_views). Antes de cerrar, validá y exportá.",
].join(" ");

/** Prompt del turno: menú, pedido, y lo observado hasta ahora. */
export function buildBuilderPrompt(
  input: Pick<BuilderAgentInput, "message" | "notation">,
  menu: string,
  state: BuilderRunState
): string {
  const observado = state.pasos
    .slice(-6)
    .map((p) => `- ${p.tool}(${JSON.stringify(p.args)}) → ${p.ok ? "OK" : "ERROR"}: ${p.texto.slice(0, 400)}`)
    .join("\n");
  return [
    `PEDIDO DEL USUARIO:\n${input.message}`,
    input.notation ? `NOTACIÓN DE LA VISTA EN CURSO: ${input.notation}` : "",
    `HERRAMIENTAS DISPONIBLES:\n${menu}`,
    observado ? `LO QUE YA HICISTE:\n${observado}` : "Todavía no hiciste nada.",
    `Pasos restantes: ${state.restantes}.`,
    'Tu próximo turno: UN objeto JSON, nada más.',
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** ¿El modelo dio por terminada la tarea? */
function textoFinal(raw: string): string | null {
  const m = raw.match(/"final"\s*:\s*"([\s\S]*?)"\s*[},]/);
  return m ? m[1].replace(/\\n/g, "\n").trim() : null;
}

async function bucle(
  input: BuilderAgentInput,
  deps: BuilderDeps,
  tools: ToolSpec[],
  estadoInicial: BuilderRunState,
  steps: AgentStep[]
): Promise<BuilderAgentResult> {
  const menu = buildToolMenu(tools, input.allow);
  let state = estadoInicial;
  const paso = (s: AgentStep) => {
    steps.push(s);
    input.onStep?.(s);
  };

  while (!runFinished(state)) {
    const prompt = buildBuilderPrompt(input, menu, state);
    if (input.mode === "local" && !cabeEnMotorLocal(prompt.length, input.maxTokens)) {
      return { reply: avisoPedidoGrande(), steps, state };
    }

    let raw: string;
    try {
      raw = await deps.generate(prompt, SYSTEM, input.mode, input.provider, input.model);
    } catch (e: any) {
      return { reply: `No pude pensar el próximo paso: ${e?.message ?? e}`, steps, state };
    }

    const fin = textoFinal(raw);
    if (fin) {
      return { reply: [fin, summarizeRun(state)].filter(Boolean).join("\n\n"), steps, state };
    }

    const parsed = parseBuilderAction(raw, input.allow);
    if ("error" in parsed) {
      // El error vuelve al modelo como observación: es corregible y no toca el modelo.
      paso({ type: "observation", content: parsed.error });
      state = applyObservation(state, { tool: "(inválida)", args: {} }, { ok: false, texto: parsed.error });
      continue;
    }

    const veredicto = judgeCall(parsed.call, {
      tools,
      vistas: input.vistas,
      notation: input.notation,
    });

    if (veredicto.kind === "rechazar") {
      paso({ type: "observation", content: veredicto.motivo });
      state = applyObservation(state, parsed.call, { ok: false, texto: veredicto.motivo });
      continue;
    }

    if (veredicto.kind === "confirmar") {
      state = pendingConfirmation(state, veredicto.call, veredicto.alcance);
      paso({ type: "question", content: veredicto.alcance });
      return {
        reply: `${veredicto.alcance}\n\n¿Lo hago?`,
        steps,
        state,
        pendiente: state.pendiente,
      };
    }

    state = await ejecutar(veredicto.call, deps, state, paso);
  }

  return { reply: summarizeRun(state), steps, state };
}

async function ejecutar(
  call: BuilderCall,
  deps: BuilderDeps,
  state: BuilderRunState,
  paso: (s: AgentStep) => void
): Promise<BuilderRunState> {
  paso({ type: "action", tool: call.tool, content: `${call.tool}(${JSON.stringify(call.args)})` });
  let obs: { ok: boolean; texto: string };
  try {
    obs = await deps.callTool(call.tool, call.args);
  } catch (e: any) {
    obs = { ok: false, texto: String(e?.message ?? e) };
  }
  paso({ type: "observation", content: obs.texto.slice(0, 600) });
  return applyObservation(state, call, obs);
}

export async function runBuilderAgent(input: BuilderAgentInput): Promise<BuilderAgentResult> {
  const deps: BuilderDeps = { ...defaultBuilderDeps, ...input.deps };
  const steps: AgentStep[] = [];
  let tools: ToolSpec[];
  try {
    tools = await deps.listTools();
  } catch (e: any) {
    return {
      reply: `No pude hablar con el MCP de la app: ${e?.message ?? e}`,
      steps,
      state: startRun(),
    };
  }
  return bucle(input, deps, tools, startRun(), steps);
}

/** Retoma una corrida detenida en una confirmación, con la respuesta del humano. */
export async function resumeBuilderAgent(
  input: BuilderAgentInput,
  estado: BuilderRunState,
  aceptada: boolean
): Promise<BuilderAgentResult> {
  const deps: BuilderDeps = { ...defaultBuilderDeps, ...input.deps };
  const steps: AgentStep[] = [];
  const tools = await deps.listTools();
  const { state, ejecutar: pedida } = resolveConfirmation(estado, aceptada);

  let siguiente = state;
  if (pedida) {
    siguiente = await ejecutar(pedida, deps, state, (s) => {
      steps.push(s);
      input.onStep?.(s);
    });
  }
  // Un "no" no cancela la corrida: el agente puede seguir por otro camino. Lo que
  // no puede es volver a intentar lo mismo, y eso lo ve en la traza.
  return bucle(input, deps, tools, siguiente, steps);
}

/** Cancelación explícita desde el chat. */
export function abortBuilderRun(state: BuilderRunState): BuilderRunState {
  return cancelRun(state);
}
