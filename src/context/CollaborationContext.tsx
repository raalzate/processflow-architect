"use client";

import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGraphContext } from "./GraphContext";
import { useViews } from "./ViewsContext";
import { useAgent } from "./AgentContext";
import { useReference } from "./ReferenceContext";
import { Projection } from "@/lib/collaboration/projection";
import type { Presence, PresenceInput } from "@/lib/collaboration/presence";
import { hostBridge } from "@/lib/host-bridge";
import { emptyGraphData } from "@/components/graph/designer/serialize";
import type { CollaborationCommand, CollaborationResult, CollaborationStatus, Role, RoomOptions, SharedProject } from "@/lib/collaboration/types";

interface CollaborationContextValue {
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
}
const CollaborationContext = createContext<CollaborationContextValue | undefined>(undefined);
export function useCollaboration() { return useContext(CollaborationContext); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Coordinates shared snapshots; native service diffs fields, never whole files. */
export function CollaborationProvider({ children }: { children: React.ReactNode }) {
  const graph = useGraphContext(), views = useViews(), agent = useAgent(), reference = useReference();
  const [status, setStatus] = useState<CollaborationStatus>();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const [pending, setPending] = useState(0), [peers, setPeers] = useState<Presence[]>([]);
  const [displayName, setDisplayNameState] = useState("Participante");
  const [sessionId] = useState(() => crypto.randomUUID());
  const queues = useRef(new Map<string, Projection<SharedProject>>());
  const binding = useRef<{ fileId: string; projection: Projection<SharedProject>; ready: boolean } | undefined>(undefined);
  const file = graph.savedFiles.find(f => f.id === graph.currentFileId);
  const project: SharedProject | undefined = file ? { name: file.name, content: file.content, customViews: views.customViews, references: reference.docs,
    agent: { versions: agent.versions, lineages: agent.lineages, artifacts: agent.artifacts },
    analysis: { driversResult: file.driversResult, constraintsResult: file.constraintsResult, roadmapResult: file.roadmapResult, proposalResult: file.proposalResult } } : undefined;
  const current = useRef({ graph, views, agent, reference, project, status, displayName }); current.current = { graph, views, agent, reference, project, status, displayName };
  const apply = useCallback((snapshot: SharedProject) => {
    const { graph: g, views: v, agent: a, reference: r } = current.current;
    if (!g.currentFileId) return;
    const existing = current.current.project;
    if (!same(existing?.content, snapshot.content) || !same(existing?.analysis, snapshot.analysis) || existing?.name !== snapshot.name)
      g.applySharedFile(g.currentFileId, { name: snapshot.name, content: snapshot.content,
        driversResult: snapshot.analysis.driversResult, constraintsResult: snapshot.analysis.constraintsResult,
        roadmapResult: snapshot.analysis.roadmapResult, proposalResult: snapshot.analysis.proposalResult });
    if (!same(v.customViews, snapshot.customViews)) v.replaceSharedViews(snapshot.customViews);
    if (!same(r.docs, snapshot.references)) r.replaceSharedReferences(snapshot.references);
    if (!same(existing?.agent, snapshot.agent)) a.replaceSharedArtifacts(snapshot.agent);
  }, []);
  useEffect(() => {
    try { setDisplayNameState(localStorage.getItem("collaboration-display-name") || "Participante"); } catch { /* local preference */ }
  }, []);
  useEffect(() => {
    if (status) graph.setSharedReadOnly(status.fileId, status.role === "viewer" || status.initialized === false || !status.saved);
  }, [status?.fileId, status?.role, status?.initialized, status?.saved, graph.setSharedReadOnly]);
  useEffect(() => {
    const host = hostBridge(), id = graph.currentFileId;
    binding.current?.projection.detach(); binding.current = undefined;
    setStatus(undefined); setPeers([]); setPending(0); setError(undefined);
    if (!host?.collaborationCommand || !id) return;
    let cancelled = false;
    const active = () => !cancelled && current.current.graph.currentFileId === id;
    const previous = queues.current.get(id);
    const projection = new Projection<SharedProject>(() => active() ? current.current.project : undefined,
      snapshot => { if (active()) apply(snapshot); },
      async (before, after) => {
        const result = await host.collaborationCommand!({ type: "patch", fileId: id, before, after });
        if (active() && result.status) setStatus(result.status);
        if (result.error) throw new Error(result.error);
        return result.snapshot;
      }, e => { if (active()) setError(e instanceof Error ? e.message : String(e)); }, count => { if (active()) setPending(count); });
    const session = { fileId: id, projection, ready: false }; binding.current = session; queues.current.set(id, projection);
    const timer = setTimeout(() => {
      void (async () => {
        await previous?.settled(); if (!active()) return;
        const initial = current.current.project; if (!initial) return;
        const result = await host.collaborationCommand!({ type: "open", fileId: id, initial });
        if (!active()) return;
        if (result.status) setStatus(result.status);
        if (result.error) setError(result.error);
        if (result.snapshot) projection.initialize(result.snapshot);
        session.ready = true;
      })().catch(e => { if (active()) setError(String(e)); });
    }, 50);
    return () => { cancelled = true; clearTimeout(timer); projection.detach(); };
  }, [graph.currentFileId, apply]);
  useEffect(() => hostBridge()?.onCollaborationEvent?.(event => {
    const session = binding.current;
    if (!session || event.fileId !== session.fileId || event.fileId !== current.current.graph.currentFileId) return;
    if (event.presence) setPeers(event.presence.filter(peer => peer.sessionId !== sessionId));
    if (event.status) setStatus(event.status);
    if (event.error) setError(event.error);
    if (event.snapshot && session.ready) session.projection.receive(event.snapshot);
  }), [sessionId]);
  useLayoutEffect(() => {
    const session = binding.current;
    if (session?.ready && session.fileId === graph.currentFileId && project && status?.role === "editor") session.projection.observe(project);
  });
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (pending || status?.saved === false) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [pending, status?.saved]);

  const run = useCallback(async (command: CollaborationCommand) => {
    const host = hostBridge(); if (!host?.collaborationCommand) throw new Error("La colaboración requiere la aplicación de escritorio.");
    setBusy(true); setError(undefined);
    try {
      await queues.current.get(command.fileId)?.settled(); const result = await host.collaborationCommand(command);
      if (result.error) throw new Error(result.error);
      if (current.current.graph.currentFileId === command.fileId) {
        if (result.status) setStatus(result.status);
        const session = binding.current;
        if (result.snapshot && session?.fileId === command.fileId) session.projection.receive(result.snapshot);
      }
      return result;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e; }
    finally { setBusy(false); }
  }, []);
  const publishPresence = useCallback((presence: Omit<PresenceInput, "name">) => {
    const id = graph.currentFileId;
    if (id && current.current.status) hostBridge()?.collaborationPresence?.(id, { ...presence, name: current.current.displayName, sessionId });
  }, [graph.currentFileId, sessionId]);
  const value: CollaborationContextValue = {
    available: !!hostBridge()?.collaborationCommand && !!hostBridge()?.onCollaborationEvent,
    status, busy, pending, error, peers, displayName,
    setDisplayName: name => { setDisplayNameState(name); try { localStorage.setItem("collaboration-display-name", name); } catch { /* local preference */ } },
    publishPresence,
    create: async options => { const p = current.current.project, id = current.current.graph.currentFileId; if (p && id) { const result = await run({ type: "create", fileId: id, initial: p, options }); if (result.snapshot && binding.current?.fileId === id && current.current.graph.currentFileId === id) binding.current.projection.initialize(result.snapshot); } },
    join: async invitation => {
      const { graph: g } = current.current;
      // Joining creates a distinct local project; never overwrite an existing one.
      const id = g.handleCreateProjectFromContent("Proyecto compartido", emptyGraphData("Proyecto compartido", new Date().toISOString()));
      if (!id) throw new Error("No se pudo crear la copia local.");
      const result = await run({ type: "join", fileId: id, invitation });
      // Provider selection/hydration opens the persisted link and applies its state.
      if (result.status && current.current.graph.currentFileId === id) setStatus(result.status);
      const initial = current.current.project;
      if (initial && current.current.graph.currentFileId === id) {
        const reopened = await run({ type: "open", fileId: id, initial });
        if (reopened.snapshot && binding.current?.fileId === id && current.current.graph.currentFileId === id) binding.current.projection.initialize(reopened.snapshot);
      }
    },
    invite: async role => (await run({ type: "invite", fileId: current.current.graph.currentFileId!, role })).invitation ?? "",
    retry: async () => { await run({ type: "retry", fileId: current.current.graph.currentFileId! }); },
    leave: async () => { const id = current.current.graph.currentFileId!; await run({ type: "leave", fileId: id }); current.current.graph.setSharedReadOnly(id, false); setStatus(undefined); setPeers([]); },
    recover: async () => (await run({ type: "recover", fileId: current.current.graph.currentFileId! })).recovery ?? "",
    revoke: async memberId => { await run({ type: "revoke", fileId: current.current.graph.currentFileId!, memberId }); },
    refreshLink: async invitation => { await run({ type: "refresh-link", fileId: current.current.graph.currentFileId!, invitation }); },
  };
  return <CollaborationContext.Provider value={value}>{children}</CollaborationContext.Provider>;
}
