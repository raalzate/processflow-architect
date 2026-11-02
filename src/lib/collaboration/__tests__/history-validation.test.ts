import { describe, expect, it } from "vitest";
import { createHistory, executeHistory, mergeProjects } from "../history";
import type { HistoryAction } from "../history";
import type { SharedProject } from "../types";
const board = (): SharedProject => ({
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
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [{ id: "a", nombre: "A", tipo_elemento: "custom", estado_comparativo: "nuevo" }],
      aristas: [],
    },
    politicas_inter_agregados: [],
  },
  customViews: [],
  references: [],
  agent: { versions: [], lineages: [], artifacts: [] },
  analysis: {},
});
const actor = { id: "host", name: "Ana", owner: true, role: "editor" as const };
const stamp = "2026-11-02T12:00:00Z";
describe("contratos de acciones y dependencias entre vistas", () => {
  it("rechaza mensajes objeto y campos de autoridad inyectados antes de guardar solicitudes", () => {
    const s = createHistory(board(), actor, { id: "initial", at: stamp });
    for (const extra of [{ message: { poison: "not a string" } }, { message: "Normal", owner: true }]) {
      const action = {
        type: "propose",
        id: "bad",
        branchId: "shared",
        targetId: "main",
        commitId: "initial",
        scopes: ["design"],
        ...extra,
      } as unknown as HistoryAction;
      expect(() => executeHistory(s, action, actor, {}, stamp)).toThrow();
    }
    expect(s.proposals).toEqual([]);
  });
  it("no confirma Modelo con subproceso si falta incluir su vista dependiente", () => {
    const s = createHistory(board(), actor, { id: "initial", at: stamp }),
      draft = board();
    draft.content.big_picture.nodos![0].viewRef = "detail";
    draft.customViews.push({
      id: "detail",
      name: "Detalle",
      kind: "graph",
      graph: board().content,
      createdAt: stamp,
    });
    expect(() =>
      executeHistory(
        s,
        {
          type: "commit",
          id: "incomplete",
          branchId: "shared",
          scopes: ["design"],
          message: "Falta detalle",
        },
        actor,
        { shared: draft },
        stamp,
      ),
    ).toThrow(/vista|dependencia/i);
    const complete = executeHistory(
      s,
      {
        type: "commit",
        id: "complete",
        branchId: "shared",
        scopes: ["design", "view:detail"],
        message: "Con detalle",
      },
      actor,
      { shared: draft },
      stamp,
    );
    expect(complete.state.commits.at(-1)!.snapshot.customViews).toHaveLength(1);
    expect(mergeProjects(board(), board(), draft, ["design"]).dependencies.length).toBeGreaterThan(0);
    expect(mergeProjects(board(), board(), draft, ["design", "view:detail"]).dependencies).toEqual([]);
  });
});
