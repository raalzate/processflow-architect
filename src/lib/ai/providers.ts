// =============================================================================
// Proveedores de IA — abstracción uniforme sobre cada motor.
//
// Añadir un motor nuevo = añadir un proveedor aquí; el router (router.ts) y los
// puntos de llamada (useAi) no cambian. Ese desacople es la base del escalado.
//
//  - local  : Qwen (modelo pequeño, en el worker de Electron). Texto corto,
//             gratis, offline. Ideal para sugerencias frecuentes.
//  - remote : Gemini (nube, vía genkit). Razonamiento complejo y salida
//             estructurada (JSON con esquema). Requiere API key.
// =============================================================================

// "remote" ya NO es la nube: es el flujo Genkit que corre el MISMO modelo Gemma
// local (orquestación estructurada en el proceso main). Se conserva el nombre por
// compatibilidad con el router. Toda la IA es local.
//  - cli    : Claude Code / Codex como MOTOR DE TEXTO (feature 021): el CLI del
//             usuario razona con SU sesión (sin llave en la app, sin red desde la
//             app) y la app actúa con sus propias tools. Un proceso por llamada.
export type ProviderId = "local" | "remote" | "cli";

import { litertGenerate } from "./litert-engine";
import { getSelectedLitertModelFile } from "@/lib/litert-models";
import { estadoIaLocal, puedeUsarIaLocal } from "./local-capability";
import { cliInstalado } from "@/lib/agent-cli/capability";
import { dentroDelTope, gastoSesion, leerTope, mensajeTope, sumarGasto } from "@/lib/agent-cli/cost";
import type { CliId } from "@/lib/agent-cli/types";

const api = () => (typeof window !== "undefined" ? (window as any).electronAPI : undefined);

/**
 * IA local disponible: corre en el renderer (LiteRT-LM / WebGPU) dentro de
 * Electron. Estar en Electron NO basta: sin adaptador WebGPU el motor no arranca,
 * y decir que está disponible hacía que el router le mandara la tarea para que
 * fallara adentro con un error del engine en vez de avisar antes (#202). El estado
 * lo publica el renderer al arrancar (`local-capability.ts`).
 */
export const localAvailable = (): boolean => !!api() && puedeUsarIaLocal(estadoIaLocal());

/** IA remota disponible: el main expone generación por proveedor (Gemini/OpenAI/Anthropic). */
export const remoteAvailable = (): boolean => !!api()?.remoteGenerate;

/** CLI por defecto del motor `cli`. Codex queda declarado sin verificar en vivo. */
export const DEFAULT_CLI: CliId = "claude";

/**
 * Motor CLI disponible: el main expone la generación Y el CLI está instalado
 * según lo que el renderer publicó al arrancar (`agent-cli/capability.ts`).
 * Afirmarlo sin eso mandaba la tarea a un binario que no existe.
 */
export const cliAvailable = (cli: CliId = DEFAULT_CLI): boolean => !!api()?.agentCliGenerate && cliInstalado(cli);

/**
 * Genera texto con el CLI del usuario (feature 021). El error del CLI (sin
 * sesión, timeout) se lanza tal cual: el humano lo ve, no se degrada en silencio.
 */
export async function runCli(prompt: string, system?: string, cli: CliId = DEFAULT_CLI): Promise<string> {
  const a = api();
  if (!a?.agentCliGenerate) throw new Error("El motor por CLI sólo está disponible en la app de escritorio.");
  // #462: tope de gasto por sesión. Se mira ANTES de llamar: una vez lanzada,
  // la llamada ya se cobra.
  const tope = leerTope(typeof localStorage === "undefined" ? undefined : localStorage);
  if (!dentroDelTope(gastoSesion(), tope)) throw new Error(mensajeTope(gastoSesion(), tope as number));
  const r = await a.agentCliGenerate({ cli, prompt, system });
  sumarGasto(r.costUsd); // también lo gastado en una llamada que falló
  if (!r.ok) throw new Error(r.error);
  return (r.text || "").trim();
}

/**
 * Genera texto con la IA local. AHORA vía LiteRT-LM (WebGPU, renderer) — el path
 * ONNX (onnxruntime-node) no podía generar gemma-4. One-shot (sin historial).
 */
export async function runLocal(prompt: string, system?: string): Promise<string> {
  const text = await litertGenerate(getSelectedLitertModelFile(), [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    { role: "user" as const, content: prompt },
  ]);
  return (text || "").trim();
}

/** Ejecuta un flujo Genkit (corre el modelo Gemma local en el proceso main). */
export async function runRemoteFlow(flow: string, input: any): Promise<any> {
  const a = api();
  if (!a?.runGenkit) throw new Error("IA local (flujos) no disponible.");
  return a.runGenkit(flow, input);
}

/**
 * Genera texto con un proveedor REMOTO (nube). La petición HTTP y la llave viven
 * en el proceso main (safeStorage); aquí sólo se invoca por IPC.
 */
export async function remoteGenerateText(
  provider: string,
  model: string,
  prompt: string,
  system?: string
): Promise<string> {
  const a = api();
  if (!a?.remoteGenerate) throw new Error("IA remota no disponible.");
  return a.remoteGenerate({ provider, model, prompt, system });
}
