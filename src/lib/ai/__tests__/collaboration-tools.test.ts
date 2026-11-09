import { expect, it } from "vitest";
import { getAgentProfile } from "../agent-profiles";
import { judgeCall } from "../builder-tools";
const ctx = { vistas: [], tools: [{ name: "manage_collaboration", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" }, action: { type: "object" } } } }] };
it("el Constructor puede consultar y usar ramas con el MCP real", () => {
  expect(getAgentProfile("constructor").tools).toContain("manage_collaboration");
  expect(judgeCall({ tool: "manage_collaboration", args: { command: "inspect" } }, ctx).kind).toBe("ejecutar");
  expect(judgeCall({ tool: "manage_collaboration", args: { command: "history", action: { type: "commit" } } }, ctx).kind).toBe("ejecutar");
});
it("integrar, restaurar y cambiar permisos conservan revisión humana", () => {
  for (const type of ["merge", "restore", "pull", "permission", "editors", "reject"]) expect(judgeCall({ tool: "manage_collaboration", args: { command: "history", action: { type } } }, ctx).kind).toBe("confirmar");
  expect(judgeCall({ tool: "manage_collaboration", args: { command: "repair-connection", viewId: "design", edgeId: "e" } }, ctx).kind).toBe("confirmar");
});
