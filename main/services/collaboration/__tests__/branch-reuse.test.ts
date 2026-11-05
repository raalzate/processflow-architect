import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as journal from "../journal";
import { BranchStore } from "../branches";
import { SharedDocument } from "../../../../src/lib/collaboration/document";
import type { SharedProject } from "../../../../src/lib/collaboration/types";
it("reutiliza la réplica candidata sin publicar cambios cuyo guardado falló", () => {
  const root = mkdtempSync(join(tmpdir(), "pf-reuse-"));
  const p: SharedProject = { name: "Prueba", content: { nombre_proyecto: "Prueba", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] }, customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} };
  const shared = new SharedDocument(); shared.patch({}, p);
  const store = new BranchStore(join(root, "branches.json"), shared), actor = { id: "host", name: "Ana", owner: true, role: "editor" as const };
  const docs = () => (store as unknown as { documents: Map<string, SharedDocument> }).documents;
  const patch = (name: string) => store.patch("shared", store.defaultSnapshot(), { ...store.defaultSnapshot(), name }, actor);
  const spy = vi.spyOn(journal, "writePrivateJson");
  try {
    store.activate(actor); patch("Uno"); const first = docs().get("shared");
    patch("Dos"); patch("Tres"); expect(docs().get("shared")).toBe(first);
    spy.mockImplementationOnce(() => { throw new Error("Disco lleno"); });
    expect(() => patch("No guardado")).toThrow("Disco lleno");
    expect(store.defaultSnapshot().name).toBe("Tres");
    patch("Cuatro"); expect(store.defaultSnapshot().name).toBe("Cuatro");
  } finally { spy.mockRestore(); store.close(); shared.destroy(); rmSync(root, { recursive: true, force: true }); }
});
