"use client";

/**
 * @fileOverview Ajustes → Actualizaciones.
 *
 * Dos cosas: el interruptor de la búsqueda automática y un «Buscar ahora». La app
 * es local por defecto, así que salir a la red tiene que poder apagarse — pero
 * apagar la automática NO prohíbe la manual: son decisiones distintas.
 *
 * La preferencia y su lectura tolerante viven en `src/lib/update-settings.ts`; qué
 * significa cada estado, en `src/lib/update-check.ts`. Acá se orquesta.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { APP_VERSION } from "@/lib/credits";
import { etiquetaBoton, type EstadoUpdate } from "@/lib/update-check";
import { describirUltimaComprobacion, readUpdatePrefs, writeUpdatePrefs } from "@/lib/update-settings";
import { isMacPlatform } from "@/lib/platform";

const api = () => (typeof window !== "undefined" ? window.electronAPI : undefined);

export function UpdateConfig() {
  const [auto, setAuto] = useState(true);
  const [ultima, setUltima] = useState<string>("");
  const [estado, setEstado] = useState<EstadoUpdate>({ tipo: "al-dia" });
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const prefs = readUpdatePrefs(window.localStorage);
    setAuto(prefs.auto);
    setUltima(describirUltimaComprobacion(prefs.ultima));
    api()?.getUpdateStatus?.().then((e) => e && setEstado(e)).catch(() => {});
  }, []);

  const cambiarAuto = useCallback((valor: boolean) => {
    setAuto(valor);
    const prefs = readUpdatePrefs(window.localStorage);
    writeUpdatePrefs(window.localStorage, { ...prefs, auto: valor });
  }, []);

  const buscarAhora = useCallback(async () => {
    const a = api();
    if (!a?.checkForUpdates) return;
    setBuscando(true);
    try {
      const e = await a.checkForUpdates();
      if (e) setEstado(e);
      const resultado = !e
        ? "sin respuesta"
        : e.tipo === "disponible"
          ? `disponible ${e.version}`
          : e.tipo;
      const prefs = readUpdatePrefs(window.localStorage);
      const nueva = { cuando: new Date().toISOString(), resultado };
      writeUpdatePrefs(window.localStorage, { ...prefs, ultima: nueva });
      setUltima(describirUltimaComprobacion(nueva));
    } finally {
      setBuscando(false);
    }
  }, []);

  const accion = useCallback(async () => {
    const a = api();
    if (!a) return;
    if (estado.tipo === "lista") return void a.installUpdate?.();
    const e = await a.downloadUpdate?.();
    if (e) setEstado(e);
  }, [estado]);

  const texto = etiquetaBoton(estado);
  // En macOS la instalación es manual (sin firma no hay auto-instalación); se
  // dice acá para que no sea una sorpresa al pulsar. La detección del SO vive en
  // `lib/platform.ts` (regla PLATAFORMA del lint), no en este componente.
  const manual = isMacPlatform();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" /> Actualizaciones
        </CardTitle>
        <CardDescription>
          Versión instalada: <strong>{APP_VERSION}</strong>. Sólo se ofrecen versiones publicadas;
          {manual
            ? " en este sistema la instalación es manual (se abre la descarga)."
            : " la actualización se descarga e instala desde la app."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <Checkbox
            id="update-auto"
            checked={auto}
            onCheckedChange={(v) => cambiarAuto(v === true)}
          />
          <div className="space-y-0.5">
            <Label htmlFor="update-auto" className="cursor-pointer">
              Buscar actualizaciones al abrir la app
            </Label>
            <p className="text-xs text-muted-foreground">
              Apagado, la app no consulta la red al arrancar; podés buscar a mano cuando quieras.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{ultima}</p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={buscarAhora} disabled={buscando}>
            {buscando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Buscar ahora
          </Button>
          {texto && (
            <Button type="button" size="sm" onClick={accion} disabled={estado.tipo === "descargando"}>
              {texto}
            </Button>
          )}
        </div>

        {estado.tipo === "fallo" && (
          <p className="text-xs text-destructive">{estado.motivo}</p>
        )}
      </CardContent>
    </Card>
  );
}
