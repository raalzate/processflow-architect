/**
 * @fileOverview Síntesis de voz con Kokoro en un Web Worker (#605).
 *
 * Fuera del hilo de la UI: una frase tarda segundos en CPU y congelaría el chat.
 * Corre en WASM (no WebGPU) para no pelear la GPU con LiteRT-LM. transformers.js
 * se importa del CDN como LiteRT (`webpackIgnore`) y lee el modelo del disco por
 * `litert-model://m/kokoro/…`: nunca sale a Hugging Face.
 *
 * Protocolo: entra `{ id, texto, voz, velocidad }`, sale `{ id, audio, sr }` o
 * `{ id, error }`. El texto ya viene limpio y partido (src/lib/tts/texto-hablable).
 */

import { fonematizar } from "@/lib/tts/g2p-es";
import { ESTILO_DIM, KOKORO_MODEL_ID, KOKORO_URL_LOCAL, estiloDeVoz } from "@/lib/tts/kokoro-catalogo";

const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";
const SR = 24_000;

interface Motor {
  model: any;
  tokenizer: any;
  Tensor: any;
}

let motor: Promise<Motor> | null = null;
const voces = new Map<string, Promise<Float32Array>>();

function cargarMotor(): Promise<Motor> {
  if (!motor) {
    motor = (async () => {
      // @ts-ignore — módulo remoto (CDN) sin tipos; webpackIgnore evita que webpack lo bundlee.
      const t = await import(/* webpackIgnore: true */ TRANSFORMERS);
      t.env.allowRemoteModels = false;
      t.env.allowLocalModels = true;
      t.env.localModelPath = KOKORO_URL_LOCAL;
      t.env.useBrowserCache = false; // ya está en disco: cachearlo otra vez es duplicar 90 MB
      const [model, tokenizer] = await Promise.all([
        t.StyleTextToSpeech2Model.from_pretrained(KOKORO_MODEL_ID, { dtype: "q8", device: "wasm" }),
        t.AutoTokenizer.from_pretrained(KOKORO_MODEL_ID),
      ]);
      return { model, tokenizer, Tensor: t.Tensor };
    })();
    // Si falla (modelo sin bajar, p.ej.), el próximo pedido reintenta.
    motor.catch(() => {
      motor = null;
    });
  }
  return motor;
}

function cargarVoz(voz: string): Promise<Float32Array> {
  let v = voces.get(voz);
  if (!v) {
    v = fetch(`${KOKORO_URL_LOCAL}voices/${voz}.bin`).then(async (r) => {
      if (!r.ok) throw new Error(`Voz ${voz} no disponible (HTTP ${r.status}).`);
      return new Float32Array(await r.arrayBuffer());
    });
    v.catch(() => voces.delete(voz));
    voces.set(voz, v);
  }
  return v;
}

self.onmessage = async (e: MessageEvent<{ id: number; texto: string; voz: string; velocidad: number }>) => {
  const { id, texto, voz, velocidad } = e.data;
  try {
    const fonemas = fonematizar(texto);
    if (!fonemas) {
      postMessage({ id, audio: new Float32Array(0), sr: SR });
      return;
    }
    const [{ model, tokenizer, Tensor }, datosVoz] = await Promise.all([cargarMotor(), cargarVoz(voz)]);
    const { input_ids } = tokenizer(fonemas, { truncation: true });
    const estilo = estiloDeVoz(datosVoz, input_ids.dims.at(-1));
    const { waveform } = await model({
      input_ids,
      style: new Tensor("float32", estilo, [1, ESTILO_DIM]),
      speed: new Tensor("float32", [velocidad], [1]),
    });
    const audio = new Float32Array(waveform.data);
    (self as unknown as Worker).postMessage({ id, audio, sr: SR }, [audio.buffer]);
  } catch (err: any) {
    postMessage({ id, error: String(err?.message ?? err) });
  }
};
