"use client";

// =============================================================================
// useAi — único punto de llamada de IA en la UI.
//
// Los componentes no saben (ni les importa) qué motor se usa: pasan una tarea
// del catálogo y el router decide local vs remoto y ejecuta con fallback.
// Patrón de escalado: nuevas funciones de IA reutilizan este hook sin tocarlo.
// =============================================================================

import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { route, type AiTask } from "@/lib/ai/router";
import { loadAiSettings, modelFor } from "@/lib/ai/remote-settings";

export function useAi() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <I, O>(task: AiTask<I, O>, input: I): Promise<O | null> => {
      setBusy(true);
      try {
        // Conmutador manual: si el usuario eligió IA remota, se envía como contexto.
        const settings = loadAiSettings();
        const res = await route(task, input, {
          mode: settings.mode,
          provider: settings.provider,
          model: modelFor(settings, settings.provider),
        });
        if (res.fellBack) {
          toast({
            title: "Motor de IA alterno",
            description: `Se usó ${res.provider === "local" ? "la IA local" : "la IA remota"} como respaldo.`,
          });
        }
        return res.output;
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "IA no disponible",
          description: e?.message || "No se pudo ejecutar la tarea de IA.",
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );

  return { run, busy };
}
