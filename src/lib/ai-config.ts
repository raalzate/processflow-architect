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

/**
 * Evento que se emite al guardar. Quien DERIVA algo de esta configuración —el
 * catálogo del agente deriva de ella si puede leer los adjuntos— tiene que
 * enterarse en el acto: un control de privacidad que tarda en aplicarse es un
 * control que no existe.
 */
export const GEN_CONFIG_EVENT = "ai-gen-config-changed";

export function setGenerationConfig(c: GenerationConfig): void {
  try {
    localStorage.setItem(GEN_CONFIG_STORAGE, JSON.stringify(c));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(GEN_CONFIG_EVENT));
  } catch {
    /* sin `window` (pruebas, main): nadie está escuchando */
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
