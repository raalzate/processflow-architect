import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SharedDocument } from "../../../src/lib/collaboration/document";
import {
  canEditBranch,
  createHistory,
  executeHistory,
  previewIncorporation,
  equalProject,
  validBranchIdentity,
} from "../../../src/lib/collaboration/history";
import type {
  DiagramHistory,
  HistoryActor,
  HistoryAction,
  MergePreview,
} from "../../../src/lib/collaboration/history";
import type { SharedProject } from "../../../src/lib/collaboration/types";
import type { DiscardedFieldEdit } from "../../../src/lib/collaboration/field-conflicts";
import { assertEncodedProject, assertJson } from "../../../src/lib/collaboration/validation";
import { encodeProject } from "../../../src/lib/collaboration/graph-codec";
import { writePrivateJson } from "./journal";
import { deRegistro } from "../../../src/lib/registro";

const encode = (v: Uint8Array) => Buffer.from(v).toString("base64");
const decode = (v: string) => new Uint8Array(Buffer.from(v, "base64"));
interface Operation {
  action: HistoryAction;
  name: string;
  at: string;
  drafts: Record<string, SharedProject>;
  expectedVector?: string;
  seed?: string;
}
export interface BranchRecovery {
  id: string;
  branchId?: string;
  error: string;
  snapshot?: SharedProject;
}
export interface WorkspaceView {
  history: DiagramHistory;
  snapshots: Record<string, SharedProject>;
  vectors: Record<string, string>;
  actor: HistoryActor;
  pending: number;
  recoveries: BranchRecovery[];
  discardedEdits: Record<string, DiscardedFieldEdit[]>;
}
export interface BranchRequest {
  revision: number;
  vectors: Record<string, string>;
  updates: Record<string, string>;
  operations: Operation[];
}
export interface BranchResponse {
  history?: DiagramHistory;
  vectors: Record<string, string>;
  updates: Record<string, string>;
  rejected: string[];
  receipts: { id: string; error?: string }[];
}
interface StoredBranches {
  format: "processflow-branches/1";
  history: DiagramHistory;
  documents: Record<string, string>;
  pending: Operation[];
  recoveries: BranchRecovery[];
  remoteVectors: Record<string, string>;
}

/** El catálogo lo decide el anfitrión. Cada lienzo tiene su CRDT; nunca se fusionan deltas de ramas distintas. */
export class BranchStore {
  private history?: DiagramHistory;
  private documents = new Map<string, SharedDocument>();
  private pending: Operation[] = [];
  private recoveries: BranchRecovery[] = [];
  private remoteVectors: Record<string, string> = {};
  private committing = false;
  private sharedChanged = () => {
    if (this.history && !this.committing) {
      this.persist();
      this.changed();
    }
  };
  constructor(
    private file: string,
    private shared: SharedDocument,
    private changed: () => void = () => {},
  ) {
    this.documents.set("shared", shared);
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, "utf8")) as StoredBranches;
      if (saved.format !== "processflow-branches/1" || saved.history?.format !== "processflow-history/1")
        throw new Error("El historial de ramas es incompatible; se conserva para recuperar.");
      if (
        !saved.history.branches.every(b => validBranchIdentity(b.id)) ||
        Object.keys(saved.documents).some(id => !validBranchIdentity(id))
      )
        throw new Error("Identidades de ramas inválidas; conserva la recuperación.");
      this.history = saved.history;
      this.pending = saved.pending;
      this.recoveries = saved.recoveries;
      this.remoteVectors = saved.remoteVectors;
      for (const [id, update] of Object.entries(saved.documents)) {
        const doc = id === "shared" ? shared : new SharedDocument();
        doc.receiveRemote(decode(update));
        this.documents.set(id, doc);
      }
    }
    shared.doc.on("update", this.sharedChanged);
  }
  get enabled() {
    return !!this.history;
  }
  recovery() {
    return this.history ? this.pack() : undefined;
  }
  bytes() {
    return this.history
      ? Buffer.byteLength(JSON.stringify(this.history)) +
          [...this.documents.values()].reduce((n, d) => n + d.update().byteLength, 0)
      : 0;
  }
  activate(owner: HistoryActor) {
    if (this.history) return;
    const state = createHistory(this.shared.snapshot(), owner, {
      id: randomUUID(),
      at: new Date().toISOString(),
    });
    const main = new SharedDocument();
    main.patch({}, this.shared.snapshot());
    this.transaction(state, new Map([...this.documents, ["main", main]]), this.pending);
    this.changed();
  }
  private pack(history = this.history!, docs = this.documents, pending = this.pending): StoredBranches {
    return {
      format: "processflow-branches/1",
      history,
      documents: Object.fromEntries([...docs].map(([id, d]) => [id, encode(d.update())])),
      pending,
      recoveries: this.recoveries,
      remoteVectors: this.remoteVectors,
    };
  }
  private persist() {
    if (this.history) writePrivateJson(this.file, this.pack());
  }
  private transaction(history: DiagramHistory, docs: Map<string, SharedDocument>, pending: Operation[]) {
    writePrivateJson(this.file, this.pack(history, docs, pending));
    this.committing = true;
    try {
      for (const [id, previous] of this.documents)
        if (id !== "shared" && docs.get(id) !== previous) previous.destroy();
      const previousShared = this.documents.get("shared");
      if (previousShared && previousShared !== this.shared && docs.get("shared") !== previousShared)
        previousShared.destroy();
      this.history = history;
      this.documents = docs;
      this.pending = pending;
    } finally {
      this.committing = false;
    }
  }
  private snapshots() {
    return Object.fromEntries([...this.documents].map(([id, d]) => [id, d.snapshot()]));
  }
  view(actor: HistoryActor): WorkspaceView | undefined {
    return this.history
      ? {
          history: this.history,
          snapshots: this.snapshots(),
          vectors: this.vectors(),
          actor,
          pending: this.pending.length,
          recoveries: this.recoveries,
          discardedEdits: Object.fromEntries([...this.documents].map(([id, d]) => [id, d.discardedEdits()])),
        }
      : undefined;
  }
  defaultSnapshot() {
    return this.documents.get("shared")!.snapshot();
  }
  defaultUpdate(vector?: Uint8Array) {
    return this.documents.get("shared")!.update(vector);
  }
  private vectors() {
    return Object.fromEntries([...this.documents].map(([id, d]) => [id, encode(d.vector())]));
  }
  private cloneDoc(id: string) {
    const doc = new SharedDocument(),
      original = this.documents.get(id);
    if (original) doc.receive(original.update());
    return doc;
  }
  patch(id: string, before: SharedProject, after: SharedProject, actor: HistoryActor) {
    if (!this.history || !canEditBranch(this.history, id, actor, new Date().toISOString()))
      throw new Error("No tienes permiso para editar esta rama.");
    assertJson(after);
    assertEncodedProject(encodeProject(after));
    const doc = this.cloneDoc(id);
    try {
      doc.patch(before, after);
      this.transaction(this.history, new Map([...this.documents, [id, doc]]), this.pending);
    } catch (error) {
      if (this.documents.get(id) !== doc) doc.destroy();
      throw error;
    }
    this.changed();
  }
  resolveFieldConflict(id: string, editId: string, keep: "current" | "discarded", actor: HistoryActor) {
    if (!this.history || !canEditBranch(this.history, id, actor, new Date().toISOString()))
      throw new Error("No tienes permiso para editar esta rama.");
    const doc = this.cloneDoc(id);
    try {
      doc.resolveFieldConflict(editId, keep);
      this.transaction(this.history, new Map([...this.documents, [id, doc]]), this.pending);
    } catch (error) {
      if (this.documents.get(id) !== doc) doc.destroy();
      throw error;
    }
    this.changed();
  }
  preview(branchId: string, commitId: string, scopes: string[], choices = {}): MergePreview {
    if (!this.history) throw new Error("El historial todavía no está activo.");
    return previewIncorporation(
      this.history,
      branchId,
      commitId,
      this.documents.get(branchId)!.snapshot(),
      scopes,
      choices,
    );
  }
  action(action: HistoryAction, actor: HistoryActor, expectedVector?: string) {
    if (!this.history) throw new Error("El historial se habilita al colaborar con otra persona.");
    const operation: Operation = {
      action,
      at: new Date().toISOString(),
      name: actor.name,
      drafts: this.snapshots(),
      expectedVector,
    };
    if (!actor.owner && ["merge", "reject", "pull", "restore"].includes(action.type)) {
      executeHistory(this.history, action, actor, operation.drafts, operation.at);
      this.transaction(this.history, this.documents, [...this.pending, operation]);
      this.changed();
      return;
    }
    this.apply(operation, actor, !actor.owner);
    this.changed();
  }
  private apply(op: Operation, actor: HistoryActor, queue: boolean) {
    if (!this.history) throw new Error("Historial no disponible.");
    assertJson(op.action);
    if (JSON.stringify(op.action).length > 64_000) throw new Error("Operación de historial excesiva.");
    const action = op.action;
    const target =
      action.type === "merge"
        ? this.history.proposals.find(p => p.id === action.proposalId)?.targetId
        : "branchId" in action
          ? action.branchId
          : undefined;
    if (
      ["merge", "pull", "restore"].includes(action.type) &&
      op.expectedVector &&
      target &&
      this.vectors()[target] !== op.expectedVector
    )
      throw new Error("El borrador destino cambió. Revisa de nuevo antes de confirmar.");
    // La versión captura lo observado por su autor; la fusión siempre compara el borrador actual del anfitrión.
    const drafts = action.type === "commit" ? op.drafts : this.snapshots();
    if (action.type === "commit")
      for (const p of Object.values(drafts)) {
        assertJson(p);
        assertEncodedProject(encodeProject(p));
      }
    const out = executeHistory(this.history, action, actor, drafts, op.at);
    const docs = new Map(this.documents),
      created: SharedDocument[] = [];
    try {
      for (const [id, project] of Object.entries(out.writes)) {
        const d = this.cloneDoc(id);
        if (action.type === "branch" && op.seed && !queue) {
          d.receiveRemote(decode(op.seed));
          if (!equalProject(encodeProject(d.snapshot()), encodeProject(project)))
            throw new Error("La base de la nueva rama no coincide con la versión elegida.");
        } else d.patch(this.documents.get(id)?.snapshot() ?? {}, project);
        docs.set(id, d);
        created.push(d);
        if (action.type === "branch" && queue) op.seed = encode(d.update());
      }
      this.transaction(out.state, docs, queue ? [...this.pending, op] : this.pending);
    } catch (error) {
      for (const doc of created) if (![...this.documents.values()].includes(doc)) doc.destroy();
      throw error;
    }
  }
  request(): BranchRequest {
    const updates: Record<string, string> = Object.create(null);
    for (const [id, doc] of this.documents)
      if (this.history) {
        const vector = deRegistro(this.remoteVectors, id),
          delta = doc.update(vector ? decode(vector) : undefined);
        if (delta.byteLength !== 2 || delta[0] !== 0 || delta[1] !== 0) updates[id] = encode(delta);
      }
    return {
      revision: this.pending.length ? -1 : (this.history?.revision ?? 0),
      vectors: this.vectors(),
      updates,
      operations: this.pending.slice(0, 50),
    };
  }
  /** Sólo se invoca después de autenticar identidad, rol y membresía en la sala. */
  exchange(request: BranchRequest, actor: HistoryActor): BranchResponse {
    if (!this.history) throw new Error("Historial no disponible.");
    if (
      !request ||
      !request.vectors ||
      !request.updates ||
      !Array.isArray(request.operations) ||
      Object.keys(request.updates).length > 500 ||
      request.operations.length > 100
    )
      throw new Error("Sincronización de ramas inválida.");
    const previousRevision = this.history.revision,
      previousVectors = JSON.stringify(this.vectors());
    const rejected: string[] = [],
      receipts: BranchResponse["receipts"] = [];
    const applied = new Set<string>();
    const updateBranch = (id: string) => {
      const raw = deRegistro(request.updates, id),
        current = this.documents.get(id);
      if (applied.has(id) || !raw || !current) return;
      applied.add(id);
      if (
        typeof raw !== "string" ||
        raw.length > 45 * 1024 ** 2 ||
        !canEditBranch(this.history!, id, actor, new Date().toISOString())
      ) {
        rejected.push(id);
        return;
      }
      const doc = this.cloneDoc(id);
      try {
        doc.receiveRemote(decode(raw));
        this.transaction(this.history!, new Map([...this.documents, [id, doc]]), this.pending);
      } catch (error) {
        doc.destroy();
        throw error;
      }
    };
    for (const id of Object.keys(request.updates)) updateBranch(id);
    // Commit C debe existir antes de crear la rama basada en C; sus deltas llegan después de crearla.
    for (const op of request.operations) {
      try {
        this.apply({ ...op, at: new Date().toISOString(), name: actor.name }, actor, false);
        receipts.push({ id: op.action.id });
        if (op.action.type === "branch") updateBranch(op.action.branchId);
      } catch (e) {
        receipts.push({ id: op.action.id, error: String(e) });
      }
    }
    for (const id of Object.keys(request.updates)) if (!applied.has(id)) rejected.push(id);
    const updates: Record<string, string> = Object.create(null);
    for (const [id, doc] of this.documents) {
      const vector = deRegistro(request.vectors, id),
        delta = doc.update(vector && !rejected.includes(id) ? decode(vector) : undefined);
      if (delta.byteLength !== 2 || delta[0] !== 0 || delta[1] !== 0 || rejected.includes(id))
        updates[id] = encode(delta);
    }
    if (this.history.revision !== previousRevision || JSON.stringify(this.vectors()) !== previousVectors)
      this.changed();
    return {
      ...(request.revision !== this.history.revision ? { history: this.history } : {}),
      updates,
      vectors: this.vectors(),
      rejected,
      receipts,
    };
  }
  receive(response: BranchResponse) {
    const history = response.history ?? this.history;
    if (!history) throw new Error("Falta el catálogo de ramas del anfitrión.");
    if (
      !response.history &&
      !Object.keys(response.updates).length &&
      !response.receipts.length &&
      !response.rejected.length
    )
      return;
    const docs = new Map(this.documents);
    for (const [id, raw] of Object.entries(response.updates)) {
      const denied = response.rejected.includes(id),
        previous = this.documents.get(id);
      const doc = new SharedDocument();
      if (previous && !denied) doc.receive(previous.update());
      doc.receiveRemote(decode(raw));
      if (denied && previous && encode(previous.update()) !== encode(doc.update()))
        this.recoveries.push({
          id: randomUUID(),
          branchId: id,
          error: "Permiso revocado: se conserva tu trabajo en esta copia de recuperación.",
          snapshot: previous.snapshot(),
        });
      docs.set(id, doc);
    }
    const settled = new Set(response.receipts.map(r => r.id)),
      pending = this.pending.filter(op => !settled.has(op.action.id));
    for (const receipt of response.receipts)
      if (receipt.error) {
        const op = this.pending.find(op => op.action.id === receipt.id),
          branchId = op && "branchId" in op.action ? op.action.branchId : undefined;
        this.recoveries.push({
          id: receipt.id,
          error: receipt.error,
          branchId,
          snapshot: branchId ? (this.documents.get(branchId)?.snapshot() ?? op?.drafts[branchId]) : undefined,
        });
      }
    this.remoteVectors = response.vectors;
    // Cada respuesta autoritativa trae su revisión; pendientes siguen guardados y se reintentan.
    let visible = history;
    for (const op of pending)
      try {
        visible = executeHistory(
          visible,
          op.action,
          { id: "pending", name: op.name, owner: false, role: "editor" },
          op.drafts,
          op.at,
        ).state;
      } catch {
        /* La operación sigue en cola hasta recibir su respuesta. */
      }
    this.transaction(visible, docs, pending);
    this.changed();
  }
  close() {
    this.shared.doc.off("update", this.sharedChanged);
    for (const doc of this.documents.values()) if (doc !== this.shared) doc.destroy();
  }
}
