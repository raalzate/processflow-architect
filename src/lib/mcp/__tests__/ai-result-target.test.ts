import { expect, it } from "vitest";
import { aiResultStillApplies } from "../branch-policy";
it("un resultado IA tardío no escribe en otra rama, proyecto o Principal protegida", () => {
  const start = { fileId: "project", scope: "project::shared", readOnly: false };
  expect(aiResultStillApplies(start, { ...start })).toBe(true);
  expect(aiResultStillApplies(start, { ...start, scope: "project::main" })).toBe(false);
  expect(aiResultStillApplies(start, { ...start, fileId: "other" })).toBe(false);
  expect(aiResultStillApplies(start, { ...start, readOnly: true })).toBe(false);
});
