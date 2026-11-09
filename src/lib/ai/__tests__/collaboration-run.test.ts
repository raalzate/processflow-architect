import { expect, it } from "vitest";
import { startRun, applyObservation, relecturaEsteril, yaEjecutada } from "../builder-run";
const inspect = { tool: "manage_collaboration", args: { command: "inspect" } };
it("consulta otra vez tras crear una rama y reconoce la escritura como progreso real", () => {
  let state = applyObservation(startRun(), inspect, { ok: true, texto: "Historia inicial" });
  const write = { tool: "manage_collaboration", args: { command: "history", action: { id: "new", type: "branch", branchId: "ensayo" } } };
  state = applyObservation(state, write, { ok: true, texto: "Rama creada" });
  expect(state.sinProgreso).toBe(0); expect(state.cambios).toHaveLength(1);
  expect(yaEjecutada(state, inspect)).toBe(false);
  expect(relecturaEsteril(state, inspect)).toBeUndefined();
  expect(yaEjecutada(state, write)).toBe(true);
});
it("cambiar de rama invalida lecturas anteriores sin inventar una edición de diagrama", () => {
  const read = { tool: "get_app_state", args: {} };
  let state = applyObservation(startRun(), read, { ok: true, texto: "Principal" });
  const select = { tool: "manage_collaboration", args: { command: "switch", branchId: "ensayo" } };
  state = applyObservation(state, select, { ok: true, texto: "Ensayo" });
  expect(relecturaEsteril(state, read)).toBeUndefined();
  expect(yaEjecutada(state, select)).toBe(false);
  expect(state.cambios).toHaveLength(0); expect(state.sinProgreso).toBe(0);
});
