"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Search, Undo2, Redo2, Settings2, Library, Download, Maximize, Trash,
  HelpCircle, Layers, Plus, GitGraph, Plug, FileDown, ArrowRight, PanelLeft,
  FilePlus2,
} from "lucide-react";
import { useViews } from "@/context/ViewsContext";
import { useGraphContext } from "@/context/GraphContext";
import { useSidebar } from "@/components/ui/sidebar";
import { NOTATION_LIST } from "@/lib/notations";

/** Acción del lienzo: se despacha a ComponentDesigner por un evento de ventana. */
function designerAction(action: string) {
  window.dispatchEvent(new CustomEvent("designer-action", { detail: action }));
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ElementType;
  keywords?: string;
  run: () => void;
}

/**
 * Paleta de acciones (⌘K / Ctrl+K). Punto único, filtrable por teclado, para
 * las acciones dispersas del arquitecto: navegar/crear vistas, operar el lienzo,
 * exportar y saltar a Ajustes/MCP. Sin dependencias nuevas (Dialog + Input).
 * Las acciones del lienzo viajan por un CustomEvent que ComponentDesigner
 * escucha, para no acoplar la paleta a su estado interno.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { views, setActiveView, createView } = useViews();
  const { handleDownloadJson, currentFileId } = useGraphContext();
  const { toggleSidebar } = useSidebar();

  // Atajo global ⌘K / Ctrl+K para abrir/cerrar; ignora si se escribe en un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Navegar a una vista existente.
    for (const v of views) {
      cmds.push({
        id: `view-${v.id}`,
        label: `Ir a la vista: ${v.name}`,
        group: "Vistas",
        icon: Layers,
        keywords: `vista ${v.name} ${v.kind}`,
        run: () => setActiveView(v.id),
      });
    }

    // Crear proyecto nuevo (abre el diálogo de nombre del header por evento).
    cmds.push({
      id: "new-project",
      label: "Nuevo proyecto…",
      group: "Crear",
      icon: FilePlus2,
      keywords: "nuevo proyecto crear archivo",
      run: () => window.dispatchEvent(new CustomEvent("open-new-project")),
    });

    // Crear una vista por notación + Mermaid.
    for (const n of NOTATION_LIST) {
      cmds.push({
        id: `new-view-${n.id}`,
        label: `Nueva vista: ${n.label}`,
        group: "Crear",
        icon: Plus,
        keywords: `crear notacion ${n.id} ${n.label}`,
        run: () => createView({ notation: n.id }),
      });
    }
    cmds.push({
      id: "new-view-mermaid",
      label: "Nueva vista: Diagrama Mermaid",
      group: "Crear",
      icon: GitGraph,
      keywords: "mermaid diagrama codigo",
      run: () => createView({ kind: "mermaid", name: "Diagrama Mermaid" }),
    });

    // Acciones del lienzo (vía evento).
    const canvas: Array<[string, string, React.ElementType, string]> = [
      ["undo", "Deshacer", Undo2, "deshacer undo"],
      ["redo", "Rehacer", Redo2, "rehacer redo"],
      ["fit", "Ajustar a contenido", Maximize, "ajustar zoom fit encuadrar"],
      ["export", "Exportar diagrama (SVG)", Download, "exportar svg imagen"],
      ["metadata", "Abrir metadatos del proyecto", Settings2, "metadatos read models"],
      ["context", "Abrir contexto de referencia", Library, "contexto documentos referencia"],
      ["clear", "Limpiar el lienzo", Trash, "limpiar borrar reiniciar"],
      ["help", "Ayuda y atajos", HelpCircle, "ayuda atajos teclado"],
    ];
    for (const [action, label, icon, keywords] of canvas) {
      cmds.push({
        id: `canvas-${action}`,
        label,
        group: "Lienzo",
        icon,
        keywords,
        run: () => designerAction(action),
      });
    }

    // Navegación de la app.
    cmds.push({
      id: "nav-settings",
      label: "Ir a Ajustes",
      group: "Ir a",
      icon: Settings2,
      keywords: "ajustes settings ia llaves",
      run: () => router.push("/settings"),
    });
    cmds.push({
      id: "nav-mcp",
      label: "Ir a la Guía MCP",
      group: "Ir a",
      icon: Plug,
      keywords: "mcp claude code servidor",
      run: () => router.push("/mcp"),
    });
    cmds.push({
      id: "toggle-sidebar",
      label: "Mostrar / ocultar el menú lateral",
      group: "Ir a",
      icon: PanelLeft,
      keywords: "sidebar menu panel",
      run: () => toggleSidebar(),
    });
    if (currentFileId) {
      cmds.push({
        id: "download-json",
        label: "Descargar JSON del proyecto",
        group: "Ir a",
        icon: FileDown,
        keywords: "descargar json exportar proyecto",
        run: () => handleDownloadJson(),
      });
    }

    return cmds;
  }, [views, setActiveView, createView, router, toggleSidebar, currentFileId, handleDownloadJson]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Reinicia estado al abrir; reajusta la selección al filtrar.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Enfoca el input tras el montaje del portal.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    setOpen(false);
    // Ejecuta tras cerrar para que el diálogo no robe el foco a lo que abra.
    requestAnimationFrame(() => cmd.run());
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    }
  };

  // Mantén visible el elemento activo al navegar con flechas.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Agrupa preservando el orden de aparición.
  const groups = useMemo(() => {
    const map = new Map<string, { cmd: Command; idx: number }[]>();
    filtered.forEach((cmd, idx) => {
      const arr = map.get(cmd.group) ?? [];
      arr.push({ cmd, idx });
      map.set(cmd.group, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 [&>button]:hidden">
        {/* Título/descripción ocultos: Radix los exige para accesibilidad. */}
        <DialogTitle className="sr-only">Paleta de acciones</DialogTitle>
        <DialogDescription className="sr-only">Busca y ejecuta una acción</DialogDescription>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Buscar una acción… (vistas, lienzo, exportar, ajustes)"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sin acciones para «{query}».
            </p>
          ) : (
            groups.map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                {items.map(({ cmd, idx }) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={idx}
                      onClick={() => runAt(idx)}
                      onMouseMove={() => setActive(idx)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm",
                        idx === active ? "bg-primary/10 text-foreground" : "text-foreground/80"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {idx === active && <ArrowRight className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
