/**
 * @fileOverview Motor de IA local LiteRT-LM en el RENDERER (WebGPU).
 *
 * Reemplaza al runtime ONNX (onnxruntime-node) que NO podía generar gemma-4 en
 * CPU. `@litert-lm/core` corre el modelo en WebGPU (Chromium del renderer de
 * Electron). El `.litertlm` se sirve localmente vía el protocolo `litert-model://`
 * (registrado en main, lee de userData/models/litert) → carga offline, con Range.
 *
 * El paquete carga WASM de forma dinámica; lo importamos por CDN con
 * `webpackIgnore` para que webpack/Next NO intente bundlearlo (rompería).
 */

// Mensaje de chat para LiteRT.
export type LitertRole = "system" | "user" | "assistant";
export interface LitertMessage {
  role: LitertRole;
  content: string;
}

let libPromise: Promise<any> | null = null;
let enginePromise: Promise<any> | null = null;
let currentModelFile = "";
let logFilterInstalled = false;

/**
 * El runtime WASM de LiteRT escribe logs informativos (p.ej.
 * "INFO: [environment.cc:30] Creating LiteRT environment") a `console.error`,
 * y el overlay de Next-dev los muestra como "Console Error". Filtramos esos logs
 * benignos (INFO/WARNING del C++) conservando los errores reales.
 */
function installLitertLogFilter(): void {
  if (logFilterInstalled || typeof window === "undefined" || typeof console === "undefined") return;
  logFilterInstalled = true;
  // Benigno = log informativo del runtime C++: prefijo INFO/WARNING o un tag de
  // archivo fuente "[algo.cc:NN]". Los errores reales (ERROR:, excepciones JS) pasan.
  const benign = /^\s*(INFO|WARNING|VERBOSE)[:\s]|\[[\w.\/-]+\.cc(:\d+)?\]/i;
  const wrap =
    (orig: (...a: any[]) => void) =>
    (...args: any[]) => {
      const first = typeof args[0] === "string" ? args[0] : "";
      if (benign.test(first)) return; // log informativo del WASM → ignorar
      orig(...args);
    };
  console.error = wrap(console.error.bind(console));
  console.warn = wrap(console.warn.bind(console));
}

// Instalar el filtro AL IMPORTAR el módulo (antes de crear el engine), para que
// los logs del WASM nunca disparen el overlay de error de Next-dev.
installLitertLogFilter();

/** Carga el paquete @litert-lm/core (CDN, sin bundling). */
function loadLib(): Promise<any> {
  installLitertLogFilter();
  if (!libPromise) {
    // @ts-ignore — módulo remoto (CDN) sin tipos; webpackIgnore evita que webpack lo bundlee.
    libPromise = import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.13.1/+esm") as Promise<any>;
  }
  return libPromise;
}

/** Libera el engine actual (p.ej. al cambiar maxTokens en Ajustes → se recrea al usar). */
export function resetLitertEngine(): void {
  const prev = enginePromise;
  enginePromise = null;
  currentModelFile = "";
  activeConversation = null; // muere con el engine
  prev?.then((e) => e?.delete?.()).catch(() => {});
}

/** ¿Hay WebGPU disponible en este renderer? (LiteRT lo requiere) */
export async function webgpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

/**
 * Engine singleton para el modelo dado. El `.litertlm` se sirve por el protocolo
 * local `litert-model://m/<archivo>`. Crear el engine carga el modelo (varios
 * segundos). Se recrea si cambia el archivo de modelo.
 */
export async function getEngine(modelFile: string): Promise<any> {
  if (enginePromise && currentModelFile === modelFile) return enginePromise;
  // Modelo distinto → libera el anterior (un solo modelo en memoria).
  if (enginePromise && currentModelFile !== modelFile) {
    const prev = enginePromise;
    enginePromise = null;
    prev.then((e) => e?.delete?.()).catch(() => {});
  }
  currentModelFile = modelFile;
  enginePromise = (async () => {
    const lib = await loadLib();
    // maxNumTokens = ventana de contexto+salida, configurable en Ajustes.
    const { getGenerationConfig } = await import("@/lib/ai-config");
    const maxNumTokens = Math.max(512, getGenerationConfig().maxTokens || 4096);
    return lib.Engine.create({
      model: `litert-model://m/${modelFile}`,
      mainExecutorSettings: { maxNumTokens },
    });
  })();
  // Si falla, permite reintentar la próxima vez.
  enginePromise.catch(() => {
    enginePromise = null;
  });
  return enginePromise;
}

/**
 * Conversación LiteRT reutilizable. El `system` se prefilla UNA sola vez (queda en
 * el KV-cache de la conversación); cada `send` sólo agrega el nuevo turno de
 * usuario y encadena su historia interna. Reutilizarla entre turnos (p.ej. el
 * bucle ReAct del agente) evita re-procesar el system+contexto en cada turno —
 * que es el mayor costo de prefill con el modelo local en WebGPU.
 */
export interface LitertConversation {
  send(userText: string, onToken?: (chunk: string) => void): Promise<string>;
  /** Libera la conversación (deja el engine listo para otro contexto). */
  close(): Promise<void>;
}

/**
 * UNA conversación viva por engine. El runtime C++ guarda el contexto procesado
 * (el preface prefillado) en un único slot del engine: abrir una segunda
 * conversación sin cerrar la primera muere con
 * `RET_CHECK failure (context_handler.h) !HasProcessedContext()`. Eso pasaba al
 * lanzar una tarea suelta (p.ej. «Extrae los drivers de arquitectura») mientras
 * el chat del agente seguía con su conversación abierta.
 */
let activeConversation: any = null;

/**
 * Cola en serie para crear/liberar conversaciones. Sin ella, dos llamadas
 * concurrentes liberan y crean intercaladas y vuelve la misma carrera.
 */
let convoQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = convoQueue.then(fn, fn); // corre igual si la anterior falló
  convoQueue = run.catch(() => {});
  return run;
}

/** El error del RET_CHECK del context handler, por si delete() no alcanzó. */
const CONTEXT_TAKEN = /HasProcessedContext|processed context is already set/i;

async function disposeActiveConversation(): Promise<void> {
  const prev = activeConversation;
  activeConversation = null;
  if (!prev) return;
  try {
    prev.cancel?.(); // corta una generación en vuelo antes de liberar
  } catch {
    /* cancelar es best-effort */
  }
  try {
    await prev.delete?.();
  } catch {
    /* si ya estaba liberada, seguir */
  }
}

/**
 * Libera la conversación viva sin tocar el engine (el modelo sigue cargado).
 * Lo usa «Limpiar» del chat: si no, el contexto procesado del turno anterior
 * seguía tomado y el próximo envío arrancaba con historia que ya no se ve.
 */
export function releaseLitertContext(): void {
  void enqueue(disposeActiveConversation);
}

/** Abre una conversación nueva liberando la que tenga el slot del engine. */
async function openConversation(modelFile: string, config: any): Promise<any> {
  return enqueue(async () => {
    await disposeActiveConversation();
    const engine = await getEngine(modelFile);
    try {
      return await engine.createConversation(config);
    } catch (err: any) {
      if (!CONTEXT_TAKEN.test(String(err?.message ?? err))) throw err;
      // El contexto quedó pegado en el engine y liberar la conversación no lo
      // suelta: recrear el engine es la única salida (cuesta recargar el modelo,
      // pero es preferible a dejar la IA muerta hasta reiniciar la app).
      resetLitertEngine();
      const fresh = await getEngine(modelFile);
      return fresh.createConversation(config);
    }
  });
}

/**
 * Historia previa como UN mensaje de usuario. Es lo que se manda cuando otra
 * tarea de IA se quedó con el slot del engine y hay que reabrir la conversación:
 * el KV-cache se perdió, pero el hilo no. No genera turnos extra (va pegado al
 * mensaje nuevo), así que el costo es un prefill, no otra inferencia.
 */
function transcriptPrefix(history: LitertMessage[]): string {
  if (history.length === 0) return "";
  const lineas = history.map(
    (m) => `${m.role === "user" ? "Usuario" : "Vos"}: ${m.content}`
  );
  return `Historial de esta conversación (retomá el contexto, no lo repitas):\n${lineas.join(
    "\n"
  )}\n\n`;
}

/**
 * Crea una conversación reutilizable sobre el engine (singleton) del modelo. Pasa
 * `system` para fijar la persona/contexto como preface una sola vez. Cierra la
 * conversación anterior: el engine sólo admite un contexto procesado a la vez.
 */
export async function createLitertConversation(
  modelFile: string,
  system?: string
): Promise<LitertConversation> {
  const config = system
    ? { preface: { messages: [{ role: "system", content: system }] } }
    : undefined;

  let current = await openConversation(modelFile, config);
  activeConversation = current;
  // Hilo hablado, en JS: sirve para reabrir la conversación si otra tarea de IA
  // (una generación suelta, p.ej.) se queda con el slot del engine en el medio.
  const history: LitertMessage[] = [];

  return {
    async send(userText, onToken) {
      let prefix = "";
      if (activeConversation !== current) {
        current = await openConversation(modelFile, config);
        activeConversation = current;
        prefix = transcriptPrefix(history);
      }
      let full = "";
      const stream = current.sendMessageStreaming(prefix + userText);
      for await (const chunk of stream) {
        for (const item of chunk?.content ?? []) {
          if (item?.type === "text" && item.text) {
            full += item.text;
            onToken?.(item.text);
          }
        }
      }
      const reply = full.trim();
      history.push({ role: "user", content: userText }, { role: "assistant", content: reply });
      return reply;
    },
    async close() {
      if (activeConversation !== current) return; // ya la reemplazaron
      await enqueue(disposeActiveConversation);
    },
  };
}

/**
 * Genera una respuesta (streaming) para un turno de chat SUELTO. `messages` debe
 * traer el system (si lo hay) como preface y el último mensaje de usuario como
 * prompt. Para varios turnos encadenados usa `createLitertConversation` y reutiliza
 * la conversación (evita re-prefill del system en cada turno).
 */
export async function litertGenerate(
  modelFile: string,
  messages: LitertMessage[],
  onToken?: (chunk: string) => void
): Promise<string> {
  const system = messages.find((m) => m.role === "system")?.content;
  const turns = messages.filter((m) => m.role !== "system");
  const lastUser = [...turns].reverse().find((m) => m.role === "user")?.content ?? "";

  const convo = await createLitertConversation(modelFile, system);
  try {
    return await convo.send(lastUser, onToken);
  } finally {
    // Tarea suelta: cerrar libera el contexto del engine para la próxima. Si no,
    // el siguiente chat del agente arrancaba contra un contexto ya ocupado.
    await convo.close();
  }
}
