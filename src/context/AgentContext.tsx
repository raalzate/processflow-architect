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
import {
  runLitertAgent,
  resumeLitertAgent,
  resolveNotations,
  type ResumeDecision,
} from "@/lib/ai/litert-agent";
import type { Catalog } from "@/lib/ai/agent-retrieval";
import { unknownPlanSources } from "@/lib/ai/agent-run";
import { safeGraphToToon } from "@/lib/ai/graph-toon";
import { extractDocumentText } from "@/lib/ai/document-extract";
import { getSelectedLitertModelFile } from "@/lib/litert-models";
import { getGenerationConfig } from "@/lib/ai-config";
import { DEFAULT_NOTATION_ID } from "@/lib/notations";
import {
  archiveLineage,
  attachToLineage,
  detachArtifact,
  ingestArtifacts,
  lineageHistory,
  lineageOf,
  migrateState,
  purgeLineage,
  resolveContextRevisions,
  restoreRevision,
  visibleArtifacts as visibleByLineage,
  type VersioningDeps,
} from "@/lib/artifacts/versioning";
import type {
  Artifact,
  ArtifactLineage,
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

/** El reloj y los ids que consume la lógica pura de versionado (§P3). */
const versioningDeps: VersioningDeps = { uid, now: nowIso };

interface AgentState {
  versions: ArtifactVersion[];
  lineages: ArtifactLineage[];
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
    if (raw) {
      const parsed = JSON.parse(raw) as AgentState;
      // El estado anterior a 004 no tiene linajes: se normaliza al cargar
      // (idempotente, así que correrlo siempre no cuesta nada).
      const migrado = migrateState(
        { lineages: parsed.lineages ?? [], artifacts: parsed.artifacts ?? [] },
        versioningDeps
      );
      return { ...parsed, ...migrado };
    }
  } catch {
    /* ignore */
  }
  const v: ArtifactVersion = { id: uid(), label: "v1", createdAt: nowIso() };
  return { versions: [v], lineages: [], artifacts: [], messages: [] };
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
  const notation = (view.notation ?? DEFAULT_NOTATION_ID) as string;
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
  lineages: ArtifactLineage[];
  artifacts: Artifact[]; // todas las revisiones
  versionArtifacts: Artifact[]; // todas las del snapshot activo
  visibleArtifacts: Artifact[]; // UNA por linaje: la revisión vigente (lo que ve el panel)
  messages: ChatMessage[];
  busy: boolean;
  contextArtifactIds: string[];
  attachments: AgentDocument[];

  sendMessage: (text: string) => Promise<void>;
  /** Reanuda la corrida del mensaje con la decisión del humano (spec 005). */
  resumeRun: (messageId: string, decision: ResumeDecision) => Promise<void>;
  /** Descarta una corrida en espera sin generar nada. */
  cancelRun: (messageId: string) => void;
  /** Revisiones de un artefacto, ascendente (histórico del linaje). */
  historyOf: (artifactId: string) => Artifact[];
  /** Restaurar = crear una revisión nueva con el contenido de la elegida. */
  restoreArtifactRevision: (artifactId: string) => void;
  /** Borrado definitivo del linaje entero: lo único que destruye histórico. */
  purgeArtifact: (artifactId: string) => void;
  /** Mueve una revisión al linaje de otro artefacto (título cambiado). */
  attachArtifactTo: (artifactId: string, targetArtifactId: string) => void;
  /** Saca una revisión a un linaje propio. */
  detachArtifactRevision: (artifactId: string) => void;
  /** Archiva el linaje (lo que hace el botón de borrar del panel). */
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
  const { views, injectedViews, activeView } = useViews();
  const { toast } = useToast();

  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string>("");
  const [lineages, setLineages] = useState<ArtifactLineage[]>([]);
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
      setLineages([]);
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
    setLineages(s.lineages);
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
        JSON.stringify({ versions, lineages, artifacts, messages, activeVersionId } as AgentState)
      );
    } catch {
      /* ignore quota */
    }
  }, [currentFileId, versions, lineages, artifacts, messages, activeVersionId]);

  /**
   * Catálogo para las herramientas de LECTURA del agente (spec 005): el agente ya
   * no recibe un paquete de contexto armado de antemano, pide lo que necesita. La
   * vista «Modelo» aporta el grafo del proyecto; `pinned` marca lo que el humano
   * ya inyectó a mano para que no se relea.
   */
  const catalog: Catalog = useMemo(() => {
    const pineadas = new Set(injectedViews.map((v) => v.id));
    return {
      views: views.map((v) => ({
        name: v.name,
        notation: (v.notation ?? DEFAULT_NOTATION_ID) as string,
        kind: v.kind,
        graph: v.kind === "design" ? graphData ?? undefined : v.graph,
        mermaidCode: v.mermaidCode,
        pinned: pineadas.has(v.id),
      })),
    };
  }, [views, injectedViews, graphData]);

  const versionArtifacts = useMemo(
    () => artifacts.filter((a) => a.versionId === activeVersionId),
    [artifacts, activeVersionId]
  );

  // Lo que ve el panel: una entrada por linaje (su revisión vigente). El
  // histórico queda a un clic; no compite por espacio en la lista (FR-005).
  const visibleArtifacts = useMemo(
    () => visibleByLineage({ lineages, artifacts }, activeVersionId),
    [lineages, artifacts, activeVersionId]
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

  const historyOf = useCallback(
    (artifactId: string) => {
      const art = artifacts.find((a) => a.id === artifactId);
      return art?.lineageId ? lineageHistory(artifacts, art.lineageId) : art ? [art] : [];
    },
    [artifacts]
  );

  /**
   * Borrar en la UI **archiva**: el artefacto sale de la lista y su histórico
   * queda recuperable (FR-009). Destruir es `purgeArtifact`, con confirmación.
   * Se mantiene el nombre `deleteArtifact` porque es el que llama el panel.
   */
  const deleteArtifact = useCallback(
    (id: string) => {
      const lineage = lineageOf({ lineages, artifacts }, id);
      if (!lineage) {
        // Artefacto sin linaje (estado raro): se retira igual, sin dejar basura.
        setArtifacts((prev) => prev.filter((a) => a.id !== id));
      } else {
        setLineages(archiveLineage({ lineages, artifacts }, lineage.id, versioningDeps).lineages);
      }
      setContextArtifactIds((prev) => prev.filter((x) => x !== id));
    },
    [lineages, artifacts]
  );

  const purgeArtifact = useCallback(
    (id: string) => {
      const lineage = lineageOf({ lineages, artifacts }, id);
      if (!lineage) return;
      const next = purgeLineage({ lineages, artifacts }, lineage.id);
      const purgados = new Set(
        artifacts.filter((a) => a.lineageId === lineage.id).map((a) => a.id)
      );
      setLineages(next.lineages);
      setArtifacts(next.artifacts);
      setContextArtifactIds((prev) => prev.filter((x) => !purgados.has(x)));
    },
    [lineages, artifacts]
  );

  const restoreArtifactRevision = useCallback(
    (artifactId: string) => {
      const next = restoreRevision({ lineages, artifacts }, artifactId, versioningDeps);
      setLineages(next.lineages);
      setArtifacts(next.artifacts);
    },
    [lineages, artifacts]
  );

  const attachArtifactTo = useCallback(
    (artifactId: string, targetArtifactId: string) => {
      const target = lineageOf({ lineages, artifacts }, targetArtifactId);
      if (!target) return;
      const next = attachToLineage({ lineages, artifacts }, artifactId, target.id);
      setLineages(next.lineages);
      setArtifacts(next.artifacts);
    },
    [lineages, artifacts]
  );

  const detachArtifactRevision = useCallback(
    (artifactId: string) => {
      const next = detachArtifact({ lineages, artifacts }, artifactId, versioningDeps);
      setLineages(next.lineages);
      setArtifacts(next.artifacts);
    },
    [lineages, artifacts]
  );

  const clearVersionArtifacts = useCallback(() => {
    setArtifacts((prev) => prev.filter((a) => a.versionId !== activeVersionId));
    setLineages((prev) => prev.filter((l) => l.versionId !== activeVersionId));
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
        // Se inyecta la revisión VIGENTE de cada linaje marcado, una sola vez:
        // marcar la v2 y que llegue la v3 es lo correcto, no un bug (FR-010).
        const resolvedContext = resolveContextRevisions(artifacts, usedContextIds);
        const resolvedContextIds = resolvedContext.map((a) => a.id);
        const artifactContext = resolvedContext.map((a) => ({
          kind: a.kind,
          title: a.revision && a.revision > 1 ? `${a.title} · v${a.revision}` : a.title,
          content: artifactToText(a),
        }));
        // Vistas inyectadas (pin en la barra inferior) → contexto del agente.
        const viewContext = injectedViews
          .map((v) => viewToContext(v))
          .filter((c) => c.content.trim());
        const contextArtifacts = [...artifactContext, ...viewContext];
        // Notación del turno: vistas pineadas > vista activa > notación del
        // documento. Antes solo se miraban las pineadas, así que preguntar sobre
        // un lienzo C4 sin pinear nada hacía razonar al agente en DDD.
        const notations = resolveNotations({
          injected: injectedViews.map((v) => (v.notation ?? "") as string),
          activeNotation: activeView?.notation,
          graphNotation: graphData?.notation,
        });

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
          views: views.map((v) => ({ name: v.name, kind: v.kind, notation: v.notation ?? DEFAULT_NOTATION_ID })),
          // Con catálogo el agente explora por partes y pide aprobación del plan.
          catalog,
          notations: notations.length ? notations : undefined,
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

        // El ingreso decide linaje y revisión (versioning.ts): si el artefacto
        // ya existía, esto es su vN+1 y la anterior queda en el histórico.
        const incoming = (data.artifacts ?? []) as AgentArtifact[];
        const ingested = ingestArtifacts(
          { lineages, artifacts },
          incoming,
          {
            versionId: activeVersionId,
            sourceMessageId: assistantId,
            contextArtifactIds: resolvedContextIds,
          },
          versioningDeps
        );
        const newArtifacts = ingested.created;
        if (newArtifacts.length) {
          setLineages(ingested.lineages);
          setArtifacts(ingested.artifacts);
        }

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
                  // Con `pause`, este mensaje ES la corrida esperando al humano
                  // (plan por aprobar o pregunta por responder).
                  run: data.run?.pause ? data.run : undefined,
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
      lineages,
      contextArtifactIds,
      attachments,
      graphData,
      currentFileId,
      activeVersionId,
      injectedViews,
      views,
      activeView,
      catalog,
      toast,
      updateTokenUsage,
    ]
  );


  /**
   * Reanuda una corrida detenida (el humano aprobó/ajustó el plan, respondió una
   * pregunta o canceló). La conversación con el modelo no se conserva: la memoria
   * de la corrida son sus NOTAS, así que reanudar sobrevive incluso a un reload.
   */
  const resumeRun = useCallback(
    async (messageId: string, decision: ResumeDecision) => {
      if (busy) return;
      const msg = messages.find((m) => m.id === messageId);
      if (!msg?.run) return;

      // Una corrida puede haber sobrevivido a un reload o a un cambio de
      // proyecto. Se valida ACÁ, no al cargar: al cargar, las vistas del
      // proyecto todavía no están y el chequeo cancelaba corridas válidas.
      // Misma regla que al proponer el plan (`unknownPlanSources`).
      const plan = msg.run.pause?.kind === "plan" ? msg.run.pause : null;
      const perdidas = plan ? unknownPlanSources(plan, catalog) : [];
      if (perdidas.length) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  run: undefined,
                  content: `${m.content}\n\n_(corrida cancelada: el proyecto cambió y ya no existe ${perdidas.join(
                    ", "
                  )})_`,
                }
              : m
          )
        );
        return;
      }

      setBusy(true);
      // La pausa se quita YA: la tarjeta desaparece del chat en cuanto se decide.
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, run: undefined } : m))
      );
      const assistantId = uid();
      try {
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", createdAt: nowIso() },
        ]);
        let streamed = "";
        const data = await resumeLitertAgent({
          modelFile: getSelectedLitertModelFile(),
          message: msg.run.goal,
          graphData: graphData ?? undefined,
          catalog,
          run: msg.run,
          resume: decision,
          notations: resolveNotations({
            injected: injectedViews.map((v) => (v.notation ?? "") as string),
            activeNotation: activeView?.notation,
            graphNotation: graphData?.notation,
          }),
          systemPrompt: getGenerationConfig().systemPrompt || undefined,
          onReplyToken: (chunk) => {
            streamed += chunk;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: streamed } : m))
            );
          },
        });

        const ingested = ingestArtifacts(
          { lineages, artifacts },
          (data.artifacts ?? []) as AgentArtifact[],
          { versionId: activeVersionId, sourceMessageId: assistantId },
          versioningDeps
        );
        if (ingested.created.length) {
          setLineages(ingested.lineages);
          setArtifacts(ingested.artifacts);
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: data.reply || streamed || "Listo.",
                  steps: data.steps,
                  producedArtifactIds: ingested.created.map((a) => a.id),
                  run: data.run?.pause ? data.run : undefined,
                }
              : m
          )
        );
      } catch (err: any) {
        const texto = err?.message || String(err) || "Error al reanudar la corrida.";
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: texto, error: true } : m))
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, graphData, catalog, injectedViews, activeView, artifacts, lineages, activeVersionId]
  );

  /** Descarta una corrida en espera sin generar nada (botón «Cancelar»). */
  const cancelRun = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              run: undefined,
              content: `${m.content}\n\n_(cancelado: no se generó ningún artefacto)_`,
            }
          : m
      )
    );
  }, []);

  const value: AgentContextType = {
    versions,
    activeVersionId,
    lineages,
    artifacts,
    versionArtifacts,
    visibleArtifacts,
    messages,
    busy,
    contextArtifactIds,
    attachments,
    sendMessage,
    resumeRun,
    cancelRun,
    historyOf,
    restoreArtifactRevision,
    purgeArtifact,
    attachArtifactTo,
    detachArtifactRevision,
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
