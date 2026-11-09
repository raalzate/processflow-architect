"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Download } from "lucide-react";
import { renderMermaidSvg } from "@/components/canvas/MermaidDiagram";
import { ReadOnlyDiagramDashboard } from "@/components/collaboration/ReadOnlyDiagramDashboard";
import { colorDeToken, downloadBlob, serializarLienzo } from "@/components/graph/designer/export-canvas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { escaparHtml, paginaHtml, PRESET_LIST, slugDeProyecto, type PresetId } from "@/lib/export/html-page";
import { hostBridge } from "@/lib/host-bridge";
import { DEFAULT_MERMAID_CODE } from "@/lib/mermaid/templates";
import { getNotation } from "@/lib/notations";
import { SKIN_DEFAULT } from "@/lib/skin";
import type { GraphData } from "@/lib/types";
import type { DesignView } from "@/lib/views-types";
import { buildZip, type ZipEntry } from "@/lib/zip";

type Format = { extension: "svg" } | { extension: "png" } | { extension: "html"; preset: PresetId };
type Surface = { view: DesignView; graph?: GraphData; svg?: string };
type Progress = { index: number; total: number; name: string };

const ArchiveMenu = createContext<(() => void) | null>(null);
const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function messageSvg(text: string) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">' +
    '<rect width="640" height="360" fill="#fff"/><text x="320" y="180" text-anchor="middle" ' +
    'fill="#222" font-family="sans-serif" font-size="18">' + escaparHtml(text) + "</text></svg>";
}

export function DownloadViewsMenuItem() {
  const open = useContext(ArchiveMenu);
  return open && <DropdownMenuItem onSelect={open}><Download className="mr-2 h-4 w-4" /> Descargar todas (ZIP)</DropdownMenuItem>;
}

export function DownloadViewsButton() {
  const open = useContext(ArchiveMenu);
  return open && (
    <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 gap-1.5 px-2" onClick={open}
      aria-label="Descargar todas las vistas en ZIP" title="Descargar todas las vistas en ZIP">
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">Descargar vistas</span>
    </Button>
  );
}

export function ViewsArchiveProvider({ graph, views, children }: {
  graph: GraphData | null | undefined;
  views: DesignView[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [surface, setSurface] = useState<Surface | null>(null);
  const job = useRef<AbortController | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => () => job.current?.abort(), []);

  const capture = hostBridge()?.captureCanvas;

  async function download(format: Format) {
    if (job.current || !views.length) return;
    const controller = new AbortController();
    job.current = controller;
    const { signal } = controller;
    const entries: ZipEntry[] = [];
    const errors: string[] = [];
    const digits = String(views.length).length;
    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";

    try {
      for (const [index, view] of views.entries()) {
        signal.throwIfAborted();
        const data = view.kind === "design" ? graph : view.graph;
        const viewGraph = data && view.notation && data.notation !== view.notation ? { ...data, notation: view.notation } : data;
        const base = String(index + 1).padStart(digits, "0") + "-" + slugDeProyecto(view.name).slice(0, 110);
        setProgress({ index: index + 1, total: views.length, name: view.name });
        let svg: string | undefined;
        if (view.kind === "mermaid") {
          const code = view.mermaidCode ?? DEFAULT_MERMAID_CODE;
          if (!code.trim()) {
            svg = messageSvg("Vista vacía");
          } else {
            try {
              svg = await renderMermaidSvg(code, theme);
            } catch {
              errors.push(view.name + " · Mermaid no pudo interpretar esta vista. El código está en " + base + ".mmd.");
              entries.push({ name: base + ".mmd", content: code });
              svg = messageSvg("La vista Mermaid tiene un error de sintaxis");
            }
          }
        } else if (!viewGraph) {
          svg = messageSvg("Vista vacía");
        }

        signal.throwIfAborted();
        await afterPaint();
        signal.throwIfAborted();
        flushSync(() => setSurface({ view, graph: viewGraph ?? undefined, svg }));
        await afterPaint();
        signal.throwIfAborted();

        let content: ZipEntry["content"];
        if (format.extension === "png") {
          if (!capture || !stage.current) throw new Error("La captura PNG requiere la aplicación de escritorio.");
          const { x, y, width, height } = stage.current.getBoundingClientRect();
          const dataUrl = await capture({ x, y, width, height });
          if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("La captura de la vista no devolvió una imagen PNG.");
          content = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), char => char.charCodeAt(0));
        } else {
          if (!svg) {
            const element = stage.current?.querySelector<SVGSVGElement>("svg[role=img]");
            if (!element) throw new Error("No se pudo preparar la vista «" + view.name + "».");
            const background = viewGraph?.skin === "editorial" ? colorDeToken(element, "--ed-paper") : undefined;
            svg = serializarLienzo(element, null, background, true);
          }
          content = format.extension === "svg" ? svg : paginaHtml({
            titulo: view.name,
            descripcion: view.description ?? viewGraph?.big_picture?.descripcion,
            notacion: view.kind === "mermaid" ? "Mermaid" : getNotation(viewGraph?.notation).label,
            skin: viewGraph?.skin ?? SKIN_DEFAULT,
            tema: theme,
            preset: format.preset,
            svg,
          });
        }
        entries.push({ name: base + "." + format.extension, content });
      }

      signal.throwIfAborted();
      if (errors.length) entries.push({ name: "vistas-con-errores.txt", content: errors.join("\n") });
      const zip = buildZip(entries);
      const project = slugDeProyecto(graph?.nombre_proyecto || "proyecto").slice(0, 100);
      downloadBlob(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), project + "-vistas-" + format.extension + ".zip");
      toast({
        title: errors.length ? "ZIP descargado con observaciones" : "Vistas descargadas",
        description: errors.length ? "Las vistas Mermaid con errores incluyen su código original en el ZIP." : views.length + " vistas en formato " + format.extension.toUpperCase() + ".",
      });
    } catch (error) {
      if (!signal.aborted) toast({
        variant: "destructive",
        title: "No se pudo descargar el ZIP",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      job.current = null;
      setProgress(null);
      setSurface(null);
      setOpen(false);
    }
  }

  return (
    <ArchiveMenu.Provider value={() => { if (!job.current) setOpen(true); }}>
      {children}
      <Dialog open={open} onOpenChange={next => {
        if (!next) job.current?.abort();
        setOpen(next);
      }}>
        <DialogContent className={progress ? "w-[calc(100dvw-2rem)] max-w-5xl data-[state=open]:animate-none" : "max-h-[calc(100dvh-2rem)] w-[calc(100dvw-2rem)] overflow-y-auto"}
          onInteractOutside={event => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Descargar todas las vistas</DialogTitle>
            <DialogDescription aria-live="polite">
              {progress ? "Preparando " + progress.index + " de " + progress.total + " · " + progress.name : "Elige el formato de los archivos dentro del ZIP."}
            </DialogDescription>
          </DialogHeader>
          {progress ? (
            <div ref={stage} className="pointer-events-none h-[min(62dvh,calc(100dvh-8rem),720px)] overflow-hidden bg-background" aria-hidden="true">
              {surface?.svg ? (
                <div className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:max-w-none"
                  dangerouslySetInnerHTML={{ __html: surface.svg }} />
              ) : surface?.graph && (
                <ReadOnlyDiagramDashboard key={surface.view.id} graph={surface.graph}
                  label={surface.view.name} sideLabel={surface.view.name} exporting />
              )}
            </div>
          ) : (
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => void download({ extension: "svg" })}>SVG · vectorial</Button>
              <Button variant="outline" disabled={!capture} onClick={() => void download({ extension: "png" })}>PNG · imagen</Button>
              {PRESET_LIST.map(preset => (
                <Button key={preset.id} variant="outline" onClick={() => void download({ extension: "html", preset: preset.id })}>
                  HTML · {preset.label}
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ArchiveMenu.Provider>
  );
}
