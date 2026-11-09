import { describe, expect, it } from "vitest";
import { aiBranchPolicy } from "../branch-policy";
describe("IA en ramas colaborativas", () => {
  it("cualquier proveedor puede editar una rama autorizada y un proyecto individual", () => {
    expect(aiBranchPolicy()).toEqual({ allowed: true });
    expect(aiBranchPolicy({ branchId: "backend", owner: false, role: "editor", canEdit: true, saved: true, initialized: true })).toEqual({ allowed: true });
  });
  it("sólo la IA del anfitrión escribe Principal, aunque el humano tenga edición delegada", () => {
    const state = { branchId: "main", owner: false, role: "editor" as const, canEdit: true, saved: true, initialized: true };
    expect(aiBranchPolicy(state).allowed).toBe(false);
    expect(aiBranchPolicy(state).error).toContain("anfitrión");
    expect(aiBranchPolicy({ ...state, owner: true }).allowed).toBe(true);
  });
  it("no confirma edición sobre lectura, vista histórica ni guardado detenido", () => {
    const base = { branchId: "shared", owner: false, role: "editor" as const, canEdit: true, saved: true, initialized: true };
    for (const extra of [{ role: "viewer" as const }, { preview: true }, { saved: false }, { initialized: false }, { canEdit: false }]) expect(aiBranchPolicy({ ...base, ...extra }).allowed).toBe(false);
  });
});
