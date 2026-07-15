"use client";

// =============================================================================
// Estado del CONTEXTO DE REFERENCIA (documentos por proyecto).
//
// El usuario sube/pega documentos que la IA LOCAL usa como referencia al SUGERIR
// en el diseñador (nombres, descripciones, tipos, etiquetas). Se persiste por
// proyecto en localStorage (`refdocs_<fileId>`). No afecta al chat del agente.
// =============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useGraphContext } from "@/context/GraphContext";
import { useToast } from "@/hooks/use-toast";
import {
  buildReferenceText,
  makeReferenceDoc,
  type ReferenceDoc,
} from "@/lib/reference-context";
import { extractFileText } from "@/lib/pdf-text";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ref_${Math.random().toString(36).slice(2)}`;

const nowIso = () => new Date().toISOString();

function storageKey(fileId: string) {
  return `refdocs_${fileId}`;
}

function loadDocs(fileId: string): ReferenceDoc[] {
  try {
    const raw = localStorage.getItem(storageKey(fileId));
    if (raw) return JSON.parse(raw) as ReferenceDoc[];
  } catch {
    /* ignore */
  }
  return [];
}

export interface ReferenceContextType {
  docs: ReferenceDoc[];
  /** Texto de referencia acotado, listo para inyectar en los prompts locales. */
  referenceText: string;
  /** Añade archivos (extrae su texto). Devuelve cuántos se añadieron. */
  addFiles: (files: FileList | File[]) => Promise<void>;
  /** Añade un bloque de texto pegado a mano. */
  addText: (name: string, text: string) => void;
  removeDoc: (id: string) => void;
  clear: () => void;
}

const ReferenceContext = createContext<ReferenceContextType | undefined>(undefined);

export const useReference = () => {
  const ctx = useContext(ReferenceContext);
  if (!ctx) throw new Error("useReference debe usarse dentro de ReferenceProvider");
  return ctx;
};

export function ReferenceProvider({ children }: { children: React.ReactNode }) {
  const { currentFileId } = useGraphContext();
  const { toast } = useToast();
  const [docs, setDocs] = useState<ReferenceDoc[]>([]);

  // Carga al cambiar de proyecto.
  useEffect(() => {
    if (!currentFileId) {
      setDocs([]);
      return;
    }
    setDocs(loadDocs(currentFileId));
  }, [currentFileId]);

  // Persiste por proyecto.
  useEffect(() => {
    if (!currentFileId) return;
    try {
      localStorage.setItem(storageKey(currentFileId), JSON.stringify(docs));
    } catch {
      /* ignore quota */
    }
  }, [currentFileId, docs]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const added: ReferenceDoc[] = [];
      for (const file of list) {
        try {
          const text = await extractFileText(file);
          if (!text.trim()) {
            toast({
              variant: "destructive",
              title: "Sin texto",
              description: `"${file.name}" no contiene texto legible.`,
            });
            continue;
          }
          added.push(makeReferenceDoc(file.name, "file", text, nowIso(), uid()));
        } catch (e: any) {
          toast({
            variant: "destructive",
            title: "No se pudo leer el archivo",
            description: `${file.name}: ${e?.message || "formato no soportado"}`,
          });
        }
      }
      if (added.length) {
        setDocs((prev) => [...prev, ...added]);
        toast({ title: "Referencia añadida", description: `${added.length} documento(s).` });
      }
    },
    [toast]
  );

  const addText = useCallback(
    (name: string, text: string) => {
      if (!text.trim()) return;
      setDocs((prev) => [
        ...prev,
        makeReferenceDoc(name.trim() || "Texto pegado", "text", text, nowIso(), uid()),
      ]);
    },
    []
  );

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clear = useCallback(() => setDocs([]), []);

  const referenceText = useMemo(() => buildReferenceText(docs), [docs]);

  const value: ReferenceContextType = {
    docs,
    referenceText,
    addFiles,
    addText,
    removeDoc,
    clear,
  };

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}
