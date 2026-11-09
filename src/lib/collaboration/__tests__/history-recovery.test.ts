import { describe, expect, it } from "vitest";
import { createHistory, executeHistory, versionAt, canManage, mergeProjects } from "../history";
import type { SharedProject } from "../types";
const board = (): SharedProject => ({
  name: "Clínica",
  content: {
    nombre_proyecto: "Clínica",
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
      nodos: [
        { id: "a", nombre: "A", tipo_elemento: "custom", estado_comparativo: "nuevo" },
        { id: "b", nombre: "B", tipo_elemento: "custom", estado_comparativo: "nuevo" },
      ],
      aristas: [],
    },
    politicas_inter_agregados: [],
  },
  customViews: [],
  references: [],
  agent: { versions: [], lineages: [], artifacts: [] },
  analysis: {},
});
const host = { id: "host", name: "Ana", owner: true, role: "editor" as const },
  guest = { id: "guest", name: "Luis", owner: false, role: "editor" as const };
describe("recuperación y permisos independientes", () => {
  it("la fecha de una restauración elige el resultado y no su checkpoint anterior", () => {
    const s = createHistory(board(), host, { id: "initial", at: "2026-11-02T12:00:00Z" }),
      draft = { ...board(), name: "Antes de restaurar" };
    const out = executeHistory(
      s,
      {
        type: "restore",
        id: "restore",
        branchId: "shared",
        commitId: "initial",
        scopes: ["design", "project"],
      },
      guest,
      { shared: draft },
      "2026-11-02T13:00:00Z",
    );
    expect(versionAt(out.state, "shared", "2026-11-02T13:00:00Z")!.id).toBe("restore");
  });
  it("limitar una fusión a una solicitud no revoca los otros permisos explícitos", () => {
    const s = createHistory(board(), host, { id: "initial", at: "2026-11-02T12:00:00Z" });
    s.permissions.guest = { mergeMain: true, proposalId: "one", editMain: true, restoreMain: true };
    expect(canManage(s, guest, "mergeMain", "2026-11-02T13:00:00Z", "two")).toBe(false);
    expect(canManage(s, guest, "editMain", "2026-11-02T13:00:00Z")).toBe(true);
    expect(canManage(s, guest, "restoreMain", "2026-11-02T13:00:00Z")).toBe(true);
  });
  it("resuelve borrar frente a conectar conservando ambos extremos o retirando la conexión", () => {
    const base = board(),
      ours = board(),
      theirs = board();
    ours.content.big_picture.nodos = ours.content.big_picture.nodos!.filter(n => n.id !== "b");
    theirs.content.big_picture.aristas = [{ id: "ab", fuente: "a", destino: "b" }];
    const preview = mergeProjects(base, ours, theirs, ["design"]);
    expect(preview.conflicts.length).toBeGreaterThan(0);
    const keep = mergeProjects(base, ours, theirs, ["design"], { [preview.conflicts[0].id]: "theirs" });
    expect(keep.dependencies).toEqual([]);
    expect(keep.conflicts).toEqual([]);
    expect(keep.project.content.big_picture.aristas).toHaveLength(1);
    expect(keep.project.content.big_picture.nodos!.some(n => n.id === "b")).toBe(true);
    const remove = mergeProjects(base, ours, theirs, ["design"], { [preview.conflicts[0].id]: "ours" });
    expect(remove.dependencies).toEqual([]);
    expect(remove.project.content.big_picture.aristas).toEqual([]);
  });
});
