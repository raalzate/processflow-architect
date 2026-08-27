"use client";

/**
 * @fileOverview Tarjeta "Sistema" de Configuración.
 *
 * Muestra los datos del equipo relevantes para la IA local: hardware (CPU/RAM/
 * disco donde viven los modelos), el adaptador WebGPU (requisito de LiteRT-LM,
 * sólo el renderer lo conoce) y las versiones del runtime para diagnóstico.
 */

import React, { useEffect, useState } from "react";
import { Cpu, MemoryStick, HardDrive, MonitorCog, Gauge, CheckCircle2, XCircle } from "lucide-react";
import { diagnosticoGpu } from "@/lib/gpu-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SystemInfo } from "@/types/electron";

const api = () => (typeof window !== "undefined" ? (window as any).electronAPI : undefined);

interface GpuInfo {
  available: boolean;
  /** vendor/architecture/description del adaptador (lo que exponga el navegador). */
  detail: string;
  /** `vendorId` PCI del adaptador, si el navegador lo expone. */
  vendorId: number | null;
}

/** Interroga al adaptador WebGPU del renderer (la GPU que usará LiteRT-LM). */
async function readGpuInfo(): Promise<GpuInfo> {
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter?.();
    if (!adapter) return { available: false, detail: "", vendorId: null };
    const info = adapter.info ?? {};
    const detail = [info.vendor, info.architecture, info.description].filter(Boolean).join(" · ");
    // `vendorId` es lo que distingue una GPU real del «Basic Render Driver» de
    // software de Windows (0x1414) — ver `gpu-status.ts`.
    const vendorId = typeof info.vendorId === "number" ? info.vendorId : null;
    return { available: true, detail, vendorId };
  } catch {
    return { available: false, detail: "", vendorId: null };
  }
}

/** Fila etiqueta/valor de la lista de datos. */
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-all">{value}</span>
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-4 first:mt-0 mb-1">
      <Icon className="w-3.5 h-3.5" /> {children}
    </div>
  );
}

export function SystemInfoCard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  // Estado de la GPU según Chromium (lo mismo que `chrome://gpu`): es lo que
  // permite decir POR QUÉ falta WebGPU en vez de sólo que falta (#203).
  const [features, setFeatures] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    api()
      ?.systemInfo?.()
      .then(setInfo)
      .catch(() => {});
    readGpuInfo().then(setGpu);
    api()
      ?.getGpuFeatureStatus?.()
      .then(setFeatures)
      .catch(() => setFeatures({}));
  }, []);

  // El diagnóstico se calcula en `src/lib/gpu-status.ts` (puro, con pruebas).
  const diag = diagnosticoGpu(
    features && gpu ? { features, adaptador: gpu.detail || null, vendorId: gpu.vendorId } : undefined
  );

  if (!info) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorCog className="w-6 h-6" /> Sistema
          </CardTitle>
          <CardDescription>Información del equipo disponible sólo en la app de escritorio.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorCog className="w-6 h-6" /> Sistema
        </CardTitle>
        <CardDescription>
          Capacidades de tu equipo para la IA local. LiteRT-LM necesita WebGPU; los modelos se guardan en la
          carpeta de datos de la app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SectionLabel icon={Cpu}>Hardware</SectionLabel>
        <div className="divide-y">
          <Row label="Sistema operativo" value={`${info.osName} ${info.osVersion} (${info.arch})`} />
          <Row label="Procesador" value={`${info.cpuModel} · ${info.cpuCores} núcleos`} />
          <Row
            label="Memoria RAM"
            value={
              <span className="inline-flex items-center gap-1">
                <MemoryStick className="w-3.5 h-3.5" /> {info.freeRamGB} GB libres de {info.totalRamGB} GB
              </span>
            }
          />
          {info.diskFreeGB != null && info.diskTotalGB != null && (
            <Row
              label="Disco (datos de la app)"
              value={
                <span className="inline-flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5" /> {info.diskFreeGB} GB libres de {info.diskTotalGB} GB
                </span>
              }
            />
          )}
        </div>

        <SectionLabel icon={Gauge}>GPU / WebGPU (requisito de la IA local)</SectionLabel>
        <div className="divide-y">
          <Row
            label="WebGPU"
            value={
              gpu == null ? (
                "Detectando…"
              ) : gpu.available ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 className="w-4 h-4" /> Disponible
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <XCircle className="w-4 h-4" /> No disponible — la IA local no funcionará
                </span>
              )
            }
          />
          {gpu?.detail && <Row label="Adaptador" value={gpu.detail} />}
          {features?.webgpu && <Row label="Chromium reporta" value={<code className="text-xs">{features.webgpu}</code>} />}
        </div>

        {/* Por qué falta y qué se puede hacer. Sólo cuando falta: en un equipo que
            funciona, esto sería ruido. */}
        {diag.webgpuAcelerado === false && (
          <div className="mt-3 rounded-md border border-warning-border bg-warning-surface p-3 text-sm">
            <p className="font-medium text-warning-foreground">Por qué no hay WebGPU</p>
            <p className="mt-1 text-warning-foreground/90">{diag.causaProbable}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-warning-foreground/90">
              {diag.recomendaciones.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <SectionLabel icon={MonitorCog}>Versiones</SectionLabel>
        <div className="divide-y">
          <Row label="Aplicación" value={info.appVersion} />
          <Row label="Electron / Chromium" value={`${info.electronVersion} / ${info.chromeVersion}`} />
          <Row label="Node.js" value={info.nodeVersion} />
          <Row label="Carpeta de datos" value={<code className="text-xs">{info.userDataPath}</code>} />
        </div>
      </CardContent>
    </Card>
  );
}
