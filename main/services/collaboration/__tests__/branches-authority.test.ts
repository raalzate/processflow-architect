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
  const root = mkdtempSync(join(tmpdir(), "pf-authority-")), a = new SharedDocument(), b = new SharedDocument(); a.patch({}, board); b.receive(a.update());
  const owner = new BranchStore(join(root, "h.json"), a), client = new BranchStore(join(root, "c.json"), b); owner.activate(host); client.receive(owner.exchange(client.request(), guest));
  return { owner, client, close: () => { owner.close(); client.close(); a.destroy(); b.destroy(); rmSync(root, { recursive: true, force: true }); } };
}
describe("autoridad, revisión y recuperación completas", () => {
  it("drena más de cien commits offline en lotes causales sin perder versiones", () => {
    const f = fixture(); try {
      for (let i = 0; i < 101; i++) f.client.action({ type: "commit", id: `offline-${i}`, branchId: "shared", scopes: ["project"], message: `Versión ${i}` }, guest);
      let batches = 0;
      while (f.client.view(guest)!.pending && batches < 5) { const packet = f.client.request(); expect(packet.operations.length).toBeLessThanOrEqual(50); f.client.receive(f.owner.exchange(packet, guest)); batches++; }
      expect(f.client.view(guest)!.pending).toBe(0); expect(f.owner.view(host)!.history.commits).toHaveLength(102); expect(f.client.view(guest)!.recoveries).toEqual([]);
    } finally { f.close(); }
  });
  it("revocar una rama compartida conserva el borrador rechazado y no lo reenvía tras conceder acceso", () => {
    const f = fixture(); try {
      f.client.patch("shared", board, { ...board, name: "Mi trabajo offline" }, guest);
      f.owner.action({ type: "editors", id: "restrict", branchId: "shared", editors: [] }, host);
      f.client.receive(f.owner.exchange(f.client.request(), guest));
      expect(f.client.view(guest)!.snapshots.shared.name).toBe("Prueba");
      expect(f.client.view(guest)!.recoveries.some(r => r.snapshot?.name === "Mi trabajo offline")).toBe(true);
      f.owner.action({ type: "editors", id: "allow", branchId: "shared" }, host);
      f.client.receive(f.owner.exchange(f.client.request(), guest));
      expect(f.owner.view(host)!.snapshots.shared.name).toBe("Prueba");
    } finally { f.close(); }
  });
  it("un destino que cambia después de revisar impide la fusión sin tocar el borrador", () => {
    const f = fixture(); try {
      f.owner.patch("main", board, { ...board, name: "Aprobado" }, host);
      f.owner.action({ type: "commit", id: "approved", branchId: "main", scopes: ["project"], message: "Principal" }, host);
      f.client.receive(f.owner.exchange(f.client.request(), guest)); const before = f.client.view(guest)!;
      f.client.action({ type: "pull", id: "stale", branchId: "shared", commitId: "approved", scopes: ["project"], expectedHead: before.history.branches[1].head, choices: {} }, guest, before.vectors.shared);
      f.owner.patch("shared", board, { ...board, name: "Trabajo concurrente" }, host);
      f.client.receive(f.owner.exchange(f.client.request(), guest));
      expect(f.owner.view(host)!.snapshots.shared.name).toBe("Trabajo concurrente"); expect(f.owner.view(host)!.history.commits.some(c => c.id === "stale")).toBe(false);
      expect(f.client.view(guest)!.recoveries.some(r => r.id === "stale")).toBe(true);
    } finally { f.close(); }
  });
  it("la recuperación incluye Principal, ramas, commits y CRDT sin invitaciones ni presencia", () => {
    const f = fixture(); try {
      f.owner.action({ type: "branch", id: "new", branchId: "b", name: "Backend", fromCommit: f.owner.view(host)!.history.commits[0].id }, host);
      f.owner.patch("b", board, { ...board, name: "Conservar rama" }, host);
      const recovery = f.owner.recovery()!; expect(recovery.history.branches).toHaveLength(3); expect(Object.keys(recovery.documents).sort()).toEqual(["b", "main", "shared"]);
      expect(JSON.stringify(recovery)).not.toMatch(/processflow:\/\/|invitation|presence|secretKey/);
    } finally { f.close(); }
  });
});
