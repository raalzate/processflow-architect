import { expect, it } from "vitest";
import { SharedDocument } from "../document";
import type { SharedProject } from "../types";
const board = (): SharedProject => ({ name: "Prueba", content: { nombre_proyecto: "Prueba", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [{ id: "a", nombre: "A", tipo_elemento: "custom", estado_comparativo: "nuevo" }, { id: "b", nombre: "B", tipo_elemento: "custom", estado_comparativo: "nuevo" }], aristas: [{ id: "edge", fuente: "old-id", destino: "b", descripcion: "Consulta" }] }, politicas_inter_agregados: [] }, customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} });
it("identifica y repara una conexión sin adivinar ni borrar los componentes", () => {
  const d = new SharedDocument(); d.patch({}, board());
  expect(d.pendingConnections()).toEqual([{ id: "edge", viewId: "design", sourceId: "old-id", targetId: "b", description: "Consulta" }]);
  expect(() => d.repairConnection("design", "edge", "still-missing", "b")).toThrow();
  expect(d.pendingEdges()).toBe(1);
  d.repairConnection("design", "edge", "a", "b");
  expect(d.pendingEdges()).toBe(0);
  expect(d.snapshot().content.big_picture.aristas?.[0].fuente).toBe("a");
  expect(d.recoveryJson()).toContain("old-id"); d.destroy();
});
it("retirar una conexión rota conserva su contenido recuperable y no borra nodos", () => {
  const d = new SharedDocument(); d.patch({}, board()); d.repairConnection("design", "edge");
  expect(d.pendingEdges()).toBe(0);
  expect(d.snapshot().content.big_picture.nodos?.length).toBe(2);
  expect(d.recoveryJson()).toContain("old-id"); d.destroy();
});
