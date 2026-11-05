import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as journal from "../journal";
import { BranchStore } from "../branches";
import { SharedDocument } from "../../../../src/lib/collaboration/document";
import type { SharedProject } from "../../../../src/lib/collaboration/types";
it("una retransmisión ya aplicada no clona y reescribe todo el historial", () => {
  const root = mkdtempSync(join(tmpdir(), "pf-noop-"));
  const project: SharedProject = { name: "Prueba", content: { nombre_proyecto: "Prueba", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] }, customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} };
  const a = new SharedDocument(), b = new SharedDocument(); a.patch({}, project);
  const host = new BranchStore(join(root, "a.json"), a), guest = new BranchStore(join(root, "b.json"), b);
  const owner = { id: "owner", name: "Ana", owner: true, role: "editor" as const }, editor = { id: "guest", name: "Nafes", owner: false, role: "editor" as const };
  const spy = vi.spyOn(journal, "writePrivateJson");
  try {
    host.activate(owner); guest.receive(host.exchange(guest.request(), editor));
    const before = guest.defaultSnapshot(); guest.patch("shared", before, { ...before, name: "Cambio" }, editor);
    const request = guest.request(); const response = host.exchange(request, editor); guest.receive(response);
    spy.mockClear();
    for (let i = 0; i < 20; i++) host.exchange(request, editor);
    for (let i = 0; i < 20; i++) guest.receive(response);
    expect(spy).not.toHaveBeenCalled();
    expect(host.defaultSnapshot().name).toBe("Cambio");
    expect(guest.defaultSnapshot().name).toBe("Cambio");
  } finally { spy.mockRestore(); host.close(); guest.close(); a.destroy(); b.destroy(); rmSync(root, { recursive: true, force: true }); }
});
