"use client";

/**
 * @fileOverview Estado del Agente de Arquitectura: chat (ReAct), artefactos y versiones.
 *
 * Aislado de GraphDataProvider: persiste por proyecto en localStorage
 * (clave `agent_state_<fileId>`). Lee apiKey/modelName/graphData del GraphContext.
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
import { useViews } from "@/context/ViewsContext";
import { useToast } from "@/hooks/use-toast";
import { runLitertAgent } from "@/lib/ai/litert-agent";
import { safeGraphToToon } from "@/lib/ai/graph-toon";
import { extractDocumentText } from "@/lib/ai/document-extract";
import { getSelectedLitertModelFile } from "@/lib/litert-models";
import { getGenerationConfig } from "@/lib/ai-config";
import type {
  Artifact,
  ArtifactVersion,
  ChatMessage,
  AgentArtifact,
  AgentDocument,
  ReactAgentOutput,
} from "@/lib/agent-types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}_${performance.now()}`;

const nowIso = () => new Date().toISOString();

interface AgentState {
  versions: ArtifactVersion[];
  artifacts: Artifact[];
  messages: ChatMessage[];
  activeVersionId?: string;
}

function storageKey(fileId: string) {
  return `agent_state_${fileId}`;
}

function loadState(fileId: string): AgentState {
  try {
    const raw = localStorage.getItem(storageKey(fileId));
    if (raw) return JSON.parse(raw) as AgentState;
  } catch {
    /* ignore */
  }
  const v: ArtifactVersion = { id: uid(), label: "v1", createdAt: nowIso() };
  return { versions: [v], artifacts: [], messages: [] };
}

/** Serializa un artefacto a texto plano para inyectarlo como contexto. */
export function artifactToText(a: Artifact): string {
  if (a.render === "markdown") return a.payload?.markdown ?? "";
  if (a.render === "mermaid") return "```mermaid\n" + (a.payload?.code ?? "") + "\n```";
  try {
    return JSON.stringify(a.payload, null, 2).slice(0, 6000);
  } catch {
    return "";
  }
}

/** Serializa una vista del diseñador a texto plano para inyectarla como contexto. */
function viewToContext(view: any): { kind: string; title: string; content: string } {
  const notation = (view.notation ?? "ddd") as string;
  let content = "";
  if (view.kind === "graph") {
    try {
      // TOON en vez de JSON: menos tokens y sin geometría del lienzo (graph-toon.ts).
      // safe*: si el grafo viniera mal formado, degrada a JSON en vez de romper.
      content =
        `Notación / grupo de componentes: ${notation}.\n` +
        "Grafo de la vista (formato TOON):\n" +
        safeGraphToToon(view.graph ?? {}).slice(0, 8000);
    } catch {
      content = "";
    }
  }
  // El kind incluye la notación para que el agente sepa en qué grupo está modelada.
  return { kind: `view:${notation}`, title: `${view.name} [${notation.toUpperCase()}]`, content };
}

export interface AgentContextType {
  versions: ArtifactVersion[];
  activeVersionId: string;
  artifacts: Artifact[]; // todos
  versionArtifacts: Artifact[]; // de la versión activa
  messages: ChatMessage[];
  busy: boolean;
  contextArtifactIds: string[];
  attachments: AgentDocument[];

  sendMessage: (text: string) => Promise<void>;
  deleteArtifact: (id: string) => void;
  clearVersionArtifacts: () => void;
  createVersion: (label?: string) => void;
  setActiveVersion: (id: string) => void;
  toggleContextArtifact: (id: string) => void;
  clearContextArtifacts: () => void;
  clearChat: () => void;
  addAttachments: (docs: AgentDocument[]) => void;
  removeAttachment: (name: string) => void;
  clearAttachments: () => void;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export const useAgent = () => {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent debe usarse dentro de AgentProvider");
  return ctx;
};

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const { currentFileId, graphData } = useGraphContext();
  const { views, injectedViews } = useViews();
  const { toast } = useToast();

  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [contextArtifactIds, setContextArtifactIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AgentDocument[]>([]);

  const addAttachments = useCallback((docs: AgentDocument[]) => {
    setAttachments((prev) => {
      const names = new Set(prev.map((d) => d.name));
      return [...prev, ...docs.filter((d) => !names.has(d.name))];
    });
  }, []);

  const removeAttachment = useCallback(
    (name: string) => setAttachments((prev) => prev.filter((d) => d.name !== name)),
    []
  );

  const clearAttachments = useCallback(() => setAttachments([]), []);

  // Cargar estado al cambiar de proyecto.
  useEffect(() => {
    if (!currentFileId) {
      setVersions([]);
      setActiveVersionId("");
      setArtifacts([]);
      setMessages([]);
      setContextArtifactIds([]);
      setAttachments([]);
      return;
    }
    const s = loadState(currentFileId);
    setVersions(s.versions);
    // Restaura la versión activa guardada si sigue existiendo; si no, la última.
    const savedActive =
      s.activeVersionId && s.versions.some((v) => v.id === s.activeVersionId)
        ? s.activeVersionId
        : s.versions[s.versions.length - 1]?.id ?? "";
    setActiveVersionId(savedActive);
    setArtifacts(s.artifacts);
    setMessages(s.messages);
    setContextArtifactIds([]);
    setAttachments([]);
  }, [currentFileId]);

  // Persistir.
  useEffect(() => {
    if (!currentFileId) return;
    try {
      localStorage.setItem(
        storageKey(currentFileId),
        JSON.stringify({ versions, artifacts, messages, activeVersionId } as AgentState)
      );
    } catch {
      /* ignore quota */
    }
  }, [currentFileId, versions, artifacts, messages, activeVersionId]);

  const versionArtifacts = useMemo(
    () => artifacts.filter((a) => a.versionId === activeVersionId),
    [artifacts, activeVersionId]
  );

  const updateTokenUsage = useCallback((tokens?: number) => {
    if (!tokens) return;
    const current = parseInt(localStorage.getItem("token_usage") || "0", 10);
    localStorage.setItem("token_usage", String(current + tokens));
  }, []);

  const createVersion = useCallback(
    (label?: string) => {
      const v: ArtifactVersion = {
        id: uid(),
        label: label?.trim() || `v${versions.length + 1}`,
        createdAt: nowIso(),
      };
      setVersions((prev) => [...prev, v]);
      setActiveVersionId(v.id);
    },
    [versions.length]
  );

  const setActiveVersion = useCallback((id: string) => setActiveVersionId(id), []);

  const deleteArtifact = useCallback((id: string) => {
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
    setContextArtifactIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const clearVersionArtifacts = useCallback(() => {
    setArtifacts((prev) => prev.filter((a) => a.versionId !== activeVersionId));
  }, [activeVersionId]);

  const toggleContextArtifact = useCallback((id: string) => {
    setContextArtifactIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const clearContextArtifacts = useCallback(() => setContextArtifactIds([]), []);

  const clearChat = useCallback(() => setMessages([]), []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const api = (window as any).electronAPI;
      // El motor LiteRT-LM corre en el renderer (WebGPU) y carga el modelo .litertlm
      // local vía el protocolo litert-model:// (solo en la app de escritorio).
      if (!api) {
        toast({
          variant: "destructive",
          title: "No disponible",
          description: "El agente sólo está disponible en la app de escritorio.",
        });
        return;
      }

      const usedContextIds = [...contextArtifactIds];
      const usedDocs = [...attachments];
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        createdAt: nowIso(),
        contextArtifactIds: usedContextIds.length ? usedContextIds : undefined,
        attachments: usedDocs.length
          ? usedDocs.map((d) => ({ name: d.name, contentType: d.contentType }))
          : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setBusy(true);

      // Fuera del try para que el catch pueda convertir el placeholder en error.
      const assistantId = uid();
      try {
        const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
        const artifactContext = artifacts
          .filter((a) => usedContextIds.includes(a.id))
          .map((a) => ({ kind: a.kind, title: a.title, content: artifactToText(a) }));
        // Vistas inyectadas (pin en la barra inferior) → contexto del agente.
        const viewContext = injectedViews
          .map((v) => viewToContext(v))
          .filter((c) => c.content.trim());
        const contextArtifacts = [...artifactContext, ...viewContext];
        // Notaciones de las vistas inyectadas → marco de razonamiento del agente
        // (BPMN/C4/UML/DDD). Sin vistas inyectadas → el agente asume DDD.
        const injectedNotations = Array.from(
          new Set(injectedViews.map((v) => (v.notation ?? "ddd") as string))
        );

        // Adjuntos → texto (PDF/imagen con OCR / texto) como contexto del agente.
        const documents: { name: string; text: string }[] = [];
        for (const d of usedDocs) {
          const text = await extractDocumentText(d);
          if (text.trim()) documents.push({ name: d.name, text });
        }

        // Placeholder del assistant: se inserta vacío ANTES de generar para poder
        // ir volcando el texto en vivo (streaming) a medida que el modelo escribe.
        let streamed = "";
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", createdAt: nowIso() },
        ]);

        // Agente ReAct LOCAL en el renderer (LiteRT-LM / WebGPU). Sin genkit/main.
        const data = await runLitertAgent({
          modelFile: getSelectedLitertModelFile(),
          message: trimmed,
          history,
          graphData: graphData ?? undefined,
          views: views.map((v) => ({ name: v.name, kind: v.kind, notation: v.notation ?? "ddd" })),
          notations: injectedNotations.length ? injectedNotations : undefined,
          contextArtifacts: contextArtifacts.length ? contextArtifacts : undefined,
          documents: documents.length ? documents : undefined,
          systemPrompt: getGenerationConfig().systemPrompt || undefined,
          // Streaming: cada fragmento de la respuesta final se va escribiendo en el
          // mensaje placeholder. Al terminar, se reemplaza por el resultado completo.
          onReplyToken: (chunk) => {
            streamed += chunk;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: streamed } : m))
            );
          },
        });

        // IA 100% local: los errores se muestran como mensaje en el chat, sin redirigir.

        // El flujo captura sus errores y los devuelve como texto con este prefijo.
        const replyIsError =
          !data.artifacts?.length &&
          /^ocurrió un problema al ejecutar el agente/i.test(data.reply ?? "");

        const newArtifacts: Artifact[] = (data.artifacts ?? []).map((a: AgentArtifact) => ({
          id: uid(),
          versionId: activeVersionId,
          kind: a.kind,
          render: a.render,
          title: a.title,
          payload: a.payload,
          createdAt: nowIso(),
          sourceMessageId: assistantId,
          contextArtifactIds: usedContextIds.length ? usedContextIds : undefined,
        }));
        if (newArtifacts.length) setArtifacts((prev) => [...prev, ...newArtifacts]);

        // Finaliza el placeholder con el resultado completo (fuente de verdad:
        // `data.reply` ya parseado; el texto streameado es solo el avance en vivo).
        const finalContent = data.reply || streamed || "Listo.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalContent,
                  steps: data.steps,
                  producedArtifactIds: newArtifacts.map((a) => a.id),
                  error: replyIsError,
                }
              : m
          )
        );
        setContextArtifactIds([]);
        setAttachments([]);
      } catch (err: any) {
        const msg = err?.message || String(err) || "Ocurrió un error al ejecutar el agente.";
        // Reusa el placeholder ya insertado (si existe) convirtiéndolo en error;
        // si el fallo ocurrió antes de insertarlo, lo agrega. Evita mensajes dobles.
        setMessages((prev) => {
          const hasPlaceholder = prev.some((m) => m.id === assistantId);
          const errorMsg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: msg,
            createdAt: nowIso(),
            error: true,
          };
          return hasPlaceholder
            ? prev.map((m) => (m.id === assistantId ? errorMsg : m))
            : [...prev, errorMsg];
        });
        // Local: el error se muestra en el chat; no se redirige a Ajustes.
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      messages,
      artifacts,
      contextArtifactIds,
      attachments,
      graphData,
      currentFileId,
      activeVersionId,
      injectedViews,
      views,
      toast,
      updateTokenUsage,
    ]
  );

  const value: AgentContextType = {
    versions,
    activeVersionId,
    artifacts,
    versionArtifacts,
    messages,
    busy,
    contextArtifactIds,
    attachments,
    sendMessage,
    deleteArtifact,
    clearVersionArtifacts,
    createVersion,
    setActiveVersion,
    toggleContextArtifact,
    clearContextArtifacts,
    clearChat,
    addAttachments,
    removeAttachment,
    clearAttachments,
  };

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}
