// =============================================================================
// Ajustes de IA REMOTA (conmutador manual global).
//
// El sistema es local por defecto (LiteRT-LM). Opcionalmente el usuario puede
// activar un proveedor remoto (Gemini/OpenAI/Anthropic) y usarlo para TODO.
// Las llaves NO viven aquí: se guardan cifradas en el proceso main (safeStorage).
// Este módulo sólo maneja la preferencia (modo, proveedor, modelo) — no secretos.
// =============================================================================

// local  → todo en el modelo local.
// remote → todo en el proveedor de nube elegido.
// hybrid → local para sugerencias ligeras; nube para lo complejo o entradas grandes.
export type AiMode = "local" | "remote" | "hybrid";
export type RemoteProvider = "gemini" | "openai" | "anthropic";

export interface RemoteProviderInfo {
  id: RemoteProvider;
  label: string;
  /** Modelos sugeridos; el usuario puede escribir otro. */
  models: string[];
  defaultModel: string;
  /** Dónde obtener la llave (para el enlace de ayuda). */
  keysUrl: string;
}

export const REMOTE_PROVIDERS: RemoteProviderInfo[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    defaultModel: "gemini-2.5-flash",
    keysUrl: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1"],
    defaultModel: "gpt-4o-mini",
    keysUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    models: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-4-5",
    keysUrl: "https://console.anthropic.com/settings/keys",
  },
];

export interface AiRemoteSettings {
  mode: AiMode;
  provider: RemoteProvider;
  /** Modelo elegido por proveedor (si falta, se usa el defaultModel). */
  models: Partial<Record<RemoteProvider, string>>;
}

export const DEFAULT_AI_SETTINGS: AiRemoteSettings = {
  mode: "local",
  provider: "gemini",
  models: {},
};

/** Estado de configuración de llaves por proveedor (viene del proceso main). */
export type KeyStatus = Partial<Record<RemoteProvider, boolean>>;

export function providerInfo(id: RemoteProvider): RemoteProviderInfo {
  return REMOTE_PROVIDERS.find((p) => p.id === id) ?? REMOTE_PROVIDERS[0];
}

/** Modelo efectivo para un proveedor (el elegido o su default). */
export function modelFor(settings: AiRemoteSettings, provider: RemoteProvider): string {
  const chosen = settings.models[provider]?.trim();
  return chosen || providerInfo(provider).defaultModel;
}

/** ¿El modo remoto está activo Y hay llave para el proveedor seleccionado? */
export function isRemoteActive(settings: AiRemoteSettings, keys: KeyStatus): boolean {
  return settings.mode === "remote" && !!keys[settings.provider];
}

/** Normaliza un objeto arbitrario a AiRemoteSettings válido (sanea persistencia). */
export function normalizeSettings(raw: unknown): AiRemoteSettings {
  const r = (raw ?? {}) as Partial<AiRemoteSettings>;
  const mode: AiMode = r.mode === "remote" ? "remote" : r.mode === "hybrid" ? "hybrid" : "local";
  const provider: RemoteProvider = REMOTE_PROVIDERS.some((p) => p.id === r.provider)
    ? (r.provider as RemoteProvider)
    : "gemini";
  const models: Partial<Record<RemoteProvider, string>> = {};
  if (r.models && typeof r.models === "object") {
    for (const p of REMOTE_PROVIDERS) {
      const v = (r.models as Record<string, unknown>)[p.id];
      if (typeof v === "string" && v.trim()) models[p.id] = v.trim();
    }
  }
  return { mode, provider, models };
}

const STORAGE_KEY = "ai_remote_settings";

/** Lee los ajustes de localStorage (o los por defecto). */
export function loadAiSettings(): AiRemoteSettings {
  if (typeof localStorage === "undefined") return DEFAULT_AI_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_AI_SETTINGS;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

/** Persiste los ajustes en localStorage. */
export function saveAiSettings(settings: AiRemoteSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}
