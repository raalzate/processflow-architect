import { expect, it } from "vitest";
import { judgeCall } from "../builder-tools";
const ctx = { vistas: [], tools: [{ name: "manage_collaboration", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string" } } } }] };
it("explica quién recibe permisos y qué permisos antes de confirmarlos", () => {
  const result = judgeCall({ tool: "manage_collaboration", args: { command: "history", action: { type: "permission", memberId: "Luis", permission: { editMain: true, mergeMain: false } } } }, ctx);
  expect(result.kind).toBe("confirmar"); if (result.kind !== "confirmar") return;
  expect(result.alcance).toContain("Luis"); expect(result.alcance).toContain("Editar Principal: Sí"); expect(result.alcance).toContain("Integrar en Principal: No");
});
it("identifica versión, rama y vistas al restaurar", () => {
  const result = judgeCall({ tool: "manage_collaboration", args: { command: "history", action: { type: "restore", branchId: "main", commitId: "version-2", scopes: ["design"] } } }, ctx);
  expect(result.kind).toBe("confirmar"); if (result.kind !== "confirmar") return;
  expect(result.alcance).toContain("Principal"); expect(result.alcance).toContain("version-2"); expect(result.alcance).toContain("Modelo");
});
