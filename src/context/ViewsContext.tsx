"use client";

/**
 * @fileOverview Estado del Diseñador de Vistas DDD.
 *
 * Gestiona las vistas custom (diagramas), la vista activa y las vistas inyectadas
 * como contexto al agente. Persiste por proyecto en localStorage (`views_<fileId>`).
 */

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
  BUILTIN_VIEWS,
  MAX_CUSTOM_VIEWS,
  MAX_INJECTED_VIEWS,
  type DesignView,
} from "@/lib/views-types";
import { DEFAULT_NOTATION_ID, INITIAL_NOTATION_ID, type NotationId } from "@/lib/notations";
import { emptyGraphData } from "@/components/graph/designer/serialize";
import type { GraphData } from "@/lib/types";
import { DEFAULT_MERMAID_CODE } from "@/lib/mermaid/templates";
import type { ViewKind } from "@/lib/views-types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `view_${Math.random().toString(36).slice(2)}`;

const nowIso = () => new Date().toISOString();

interface PersistedViews {
  customViews: DesignView[];
  activeViewId: string;
  injectedViewIds: string[];
}

function storageKey(fileId: string) {
  return `views_${fileId}`;
}

function loadViews(fileId: string): PersistedViews {
  try {
    const raw = localStorage.getItem(storageKey(fileId));
    if (raw) return JSON.parse(raw) as PersistedViews;
  } catch {
    /* ignore */
  }
  return { customViews: [], activeViewId: "design", injectedViewIds: [] };
}

export interface ViewsContextType {
  views: DesignView[]; // built-in + custom (en orden)
  customViews: DesignView[];
  activeViewId: string;
  activeView: DesignView | undefined;
  injectedViewIds: string[];
  injectedViews: DesignView[];
  canCreate: boolean;
  canInjectMore: boolean;
  /** Pila de vistas ancestro al entrar a subprocesos (para el breadcrumb). */
  drillStack: string[];

  setActiveView: (id: string) => void;
  /** Entra a una vista embebida apilando la actual (drill-down). */
  enterView: (childId: string) => void;
  /** Salta a la posición `index` del breadcrumb [...drillStack, activa]. */
  goToDrill: (index: number) => void;
  createView: (opts?: { name?: string; description?: string; graph?: GraphData; notation?: NotationId; kind?: ViewKind; mermaidCode?: string; activate?: boolean }) => string | null;
  cloneView: (id: string) => string | null;
  renameView: (id: string, name: string) => void;
  setViewNotation: (id: string, notation: NotationId) => void;
  deleteView: (id: string) => void;
  updateViewGraph: (id: string, graph: GraphData) => void;
  updateViewMermaid: (id: string, code: string) => void;
  moveCustomView: (draggedId: string, targetId: string) => void;
  toggleInject: (id: string) => void;
  clearInjected: () => void;
}

const ViewsContext = createContext<ViewsContextType | undefined>(undefined);

export const useViews = () => {
  const ctx = useContext(ViewsContext);
  if (!ctx) throw new Error("useViews debe usarse dentro de ViewsProvider");
  return ctx;
};

export function ViewsProvider({ children }: { children: React.ReactNode }) {
  const { currentFileId, graphData } = useGraphContext();
  const { toast } = useToast();

  const [customViews, setCustomViews] = useState<DesignView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("design");
  const [injectedViewIds, setInjectedViewIds] = useState<string[]>([]);
  // Navegación en profundidad (subprocesos): ids de las vistas ancestro. No se
  // persiste: es estado de navegación efímero, no del documento.
  const [drillStack, setDrillStack] = useState<string[]>([]);

  // Carga al cambiar de proyecto.
  useEffect(() => {
    setDrillStack([]);
    if (!currentFileId) {
      setCustomViews([]);
      setActiveViewId("design");
      setInjectedViewIds([]);
      return;
    }
    const s = loadViews(currentFileId);
    setCustomViews(s.customViews ?? []);
    setActiveViewId(s.activeViewId ?? "design");
    setInjectedViewIds(s.injectedViewIds ?? []);
  }, [currentFileId]);

  // Persiste.
  useEffect(() => {
    if (!currentFileId) return;
    try {
      localStorage.setItem(
        storageKey(currentFileId),
        JSON.stringify({ customViews, activeViewId, injectedViewIds } as PersistedViews)
      );
    } catch {
      /* ignore quota */
    }
  }, [currentFileId, customViews, activeViewId, injectedViewIds]);

  // La notación de la vista built-in "Modelo" se deriva del documento activo
  // (graphData.notation), no del "ddd" cableado: así un proyecto BPMN se ve como
  // BPMN en su vista principal, sin necesidad de una vista anexa.
  const views = useMemo(() => {
    const docNotation = (graphData?.notation as NotationId | undefined);
    const builtins = BUILTIN_VIEWS.map((v) =>
      v.id === "design" ? { ...v, notation: docNotation ?? v.notation } : v
    );
    return [...builtins, ...customViews];
  }, [customViews, graphData?.notation]);
  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId),
    [views, activeViewId]
  );
  const injectedViews = useMemo(
    () => views.filter((v) => injectedViewIds.includes(v.id)),
    [views, injectedViewIds]
  );

  const canCreate = customViews.length < MAX_CUSTOM_VIEWS;
  const canInjectMore = injectedViewIds.length < MAX_INJECTED_VIEWS;

  // Navegación explícita (pestañas): reinicia el drill-down.
  const setActiveView = useCallback((id: string) => {
    setDrillStack([]);
    setActiveViewId(id);
  }, []);

  const enterView = useCallback(
    (childId: string) => {
      setDrillStack((prev) => [...prev, activeViewId]);
      setActiveViewId(childId);
    },
    [activeViewId]
  );

  const goToDrill = useCallback(
    (index: number) => {
      const full = [...drillStack, activeViewId];
      const target = full[index];
      if (target === undefined) return;
      setDrillStack(full.slice(0, index));
      setActiveViewId(target);
    },
    [drillStack, activeViewId]
  );

  const createView = useCallback<ViewsContextType["createView"]>(
    (opts) => {
      if (customViews.length >= MAX_CUSTOM_VIEWS) {
        toast({
          variant: "destructive",
          title: "Límite de vistas",
          description: `Máximo ${MAX_CUSTOM_VIEWS} vistas custom.`,
        });
        return null;
      }
      const n = customViews.length + 1;
      const name = opts?.name?.trim() || `Vista ${n}`;
      const kind: ViewKind = opts?.kind ?? "graph";
      // Vista Mermaid: no lleva grafo; lleva código Mermaid libre.
      const isMermaid = kind === "mermaid";
      const view: DesignView = {
        id: uid(),
        name,
        kind,
        notation: opts?.notation ?? INITIAL_NOTATION_ID,
        graph: isMermaid ? undefined : opts?.graph ?? emptyGraphData(name, new Date().toISOString().slice(0, 10)),
        mermaidCode: isMermaid ? opts?.mermaidCode ?? DEFAULT_MERMAID_CODE : undefined,
        description: opts?.description,
        createdAt: nowIso(),
      };
      setCustomViews((prev) => [...prev, view]);
      // activate por defecto; al crear una sub-vista embebida se omite para no
      // desmontar el lienzo actual antes de persistir el viewRef del nodo.
      if (opts?.activate !== false) {
        setDrillStack([]);
        setActiveViewId(view.id);
      }
      return view.id;
    },
    [customViews.length, toast]
  );

  // Clona una vista a una NUEVA vista custom editable. Sirve para vistas custom
  // (incl. las generadas por agregado) y para el built-in "Modelo" (clona el
  // grafo del proyecto activo). Deep-clone del grafo para no compartir referencias.
  const cloneView = useCallback(
    (id: string): string | null => {
      if (customViews.length >= MAX_CUSTOM_VIEWS) {
        toast({
          variant: "destructive",
          title: "Límite de vistas",
          description: `Máximo ${MAX_CUSTOM_VIEWS} vistas custom.`,
        });
        return null;
      }
      const src = [...BUILTIN_VIEWS, ...customViews].find((v) => v.id === id);
      // Vista Mermaid: se clona su código (no tiene grafo).
      if (src?.kind === "mermaid") {
        const existingM = new Set(customViews.map((v) => v.name));
        let mName = `${src.name} (copia)`;
        let k = 2;
        while (existingM.has(mName)) mName = `${src.name} (copia ${k++})`;
        const mView: DesignView = {
          id: uid(),
          name: mName,
          kind: "mermaid",
          notation: src.notation ?? DEFAULT_NOTATION_ID,
          mermaidCode: src.mermaidCode ?? DEFAULT_MERMAID_CODE,
          description: src.description,
          createdAt: nowIso(),
        };
        setCustomViews((prev) => [...prev, mView]);
        setDrillStack([]);
        setActiveViewId(mView.id);
        return mView.id;
      }
      const sourceGraph: GraphData | undefined =
        (src as any)?.graph ?? (id === "design" ? graphData ?? undefined : undefined);
      if (!sourceGraph) {
        toast({
          variant: "destructive",
          title: "No se puede clonar",
          description: "Esta vista no tiene un grafo editable para clonar.",
        });
        return null;
      }
      const baseName = src?.name ?? "Vista";
      const existing = new Set(customViews.map((v) => v.name));
      let name = `${baseName} (copia)`;
      let i = 2;
      while (existing.has(name)) name = `${baseName} (copia ${i++})`;
      let graph: GraphData;
      try {
        graph = JSON.parse(JSON.stringify(sourceGraph));
      } catch {
        graph = sourceGraph;
      }
      const view: DesignView = {
        id: uid(),
        name,
        kind: "graph",
        notation: (src as any)?.notation ?? DEFAULT_NOTATION_ID,
        graph,
        description: (src as any)?.description,
        createdAt: nowIso(),
      };
      setCustomViews((prev) => [...prev, view]);
      setDrillStack([]);
      setActiveViewId(view.id);
      return view.id;
    },
    [customViews, graphData, toast]
  );

  const renameView = useCallback((id: string, name: string) => {
    setCustomViews((prev) =>
      prev.map((v) => (v.id === id ? { ...v, name: name.trim() || v.name } : v))
    );
  }, []);

  const setViewNotation = useCallback((id: string, notation: NotationId) => {
    setCustomViews((prev) =>
      prev.map((v) => (v.id === id ? { ...v, notation } : v))
    );
  }, []);

  const deleteView = useCallback(
    (id: string) => {
      setCustomViews((prev) => prev.filter((v) => v.id !== id));
      setInjectedViewIds((prev) => prev.filter((x) => x !== id));
      setDrillStack((prev) => prev.filter((x) => x !== id));
      setActiveViewId((cur) => (cur === id ? "design" : cur));
    },
    []
  );

  const updateViewGraph = useCallback((id: string, graph: GraphData) => {
    setCustomViews((prev) => prev.map((v) => (v.id === id ? { ...v, graph } : v)));
  }, []);

  const updateViewMermaid = useCallback((id: string, code: string) => {
    setCustomViews((prev) => prev.map((v) => (v.id === id ? { ...v, mermaidCode: code } : v)));
  }, []);

  const moveCustomView = useCallback((draggedId: string, targetId: string) => {
    setCustomViews((prev) => {
      const from = prev.findIndex((v) => v.id === draggedId);
      const to = prev.findIndex((v) => v.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const toggleInject = useCallback(
    (id: string) => {
      setInjectedViewIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= MAX_INJECTED_VIEWS) {
          toast({
            variant: "destructive",
            title: "Límite de contexto",
            description: `Máximo ${MAX_INJECTED_VIEWS} vistas inyectadas a la vez.`,
          });
          return prev;
        }
        return [...prev, id];
      });
    },
    [toast]
  );

  const clearInjected = useCallback(() => setInjectedViewIds([]), []);

  const value: ViewsContextType = {
    views,
    customViews,
    activeViewId,
    activeView,
    injectedViewIds,
    injectedViews,
    canCreate,
    canInjectMore,
    drillStack,
    setActiveView,
    enterView,
    goToDrill,
    createView,
    cloneView,
    renameView,
    setViewNotation,
    deleteView,
    updateViewGraph,
    updateViewMermaid,
    moveCustomView,
    toggleInject,
    clearInjected,
  };

  return <ViewsContext.Provider value={value}>{children}</ViewsContext.Provider>;
}
