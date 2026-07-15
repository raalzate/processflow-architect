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
export type ProviderId = "local" | "remote";

import { litertGenerate } from "./litert-engine";
import { getSelectedLitertModelFile } from "@/lib/litert-models";

const api = () => (typeof window !== "undefined" ? (window as any).electronAPI : undefined);

/** IA local disponible: corre en el renderer (LiteRT-LM / WebGPU) dentro de Electron. */
export const localAvailable = (): boolean => !!api();

/** IA remota disponible: el main expone generación por proveedor (Gemini/OpenAI/Anthropic). */
export const remoteAvailable = (): boolean => !!api()?.remoteGenerate;

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
