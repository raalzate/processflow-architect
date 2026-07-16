"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  Trash2,
  Loader2,
  MemoryStick,
  SlidersHorizontal,
  MoreHorizontal,
  FolderOpen,
  BrainCircuit,
  Plug,
  MonitorCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  getSelectedLitertModelId,
  setSelectedLitertModelId,
  type LitertModelId,
} from "@/lib/litert-models";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelConfigDialog } from "@/components/settings/ModelConfigDialog";
import { RemoteAiConfig } from "@/components/settings/RemoteAiConfig";
import { McpServerConfig } from "@/components/settings/McpServerConfig";
import { SystemInfoCard } from "@/components/settings/SystemInfoCard";
import type { LitertModelStatus } from "@/types/electron";

const api = () => (typeof window !== "undefined" ? (window as any).electronAPI : undefined);

// Secciones de la vista: alimentan el sidebar de navegación y los anchors.
const SECTIONS = [
  { id: "modelo", label: "Modelo de IA", icon: Download },
  { id: "motor", label: "Motor de IA", icon: BrainCircuit },
  { id: "mcp", label: "Servidor MCP", icon: Plug },
  { id: "sistema", label: "Sistema", icon: MonitorCog },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function SettingsPage() {
  const { toast } = useToast();

  const [models, setModels] = useState<LitertModelStatus[]>([]);
  const [totalRamGB, setTotalRamGB] = useState<number | null>(null);
  const [selected, setSelected] = useState<LitertModelId>(getSelectedLitertModelId());
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("modelo");
  const scrollRef = useRef<HTMLElement | null>(null);

  // Resalta en el sidebar la sección visible (scroll-spy sobre el contenedor).
  useEffect(() => {
    const rootEl = scrollRef.current;
    if (!rootEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // La sección visible más cercana al tope del contenedor gana.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id as SectionId);
      },
      { root: rootEl, rootMargin: "-10% 0px -60% 0px" }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const refreshModels = useCallback(async () => {
    try {
      const res = await api()?.litertModelsList?.();
      if (res) {
        setModels(res.models);
        setTotalRamGB(res.totalRamGB ?? null);
      }
    } catch {
      /* desktop-only */
    }
  }, []);

  useEffect(() => {
    setSelected(getSelectedLitertModelId());
    refreshModels();
    const off = api()?.onLitertModelProgress?.((data: { id: string; percent: number }) => {
      setProgress((p) => ({ ...p, [data.id]: data.percent }));
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [refreshModels]);

  // Auto-corrige la selección: si el elegido no está descargado pero hay otro que sí.
  useEffect(() => {
    if (!models.length) return;
    if (models.find((m) => m.id === selected)?.downloaded) return;
    const dl = models.find((m) => m.downloaded);
    if (dl) {
      setSelected(dl.id as LitertModelId);
      setSelectedLitertModelId(dl.id as LitertModelId);
    }
  }, [models, selected]);

  const handleSelect = (id: LitertModelId, label: string) => {
    setSelected(id);
    setSelectedLitertModelId(id);
    toast({ title: "Modelo seleccionado", description: `Se usará ${label}.` });
  };

  const handleDownload = async (id: LitertModelId) => {
    setDownloading(id);
    setProgress((p) => ({ ...p, [id]: 0 }));
    try {
      const res = await api()?.litertModelDownload?.(id);
      if (res?.ok) {
        setSelected(id);
        setSelectedLitertModelId(id);
        toast({ title: "Modelo descargado y seleccionado", description: "Listo para usar sin conexión." });
        await refreshModels();
      } else {
        toast({ variant: "destructive", title: "Error al descargar", description: res?.error ?? "Fallo desconocido." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error al descargar", description: e?.message ?? "Fallo." });
    } finally {
      setDownloading(null);
    }
  };

  const handleDeleteModel = async (id: LitertModelId, label: string) => {
    const res = await api()?.litertModelDelete?.(id);
    if (res?.ok) {
      toast({ title: "Modelo borrado", description: `Se liberó el espacio de ${label}.` });
      await refreshModels();
    } else {
      toast({ variant: "destructive", title: "No se pudo borrar", description: res?.error ?? "Fallo." });
    }
  };

  const handleRevealModel = async (id: LitertModelId) => {
    const res = await api()?.litertModelReveal?.(id);
    if (!res?.ok) {
      toast({ variant: "destructive", title: "No se pudo abrir", description: res?.error ?? "Fallo." });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="bg-card border-b shadow-sm w-full p-4 z-10 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-foreground font-headline">Configuración</h1>
          <p className="text-sm text-muted-foreground">
            Local por defecto con Gemma (LiteRT-LM · WebGPU). IA remota opcional (Gemini · OpenAI · Anthropic).
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Analizador
          </Link>
        </Button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar de navegación entre secciones (scroll-spy). */}
        <aside className="w-56 shrink-0 border-r bg-card p-4 hidden md:block">
          <nav className="space-y-1 sticky top-4">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors",
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <s.icon className="w-4 h-4 shrink-0" />
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <main ref={scrollRef} className="flex-1 overflow-y-auto p-8">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            {/* Selección + descarga de modelo */}
            <section id="modelo" className="scroll-mt-4">
              <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-6 h-6" /> Modelo de IA (Gemma local)
                  </CardTitle>
                  <CardDescription className="mt-1.5">
                    Elige el modelo que usarán los agentes. Descárgalo una vez; luego funciona sin conexión.
                    {totalRamGB != null && (
                      <span className="ml-1 inline-flex items-center gap-1 text-xs">
                        <MemoryStick className="w-3.5 h-3.5" /> {totalRamGB} GB RAM
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => setConfigOpen(true)}>
                  <SlidersHorizontal className="w-4 h-4 mr-2" /> Avanzado
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {models.map((m) => {
                const isSelected = selected === m.id;
                const isDownloading = downloading === m.id;
                const pct = progress[m.id] ?? 0;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg border p-4 transition-colors",
                      m.downloaded && "cursor-pointer",
                      isSelected ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/40"
                    )}
                    onClick={() => m.downloaded && handleSelect(m.id as LitertModelId, m.label)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          checked={isSelected}
                          disabled={!m.downloaded}
                          onChange={() => handleSelect(m.id as LitertModelId, m.label)}
                          className="mt-1 h-4 w-4 accent-primary disabled:opacity-40"
                        />
                        <div>
                          <div className="font-semibold flex items-center gap-2">
                            {m.label}
                            <span className="text-xs font-normal text-muted-foreground">· ~{m.approxGB} GB</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{m.blurb}</p>
                        </div>
                      </div>
                      {m.downloaded && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => handleRevealModel(m.id as LitertModelId)}>
                              <FolderOpen className="w-4 h-4 mr-2" /> Mostrar en Finder
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
                              onClick={() => handleDeleteModel(m.id as LitertModelId, m.label)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Borrar modelo
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    <div className="mt-3 ml-7 flex items-center gap-3">
                      {m.downloaded ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="w-4 h-4" /> Descargado
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isDownloading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(m.id as LitertModelId);
                          }}
                        >
                          {isDownloading ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          {isDownloading ? "Descargando…" : "Descargar"}
                        </Button>
                      )}
                    </div>

                    {isDownloading && (
                      <div className="mt-2 ml-7">
                        <Progress value={pct} />
                        <div className="text-xs text-muted-foreground mt-1">{pct}%</div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!models.length && (
                <p className="text-sm text-muted-foreground">
                  Información disponible sólo en la app de escritorio.
                </p>
              )}
            </CardContent>
              </Card>
            </section>

            {/* IA remota opcional (llaves cifradas + conmutador de motor) */}
            <section id="motor" className="scroll-mt-4">
              <RemoteAiConfig />
            </section>

            {/* Servidor MCP embebido (opt-in): Claude Code/Codex diseñan sobre la app */}
            <section id="mcp" className="scroll-mt-4">
              <McpServerConfig />
            </section>

            {/* Datos del equipo relevantes para la IA local (WebGPU, RAM, disco) */}
            <section id="sistema" className="scroll-mt-4">
              <SystemInfoCard />
            </section>
          </div>
        </main>
      </div>
      <ModelConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
      <Toaster />
    </div>
  );
}
