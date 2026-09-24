"use client";

/**
 * @fileOverview Ajustes → Apariencia.
 *
 * Un selector de tres estados y nada más. La app trabaja en oscuro por defecto,
 * pero el diagrama también se **muestra**: proyectado en una sala con luz o
 * impreso, el lienzo oscuro no se lee.
 *
 * Qué significa cada modo y cuál es el default viven en `src/lib/theme.ts`; la
 * aplicación al documento, en `src/hooks/use-theme.ts`. Acá se orquesta.
 */

import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";

const ICONOS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function AppearanceConfig() {
  const { preferencia, tema, elegir } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sun className="h-5 w-5" />
          Apariencia
        </CardTitle>
        <CardDescription className="mt-1.5">
          El tema de la app y del lienzo. Se guarda en esta máquina: es de quien mira, no del
          diagrama, así que el proyecto se ve igual para el resto del equipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Tema" className="grid gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map((o) => {
            const Icono = ICONOS[o.id];
            const activo = preferencia === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => elegir(o.id)}
                className={cn(
                  "flex flex-col gap-1 rounded-md border p-3 text-left transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  activo ? "border-primary bg-primary/10" : "hover:bg-accent/10"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icono className="h-4 w-4" />
                  {o.label}
                </span>
                <span className="text-xs text-muted-foreground">{o.detalle}</span>
              </button>
            );
          })}
        </div>
        {preferencia === "system" && (
          // Con «seguir al sistema» el usuario no eligió un color: decir cuál
          // está viendo evita el «¿no me tomó el cambio?».
          <p className="mt-3 text-xs text-muted-foreground">
            Ahora mismo el sistema está en {tema === "dark" ? "oscuro" : "claro"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
