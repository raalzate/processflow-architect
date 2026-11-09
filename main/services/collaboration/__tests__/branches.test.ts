import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BranchStore } from "../branches";
import { SharedDocument } from "../../../../src/lib/collaboration/document";
import type { SharedProject } from "../../../../src/lib/collaboration/types";
const initial: SharedProject = {
  name: "Prueba",
  content: {
    nombre_proyecto: "Prueba",
    version: "1",
    fecha_analisis: "",
    responsables: [],
    notas: "",
    transcript: "",
    read_models: [],
    agregados: [],
    big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
    politicas_inter_agregados: [],
  },
  customViews: [],
  references: [],
  agent: { versions: [], lineages: [], artifacts: [] },
  analysis: {},
};
const host = { id: "host", name: "Ana", owner: true, role: "editor" as const },
  guest = { id: "guest", name: "Luis", owner: false, role: "editor" as const };
describe("persistencia y autoridad de ramas", () => {
  it("activa de forma aditiva, persiste ramas y no permite escribir Principal sin permiso", () => {
    const root = mkdtempSync(join(tmpdir(), "pf-branches-")),
      doc = new SharedDocument();
    doc.patch({}, initial);
    let s = new BranchStore(join(root, "branches.json"), doc);
    try {
      expect(s.view(host)).toBeUndefined();
      s.activate(host);
      expect(() => s.patch("main", initial, { ...initial, name: "Ataque" }, guest)).toThrow(/permiso/);
      const version = s.view(host)!.history.commits[0].id;
      s.action(
        { type: "branch", id: "new", branchId: "test", name: "Experimento", fromCommit: version },
        guest,
      );
      s.patch("test", initial, { ...initial, name: "Otra rama" }, guest);
      expect(s.view(host)!.snapshots.main.name).toBe("Prueba");
      s.close();
      s = new BranchStore(join(root, "branches.json"), doc);
      expect(s.view(host)!.snapshots.test.name).toBe("Otra rama");
      expect(s.view(host)!.history.branches).toHaveLength(3);
    } finally {
      s.close();
      doc.destroy();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("sincroniza versiones offline idempotentes y conserva el trabajo rechazado tras revocar", () => {
    const root = mkdtempSync(join(tmpdir(), "pf-branches-")),
      a = new SharedDocument(),
      b = new SharedDocument();
    a.patch({}, initial);
    b.receive(a.update());
    const owner = new BranchStore(join(root, "host.json"), a),
      client = new BranchStore(join(root, "guest.json"), b);
    try {
      owner.activate(host);
      client.receive(owner.exchange(client.request(), guest));
      client.action(
        { type: "commit", id: "offline", branchId: "shared", message: "Sin conexión", scopes: ["project"] },
        guest,
      );
      const packet = client.request();
      expect(packet.operations).toHaveLength(1);
      const response = owner.exchange(packet, guest);
      client.receive(response);
      client.receive(owner.exchange(packet, guest));
      expect(owner.view(host)!.history.commits.filter(c => c.id === "offline")).toHaveLength(1);
      expect(client.view(guest)!.pending).toBe(0);
      owner.action(
        { type: "permission", id: "grant", memberId: "guest", permission: { editMain: true } },
        host,
      );
      client.receive(owner.exchange(client.request(), guest));
      client.patch("main", initial, { ...initial, name: "Trabajo offline" }, guest);
      owner.action({ type: "permission", id: "revoke", memberId: "guest", permission: {} }, host);
      client.receive(owner.exchange(client.request(), guest));
      expect(owner.view(host)!.snapshots.main.name).toBe("Prueba");
      expect(client.view(guest)!.recoveries.some(r => r.snapshot?.name === "Trabajo offline")).toBe(true);
      expect(client.view(guest)!.snapshots.main.name).toBe("Prueba");
    } finally {
      owner.close();
      client.close();
      a.destroy();
      b.destroy();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
