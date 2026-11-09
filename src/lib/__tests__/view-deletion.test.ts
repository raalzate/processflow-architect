import { describe, expect, it } from "vitest";
import { deleteCustomView } from "../view-embeds";
import { createHistory, executeHistory, projectDependencies } from "../collaboration/history";
import type { SharedProject } from "../collaboration/types";

const board = (): SharedProject => ({
  name: "Proyecto de prueba",
  content: { nombre_proyecto: "Proyecto de prueba", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], politicas_inter_agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: ["a", "b"].map(id => ({ id, nombre: id, tipo_elemento: "Tarea", estado_comparativo: "nuevo" })), aristas: [] } },
  customViews: [{ id: "web", name: "Detalle", kind: "mermaid", mermaidCode: "graph TD; A-->B", createdAt: "" }],
  references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {},
});

describe("borrar una vista enlazada", () => {
  it("permite guardar después de borrar sin perder componentes ni otros subprocesos", () => {
    const p = board();
    p.content.big_picture.nodos[0].viewRef = "web";
    p.content.big_picture.nodos[1].viewRef = "conservar";
    p.customViews.push({ id: "conservar", name: "Conservar", kind: "graph", createdAt: "", graph: structuredClone(p.content) });
    const actor = { id: "host", name: "Persona", owner: true, role: "editor" as const };
    const history = createHistory(p, actor, { id: "initial", at: "2026-11-07T12:00:00Z" });
    const deleted = deleteCustomView(p.content, p.customViews, "web");
    const next = { ...p, content: deleted.graph!, customViews: deleted.views };
    expect(next.content.big_picture.nodos.map(n => n.id)).toEqual(["a", "b"]);
    expect(next.content.big_picture.nodos[0].viewRef).toBeUndefined();
    expect(next.content.big_picture.nodos[1].viewRef).toBe("conservar");
    expect(next.customViews[0].graph!.big_picture.nodos[0].viewRef).toBeUndefined();
    expect(projectDependencies(next)).toEqual([]);
    expect(p.content.big_picture.nodos[0].viewRef).toBe("web");
    const result = executeHistory(history, { type: "commit", id: "c1", branchId: "shared", scopes: ["design", "view:web", "view:conservar"], message: "Borrar detalle" }, actor, { shared: next }, "2026-11-07T12:01:00Z");
    expect(result.state.commits.at(-1)!.snapshot.customViews.map(v => v.id)).toEqual(["conservar"]);
  });

  it("ignora vistas inexistentes y protege la vista del sistema", () => {
    const p = board();
    for (const id of ["no-existe", "design"]) {
      const result = deleteCustomView(p.content, p.customViews, id);
      expect(result.graph).toBe(p.content);
      expect(result.views).toBe(p.customViews);
    }
  });
});
