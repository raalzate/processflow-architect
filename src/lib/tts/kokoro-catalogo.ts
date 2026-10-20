/**
 * @fileOverview Catálogo de Kokoro-82M (voz local) — DATOS PUROS.
 *
 * Compartido entre el main (descarga y servido por `litert-model://m/kokoro/…`)
 * y el renderer (worker de síntesis, Ajustes). Los archivos salen del repo ONNX
 * de la comunidad; se usa el modelo q8 (~90 MB) porque corre en CPU (WASM) sin
 * quitarle la GPU a LiteRT-LM.
 */

export const KOKORO_REPO = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_BASE_URL = `https://huggingface.co/${KOKORO_REPO}/resolve/main`;
/** Nombre del modelo para transformers.js: arma `<localModelPath>/<id>/<archivo>`. */
export const KOKORO_MODEL_ID = "Kokoro-82M-v1.0-ONNX";
/** Prefijo del scheme local: `litert-model://m/kokoro/<ruta>`. */
export const KOKORO_URL_LOCAL = "litert-model://m/kokoro/";

export type VozId = "ef_dora" | "em_alex" | "em_santa";

export interface VozEs {
  id: VozId;
  nombre: string;
  genero: "mujer" | "hombre";
}

export const VOCES_ES: readonly VozEs[] = [
  { id: "ef_dora", nombre: "Dora", genero: "mujer" },
  { id: "em_alex", nombre: "Alex", genero: "hombre" },
  { id: "em_santa", nombre: "Santa", genero: "hombre" },
];

export const VOZ_POR_DEFECTO: VozId = "ef_dora";

export interface ArchivoKokoro {
  /** Ruta dentro del repo y, también, dentro de `userData/models/kokoro`. */
  ruta: string;
  /** Tamaño aproximado en bytes (para la barra de progreso). */
  bytes: number;
}

export const ARCHIVOS_KOKORO: readonly ArchivoKokoro[] = [
  { ruta: "config.json", bytes: 44 },
  { ruta: "tokenizer.json", bytes: 3_497 },
  { ruta: "tokenizer_config.json", bytes: 113 },
  { ruta: "onnx/model_quantized.onnx", bytes: 92_361_116 },
  ...VOCES_ES.map((v) => ({ ruta: `voices/${v.id}.bin`, bytes: 522_240 })),
];

export const KOKORO_BYTES_TOTALES = ARCHIVOS_KOKORO.reduce((s, a) => s + a.bytes, 0);

/**
 * Traduce lo que pide el renderer a un archivo del catálogo, o null. transformers.js
 * antepone el id del modelo («Kokoro-82M-v1.0-ONNX/onnx/…»); se quita. Sólo se
 * sirve lo que está en la lista: así no hay path traversal posible.
 */
export function rutaLocalSegura(pedida: string): string | null {
  const limpia = pedida.replace(/^\/+/, "").replace(new RegExp(`^${KOKORO_MODEL_ID}/`), "");
  return ARCHIVOS_KOKORO.some((a) => a.ruta === limpia) ? limpia : null;
}

/** Dimensión del vector de estilo de Kokoro. */
export const ESTILO_DIM = 256;

/**
 * Kokoro guarda un vector de estilo por largo de entrada (0..510 tokens). Se usa
 * la fila del número de tokens sin el de inicio y el de fin, como kokoro-js.
 */
export function estiloDeVoz(voz: Float32Array, numTokens: number): Float32Array {
  const fila = Math.min(Math.max(numTokens - 2, 0), 509);
  return voz.slice(fila * ESTILO_DIM, (fila + 1) * ESTILO_DIM);
}

export interface AjustesVoz {
  voz: VozId;
  /** 0.5–2; 1 es la velocidad natural. */
  velocidad: number;
}

const CLAVE = "tts_voz";
const POR_DEFECTO: AjustesVoz = { voz: VOZ_POR_DEFECTO, velocidad: 1 };

export function cargarAjustesVoz(): AjustesVoz {
  try {
    const crudo = typeof localStorage === "undefined" ? null : localStorage?.getItem(CLAVE);
    if (!crudo) return { ...POR_DEFECTO };
    const j = JSON.parse(crudo) as Partial<AjustesVoz>;
    const voz = VOCES_ES.find((v) => v.id === j.voz)?.id ?? VOZ_POR_DEFECTO;
    const v = Number(j.velocidad);
    return { voz, velocidad: v >= 0.5 && v <= 2 ? v : 1 };
  } catch {
    return { ...POR_DEFECTO };
  }
}

export function guardarAjustesVoz(a: AjustesVoz): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    /* sin almacenamiento: queda el defecto */
  }
}
