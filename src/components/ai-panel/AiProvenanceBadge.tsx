"use client";

import React, { useEffect, useState } from "react";
import { Cloud, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadAiSettings, type KeyStatus } from "@/lib/ai/remote-settings";
import { describeEngine } from "@/lib/ai/provenance";

/**
 * Badge de PROCEDENCIA de la IA: dice si lo que se genera saldrá del motor local
 * (en el equipo, offline) o de la nube. El arquitecto debe conocer el origen
 * antes de confiar en una sugerencia/artefacto.
 *
 * Lee los ajustes de localStorage y consulta el estado real de llaves al proceso
 * main (getAiKeyStatus): así el badge NO miente "nube" cuando falta la llave y la
 * petición caería en realidad al respaldo local.
 */
export function AiProvenanceBadge({ className }: { className?: string }) {
  const [keys, setKeys] = useState<KeyStatus | undefined>(undefined);
  // Recarga al montar y cuando la ventana recupera el foco (el usuario pudo
  // cambiar el modo o la llave en Ajustes en otra pestaña/ventana).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    let alive = true;
    api?.getAiKeyStatus?.().then((s) => alive && setKeys(s)).catch(() => {});
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [tick]);

  const engine = describeEngine(loadAiSettings(), keys);
  const Icon = engine.isLocal ? Cpu : Cloud;

  return (
    <span
      title={engine.detail}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        engine.isLocal
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {engine.label}
    </span>
  );
}
