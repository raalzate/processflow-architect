import { describe, it, expect, vi, afterEach } from "vitest";

const runLocal = vi.fn();
vi.mock("@/lib/ai/providers", () => ({ runLocal: (...a: unknown[]) => runLocal(...a) }));

import { formatTaskListToMarkdown } from "@/lib/markdown-utils";
import { setHostBridge } from "@/lib/host-bridge";
import type { GraphNode } from "@/lib/types";

const nodo = { id: "n1", nombre: "Registrar pedido", tipo_elemento: "X" } as unknown as GraphNode;

afterEach(() => {
  setHostBridge(null);
  vi.unstubAllGlobals();
  runLocal.mockReset();
});

/**
 * Parafrasear con IA depende de que haya un host (antes: `window.electronAPI` a
 * mano). Sin host se usa el nombre tal cual y no se llama al motor.
 */
describe("formatTaskListToMarkdown · parafraseo según el host", () => {
  it("sin host no llama a la IA aunque se pida, y deja el nombre", async () => {
    const md = await formatTaskListToMarkdown({ new: [nodo], modified: [] }, undefined, true);
    expect(runLocal).not.toHaveBeenCalled();
    expect(md).toContain("Registrar pedido");
  });

  it("con el host de escritorio parafrasea", async () => {
    vi.stubGlobal("window", { electronAPI: {} });
    runLocal.mockResolvedValue("  Dar de alta un pedido ");
    const md = await formatTaskListToMarkdown({ new: [nodo], modified: [] }, undefined, true);
    expect(runLocal).toHaveBeenCalledTimes(1);
    expect(md).toContain("Dar de alta un pedido");
  });

  it("si el motor falla, cae al nombre en vez de romper el documento", async () => {
    setHostBridge({});
    runLocal.mockRejectedValue(new Error("sin WebGPU"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const md = await formatTaskListToMarkdown({ new: [], modified: [nodo] }, undefined, true);
    expect(md).toContain("Registrar pedido");
  });

  it("sin pedir IA no la llama aunque haya host", async () => {
    setHostBridge({});
    await formatTaskListToMarkdown({ new: [nodo], modified: [] }, undefined, false);
    expect(runLocal).not.toHaveBeenCalled();
  });
});
