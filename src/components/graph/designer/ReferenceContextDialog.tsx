"use client";

import React, { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { accion } from "@/lib/action-labels";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useReference } from "@/context/ReferenceContext";
import { ACCEPTED_REFERENCE_TYPES } from "@/lib/pdf-text";
import { FileText, Upload, Trash2, Loader2, ClipboardPaste, Library } from "lucide-react";

/**
 * Documentos de referencia del proyecto. Sirven de contexto para las SUGERENCIAS
 * de la IA local en el diseñador (nombres, descripciones, tipos, etiquetas).
 * No tiene relación con el chat del agente.
 */
export function ReferenceContextDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { docs, addFiles, addText, removeDoc, clear } = useReference();
  const [busy, setBusy] = useState(false);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const totalChars = docs.reduce((s, d) => s + d.chars, 0);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await addFiles(files);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAddText = () => {
    if (!pasteText.trim()) return;
    addText(pasteName, pasteText);
    setPasteName("");
    setPasteText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="w-5 h-5 text-primary" /> Contexto de referencia
          </DialogTitle>
          <DialogDescription>
            Sube o pega documentos del dominio (glosarios, actas, requisitos, PDF).
            La IA los usará como referencia al <strong>Sugerir</strong> nombres,
            descripciones, tipos y etiquetas en el lienzo. No afecta al chat del agente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Subida de archivos */}
          <div
            className="rounded-lg border border-dashed p-4 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPTED_REFERENCE_TYPES}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Arrastra archivos aquí o
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Seleccionar archivos
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Admite .txt, .md, .csv, .json y .pdf
            </p>
          </div>

          {/* Pegar texto */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ClipboardPaste className="h-4 w-4" /> Pegar texto
            </Label>
            <Input
              value={pasteName}
              onChange={(e) => setPasteName(e.target.value)}
              placeholder="Nombre (opcional). Ej: Glosario de negocio"
            />
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Pega aquí notas, glosario, reglas de negocio…"
              className="min-h-[100px]"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAddText} disabled={!pasteText.trim()}>
                Añadir texto
              </Button>
            </div>
          </div>

          {/* Lista de documentos */}
          <div className="border-t pt-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Documentos{" "}
                <Badge variant="secondary" className="ml-1">
                  {docs.length}
                </Badge>
              </Label>
              {docs.length > 0 && (
                <IconAction
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={clear}
                  label={accion("quitar", "todos los documentos")}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                />
              )}
            </div>
            {docs.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                Sin documentos de referencia todavía.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm" title={d.name}>
                      {d.name}
                    </span>
                    <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                      {d.chars.toLocaleString()} car.
                    </span>
                    <button
                      onClick={() => removeDoc(d.id)}
                      title="Quitar"
                      className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {totalChars > 0 && (
              <p className="mt-2 text-2xs text-muted-foreground">
                Total: {totalChars.toLocaleString()} caracteres. La IA usa hasta ~12&nbsp;000
                como referencia (se recorta el excedente).
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
