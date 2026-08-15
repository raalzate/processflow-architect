"use client";

import React from "react";
import { LayoutGrid, Loader2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DENSITY_ORDER,
  LAYOUT_PRESETS,
  LAYOUT_STRATEGIES,
  type LayoutDensity,
  type LayoutStrategy,
} from "@/lib/mcp/layout-presets";
import { cn } from "@/lib/utils";

/**
 * Menú «Organizar» del diseñador: cambia la disposición del lienzo sin tocar el
 * contenido. Las opciones salen del registro de presets (`layout-presets`), el
 * mismo que usa la herramienta MCP: lo que el usuario elige aquí es exactamente
 * lo que puede pedir el agente externo.
 *
 * La opción con IA no calcula posiciones: propone el ORDEN de las bandas y la
 * geometría la sigue calculando el layout determinista.
 */
export const ArrangeMenu: React.FC<{
  density: LayoutDensity;
  strategy: LayoutStrategy;
  busy?: boolean;
  /** true si el diagrama tiene bandas (sin ellas, ordenar con IA no aplica). */
  hasLanes?: boolean;
  onArrange: (opts: { density?: LayoutDensity; strategy?: LayoutStrategy }) => void;
  onSuggestWithAi: () => void;
}> = ({ density, strategy, busy, hasLanes = true, onArrange, onSuggestWithAi }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="gap-2" title="Organizar el diagrama">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />}
        Organizar
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-64">
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Aire del diagrama
      </DropdownMenuLabel>
      {DENSITY_ORDER.map((id) => {
        const preset = LAYOUT_PRESETS[id];
        return (
          <DropdownMenuItem key={id} onSelect={() => onArrange({ density: id })} className="gap-2">
            <Check className={cn("h-4 w-4 shrink-0", density !== id && "opacity-0")} />
            <span className="flex flex-col">
              <span>{preset.label}</span>
              <span className="text-xs text-muted-foreground">{preset.hint}</span>
            </span>
          </DropdownMenuItem>
        );
      })}

      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        Cómo se ordena
      </DropdownMenuLabel>
      {(Object.keys(LAYOUT_STRATEGIES) as LayoutStrategy[]).map((id) => {
        const s = LAYOUT_STRATEGIES[id];
        return (
          <DropdownMenuItem key={id} onSelect={() => onArrange({ strategy: id })} className="gap-2">
            <Check className={cn("h-4 w-4 shrink-0", strategy !== id && "opacity-0")} />
            <span className="flex flex-col">
              <span>{s.label}</span>
              <span className="text-xs text-muted-foreground">{s.hint}</span>
            </span>
          </DropdownMenuItem>
        );
      })}

      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onSuggestWithAi} disabled={!hasLanes} className="gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex flex-col">
          <span>Sugerir con IA</span>
          <span className="text-xs text-muted-foreground">
            {hasLanes
              ? "Ordena los grupos por su lectura natural."
              : "Requiere grupos (contextos, pools, límites)."}
          </span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
