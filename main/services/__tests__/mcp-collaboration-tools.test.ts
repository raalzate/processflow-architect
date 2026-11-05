import { expect, it, vi } from "vitest";
import { registerProcessflowTools } from "../mcp-tools";
function register(focusScope?: string) {
  const tools = new Map<string, (args: unknown) => Promise<any>>();
  const actOnApp = vi.fn(async () => ({ ok: true as const, message: "Estado", data: { branches: [{ id: "shared" }] } }));
  registerProcessflowTools({ registerTool: (name: string, _def: unknown, callback: (args: unknown) => Promise<any>) => tools.set(name, callback) } as any, { workspace: "unused", focusScope, actOnApp });
  return { call: tools.get("manage_collaboration")!, actOnApp };
}
it("el chat de una caja no puede cambiar, restaurar ni integrar ramas", async () => {
  const { call, actOnApp } = register("node-a");
  for (const command of ["switch", "preview", "return", "history", "preview-merge", "resolve-field"]) {
    const result = await call({ command, branchId: "shared" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/chat.*caja/);
  }
  expect(actOnApp).not.toHaveBeenCalled();
});
it("el chat del proyecto obtiene datos estructurados y propaga rechazos reales", async () => {
  const { call, actOnApp } = register();
  const result = await call({ command: "inspect" });
  expect(result.content[0].text).toContain('"branches":[{"id":"shared"}]');
  expect(actOnApp).toHaveBeenCalledWith({ kind: "collaboration", command: "inspect" }, { timeoutMs: 15000 });
  const invalid = await call({ command: "history", action: { type: "commit" } });
  expect(invalid.isError).toBe(true);
  expect(actOnApp).toHaveBeenCalledTimes(1);
});
