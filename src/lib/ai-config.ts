/**
 * @fileOverview Configuración de generación de la IA local (LiteRT-LM).
 *
 * La app es 100% local: el modelo (.litertlm) se elige en `litert-models.ts` y la
 * inferencia corre en el renderer (WebGPU). Aquí solo viven los parámetros de
 * generación persistidos (ventana de tokens + system prompt base).
 */

export const GEN_CONFIG_STORAGE = "ai_gen_config";

export interface GenerationConfig {
  /** Ventana máxima de tokens del motor LiteRT (`maxNumTokens`). */
  maxTokens: number;
  /** Persona/instrucción base; vacío = por defecto del agente. */
  systemPrompt: string;
}

export const DEFAULT_GEN_CONFIG: GenerationConfig = {
  maxTokens: 4096,
  systemPrompt: "",
};

export function getGenerationConfig(): GenerationConfig {
  if (typeof localStorage === "undefined") return { ...DEFAULT_GEN_CONFIG };
  try {
    const stored = JSON.parse(localStorage.getItem(GEN_CONFIG_STORAGE) || "{}");
    return { ...DEFAULT_GEN_CONFIG, ...stored };
  } catch {
    return { ...DEFAULT_GEN_CONFIG };
  }
}

export function setGenerationConfig(c: GenerationConfig): void {
  try {
    localStorage.setItem(GEN_CONFIG_STORAGE, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}
