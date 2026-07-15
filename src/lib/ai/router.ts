// =============================================================================
// Router de IA — decide QUÉ motor usar para cada tarea y ejecuta con fallback.
//
// Política (lo que garantiza el escalado):
//   1. Tarea `heavy` o que exige salida estructurada (JSON/esquema) → REMOTO.
//      El modelo local pequeño nunca recibe trabajo que no puede hacer.
//   2. Tarea `light` → LOCAL (corto, frecuente, offline, gratis)…
//      …salvo que la entrada exceda `maxLocalChars` → REMOTO.
//   3. Fallback asimétrico:
//        - light puede degradar a remoto si local no está disponible;
//        - heavy NO puede degradar a local (no le da la capacidad) → error claro.
//
// Añadir una función de IA nueva = declarar una `AiTask` (ver tasks.ts).
// Ni el router ni los componentes cambian: ese es el patrón de escalado.
// =============================================================================

import {
  type ProviderId,
  localAvailable,
  remoteAvailable,
  runLocal,
  runRemoteFlow,
  remoteGenerateText,
} from "./providers";
import type { AiMode, RemoteProvider } from "./remote-settings";

export type Tier = "light" | "heavy";

/** Contexto de ejecución (conmutador manual + proveedor/modelo remoto elegido). */
export interface RouteContext {
  mode?: AiMode;
  provider?: RemoteProvider;
  model?: string;
}

export interface AiTask<I = any, O = string> {
  id: string;
  tier: Tier;
  /** Requiere salida estructurada (JSON/esquema) → fuerza remoto. */
  structured?: boolean;
  /** Tope de tamaño de entrada para el motor local (caracteres del prompt). */
  maxLocalChars?: number;
  // --- Ejecución LOCAL (texto) ---
  buildPrompt?: (input: I) => { prompt: string; system?: string };
  parse?: (raw: string) => O;
  // --- Ejecución REMOTA (genkit) ---
  remoteFlow?: string;
  buildRemoteInput?: (input: I) => any;
}

export interface RouteResult<O> {
  provider: ProviderId;
  fellBack: boolean;
  reason: string;
  output: O;
}

/** Decide el proveedor (o null si ninguno puede atender la tarea). */
export function chooseProvider(
  task: AiTask,
  inputSize: number,
  ctx?: RouteContext
): { provider: ProviderId | null; fellBack: boolean; reason: string } {
  const local = localAvailable();
  const remote = remoteAvailable();
  const runnableRemote = task.buildPrompt || task.remoteFlow; // hay forma de correrla en remoto
  const mode: AiMode = ctx?.mode ?? "hybrid";

  // MODO REMOTO: el usuario forzó la nube para TODO (incluidas las ligeras).
  if (mode === "remote" && remote && runnableRemote) {
    return { provider: "remote", fellBack: false, reason: "modo remoto (manual)" };
  }

  // MODO LOCAL: nunca sale a la nube.
  if (mode === "local") {
    if (task.buildPrompt && local) return { provider: "local", fellBack: false, reason: "modo local" };
    return { provider: null, fellBack: false, reason: "modo local: no hay motor local para esta tarea" };
  }

  // MODO HÍBRIDO (y por defecto): política inteligente local/remoto.
  // 1. Complejo / estructurado → remoto (sin degradar a local).
  if (task.tier === "heavy" || task.structured) {
    if (remote) return { provider: "remote", fellBack: false, reason: "tarea compleja/estructurada → remoto" };
    return { provider: null, fellBack: false, reason: "tarea compleja sin IA remota disponible (configura la API key)" };
  }

  // 2. Ligera → local primero.
  const tooBig = task.maxLocalChars != null && inputSize > task.maxLocalChars;
  if (!tooBig && local) return { provider: "local", fellBack: false, reason: "tarea ligera → local" };

  // 3. Fallbacks: si el local no da (no disponible o entrada grande) → remoto si hay
  //    cómo ejecutarla; si no, el local igual (marcando el degradado).
  if (runnableRemote && remote) {
    return { provider: "remote", fellBack: true, reason: tooBig ? "entrada grande → remoto" : "local no disponible → remoto" };
  }
  if (local) return { provider: "local", fellBack: tooBig, reason: "remoto no disponible → local" };
  return { provider: null, fellBack: false, reason: "ninguna IA disponible" };
}

/** Ejecuta una tarea por el proveedor que decide la política. */
export async function route<I, O = string>(
  task: AiTask<I, O>,
  input: I,
  ctx?: RouteContext
): Promise<RouteResult<O>> {
  const inputSize = task.buildPrompt ? task.buildPrompt(input).prompt.length : 0;
  const { provider, fellBack, reason } = chooseProvider(task as AiTask, inputSize, ctx);
  if (!provider) throw new Error(reason);

  if (provider === "local") {
    if (!task.buildPrompt) throw new Error(`La tarea "${task.id}" no define prompt local.`);
    const { prompt, system } = task.buildPrompt(input);
    const raw = await runLocal(prompt, system);
    const output = (task.parse ? task.parse(raw) : raw) as O;
    return { provider, fellBack, reason, output };
  }

  // remote — flujo Genkit estructurado (legado) o generación de texto en la nube.
  if (task.remoteFlow) {
    const remoteInput = task.buildRemoteInput ? task.buildRemoteInput(input) : input;
    const output = (await runRemoteFlow(task.remoteFlow, remoteInput)) as O;
    return { provider, fellBack, reason, output };
  }
  if (task.buildPrompt) {
    const { prompt, system } = task.buildPrompt(input);
    const raw = await remoteGenerateText(ctx?.provider ?? "gemini", ctx?.model ?? "", prompt, system);
    const output = (task.parse ? task.parse(raw) : raw) as O;
    return { provider, fellBack, reason, output };
  }
  throw new Error(`La tarea "${task.id}" no define ejecución remota.`);
}
