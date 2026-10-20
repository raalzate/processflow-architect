"use client";

/**
 * @fileOverview Ajustes → Voz (#605).
 *
 * Qué voz lee las respuestas del agente y a qué velocidad, y el modelo de Kokoro
 * en disco. Las voces y el default (Dora) viven en `src/lib/tts/kokoro-catalogo.ts`;
 * la lectura, en `useLeerEnVoz`. Acá se orquesta.
 */

import React, { useCallback, useEffect, useState } from "react";
import { AudioLines, Loader2, Square, Trash2, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { hostBridge } from "@/lib/host-bridge";
import { useLeerEnVoz } from "@/hooks/useLeerEnVoz";
import {
  KOKORO_BYTES_TOTALES,
  VOCES_ES,
  VOZ_POR_DEFECTO,
  cargarAjustesVoz,
  guardarAjustesVoz,
  type AjustesVoz,
} from "@/lib/tts/kokoro-catalogo";

const VELOCIDADES = [
  { v: 0.85, label: "Pausada" },
  { v: 1, label: "Normal" },
  { v: 1.15, label: "Rápida" },
];

const PRUEBA = "Hola. Así suena la respuesta del agente cuando la escuchás en voz alta.";
const MB = (b: number) => `${Math.round(b / 1024 ** 2)} MB`;

export function VoiceConfig() {
  const voz = useLeerEnVoz();
  // Lo guardado se lee al montar: localStorage no existe en el render del servidor.
  const [ajustes, setAjustes] = useState<AjustesVoz>({ voz: VOZ_POR_DEFECTO, velocidad: 1 });
  useEffect(() => setAjustes(cargarAjustesVoz()), []);
  const [descargado, setDescargado] = useState<boolean | null>(null);

  const refrescar = useCallback(() => {
    hostBridge()
      ?.kokoroStatus?.()
      .then((s) => setDescargado(s.descargado))
      .catch(() => setDescargado(null));
  }, []);

  useEffect(refrescar, [refrescar]);
  // Al terminar una prueba que bajó el modelo, el estado cambia.
  useEffect(() => {
    if (voz.estado.fase === "idle") refrescar();
  }, [voz.estado.fase, refrescar]);

  const elegir = (cambio: Partial<AjustesVoz>) => {
    const nuevo = { ...ajustes, ...cambio };
    setAjustes(nuevo);
    guardarAjustesVoz(nuevo);
  };

  if (!voz.disponible) return null;

  const probando = voz.estado.id === "prueba";
  const fase = probando ? voz.estado.fase : "idle";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AudioLines className="h-5 w-5" />
          Voz
        </CardTitle>
        <CardDescription className="mt-1.5">
          El botón «Escuchar» de cada respuesta la lee con Kokoro, en esta máquina y sin conexión.
          La primera vez se baja el modelo (~{MB(KOKORO_BYTES_TOTALES)}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="radiogroup" aria-label="Voz" className="grid gap-2 sm:grid-cols-3">
          {VOCES_ES.map((v) => {
            const activo = ajustes.voz === v.id;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => elegir({ voz: v.id })}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border p-3 text-left transition",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  activo ? "border-primary bg-primary/10" : "hover:bg-accent/10"
                )}
              >
                <span className="text-sm font-medium">{v.nombre}</span>
                <span className="text-xs text-muted-foreground">Voz de {v.genero}</span>
              </button>
            );
          })}
        </div>

        <div role="radiogroup" aria-label="Velocidad" className="flex flex-wrap gap-2">
          {VELOCIDADES.map((o) => (
            <Button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={ajustes.velocidad === o.v}
              size="sm"
              variant={ajustes.velocidad === o.v ? "default" : "outline"}
              onClick={() => elegir({ velocidad: o.v })}
            >
              {o.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => voz.alternar("prueba", PRUEBA)}>
            {fase === "descargando" || fase === "preparando" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : fase === "hablando" ? (
              <Square className="mr-2 h-3.5 w-3.5 fill-current" />
            ) : (
              <Volume2 className="mr-2 h-4 w-4" />
            )}
            {fase === "descargando"
              ? `Bajando la voz (${voz.estado.progreso}%)`
              : fase === "preparando"
                ? "Preparando…"
                : fase === "hablando"
                  ? "Detener"
                  : "Probar la voz"}
          </Button>
          {descargado && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                voz.detener();
                hostBridge()?.kokoroDelete?.().then(refrescar);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Borrar el modelo de voz
            </Button>
          )}
          {descargado === false && (
            <span className="text-xs text-muted-foreground">Sin bajar: se baja al probar o al escuchar.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
