import { expect, it } from "vitest";
import { SharedDocument } from "../document";
import type { SharedProject } from "../types";
it("recupera un historial local acumulado grande conservando el límite de una edición remota", () => {
  const source = new SharedDocument(), target = new SharedDocument();
  const project: SharedProject = { name: "Archivo grande", content: { nombre_proyecto: "Archivo grande", version: "1", fecha_analisis: "", responsables: [], notas: "x".repeat(17 * 1024 ** 2), transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] }, customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} };
  try {
    source.patch({}, project);
    const saved = source.update();
    expect(saved.byteLength).toBeGreaterThan(32 * 1024 ** 2);
    expect(() => target.receiveRemote(saved)).toThrow("32 MiB");
    target.receiveArchive(saved);
    expect(target.snapshot().content.notas).toBe(project.content.notas);
    expect(target.pendingEdges()).toBe(0);
  } finally { source.destroy(); target.destroy(); }
});
