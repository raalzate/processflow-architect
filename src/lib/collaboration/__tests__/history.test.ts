import { describe, it, expect } from "vitest";
import {
  createHistory,
  executeHistory,
  canEditBranch,
  canManage,
  mergeProjects,
  scopeOptions,
  selectScopes,
  commonBase,
  versionAt,
} from "../history";
import type { HistoryActor, HistoryAction } from "../history";
import type { SharedProject } from "../types";

export const board = (): SharedProject => ({
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
        { id: "a", nombre: "A", tipo_elemento: "custom", estado_comparativo: "nuevo", x: 10, y: 10 },
        { id: "b", nombre: "B", tipo_elemento: "custom", estado_comparativo: "nuevo", x: 100, y: 10 },
      ],
      aristas: [],
    },
    politicas_inter_agregados: [],
  },
  customViews: [
    { id: "web", name: "App Web", kind: "mermaid", mermaidCode: "graph TD; A-->B", createdAt: "2026-11-02" },
  ],
  agent: { versions: [], lineages: [], artifacts: [] },
  references: [],
  analysis: {},
});
const host: HistoryActor = { id: "host", name: "Ana", owner: true, role: "editor" };
const guest: HistoryActor = { id: "guest", name: "Luis", owner: false, role: "editor" };
const stamp = { id: "initial", at: "2026-11-02T12:00:00.000Z" };
const modify = (p: SharedProject, field: "x" | "nombre", value: number | string) => {
  const n = structuredClone(p);
  Object.assign(n.content.big_picture.nodos![0], { [field]: value });
  return n;
};
describe("ramas y versiones colaborativas", () => {
  it("conserva la base aprobada separada del trabajo en vivo", () => {
    const s = createHistory(board(), host, stamp);
    expect(s.branches.map(b => b.id)).toEqual(["main", "shared"]);
    expect(canEditBranch(s, "main", guest, stamp.at)).toBe(false);
    expect(canEditBranch(s, "shared", guest, stamp.at)).toBe(true);
    expect(s.commits[0].snapshot).toEqual(board());
  });
  it("confirma solo las vistas seleccionadas y no muta el borrador ni la versión inicial", () => {
    const s = createHistory(board(), host, stamp),
      draft = modify(board(), "nombre", "Nuevo");
    draft.customViews[0].mermaidCode = "graph TD; C-->D";
    const out = executeHistory(
      s,
      { type: "commit", id: "c1", branchId: "shared", scopes: ["design"], message: "Modelo" },
      guest,
      { shared: draft },
      "2026-11-02T13:00:00Z",
    );
    expect(out.state.commits.at(-1)!.snapshot.content).toEqual(draft.content);
    expect(out.state.commits.at(-1)!.snapshot.customViews).toEqual(board().customViews);
    expect(out.state.commits.at(-1)!.author).toEqual({ id: "guest", name: "Luis" });
    expect(out.writes).toEqual({});
    expect(s.commits).toHaveLength(1);
    expect(draft.customViews[0].mermaidCode).toContain("C-->");
  });
  it("selecciona altas y borrados de vistas por identidad sin incluir otras", () => {
    const p = board(),
      next = board();
    next.customViews = [];
    expect(selectScopes(p, next, ["view:web"]).customViews).toEqual([]);
    expect(scopeOptions(p, next).some(v => v.id === "view:web")).toBe(true);
    expect(() => selectScopes(p, next, ["inventada"])).toThrow();
  });
  it("combina campos distintos de un componente y detecta el mismo campo", () => {
    const b = board(),
      ours = modify(b, "x", 50),
      theirs = modify(b, "nombre", "Renombrado");
    const m = mergeProjects(b, ours, theirs, ["design"]);
    expect(m.conflicts).toEqual([]);
    expect(m.project.content.big_picture.nodos![0]).toMatchObject({ x: 50, nombre: "Renombrado" });
    expect(mergeProjects(b, modify(b, "nombre", "Uno"), theirs, ["design"]).conflicts).toHaveLength(1);
  });
  it("no pierde una flecha cuando se eliminó su extremo: exige resolver la dependencia", () => {
    const b = board(),
      ours = board(),
      theirs = board();
    ours.content.big_picture.nodos = ours.content.big_picture.nodos!.filter(n => n.id !== "b");
    theirs.content.big_picture.aristas = [{ id: "ab", fuente: "a", destino: "b", descripcion: "Atiende" }];
    expect(mergeProjects(b, ours, theirs, ["design"]).dependencies.length).toBeGreaterThan(0);
  });
  it("resuelve un conflicto con una elección explícita", () => {
    const b = board(),
      ours = modify(b, "nombre", "Uno"),
      theirs = modify(b, "nombre", "Dos");
    const preview = mergeProjects(b, ours, theirs, ["design"]);
    const merged = mergeProjects(b, ours, theirs, ["design"], { [preview.conflicts[0].id]: "theirs" });
    expect(merged.conflicts).toEqual([]);
    expect(merged.project.content.big_picture.nodos![0].nombre).toBe("Dos");
  });
  it("un permiso para fusionar no permite editar o restaurar Principal y caduca", () => {
    const s = createHistory(board(), host, stamp);
    s.permissions.guest = { mergeMain: true, until: "2026-11-02T14:00:00Z" };
    expect(canManage(s, guest, "mergeMain", "2026-11-02T13:00:00Z")).toBe(true);
    expect(canEditBranch(s, "main", guest, "2026-11-02T13:00:00Z")).toBe(false);
    expect(canManage(s, guest, "restoreMain", "2026-11-02T13:00:00Z")).toBe(false);
    expect(canManage(s, guest, "mergeMain", "2026-11-02T15:00:00Z")).toBe(false);
  });
  it("solo anfitrión administra permisos incluso si otro puede fusionar", () => {
    const s = createHistory(board(), host, stamp);
    s.permissions.guest = { mergeMain: true };
    expect(() =>
      executeHistory(
        s,
        { type: "permission", id: "p1", memberId: "guest", permission: { editMain: true } },
        guest,
        {},
        stamp.at,
      ),
    ).toThrow(/anfitrión/);
    expect(() =>
      executeHistory(
        s,
        { type: "commit", id: "c1", branchId: "main", scopes: ["design"], message: "Sin permiso" },
        guest,
        { main: board() },
        stamp.at,
      ),
    ).toThrow(/permiso/);
  });
  it("las ramas admiten edición conjunta o personas asignadas y lector no escribe", () => {
    const s = createHistory(board(), host, stamp);
    const out = executeHistory(
      s,
      { type: "branch", id: "r1", branchId: "backend", name: "Backend", fromCommit: "initial" },
      guest,
      {},
      stamp.at,
    );
    expect(out.writes.backend).toEqual(board());
    expect(canEditBranch(out.state, "backend", guest, stamp.at)).toBe(true);
    out.state.branches.find(b => b.id === "backend")!.editors = ["other"];
    expect(canEditBranch(out.state, "backend", guest, stamp.at)).toBe(false);
    expect(canEditBranch(s, "shared", { ...guest, role: "viewer" }, stamp.at)).toBe(false);
  });
  it("las solicitudes fijan una versión y no toman los borradores posteriores", () => {
    const s = createHistory(board(), host, stamp),
      draft = modify(board(), "nombre", "Revisado");
    let out = executeHistory(
      s,
      { type: "commit", id: "c1", branchId: "shared", scopes: ["design"], message: "Listo" },
      guest,
      { shared: draft },
      stamp.at,
    );
    out = executeHistory(
      out.state,
      {
        type: "propose",
        id: "q1",
        branchId: "shared",
        targetId: "main",
        commitId: "c1",
        scopes: ["design"],
        message: "Revisar",
      },
      guest,
      { shared: modify(draft, "nombre", "Todavía no") },
      stamp.at,
    );
    const merged = executeHistory(
      out.state,
      { type: "merge", id: "m1", proposalId: "q1", expectedHead: "initial", choices: {} },
      host,
      { main: board() },
      stamp.at,
    );
    expect(merged.writes.main.content.big_picture.nodos![0].nombre).toBe("Revisado");
    expect(merged.state.proposals[0].status).toBe("merged");
    expect(() =>
      executeHistory(
        out.state,
        { type: "merge", id: "m2", proposalId: "q1", expectedHead: "stale", choices: {} },
        host,
        { main: board() },
        stamp.at,
      ),
    ).toThrow(/cambi/);
  });
  it("restaurar conserva un punto de recuperación y el resto del historial", () => {
    const s = createHistory(board(), host, stamp),
      draft = modify(board(), "nombre", "Pendiente");
    const restored = executeHistory(
      s,
      { type: "restore", id: "r1", branchId: "shared", commitId: "initial", scopes: ["design"] },
      guest,
      { shared: draft },
      stamp.at,
    );
    expect(restored.state.commits).toHaveLength(3);
    expect(restored.writes.shared).toEqual(board());
    expect(restored.state.commits[1].snapshot).toEqual(draft);
    expect(restored.state.commits[2].kind).toBe("restore");
    expect(() =>
      executeHistory(
        s,
        { type: "restore", id: "r2", branchId: "main", commitId: "initial", scopes: ["design"] },
        guest,
        { main: draft },
        stamp.at,
      ),
    ).toThrow(/permiso/);
  });
  it("una aprobación limitada a una solicitud no sirve para otra", () => {
    const s = createHistory(board(), host, stamp);
    s.permissions.guest = { mergeMain: true, proposalId: "q1" };
    expect(canManage(s, guest, "mergeMain", stamp.at, "q1")).toBe(true);
    expect(canManage(s, guest, "mergeMain", stamp.at, "q2")).toBe(false);
    expect(canManage(s, guest, "mergeMain", stamp.at)).toBe(false);
  });
  it("elige por tiempo una versión guardada y no inventa un estado entre movimientos", () => {
    const s = createHistory(board(), host, stamp);
    const out = executeHistory(
      s,
      { type: "commit", id: "c1", branchId: "shared", message: "Después", scopes: ["design"] },
      guest,
      { shared: modify(board(), "x", 99) },
      "2026-11-02T14:00:00Z",
    );
    expect(versionAt(out.state, "shared", "2026-11-02T13:00:00Z")!.id).toBe("initial");
    expect(versionAt(out.state, "shared", "2026-11-02T15:00:00Z")!.id).toBe("c1");
    expect(commonBase(out.state, "initial", "c1", "design").id).toBe("initial");
  });
  it("una fusión parcial no marca como incorporadas otras vistas", () => {
    const s = createHistory(board(), host, stamp),
      draft = modify(board(), "nombre", "Modelo nuevo");
    draft.customViews[0].mermaidCode = "graph TD; X-->Y";
    let out = executeHistory(
      s,
      { type: "commit", id: "c1", branchId: "shared", message: "Dos vistas", scopes: ["design", "view:web"] },
      guest,
      { shared: draft },
      stamp.at,
    );
    out = executeHistory(
      out.state,
      {
        type: "propose",
        id: "q1",
        branchId: "shared",
        targetId: "main",
        commitId: "c1",
        scopes: ["design"],
        message: "Modelo",
      },
      guest,
      {},
      stamp.at,
    );
    out = executeHistory(
      out.state,
      { type: "merge", id: "m1", proposalId: "q1", expectedHead: "initial", choices: {} },
      host,
      { main: board() },
      stamp.at,
    );
    expect(commonBase(out.state, out.state.branches[0].head, "c1", "view:web").id).toBe("initial");
    expect(out.writes.main.customViews).toEqual(board().customViews);
  });
});
