/**
 * @fileOverview Catálogo de modelos LiteRT-LM (.litertlm) — DATOS PUROS.
 *
 * Compartido entre renderer (Ajustes, selección) y main (descarga/servido). La
 * inferencia corre en el renderer con `@litert-lm/core` (WebGPU); el archivo se
 * sirve localmente vía el protocolo `litert-model://`.
 *
 * Sin React ni APIs de Node: solo el catálogo y la selección persistida.
 */

export type LitertModelId = "gemma-e2b" | "gemma-e4b";

export interface LitertModelMeta {
  id: LitertModelId;
  /** Etiqueta para la UI. */
  label: string;
  /** Nombre de archivo local (en userData/models/litert). */
  file: string;
  /** URL de descarga (HuggingFace, litert-community). */
  url: string;
  /** Tamaño aproximado de la descarga, en GB (para la barra y avisos). */
  approxGB: number;
  /** Descripción corta. */
  blurb: string;
}

export const LITERT_MODELS: LitertModelMeta[] = [
  {
    id: "gemma-e2b",
    label: "Gemma 4 · E2B",
    file: "gemma-4-E2B-it-web.litertlm",
    url: "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
    approxGB: 2.0,
    blurb: "Más liviano y rápido. Buena opción por defecto en equipos con poca VRAM.",
  },
  {
    id: "gemma-e4b",
    label: "Gemma 4 · E4B",
    file: "gemma-4-E4B-it-web.litertlm",
    url: "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
    approxGB: 3.0,
    blurb: "Máxima calidad agéntica/multimodal. Requiere GPU/VRAM más holgada.",
  },
];

export const DEFAULT_LITERT_MODEL_ID: LitertModelId = "gemma-e4b";
export const LITERT_MODEL_STORAGE = "litert_model";

export function getLitertModelMeta(id: string | undefined | null): LitertModelMeta {
  return LITERT_MODELS.find((m) => m.id === id) ?? LITERT_MODELS.find((m) => m.id === DEFAULT_LITERT_MODEL_ID)!;
}

/** Modelo seleccionado (renderer). Defensivo para entornos sin localStorage. */
export function getSelectedLitertModelId(): LitertModelId {
  try {
    const v = localStorage?.getItem?.(LITERT_MODEL_STORAGE) as LitertModelId | null;
    return LITERT_MODELS.some((m) => m.id === v) ? (v as LitertModelId) : DEFAULT_LITERT_MODEL_ID;
  } catch {
    return DEFAULT_LITERT_MODEL_ID;
  }
}

export function setSelectedLitertModelId(id: LitertModelId): void {
  try {
    localStorage.setItem(LITERT_MODEL_STORAGE, id);
  } catch {
    /* ignore */
  }
}

/** Nombre de archivo del modelo seleccionado (lo usa el motor y el agente). */
export function getSelectedLitertModelFile(): string {
  return getLitertModelMeta(getSelectedLitertModelId()).file;
}
