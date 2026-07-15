"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type GenerationConfig,
  getGenerationConfig,
  setGenerationConfig,
  DEFAULT_GEN_CONFIG,
} from "@/lib/ai-config";
import { resetLitertEngine } from "@/lib/ai/litert-engine";

/** Fila de slider (rango nativo) + caja numérica sincronizada. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="flex-1 accent-primary cursor-pointer"
        />
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(clamp(v));
          }}
          className="w-24 text-right"
        />
      </div>
    </div>
  );
}


export function ModelConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [cfg, setCfg] = useState<GenerationConfig>(DEFAULT_GEN_CONFIG);

  // Recargar desde localStorage cada vez que se abre (descarta ediciones canceladas).
  useEffect(() => {
    if (open) setCfg(getGenerationConfig());
  }, [open]);

  const patch = (p: Partial<GenerationConfig>) => setCfg((c) => ({ ...c, ...p }));

  const handleOk = () => {
    setGenerationConfig(cfg);
    // El motor LiteRT lee maxNumTokens al crearse → lo recreamos para aplicar el cambio.
    // El System Prompt se usa por petición (no requiere recrear).
    resetLitertEngine();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Configurations</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="model" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="model">Model Configs</TabsTrigger>
            <TabsTrigger value="system">System Prompt</TabsTrigger>
          </TabsList>

          <TabsContent value="model" className="space-y-5 pt-4">
            <SliderRow
              label="Max Tokens (contexto + salida)"
              value={cfg.maxTokens}
              min={512}
              max={8192}
              step={256}
              onChange={(v) => patch({ maxTokens: v })}
            />
            <p className="text-xs text-muted-foreground">
              Ventana máxima de tokens del motor LiteRT-LM. Cambiarla recarga el modelo.
            </p>

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">Acelerador: GPU (WebGPU)</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                LiteRT-LM ejecuta el modelo en la GPU vía WebGPU. No hay modo CPU.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="system" className="pt-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">System Prompt</Label>
              <Textarea
                rows={10}
                placeholder="Define la persona/instrucciones base del modelo. Vacío = por defecto."
                value={cfg.systemPrompt}
                onChange={(e) => patch({ systemPrompt: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Se usa como instrucción base cuando una petición no trae su propio system
                prompt.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleOk}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
