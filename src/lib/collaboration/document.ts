import * as Y from "yjs";
import { encodeProject, decodeProject } from "./graph-codec";
import type { SharedProject } from "./types";
import { assertCell, assertEncodedProject, assertJson } from "./validation";

type Path = string[];
type Cell = { kind: "object" | "list" } | { kind: "value"; value: unknown };
const LOCAL = "local-project-edit";
const key = (path: Path) => JSON.stringify(path);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const entity = (segment: string) => segment.startsWith("@");

/** Flat paths avoid racing creation of nested Y.Maps; lists are keyed by stable ID. */
function flatten(value: unknown, path: Path = [], out = new Map<string, Cell>()): Map<string, Cell> {
  if (value === undefined) return out;
  if (
    Array.isArray(value) &&
    value.every(v => v && typeof v === "object" && typeof v.id === "string") &&
    new Set(value.map(v => v.id)).size === value.length
  ) {
    out.set(key(path), { kind: "list" });
    value.forEach((v, index) => {
      const item = [...path, `@${v.id}`];
      flatten(v, item, out);
      out.set(key([...item, "#rank"]), { kind: "value", value: index });
    });
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    out.set(key(path), { kind: "object" });
    for (const [field, child] of Object.entries(value)) flatten(child, [...path, field], out);
  } else out.set(key(path), { kind: "value", value });
  return out;
}

export class SharedDocument {
  readonly doc = new Y.Doc({ gc: false });
  private fields = this.doc.getMap<Cell>("fields-v1");
  private tombstones = this.doc.getMap<boolean>("deleted-v1");
  private audit = this.doc.getMap<{ path: string; previous?: Cell; value?: Cell }>("edit-history-v1");
  private sequence = 0;
  private candidate?: SharedDocument;
  private history = new Y.UndoManager([this.fields, this.tombstones], {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 0,
  });

  /** before is the caller's observed projection, not the latest remote state. */
  patch(before: Partial<SharedProject>, after: SharedProject) {
    const previous = before.content
      ? flatten(encodeProject(before as SharedProject))
      : new Map<string, Cell>();
    const next = flatten(encodeProject(after));
    this.doc.transact(() => {
      for (const [pathKey, cell] of next) {
        const path = JSON.parse(pathKey) as Path;
        // An explicit add/undo after observing removal is a restore. An offline
        // edit to an entity that was still present in before cannot resurrect it.
        if (cell.kind === "object" && entity(path[path.length - 1] ?? "") && !previous.has(pathKey))
          this.tombstones.delete(pathKey);
        if (!equal(previous.get(pathKey), cell)) {
          this.audit.set(`${this.doc.clientID}:${this.sequence++}`, {
            path: pathKey,
            previous: previous.get(pathKey),
            value: cell,
          });
          this.fields.set(pathKey, cell);
        }
      }
      for (const [pathKey, cell] of previous) {
        if (next.has(pathKey)) continue;
        const path = JSON.parse(pathKey) as Path;
        if (cell.kind === "object" && entity(path[path.length - 1] ?? "")) {
          this.tombstones.set(pathKey, true);
        } else if (!path.some(entity)) this.fields.delete(pathKey);
        else {
          // Keep descendants of a deleted entity for recovery; remove ordinary
          // fields only when their enclosing entity still exists in this edit.
          const lastEntity = path.map(entity).lastIndexOf(true);
          if (next.has(key(path.slice(0, lastEntity + 1)))) this.fields.delete(pathKey);
        }
      }
    }, LOCAL);
  }

  private materialize(): unknown {
    const children = new Map<string, string[]>();
    for (const pathKey of this.fields.keys()) {
      const path = JSON.parse(pathKey) as Path;
      if (!path.length) continue;
      const parent = key(path.slice(0, -1));
      const list = children.get(parent) ?? [];
      list.push(path[path.length - 1]!);
      children.set(parent, list);
    }
    const build = (path: Path): unknown => {
      const pathKey = key(path);
      if (this.tombstones.get(pathKey)) return undefined;
      const cell = this.fields.get(pathKey);
      if (!cell) return undefined;
      if (cell.kind === "value") return cell.value;
      const keys = children.get(pathKey) ?? [];
      if (cell.kind === "list")
        return keys
          .filter(entity)
          .sort((a, b) => {
            const rank = (id: string) =>
              (this.fields.get(key([...path, id, "#rank"])) as { value?: number })?.value ?? 0;
            return rank(a) - rank(b) || a.localeCompare(b);
          })
          .map(id => build([...path, id]))
          .filter(v => v !== undefined);
      const result: Record<string, unknown> = Object.create(null);
      for (const field of keys) {
        if (field === "#rank") continue;
        const value = build([...path, field]);
        if (value !== undefined) result[field] = value;
      }
      return result;
    };
    return build([]);
  }
  snapshot(): SharedProject {
    return decodeProject(this.materialize() as ReturnType<typeof encodeProject>).project;
  }
  isInitialized(): boolean {
    return this.fields.get("[]")?.kind === "object" && this.fields.get('["content"]')?.kind === "object";
  }
  pendingEdges(): number {
    return decodeProject(this.materialize() as ReturnType<typeof encodeProject>).pending;
  }
  deleted(): string[] {
    return [...this.tombstones.keys()].filter(k => this.tombstones.get(k));
  }
  recoveryJson(): string {
    return JSON.stringify(
      {
        format: "processflow-recovery/v1",
        deleted: this.deleted(),
        fields: Object.fromEntries(this.fields),
        edits: [...this.audit.values()],
      },
      null,
      2,
    );
  }
  update(vector?: Uint8Array) {
    return Y.encodeStateAsUpdate(this.doc, vector);
  }
  vector() {
    return Y.encodeStateVector(this.doc);
  }
  receive(update: Uint8Array) {
    Y.applyUpdate(this.doc, update, "remote");
  }
  /** Network changes are checked on a candidate before any durable live update. */
  receiveRemote(update: Uint8Array) {
    if (update.byteLength > 32 * 1024 ** 2) throw new Error("Actualización remota inválida: supera 32 MiB.");
    if (update.byteLength === 2 && update[0] === 0 && update[1] === 0) return;
    const candidate = (this.candidate ??= new SharedDocument());
    try {
      candidate.receive(this.update(candidate.vector()));
      candidate.receive(update);
      candidate.assertValid();
    } catch {
      candidate.destroy();
      this.candidate = undefined;
      throw new Error("Documento remoto inválido; se conserva la copia anterior.");
    }
    this.receive(update);
  }
  assertValid() {
    const allowed = new Set(["fields-v1", "deleted-v1", "edit-history-v1"]);
    if (
      [...this.doc.share.keys()].some(name => !allowed.has(name)) ||
      this.fields.size > 500_000 ||
      this.audit.size > 1_000_000
    )
      throw new Error("Documento inválido: estructura excesiva o desconocida.");
    for (const [pathKey, cell] of this.fields) assertCell(pathKey, cell);
    for (const [pathKey, deleted] of this.tombstones) {
      assertCell(pathKey, { kind: "object" });
      if (typeof deleted !== "boolean") throw new Error("Marca de borrado inválida.");
    }
    for (const entry of this.audit.values()) assertJson(entry);
    assertEncodedProject(this.materialize());
  }
  undo() {
    this.history.undo();
  }
  redo() {
    this.history.redo();
  }
  clearUndo() {
    this.history.clear();
  }
  destroy() {
    this.candidate?.destroy();
    this.candidate = undefined;
    this.history.destroy();
    this.doc.destroy();
  }
}
