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

/**
 * Tope de la ventana del motor LiteRT — el mismo que ofrece el slider de
 * Ajustes → Modelo de IA. Vive acá para que la lógica que PROPONE ampliar y la
 * UI que la deja mover no se desincronicen.
 */
export const WINDOW_MAX = 8192;

/**
 * Siguiente escalón de ventana, o `null` si ya no hay margen. Existe porque el
 * default (4 096) deja el bucle del agente sin aire: el system ronda los 2 200
 * tokens y la corrida se quedaba sin ventana a mitad de la exploración, con un
 * mensaje que no decía qué cambiar (#358). Duplicar es el salto que se nota;
 * un valor fuera de escala se lleva al tope en vez de pasarse.
 */
export function nextWindow(actual: number | undefined): number | null {
  const base = actual && actual > 0 ? actual : DEFAULT_GEN_CONFIG.maxTokens;
  if (base >= WINDOW_MAX) return null;
  return Math.min(WINDOW_MAX, base * 2);
}
