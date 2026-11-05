import { expect, it } from "vitest";
import { assertAiHistoryAction } from "../collaboration-actions";
import type { DiagramHistory, HistoryAction, HistoryActor } from "../../collaboration/history";
const actor: HistoryActor = { id: "guest", name: "Luis", owner: false, role: "editor" };
const history = { branches: [{ id: "main", head: "c" }, { id: "shared", head: "c" }], proposals: [{ id: "pr", targetId: "main" }], permissions: { guest: { editMain: true, mergeMain: true } } } as unknown as DiagramHistory;
it("protege el destino Principal incluso desde otra rama y con permisos humanos delegados", () => {
  expect(() => assertAiHistoryAction({ type: "commit", id: "x", branchId: "main", scopes: ["design"], message: "Cambio" }, history, actor)).toThrow(/anfitrión/);
  expect(() => assertAiHistoryAction({ type: "merge", id: "x", proposalId: "pr", expectedHead: "c", choices: {} }, history, actor)).toThrow(/anfitrión/);
  expect(() => assertAiHistoryAction({ type: "restore", id: "x", branchId: "main", commitId: "c", scopes: ["design"] }, history, actor)).toThrow(/anfitrión/);
});
it("permite trabajar y proponer a Principal sin modificarla", () => {
  const commit: HistoryAction = { type: "commit", id: "x", branchId: "shared", scopes: ["design"], message: "Cambio" };
  expect(assertAiHistoryAction(commit, history, actor)).toEqual(commit);
  expect(() => assertAiHistoryAction({ type: "propose", id: "p", branchId: "shared", targetId: "main", commitId: "c", scopes: ["design"], message: "Revisar" }, history, actor)).not.toThrow();
  expect(() => assertAiHistoryAction({ ...commit, branchId: "main" }, history, { ...actor, owner: true })).not.toThrow();
});
it("un invitado no puede otorgarse permisos y valida el contrato antes de ejecutarlo", () => {
  expect(() => assertAiHistoryAction({ type: "permission", id: "p", memberId: "guest", permission: { mergeMain: true } }, history, actor)).toThrow(/anfitrión/);
  expect(() => assertAiHistoryAction({ type: "commit", id: "p" } as HistoryAction, history, actor)).toThrow(/inválida/);
});
