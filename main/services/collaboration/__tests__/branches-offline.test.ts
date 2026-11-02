import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BranchStore } from "../branches";
import { SharedDocument } from "../../../../src/lib/collaboration/document";
import type { SharedProject } from "../../../../src/lib/collaboration/types";
const board: SharedProject = { name: "Prueba", content: { nombre_proyecto: "Prueba", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] }, customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} };
const host = { id: "host", name: "Ana", owner: true, role: "editor" as const }, guest = { id: "guest", name: "Luis", owner: false, role: "editor" as const };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pf-causal-")), a = new SharedDocument(), b = new SharedDocument(); a.patch({}, board); b.receive(a.update());
  const owner = new BranchStore(join(root, "h.json"), a), client = new BranchStore(join(root, "c.json"), b); owner.activate(host); client.receive(owner.exchange(client.request(), guest));
  return { owner, client, close: () => { owner.close(); client.close(); a.destroy(); b.destroy(); rmSync(root, { recursive: true, force: true }); } };
}
describe("orden causal y borradores al reconectar", () => {
  it("publica commit offline, rama desde él y ediciones posteriores en ese orden", () => {
    const f = fixture(); try {
      f.client.action({ type: "commit", id: "offline-version", branchId: "shared", message: "Sin red", scopes: ["project"] }, guest);
      f.client.action({ type: "branch", id: "offline-branch", branchId: "b", name: "Rama B", fromCommit: "offline-version" }, guest);
      f.client.patch("b", board, { ...board, name: "Trabajo nuevo en B" }, guest);
      f.client.receive(f.owner.exchange(f.client.request(), guest));
      expect(f.owner.view(host)!.snapshots.b.name).toBe("Trabajo nuevo en B");
      expect(f.client.view(guest)!.history.branches.some(b => b.id === "b")).toBe(true);
      expect(f.client.view(guest)!.recoveries).toEqual([]);
      expect(f.client.view(guest)!.pending).toBe(0);
    } finally { f.close(); }
  });
  it("pull deja el borrador intacto hasta confirmarse y después agrega recuperación y versión", () => {
    const f = fixture(); try {
      const main = structuredClone(board); main.content.notas = "Cambio aprobado";
      f.owner.patch("main", board, main, host);
      f.owner.action({ type: "commit", id: "approved", branchId: "main", scopes: ["design"], message: "Aprobado" }, host);
      f.client.receive(f.owner.exchange(f.client.request(), guest));
      f.client.patch("shared", board, { ...board, name: "Mi borrador" }, guest);
      const before = f.client.view(guest)!;
      f.client.action({ type: "pull", id: "pull", branchId: "shared", commitId: "approved", scopes: ["design", "project"], expectedHead: before.history.branches[1].head, choices: {} }, guest, before.vectors.shared);
      expect(f.client.view(guest)!.snapshots.shared.content.notas).toBe("");
      f.client.receive(f.owner.exchange(f.client.request(), guest));
      const after = f.client.view(guest)!;
      expect(after.snapshots.shared.name).toBe("Mi borrador"); expect(after.snapshots.shared.content.notas).toBe("Cambio aprobado");
      expect(after.history.commits.some(c => c.id === "pull-before")).toBe(true);
      expect(after.history.branches[1].head).toBe("pull"); expect(after.recoveries).toEqual([]);
    } finally { f.close(); }
  });
});
