"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { capacidadesHost, hostBridge } from "@/lib/host-bridge";
import { partirEnFrases, textoHablable } from "@/lib/tts/texto-hablable";
import { KOKORO_BYTES_TOTALES, cargarAjustesVoz } from "@/lib/tts/kokoro-catalogo";
import { useToast } from "@/hooks/use-toast";

export type FaseVoz = "idle" | "descargando" | "preparando" | "hablando";

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

/**
 * Lee en voz alta las respuestas del agente con Kokoro (#605). La primera vez
 * baja el modelo (~93 MB); después, cada frase se sintetiza mientras suena la
 * anterior, así el primer audio sale con la primera frase.
 */
export function useLeerEnVoz() {
  const [estado, setEstado] = useState<EstadoVoz>(QUIETO);
  const { toast } = useToast();
  /** Cada lectura tiene su turno: detener o empezar otra invalida el anterior. */
  const turno = useRef(0);
  const fuente = useRef<AudioBufferSourceNode | null>(null);

  // Se decide al montar, no en el render: en el render del servidor no hay host y
  // la diferencia rompía la hidratación de Ajustes.
  const [disponible, setDisponible] = useState(false);
  useEffect(() => setDisponible(capacidadesHost().vozLocal), []);

  const detener = useCallback(() => {
    turno.current++;
    try {
      fuente.current?.stop();
    } catch {
      /* ya había terminado */
    }
    fuente.current = null;
    setEstado(QUIETO);
  }, []);

  useEffect(() => detener, [detener]);

  const leer = useCallback(
    async (id: string, markdown: string) => {
      detener();
      const mio = ++turno.current;
      const vigente = () => turno.current === mio;
      const host = hostBridge();
      if (!host?.kokoroStatus) return;
      const frases = partirEnFrases(textoHablable(markdown));
      if (!frases.length) return;

      try {
        const st = await host.kokoroStatus();
        if (!st.descargado) {
          toast({
            title: "Bajando la voz",
            description: `Una sola vez, ~${Math.round(KOKORO_BYTES_TOTALES / 1024 ** 2)} MB. Después funciona sin conexión.`,
          });
          setEstado({ id, fase: "descargando", progreso: 0 });
          const quitar = host.onKokoroProgress((p) => vigente() && setEstado({ id, fase: "descargando", progreso: p }));
          const r = await host.kokoroDownload().finally(quitar);
          if (!r.ok) throw new Error(r.error ?? "No se pudo bajar la voz.");
        }
        if (!vigente()) return;
        setEstado({ id, fase: "preparando", progreso: 0 });
        ctx ??= new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();

        let siguiente = sintetizar(frases[0]);
        for (let i = 0; i < frases.length; i++) {
          const { audio, sr } = await siguiente;
          if (!vigente()) return;
          // La próxima frase se sintetiza mientras suena ésta.
          if (i + 1 < frases.length) siguiente = sintetizar(frases[i + 1]);
          if (!audio.length) continue;
          const buf = ctx.createBuffer(1, audio.length, sr);
          buf.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          fuente.current = src;
          setEstado({ id, fase: "hablando", progreso: 0 });
          await new Promise<void>((fin) => {
            src.onended = () => fin();
            src.start();
          });
          if (!vigente()) return;
        }
        if (vigente()) setEstado(QUIETO);
      } catch (e: any) {
        if (!vigente()) return;
        setEstado(QUIETO);
        toast({ variant: "destructive", title: "No pude leer la respuesta", description: String(e?.message ?? e) });
      }
    },
    [detener, toast]
  );

  /** El mismo botón empieza y detiene. */
  const alternar = useCallback(
    (id: string, markdown: string) => (estado.id === id ? detener() : void leer(id, markdown)),
    [estado.id, detener, leer]
  );

  return { disponible, estado, alternar, detener };
}
