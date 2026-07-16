"use client";

/**
 * @fileOverview Tarjeta "Sistema" de Configuración.
 *
 * Muestra los datos del equipo relevantes para la IA local: hardware (CPU/RAM/
 * disco donde viven los modelos), el adaptador WebGPU (requisito de LiteRT-LM,
 * sólo el renderer lo conoce) y las versiones del runtime para diagnóstico.
 */

import React, { useEffect, useState } from "react";
import { Cpu, MemoryStick, HardDrive, MonitorCog, Gauge, CheckCircle2, XCircle, Sun, Moon, Palette } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";
import type { SystemInfo } from "@/types/electron";

const api = () => (typeof window !== "undefined" ? (window as any).electronAPI : undefined);

interface GpuInfo {
  available: boolean;
  /** vendor/architecture/description del adaptador (lo que exponga el navegador). */
  detail: string;
}

/** Interroga al adaptador WebGPU del renderer (la GPU que usará LiteRT-LM). */
async function readGpuInfo(): Promise<GpuInfo> {
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter?.();
    if (!adapter) return { available: false, detail: "" };
    const info = adapter.info ?? {};
    const detail = [info.vendor, info.architecture, info.description].filter(Boolean).join(" · ");
    return { available: true, detail };
  } catch {
    return { available: false, detail: "" };
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

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: MonitorCog },
];

/** Conmutador segmentado claro/oscuro/sistema (persistido en localStorage). */
function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Tema de la aplicación">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            theme === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );
}

export function SystemInfoCard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [gpu, setGpu] = useState<GpuInfo | null>(null);

  useEffect(() => {
    api()
      ?.systemInfo?.()
      .then(setInfo)
      .catch(() => {});
    readGpuInfo().then(setGpu);
  }, []);

  if (!info) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorCog className="w-6 h-6" /> Sistema
          </CardTitle>
          <CardDescription>Información del equipo disponible sólo en la app de escritorio.</CardDescription>
        </CardHeader>
        <CardContent>
          <SectionLabel icon={Palette}>Apariencia</SectionLabel>
          <div className="py-1.5">
            <ThemeSelector />
          </div>
        </CardContent>
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
        <SectionLabel icon={Palette}>Apariencia</SectionLabel>
        <div className="py-1.5">
          <ThemeSelector />
        </div>

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
                <span className="inline-flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="w-4 h-4" /> Disponible
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <XCircle className="w-4 h-4" /> No disponible — la IA local no funcionará
                </span>
              )
            }
          />
          {gpu?.detail && <Row label="Adaptador" value={gpu.detail} />}
        </div>

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
