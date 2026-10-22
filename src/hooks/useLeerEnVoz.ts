"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { capacidadesHost, hostBridge } from "@/lib/host-bridge";
import { partirEnFrases, textoHablable } from "@/lib/tts/texto-hablable";
import { KOKORO_BYTES_TOTALES, cargarAjustesVoz } from "@/lib/tts/kokoro-catalogo";
import {
  POR_ADELANTADO,
  debeArrancar,
  inicioDelSiguiente,
  primeraCorta,
  ritmoDeSintesis,
  segundosPorCaracter,
  type Muestra,
} from "@/lib/tts/cola-voz";
import { useToast } from "@/hooks/use-toast";

export type FaseVoz = "idle" | "descargando" | "preparando" | "hablando" | "pausado";

export interface EstadoVoz {
  /** Mensaje que se está leyendo (o preparando). */
  id: string | null;
  fase: FaseVoz;
  /** 0–100 mientras se baja el modelo. */
  progreso: number;
}

const QUIETO: EstadoVoz = { id: null, fase: "idle", progreso: 0 };

/* El worker y el AudioContext viven a nivel de módulo: el modelo tarda en cargar y
   no tiene sentido repetirlo por cada panel que se monta. */
let worker: Worker | null = null;
let pedidos = 0;
const pendientes = new Map<number, { ok: (a: Float32Array, sr: number) => void; mal: (e: Error) => void }>();

function sintetizar(texto: string): Promise<{ audio: Float32Array; sr: number }> {
  if (!worker) {
    worker = new Worker(new URL("../workers/kokoro.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; audio?: Float32Array; sr?: number; error?: string }>) => {
      const p = pendientes.get(e.data.id);
      if (!p) return;
      pendientes.delete(e.data.id);
      if (e.data.error) p.mal(new Error(e.data.error));
      else p.ok(e.data.audio!, e.data.sr!);
    };
  }
  const { voz, velocidad } = cargarAjustesVoz();
  const id = ++pedidos;
  return new Promise((ok, mal) => {
    pendientes.set(id, { ok: (audio, sr) => ok({ audio, sr }), mal });
    worker!.postMessage({ id, texto, voz, velocidad });
  });
}

let ctx: AudioContext | null = null;

/* El estado de la lectura también vive a nivel de módulo (#612): si viviera en el
   hook, cambiar de vista desmontaba el panel y cortaba la respuesta a la mitad. Lo
   que monta el hook se suscribe; cuando ya no queda nadie mirando (se cerró el
   chat), se detiene, porque sonar sin un botón para pararlo no es aceptable. */
let estadoActual: EstadoVoz = QUIETO;
const oyentes = new Set<() => void>();
let turno = 0;
let fuentes: AudioBufferSourceNode[] = [];
/** Despierta la espera del final cuando se detiene antes de que suene todo. */
let cortar: (() => void) | null = null;

function fijar(e: EstadoVoz) {
  estadoActual = e;
  oyentes.forEach((f) => f());
}

function detenerTodo() {
  turno++;
  for (const f of fuentes) {
    try {
      f.stop();
    } catch {
      /* ya había terminado o no había empezado */
    }
  }
  fuentes = [];
  cortar?.();
  cortar = null;
  if (estadoActual !== QUIETO) fijar(QUIETO);
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
    // Un remontaje (cambio de vista) se vuelve a suscribir enseguida: sólo se
    // detiene si nadie volvió a mirar.
    if (!oyentes.size) setTimeout(() => !oyentes.size && detenerTodo(), 500);
  };
}

const leerEstado = () => estadoActual;
const estadoServidor = () => QUIETO;

/**
 * Sintetiza con la cola de `src/lib/tts/cola-voz` y programa cada buffer en el
 * reloj del AudioContext, encadenado al anterior. Resuelve cuando terminó de sonar
 * o cuando se detuvo.
 */
async function reproducir(id: string, frases: string[], vigente: () => boolean) {
  const audio = (ctx ??= new AudioContext());
  if (audio.state === "suspended") await audio.resume();

  const muestras: Muestra[] = [];
  const pedidos: Promise<{ audio: Float32Array; sr: number }>[] = [];
  const pedidoEn: number[] = [];
  const pedirHasta = (n: number) => {
    for (let k = pedidos.length; k < Math.min(n, frases.length); k++) {
      pedidoEn[k] = performance.now();
      pedidos[k] = sintetizar(frases[k]);
    }
  };

  let fin = 0;
  let sonando = false;
  let enCola: AudioBuffer[] = [];
  let ultima: AudioBufferSourceNode | null = null;
  let resueltaAntes = performance.now();

  const programar = () => {
    for (const buf of enCola) {
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      const t = inicioDelSiguiente(audio.currentTime, fin);
      src.start(t);
      fin = t + buf.duration;
      fuentes.push(src);
      ultima = src;
    }
    enCola = [];
    if (estadoActual.fase !== "pausado") fijar({ id, fase: "hablando", progreso: 0 });
  };

  for (let i = 0; i < frases.length; i++) {
    pedirHasta(i + 1 + POR_ADELANTADO);
    const r = await pedidos[i];
    if (!vigente()) return;
    // El worker atiende en serie: lo que tardó esta frase empieza cuando terminó la
    // anterior, no cuando se pidió.
    const ahora = performance.now();
    const sintesisS = (ahora - Math.max(resueltaAntes, pedidoEn[i])) / 1000;
    resueltaAntes = ahora;
    if (!r.audio.length) continue;
    const buf = audio.createBuffer(1, r.audio.length, r.sr);
    buf.copyToChannel(r.audio as Float32Array<ArrayBuffer>, 0);
    muestras.push({ caracteres: frases[i].length, sintesisS, audioS: buf.duration });
    enCola.push(buf);

    if (!sonando) {
      const enColaS = enCola.reduce((s, b) => s + b.duration, 0);
      const faltan = frases.slice(i + 1).reduce((s, f) => s + f.length, 0);
      const faltaS = faltan * segundosPorCaracter(muestras);
      sonando = debeArrancar(enColaS, faltaS, ritmoDeSintesis(muestras));
    }
    if (sonando) programar();
  }
  if (enCola.length) programar();
  if (!ultima || !vigente()) return;

  const ultimaFuente: AudioBufferSourceNode = ultima;
  await new Promise<void>((listo) => {
    cortar = listo;
    ultimaFuente.onended = () => listo();
  });
  if (vigente()) {
    fuentes = [];
    cortar = null;
    fijar(QUIETO);
  }
}

/**
 * Lee en voz alta las respuestas del agente con Kokoro (#605). La primera vez
 * baja el modelo (~93 MB); después la primera frase sale corta y las siguientes
 * se sintetizan por adelantado y se encadenan sin hueco (#612). Se puede pausar y
 * reanudar desde el mismo punto: se suspende el reloj del AudioContext.
 */
export function useLeerEnVoz() {
  const estado = useSyncExternalStore(suscribir, leerEstado, estadoServidor);
  const { toast } = useToast();

  // Se decide al montar, no en el render: en el render del servidor no hay host y
  // la diferencia rompía la hidratación de Ajustes.
  const [disponible, setDisponible] = useState(false);
  useEffect(() => setDisponible(capacidadesHost().vozLocal), []);

  const detener = useCallback(() => detenerTodo(), []);

  const leer = useCallback(
    async (id: string, markdown: string) => {
      detenerTodo();
      const mio = ++turno;
      const vigente = () => turno === mio;
      const host = hostBridge();
      if (!host?.kokoroStatus) return;
      const frases = primeraCorta(partirEnFrases(textoHablable(markdown)));
      if (!frases.length) return;

      try {
        const st = await host.kokoroStatus();
        if (!st.descargado) {
          toast({
            title: "Bajando la voz",
            description: `Una sola vez, ~${Math.round(KOKORO_BYTES_TOTALES / 1024 ** 2)} MB. Después funciona sin conexión.`,
          });
          fijar({ id, fase: "descargando", progreso: 0 });
          const quitar = host.onKokoroProgress((p) => vigente() && fijar({ id, fase: "descargando", progreso: p }));
          const r = await host.kokoroDownload().finally(quitar);
          if (!r.ok) throw new Error(r.error ?? "No se pudo bajar la voz.");
        }
        if (!vigente()) return;
        fijar({ id, fase: "preparando", progreso: 0 });
        await reproducir(id, frases, vigente);
      } catch (e: any) {
        if (!vigente()) return;
        detenerTodo();
        toast({ variant: "destructive", title: "No pude leer la respuesta", description: String(e?.message ?? e) });
      }
    },
    [toast]
  );

  /** Suspende el reloj de audio: lo programado queda donde estaba y sigue al reanudar. */
  const pausar = useCallback(async () => {
    if (estadoActual.fase !== "hablando" || !ctx) return;
    await ctx.suspend();
    fijar({ ...estadoActual, fase: "pausado" });
  }, []);

  const reanudar = useCallback(async () => {
    if (estadoActual.fase !== "pausado" || !ctx) return;
    await ctx.resume();
    fijar({ ...estadoActual, fase: "hablando" });
  }, []);

  /** El mismo botón empieza y detiene. */
  const alternar = useCallback(
    (id: string, markdown: string) => (estadoActual.id === id ? detenerTodo() : void leer(id, markdown)),
    [leer]
  );

  return { disponible, estado, alternar, detener, pausar, reanudar };
}
