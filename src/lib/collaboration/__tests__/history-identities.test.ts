import { describe, expect, it } from "vitest";
import { createHistory, executeHistory } from "../history";
import type { SharedProject } from "../types";
const p: SharedProject = {
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
const actor = { id: "host", name: "Ana", owner: true, role: "editor" as const };
describe("identidades de rama externas", () => {
  it.each(["__proto__", "constructor", "prototype", "toString", "valueOf", "hasOwnProperty"])(
    "rechaza la identidad reservada %s sin modificar catálogo",
    id => {
      const s = createHistory(p, actor, { id: "initial", at: "2026-11-02T12:00:00Z" });
      expect(() =>
        executeHistory(
          s,
          { type: "branch", id: "new", branchId: id, name: "Prueba", fromCommit: "initial" },
          actor,
          {},
          "2026-11-02T13:00:00Z",
        ),
      ).toThrow(/válid/);
      expect(s.branches).toHaveLength(2);
    },
  );
});
