"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGraphContext } from "@/context/GraphContext";
import { useAgent } from "@/context/AgentContext";
import { artifactBodyMarkdown } from "@/lib/artifacts/to-markdown";
import { artifactFileName } from "@/lib/artifacts/editing";
import { ArtifactEditor, type ArtifactEditorHandle } from "./ArtifactEditor";
import { Markdown } from "./Markdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { iconForArtifact } from "./artifact-icon";
import {
  Copy,
  ClipboardPaste,
  Download,
  Pencil,
  Eye,
  Save,
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
} from "lucide-react";
import type { Artifact } from "@/lib/agent-types";

/** Sufijo de revisión: la v1 no lo lleva (ruido para el caso normal). */
export function revisionLabel(a: Artifact): string {
  return a.revision && a.revision > 1 ? `v${a.revision}` : "";
}

/** Copia texto: en Electron por el main (portapapeles nativo), si no por el navegador. */
async function copyText(text: string): Promise<boolean> {
  try {
    const api = (window as any).electronAPI;
    if (api?.copyToClipboard) return !!(await api.copyToClipboard(text));
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Clave del borrador: sobrevive cerrar la modal sin guardar. */
const draftKey = (id: string) => `artifact_draft_${id}`;

function readDraft(id: string): string | null {
  try {
    return localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}
function writeDraft(id: string, text: string): void {
  try {
    localStorage.setItem(draftKey(id), text);
  } catch {
    /* sin cuota: el borrador es una comodidad, no puede romper la edición */
  }
}
function clearDraft(id: string): void {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

/** Descarga un texto como archivo (mismo patrón que el export del lienzo). */
function downloadText(content: string, filename: string, mime = "text/markdown;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Visor de UN artefacto: lee, edita, copia, pega y descarga. Vive aparte de
 * `ArtifactsPanel` porque también lo usa el riel del sidebar colapsado: desde
 * ahí se abre el artefacto SIN expandir el panel, y duplicar la modal era
 * pedirle que se desincronice.
 *
 * Guardar NO sobreescribe: crea una revisión nueva del linaje (append-only,
 * specs/004-artefactos-versionados). Las reglas de la edición —qué payload sale
 * del texto, cómo se llama el archivo, qué hace cada botón de la barra— viven
 * en `src/lib/artifacts/editing.ts`; acá sólo está el DOM.
 */
export function ArtifactViewerDialog({
  artifact,
  onClose,
}: {
  artifact: Artifact | null;
  onClose: () => void;
}) {
  const { allNodes } = useGraphContext();
  const { editArtifact } = useAgent();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState(true);
  const [ancho, setAncho] = useState(true);
  /** Borrador encontrado al abrir: se ofrece recuperar, no se aplica solo. */
  const [rescate, setRescate] = useState<string | null>(null);
  const editorRef = useRef<ArtifactEditorHandle | null>(null);

  const source = useMemo(
    () => (artifact ? artifactBodyMarkdown(artifact, allNodes) : ""),
    [artifact, allNodes]
  );

  // Cambiar de artefacto (o cerrar) sale del modo edición: el borrador es de UNO.
  // Si quedó uno de una sesión anterior, se avisa; pisar lo guardado sin permiso
  // es peor que ofrecerlo.
  useEffect(() => {
    setEditing(false);
    setDraft("");
    const guardado = artifact ? readDraft(artifact.id) : null;
    setRescate(guardado && guardado !== source ? guardado : null);
  }, [artifact?.id, source]);

  const Icon = artifact ? iconForArtifact(artifact) : null;
  const sucio = editing && draft !== source;

  // El borrador se persiste mientras se escribe: cerrar la modal sin guardar (o
  // que se cierre la app) no puede costar media hora de edición.
  useEffect(() => {
    if (!artifact || !editing) return;
    if (draft === source) {
      clearDraft(artifact.id);
      return;
    }
    const t = setTimeout(() => writeDraft(artifact.id, draft), 400);
    return () => clearTimeout(t);
  }, [artifact, editing, draft, source]);

  const editar = (texto = source) => {
    setDraft(texto);
    setEditing(true);
    setRescate(null);
  };

  const pegar = async () => {
    try {
      const texto = await navigator.clipboard.readText();
      if (!texto) return toast({ title: "El portapapeles está vacío" });
      editorRef.current?.paste(texto);
    } catch {
      toast({
        variant: "destructive",
        title: "No se pudo leer el portapapeles",
        description: "Pegá con ⌘V / Ctrl+V dentro del editor.",
      });
    }
  };

  const copiar = async () => {
    const texto = editing ? draft : source;
    toast(
      (await copyText(texto))
        ? { title: "Markdown copiado" }
        : { variant: "destructive", title: "No se pudo copiar" }
    );
  };

  const descargar = () => {
    if (!artifact) return;
    const rev = revisionLabel(artifact);
    const cuerpo = editing ? draft : source;
    downloadText(`# ${artifact.title}${rev ? ` · ${rev}` : ""}\n\n${cuerpo}\n`, artifactFileName(artifact));
    toast({ title: `Descargado ${artifactFileName(artifact)}` });
  };

  const guardar = () => {
    if (!artifact) return;
    if (!draft.trim()) {
      return toast({ variant: "destructive", title: "Un artefacto vacío no se guarda" });
    }
    if (draft === source) return;
    editArtifact(artifact.id, draft);
    clearDraft(artifact.id);
    setEditing(false);
    // La revisión nueva es otro artefacto: el visor se cierra en vez de mostrar
    // una versión que ya quedó atrás (el panel muestra la vigente).
    onClose();
    toast({ title: "Guardado como revisión nueva" });
  };

  const cerrarEdicion = () => {
    // Cerrar el editor con cambios NO los tira: se persiste el borrador y la
    // vista de lectura ofrece recuperarlo ahí mismo (antes había que cerrar y
    // volver a abrir la modal para que apareciera el aviso).
    if (sucio && artifact) {
      writeDraft(artifact.id, draft);
      setRescate(draft);
    }
    setEditing(false);
  };

  // Editando, la modal ocupa la ventana: un documento largo en 3xl es el problema
  // que se está resolviendo. Leyendo, se queda angosta (columna de lectura).
  const tamano = editing && ancho ? "w-[96vw] max-w-[96vw] h-[93vh]" : "w-full max-w-3xl max-h-[85vh]";

  return (
    <Dialog open={!!artifact} onOpenChange={(o) => !o && (sucio ? cerrarEdicion() : onClose())}>
      {/* `flex flex-col` + `min-h-0` en el cuerpo: el DialogContent es un grid,
          así que sin esto el hijo con `overflow-auto` no recibe altura acotada,
          se recorta y el artefacto largo no se puede scrollear. */}
      <DialogContent className={`flex flex-col overflow-hidden p-0 gap-0 ${tamano}`}>
        <DialogHeader className="border-b px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 text-base">
            {Icon && <Icon className="h-4 w-4 text-primary" />}
            <span className="truncate">{artifact?.title}</span>
            {artifact && revisionLabel(artifact) && (
              <span className="rounded bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                {revisionLabel(artifact)}
              </span>
            )}
            {sucio && <span className="text-2xs font-normal text-warning">· sin guardar</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Acciones del artefacto */}
        <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-3 py-1.5">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={copiar}>
            <Copy className="h-3.5 w-3.5" /> Copiar
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={descargar}>
            <Download className="h-3.5 w-3.5" /> Descargar .md
          </Button>
          <div className="ml-auto flex items-center gap-1">
            {editing ? (
              <>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={pegar}>
                  <ClipboardPaste className="h-3.5 w-3.5" /> Pegar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setPreview((p) => !p)}
                >
                  <Eye className="h-3.5 w-3.5" /> {preview ? "Sólo editor" : "Vista previa"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title={ancho ? "Modal angosta" : "Ocupar la ventana"}
                  aria-label={ancho ? "Modal angosta" : "Ocupar la ventana"}
                  onClick={() => setAncho((a) => !a)}
                >
                  {ancho ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={cerrarEdicion}>
                  <X className="h-3.5 w-3.5" /> Cerrar editor
                </Button>
                <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={guardar} disabled={!sucio}>
                  <Save className="h-3.5 w-3.5" /> Guardar revisión
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => editar()}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            )}
          </div>
        </div>

        {/* Borrador de una sesión anterior */}
        {!editing && rescate && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-warning-surface px-3 py-1.5 text-2xs text-warning-foreground">
            <RotateCcw className="h-3.5 w-3.5 text-warning" />
            <span>Hay una edición sin guardar de este artefacto.</span>
            <Button variant="secondary" size="sm" className="h-6 text-2xs" onClick={() => editar(rescate)}>
              Recuperar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-2xs"
              onClick={() => {
                if (artifact) clearDraft(artifact.id);
                setRescate(null);
              }}
            >
              Descartar
            </Button>
          </div>
        )}

        {editing ? (
          <ArtifactEditor
            value={draft}
            onChange={setDraft}
            onSave={guardar}
            preview={preview}
            editorRef={editorRef}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {artifact && <Markdown content={source} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
