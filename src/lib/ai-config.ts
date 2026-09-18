/**
 * @fileOverview Configuración de generación de la IA local (LiteRT-LM).
 *
 * La app es 100% local: el modelo (.litertlm) se elige en `litert-models.ts` y la
 * inferencia corre en el renderer (WebGPU). Aquí solo viven los parámetros de
 * generación persistidos (ventana de tokens + system prompt base).
 */

export const GEN_CONFIG_STORAGE = "ai_gen_config";

/**
 * Qué puede hacer el agente de la app con el material adjunto a una caja.
 *
 * Sólo hay DOS valores, y la ausencia de un tercero es la decisión: no existe
 * «inyectar». Un contrato adjunto son decenas de miles de caracteres y la
 * ventana del motor local son 4 096 tokens; inyectarlo mata la corrida, y
 * recortarlo es peor —un contrato recortado miente—. Por eso el default es
 * `a-pedido`: la herramienta existe y el modelo decide, o no existe.
 */
export type AdjuntosAlAgente = "a-pedido" | "nunca";

export interface GenerationConfig {
  /** Ventana máxima de tokens del motor LiteRT (`maxNumTokens`). */
  maxTokens: number;
  /** Persona/instrucción base; vacío = por defecto del agente. */
  systemPrompt: string;
  /**
   * Si el agente puede LEER (nunca recibir) el material adjunto a una caja.
   * Opcional: una config guardada antes de la feature 016 no tiene el campo y
   * vale lo mismo que el default (`a-pedido`).
   */
  adjuntos?: AdjuntosAlAgente;
}

export const DEFAULT_GEN_CONFIG: GenerationConfig = {
  maxTokens: 4096,
  systemPrompt: "",
  adjuntos: "a-pedido",
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
