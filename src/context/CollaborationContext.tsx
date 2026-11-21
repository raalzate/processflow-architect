"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useGraphContext } from "./GraphContext";
import { useViews } from "./ViewsContext";
import { useAgent } from "./AgentContext";
import { useReference } from "./ReferenceContext";
import { Projection } from "@/lib/collaboration/projection";
import type { Presence, PresenceInput } from "@/lib/collaboration/presence";
import { hostBridge } from "@/lib/host-bridge";
import { emptyGraphData } from "@/components/graph/designer/serialize";
import type {
  CollaborationCommand,
  CollaborationResult,
  CollaborationStatus,
  Role,
  RoomOptions,
  SharedProject,
} from "@/lib/collaboration/types";
import type { CollaborationWorkspace } from "@/lib/collaboration/types";
import { canEditBranch, type HistoryAction, type Choices } from "@/lib/collaboration/history";
import { writeStoredViews } from "./ViewsContext";
import { writeStoredReferences } from "./ReferenceContext";
import { writeStoredSharedArtifacts } from "./AgentContext";
import { useToast } from "@/hooks/use-toast";
import { canExportShared, type LeasePolicy } from "@/lib/collaboration/lease";
import { purgeBorrowedStorage } from "@/lib/collaboration/borrowed-storage";
import { EXPORT_DENIED_MESSAGE, setExportDeniedNotifier, setExportRule } from "@/lib/export-gate";
import type { CollaborationPurge, PurgeReason } from "@/lib/collaboration/types";

const PURGE_MESSAGES: Record<PurgeReason, string> = {
  left: "Saliste del proyecto compartido: su copia se eliminó de este equipo.",
  revoked: "El anfitrión revocó tu acceso: la copia del proyecto se eliminó de este equipo.",
  expired: "El anfitrión no respondió dentro del plazo del préstamo: la copia se eliminó de este equipo.",
};

interface CollaborationContextValue {
  workspace?: CollaborationWorkspace;
  branchId: string;
  previewCommitId?: string;
  readOnly: boolean;
  /** La copia es prestada y el anfitrión no responde: el contenido se oculta (#756). */
  locked: boolean;
  /** Exportar o sacar contenido del proyecto activo: siempre en uno propio, con permiso en uno prestado. */
  canExport: boolean;
  /** Proyectos del catálogo que son copias prestadas sin permiso de exportar: nada los lee hacia fuera. */
  sealedFileIds: readonly string[];
  setPolicy: (policy: LeasePolicy) => Promise<void>;
  selectBranch: (id: string) => Promise<void>;
  previewVersion: (id?: string) => Promise<void>;
  historyAction: (action: HistoryAction, expectedVector?: string) => Promise<void>;
  previewMerge: (
    branchId: string,
    commitId: string,
    scopes: string[],
    choices?: Choices,
  ) => Promise<CollaborationResult>;
  available: boolean;
  status?: CollaborationStatus;
  busy: boolean;
  pending: number;
  peers: Presence[];
  displayName: string;
  setDisplayName: (name: string) => void;
  publishPresence: (presence: Omit<PresenceInput, "name">) => void;
  error?: string;
  create: (options: RoomOptions) => Promise<void>;
  join: (invitation: string) => Promise<void>;
  invite: (role: Role) => Promise<string>;
  retry: () => Promise<void>;
  leave: () => Promise<void>;
  recover: () => Promise<string>;
  revoke: (memberId: string) => Promise<void>;
  refreshLink: (invitation: string) => Promise<void>;
  resolveFieldConflict: (editId: string, keep: "current" | "discarded") => Promise<void>;
  repairConnection: (viewId: string, edgeId: string, sourceId?: string, targetId?: string) => Promise<void>;
}
const CollaborationContext = createContext<CollaborationContextValue | undefined>(undefined);
export function useCollaboration() {
  return useContext(CollaborationContext);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Coordinates shared snapshots; native service diffs fields, never whole files. */
export function CollaborationProvider({ children }: { children: React.ReactNode }) {
  const graph = useGraphContext(),
    views = useViews(),
    agent = useAgent(),
    reference = useReference();
  const [status, setStatus] = useState<CollaborationStatus>();
  const [workspace, setWorkspace] = useState<CollaborationWorkspace>();
  const [branchId, setBranchId] = useState("shared"),
    [previewCommitId, setPreviewCommitId] = useState<string>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const [pending, setPending] = useState(0),
    [peers, setPeers] = useState<Presence[]>([]);
  const [displayName, setDisplayNameState] = useState("Participante");
  const [sessionId] = useState(() => crypto.randomUUID());
  const { toast } = useToast();
  const [sealedFileIds, setSealedFileIds] = useState<string[]>([]);
  const refreshSealed = useCallback(() => {
    void hostBridge()
      ?.collaborationCommand?.({ type: "borrowed", fileId: "" })
      .then(r => setSealedFileIds(r.sealed ?? []))
      .catch(() => {});
  }, []);
  const latestPresence = useRef<Omit<PresenceInput, "name"> | undefined>(undefined);
  const lastPublishedPresence = useRef<{ fileId: string; value: PresenceInput } | undefined>(undefined);
  const queues = useRef(new Map<string, Projection<SharedProject>>());
  const binding = useRef<
    | {
        fileId: string;
        branchId: string;
        previewCommitId?: string;
        projection: Projection<SharedProject>;
        ready: boolean;
      }
    | undefined
  >(undefined);
  const file = graph.savedFiles.find(f => f.id === graph.currentFileId);
  const project: SharedProject | undefined = file
    ? {
        name: file.name,
        content: file.content,
        customViews: views.customViews,
        references: reference.docs,
        agent: { versions: agent.versions, lineages: agent.lineages, artifacts: agent.artifacts },
        analysis: {
          driversResult: file.driversResult,
          constraintsResult: file.constraintsResult,
          roadmapResult: file.roadmapResult,
          proposalResult: file.proposalResult,
        },
      }
    : undefined;
  const current = useRef({
    graph,
    views,
    agent,
    reference,
    project,
    status,
    displayName,
    workspace,
    branchId,
    previewCommitId,
  });
  current.current = {
    graph,
    views,
    agent,
    reference,
    project,
    status,
    displayName,
    workspace,
    branchId,
    previewCommitId,
  };
  const selectionFile = useRef(graph.currentFileId);
  useLayoutEffect(() => {
    if (selectionFile.current === graph.currentFileId) return;
    selectionFile.current = graph.currentFileId;
    binding.current?.projection.detach();
    binding.current = undefined;
    try { setBranchId(localStorage.getItem(`collaboration-branch:${graph.currentFileId}`) || "shared"); } catch { setBranchId("shared"); }
    setPreviewCommitId(undefined);
    setWorkspace(undefined);
    setStatus(undefined);
    graph.setSharedStorageScope?.();
  }, [graph.currentFileId, graph.setSharedStorageScope]);
  const locked = !!status && !status.owner && status.lease?.state !== "active";
  const readOnly =
    !!status &&
    (locked ||
      status.role === "viewer" ||
      !status.initialized ||
      !status.saved ||
      !!previewCommitId ||
      (!!workspace &&
        !canEditBranch(workspace.history, branchId, workspace.actor, new Date().toISOString())));
  const apply = useCallback((snapshot: SharedProject) => {
    const { graph: g, views: v, agent: a, reference: r } = current.current;
    if (!g.currentFileId) return;
    const existing = current.current.project;
    if (
      !same(existing?.content, snapshot.content) ||
      !same(existing?.analysis, snapshot.analysis) ||
      existing?.name !== snapshot.name
    )
      g.applySharedFile(g.currentFileId, {
        name: snapshot.name,
        content: snapshot.content,
        driversResult: snapshot.analysis.driversResult,
        constraintsResult: snapshot.analysis.constraintsResult,
        roadmapResult: snapshot.analysis.roadmapResult,
        proposalResult: snapshot.analysis.proposalResult,
      });
    if (!same(v.customViews, snapshot.customViews)) v.replaceSharedViews(snapshot.customViews);
    if (!same(r.docs, snapshot.references)) r.replaceSharedReferences(snapshot.references);
    if (!same(existing?.agent, snapshot.agent)) a.replaceSharedArtifacts(snapshot.agent);
  }, []);
  const selectedResult = useCallback((result: CollaborationResult) => {
    const active = current.current,
      w = result.workspace;
    if (w) {
      setWorkspace(w);
      const scope = `${active.graph.currentFileId}::${active.previewCommitId ? `version:${active.previewCommitId}` : active.branchId}`;
      active.graph.setSharedStorageScope?.(scope, w.snapshots.main);
      // El catálogo individual sigue mostrando Principal; los borradores se guardan en su rama nativa.
      if (active.graph.currentFileId && w.snapshots.main) {
        const main = w.snapshots.main;
        writeStoredViews(active.graph.currentFileId, {
          customViews: main.customViews,
          activeViewId: "design",
          injectedViewIds: [],
        });
        writeStoredReferences(active.graph.currentFileId, main.references);
        writeStoredSharedArtifacts(active.graph.currentFileId, main.agent);
      }
      return active.previewCommitId
        ? w.history.commits.find(c => c.id === active.previewCommitId)?.snapshot
        : w.snapshots[active.branchId];
    }
    return active.previewCommitId || active.branchId !== "shared" ? undefined : result.snapshot;
  }, []);
  useEffect(() => {
    try {
      setDisplayNameState(localStorage.getItem("collaboration-display-name") || "Participante");
    } catch {
      /* local preference */
    }
  }, []);
  useEffect(() => {
    if (status) graph.setSharedReadOnly(status.fileId, readOnly, readOnly || (!status.owner && branchId === "main"));
  }, [status?.fileId, status?.owner, branchId, readOnly, graph.setSharedReadOnly]);
  useEffect(() => {
    const host = hostBridge(),
      id = graph.currentFileId;
    binding.current?.projection.detach();
    binding.current = undefined;
    setPeers([]);
    setPending(0);
    setError(undefined);
    if (!host?.collaborationCommand || !id) return;
    let cancelled = false;
    const active = () =>
      !cancelled &&
      current.current.graph.currentFileId === id &&
      current.current.branchId === branchId &&
      current.current.previewCommitId === previewCommitId;
    const previous = queues.current.get(id);
    const projection = new Projection<SharedProject>(
      () => (active() ? current.current.project : undefined),
      snapshot => {
        if (active()) apply(snapshot);
      },
      async (before, after) => {
        if (current.current.previewCommitId) return current.current.project;
        const result = await host.collaborationCommand!({
          type: "patch",
          fileId: id,
          before,
          after,
          branchId,
        });
        if (active() && result.status) setStatus(result.status);
        if (result.error) throw new Error(result.error);
        return active() ? selectedResult(result) : undefined;
      },
      e => {
        if (active()) setError(e instanceof Error ? e.message : String(e));
      },
      count => {
        if (active()) setPending(count);
      },
    );
    const session = { fileId: id, branchId, previewCommitId, projection, ready: false };
    binding.current = session;
    queues.current.set(id, projection);
    const timer = setTimeout(() => {
      void (async () => {
        await previous?.settled();
        if (!active()) return;
        const initial = current.current.project;
        if (!initial) return;
        const result = await host.collaborationCommand!({
          type: "open",
          fileId: id,
          initial,
          name: current.current.displayName,
        });
        if (!active()) return;
        if (result.status) setStatus(result.status);
        if (result.error) setError(result.error);
        const snapshot = selectedResult(result);
        if (snapshot) projection.initialize(snapshot);
        if (!result.status) {
          setStatus(undefined);
          setWorkspace(undefined);
          current.current.graph.setSharedStorageScope?.();
        }
        session.ready = true;
      })().catch(e => {
        if (active()) setError(String(e));
      });
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      projection.detach();
    };
  }, [graph.currentFileId, branchId, previewCommitId, apply, selectedResult]);
  useEffect(
    () =>
      hostBridge()?.onCollaborationEvent?.(event => {
        const session = binding.current;
        if (
          !session ||
          event.fileId !== session.fileId ||
          event.fileId !== current.current.graph.currentFileId
        )
          return;
        if (event.presence) setPeers(event.presence.filter(peer => peer.sessionId !== sessionId));
        if (event.status) setStatus(event.status);
        if (event.error) setError(event.error);
        const snapshot = selectedResult(event);
        if (
          snapshot &&
          session.ready &&
          session.branchId === current.current.branchId &&
          session.previewCommitId === current.current.previewCommitId
        )
          session.projection.receive(snapshot);
      }),
    [sessionId, selectedResult],
  );
  useLayoutEffect(() => {
    const session = binding.current;
    if (
      selectionFile.current === graph.currentFileId &&
      session?.ready &&
      session.branchId === branchId &&
      session.previewCommitId === previewCommitId &&
      session.fileId === graph.currentFileId &&
      project &&
      status?.role === "editor" &&
      !readOnly
    )
      session.projection.observe(project);
  });
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (pending || status?.saved === false) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [pending, status?.saved]);

  // Quitar la copia prestada del catálogo y todo su rastro local. El main ya borró el historial.
  const removeBorrowed = useCallback(
    (fileId: string, reason: PurgeReason) => {
      const g = current.current.graph;
      if (g.savedFiles.some(f => f.id === fileId)) g.handleFileDelete(fileId);
      try {
        purgeBorrowedStorage(localStorage, fileId);
      } catch {
        /* sin almacenamiento local no queda rastro que quitar */
      }
      toast({ title: "Copia compartida eliminada", description: PURGE_MESSAGES[reason] });
      refreshSealed();
    },
    [toast, refreshSealed],
  );
  // Toda descarga del renderer consulta esta regla (src/lib/export-gate.ts).
  const exportOk = canExportShared(status) && !sealedFileIds.includes(graph.currentFileId ?? "");
  const exportOkRef = useRef(exportOk);
  exportOkRef.current = exportOk;
  useEffect(() => {
    const quitarRegla = setExportRule(() => exportOkRef.current);
    const quitarAviso = setExportDeniedNotifier(() =>
      toast({ variant: "destructive", title: "Exportación no permitida", description: EXPORT_DENIED_MESSAGE }),
    );
    return () => {
      quitarRegla();
      quitarAviso();
    };
  }, [toast]);
  // La política puede cambiar en cualquier sincronización; el vínculo, al unirse o salir.
  useEffect(refreshSealed, [refreshSealed, status?.fileId, status?.lease?.policy.allowExport]);
  useEffect(() => {
    const host = hostBridge();
    if (!host?.collaborationCommand) return;
    // El main olvida una purga sólo cuando la copia ya salió del catálogo: si la app se
    // cierra en medio, al arrancar se vuelve a aplicar en vez de dejar un proyecto huérfano.
    const apply = (purges: CollaborationPurge[] = []) => {
      if (!purges.length) return;
      for (const p of purges) removeBorrowed(p.fileId, p.reason);
      void host.collaborationCommand!({ type: "ack-purges", fileId: "", fileIds: purges.map(p => p.fileId) }).catch(
        () => {},
      );
    };
    void host
      .collaborationCommand({ type: "take-purges", fileId: "" })
      .then(r => apply(r.purges))
      .catch(() => {});
    return host.onCollaborationEvent?.(event => {
      if (event.sealed) setSealedFileIds(event.sealed);
      apply(event.purges);
    });
  }, [removeBorrowed]);
  const run = useCallback(
    async (command: CollaborationCommand) => {
      const host = hostBridge();
      if (!host?.collaborationCommand)
        throw new Error("La colaboración requiere la aplicación de escritorio.");
      setBusy(true);
      setError(undefined);
      try {
        await queues.current.get(command.fileId)?.settled();
        const result = await host.collaborationCommand(command);
        if (result.error) throw new Error(result.error);
        if (current.current.graph.currentFileId === command.fileId) {
          if (result.status) setStatus(result.status);
          const session = binding.current;
          const snapshot = selectedResult(result);
          if (snapshot && session?.fileId === command.fileId) session.projection.receive(snapshot);
        }
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [selectedResult],
  );
  const publishPresence = useCallback(
    (presence: Omit<PresenceInput, "name">) => {
      const id = graph.currentFileId;
      latestPresence.current = { ...presence, branchId: current.current.branchId };
      if (id && current.current.status && !current.current.previewCommitId)
        hostBridge()?.collaborationPresence?.(id, {
          ...presence,
          name: current.current.displayName,
          sessionId,
          branchId: current.current.branchId,
        });
    },
    [graph.currentFileId, sessionId],
  );
  useEffect(() => {
    const depart = () => {
      const previous = lastPublishedPresence.current;
      if (previous) hostBridge()?.collaborationPresence?.(previous.fileId, { ...previous.value, pointer: null, selectedIds: [], moving: [], connecting: undefined, leaving: true });
      lastPublishedPresence.current = undefined;
    };
    window.addEventListener("beforeunload", depart);
    return () => { window.removeEventListener("beforeunload", depart); depart(); };
  }, [graph.currentFileId]);
  useEffect(() => {
    if (!status) return;
    const publish = () => {
      const active = current.current; if (!active.status || active.previewCommitId || !active.graph.currentFileId) return;
      const viewId = active.views.activeView?.id ?? "design", previous = latestPresence.current;
      const sameView = previous?.viewId === viewId && previous?.branchId === active.branchId;
      const presence = sameView ? previous : { viewId, pointer: null, selectedIds: [] };
      const value = { ...presence, viewId, branchId: active.branchId, name: active.displayName, sessionId };
      lastPublishedPresence.current = { fileId: active.graph.currentFileId, value };
      hostBridge()?.collaborationPresence?.(active.graph.currentFileId, value);
    };
    publish(); const timer = setInterval(publish, 2500); return () => clearInterval(timer);
  }, [status?.fileId, branchId, views.activeView?.id, previewCommitId, sessionId]);
  const value: CollaborationContextValue = {
    workspace,
    branchId,
    previewCommitId,
    readOnly,
    locked,
    canExport: exportOk,
    sealedFileIds,
    setPolicy: async policy => {
      await run({ type: "policy", fileId: current.current.graph.currentFileId!, policy });
    },
    selectBranch: async id => {
      await queues.current.get(current.current.graph.currentFileId!)?.settled();
      setPreviewCommitId(undefined);
      setBranchId(id);
      try { localStorage.setItem(`collaboration-branch:${current.current.graph.currentFileId}`, id); } catch { /* preferencia local */ }
    },
    previewVersion: async id => {
      await queues.current.get(current.current.graph.currentFileId!)?.settled();
      setPreviewCommitId(id);
    },
    historyAction: async (action, expectedVector) => {
      await run({
        type: "history",
        fileId: current.current.graph.currentFileId!,
        name: current.current.displayName,
        action,
        expectedVector,
      });
    },
    previewMerge: async (target, commitId, scopes, choices) =>
      run({
        type: "history-preview",
        fileId: current.current.graph.currentFileId!,
        branchId: target,
        commitId,
        scopes,
        choices,
      }),
    available: !!hostBridge()?.collaborationCommand && !!hostBridge()?.onCollaborationEvent,
    status,
    busy,
    pending,
    error,
    peers: previewCommitId ? [] : peers.filter(p => (p.branchId ?? "shared") === branchId),
    displayName,
    setDisplayName: name => {
      setDisplayNameState(name);
      try {
        localStorage.setItem("collaboration-display-name", name);
      } catch {
        /* local preference */
      }
    },
    publishPresence,
    create: async options => {
      const p = current.current.project,
        id = current.current.graph.currentFileId;
      if (p && id) {
        const result = await run({
          type: "create",
          fileId: id,
          initial: p,
          options,
          name: current.current.displayName,
        });
        if (result.snapshot && binding.current?.fileId === id && current.current.graph.currentFileId === id)
          binding.current.projection.initialize(result.snapshot);
      }
    },
    join: async invitation => {
      const { graph: g } = current.current;
      // Joining creates a distinct local project; never overwrite an existing one.
      const id = g.handleCreateProjectFromContent(
        "Proyecto compartido",
        emptyGraphData("Proyecto compartido", new Date().toISOString()),
      );
      if (!id) throw new Error("No se pudo crear la copia local.");
      const result = await run({ type: "join", fileId: id, invitation, name: current.current.displayName });
      // Provider selection/hydration opens the persisted link and applies its state.
      if (result.status && current.current.graph.currentFileId === id) setStatus(result.status);
      const initial = current.current.project;
      if (initial && current.current.graph.currentFileId === id) {
        const reopened = await run({ type: "open", fileId: id, initial, name: current.current.displayName });
        if (reopened.snapshot && binding.current?.fileId === id && current.current.graph.currentFileId === id)
          binding.current.projection.initialize(reopened.snapshot);
      }
    },
    invite: async role =>
      (await run({ type: "invite", fileId: current.current.graph.currentFileId!, role })).invitation ?? "",
    retry: async () => {
      await run({ type: "retry", fileId: current.current.graph.currentFileId! });
    },
    leave: async () => {
      const id = current.current.graph.currentFileId!,
        borrowed = !!current.current.status && !current.current.status.owner;
      await run({ type: "leave", fileId: id });
      if (borrowed) {
        // Salir es devolver el préstamo: la copia no se libera, se elimina.
        setStatus(undefined);
        setWorkspace(undefined);
        removeBorrowed(id, "left");
        return;
      }
      current.current.graph.setSharedReadOnly(id, false);
      current.current.graph.setSharedStorageScope?.();
      setStatus(undefined);
      setWorkspace(undefined);
      setBranchId("shared");
      setPreviewCommitId(undefined);
      setPeers([]);
    },
    recover: async () =>
      (await run({ type: "recover", fileId: current.current.graph.currentFileId! })).recovery ?? "",
    revoke: async memberId => {
      await run({ type: "revoke", fileId: current.current.graph.currentFileId!, memberId });
    },
    refreshLink: async invitation => {
      await run({ type: "refresh-link", fileId: current.current.graph.currentFileId!, invitation });
    },
    resolveFieldConflict: async (editId, keep) => {
      await run({
        type: "resolve-field-conflict",
        fileId: current.current.graph.currentFileId!,
        editId,
        keep,
        branchId: current.current.branchId,
      });
    },
    repairConnection: async (viewId, edgeId, sourceId, targetId) => { await run({ type: "repair-connection", fileId: current.current.graph.currentFileId!, branchId: current.current.branchId, viewId, edgeId, sourceId, targetId }); },
  };
  return <CollaborationContext.Provider value={value}>{children}</CollaborationContext.Provider>;
}
