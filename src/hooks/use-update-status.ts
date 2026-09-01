"use client";

/**
 * @fileOverview Estado del sistema de actualización, para quien lo quiera pintar.
 *
 * Vivía dentro del botón de la barra superior. Ese botón se fue (#231): el aviso
 * ahora es una línea discreta en el pie del sidebar, y el menú «Ayuda» también
 * dispara la búsqueda. Con dos consumidores posibles, la suscripción al main y la
 * acción de cada estado se comparten desde acá en vez de duplicarse.
 *
 * Lo que DECIDE (si hay versión nueva, qué dice el rótulo) sigue en
 * `src/lib/update-check.ts`, que es puro y tiene pruebas.
 */

import { useCallback, useEffect, useState } from "react";

import type { EstadoUpdate } from "@/lib/update-check";
import { readUpdatePrefs, writeUpdatePrefs } from "@/lib/update-settings";

const api = () => (typeof window !== "undefined" ? window.electronAPI : undefined);

export function useUpdateStatus() {
  const [estado, setEstado] = useState<EstadoUpdate>({ tipo: "al-dia" });

  useEffect(() => {
    const a = api();
    if (!a?.getUpdateStatus) return;
    let vivo = true;

    // Estado que el main ya conocía (la ventana puede montarse después de una
    // búsqueda, o de una que lanzó el menú) y suscripción a lo que venga.
    a.getUpdateStatus().then((e) => vivo && e && setEstado(e)).catch(() => {});
    const desuscribir = a.onUpdateStatus?.((e) => vivo && setEstado(e));

    // La búsqueda automática se puede apagar en Ajustes: la app es local por
    // defecto y salir a la red tiene que ser algo que el usuario decida.
    const prefs = readUpdatePrefs(window.localStorage);
    if (prefs.auto) {
      a.checkForUpdates?.()
        .then((e) => {
          if (!vivo || !e) return;
          setEstado(e);
          writeUpdatePrefs(window.localStorage, {
            ...prefs,
            ultima: {
              cuando: new Date().toISOString(),
              resultado: e.tipo === "disponible" ? `disponible ${e.version}` : e.tipo,
            },
          });
        })
        .catch(() => {});
    }

    return () => {
      vivo = false;
      desuscribir?.();
    };
  }, []);

  /** Qué hace pulsar el aviso, según en qué estado está. */
  const actuar = useCallback(() => {
    const a = api();
    if (!a) return;
    switch (estado.tipo) {
      case "lista":
        void a.installUpdate?.();
        return;
      case "descargada":
        // Instalar es cosa del humano (macOS sin firma): lo más útil que puede
        // hacer la app es mostrarle dónde dejó el archivo.
        void a.revealUpdate?.();
        return;
      case "fallo":
        void a.checkForUpdates?.().then((e) => e && setEstado(e));
        return;
      default:
        void a.downloadUpdate?.().then((e) => e && setEstado(e));
    }
  }, [estado]);

  return { estado, actuar };
}
