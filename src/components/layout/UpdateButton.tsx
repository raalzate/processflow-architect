"use client";

/**
 * @fileOverview Botón «Actualizar» de la barra superior.
 *
 * Aparece SÓLO cuando hay una versión publicada más nueva que la instalada: al
 * día, la barra no gana ruido. Lo que decide (si hay actualización, si esta
 * plataforma puede instalar sola, qué dice el botón) vive en
 * `src/lib/update-check.ts`; el estado lo lleva el proceso main
 * (`main/services/updater.ts`) y acá sólo se pinta y se pulsa.
 *
 * En macOS el botón lleva a la descarga en vez de prometer una instalación
 * automática: sin firma ni notarización de Apple, Squirrel.Mac no la permite.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { etiquetaBoton, type EstadoUpdate } from "@/lib/update-check";
import { readUpdatePrefs, writeUpdatePrefs } from "@/lib/update-settings";

const api = () => (typeof window !== "undefined" ? window.electronAPI : undefined);

export function UpdateButton({ className }: { className?: string }) {
  const [estado, setEstado] = useState<EstadoUpdate>({ tipo: "al-dia" });

  useEffect(() => {
    const a = api();
    if (!a?.getUpdateStatus) return;
    let vivo = true;

    // Estado que el main ya conocía (la ventana puede montarse después de una
    // búsqueda) y suscripción a lo que venga.
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

  const alPulsar = useCallback(() => {
    const a = api();
    if (!a) return;
    if (estado.tipo === "lista") {
      void a.installUpdate?.();
      return;
    }
    if (estado.tipo === "fallo") {
      void a.checkForUpdates?.().then((e) => e && setEstado(e));
      return;
    }
    // Disponible: descargar (o, donde no se puede instalar, abrir la descarga).
    void a.downloadUpdate?.().then((e) => e && setEstado(e));
  }, [estado]);

  const texto = etiquetaBoton(estado);
  if (!texto) return null;

  const descargando = estado.tipo === "descargando";
  const Icono =
    estado.tipo === "lista" ? RotateCcw : estado.tipo === "fallo" ? RefreshCw : Download;

  return (
    <Button
      type="button"
      size="sm"
      onClick={alPulsar}
      disabled={descargando}
      title={
        estado.tipo === "disponible" && !estado.instalable
          ? "Se abrirá la página de descarga: en macOS la instalación es manual"
          : texto
      }
      className={className}
    >
      {descargando ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Icono className="mr-2 h-4 w-4" />
      )}
      {texto}
    </Button>
  );
}
