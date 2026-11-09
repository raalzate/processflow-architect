import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerProcessflowTools } from "../mcp-tools";
import { ontologyMarkdown } from "../../../src/lib/mcp/catalog";
import { typesWithRole } from "../../../src/lib/notations";

// Spec 027 · T7 y T13: las herramientas MCP de la ontología responden lo mismo
// que la lógica pura y persisten el predicado en el diagrama.

let workspace = "";
beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "pf-onto-"));
});
afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

function toolsFor() {
  const tools = new Map<string, (args: any) => Promise<any>>();
  const server = { registerTool: (name: string, _def: unknown, handler: any) => tools.set(name, handler) } as any;
  registerProcessflowTools(server, { workspace } as any);
  const call = (name: string, args: any = {}) => tools.get(name)!(args);
  const textOf = async (name: string, args: any = {}) => (await call(name, args)).content[0].text as string;
  return { call, textOf };
}

/** El modelo guardado en disco (busca `<id>.json` bajo el workspace). */
async function guardado(id: string): Promise<string> {
  const buscar = async (dir: string): Promise<string | null> => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        const r = await buscar(p);
        if (r) return r;
      } else if (e.name === `${id}.json`) return fs.readFile(p, "utf8");
    }
    return null;
  };
  return (await buscar(workspace)) ?? "";
}

const tipo = (n: string, r: Parameters<typeof typesWithRole>[1]) => typesWithRole(n, r)[0];

describe("get_ontology", () => {
  it("responde el mismo markdown que la API pura", async () => {
    const { textOf } = toolsFor();
    expect(await textOf("get_ontology", { notation: "ddd" })).toBe(ontologyMarkdown("ddd"));
  });

  it("describe_notation lista los predicados", async () => {
    const { textOf } = toolsFor();
    expect(await textOf("describe_notation", { notation: "ddd" })).toMatch(/`dispara`.*→/);
  });
});

describe("set_edge_predicate", () => {
  it("fija un predicado válido, rechaza uno incompatible y lo quita con null", async () => {
    const t = toolsFor();
    const id = /diagramId="([^"]+)"/.exec(await t.textOf("create_diagram", { name: "Ventas", notation: "ddd" }))![1];
    await t.call("add_node", { diagramId: id, id: "cmd", name: "Pagar", type: tipo("ddd", "command") });
    await t.call("add_node", { diagramId: id, id: "evt", name: "Pagado", type: tipo("ddd", "event") });
    await t.call("add_edge", { diagramId: id, from: "cmd", to: "evt", label: "emite" });

    const ok = await t.call("set_edge_predicate", { diagramId: id, from: "cmd", to: "evt", predicate: "dispara" });
    expect(ok.isError).toBeUndefined();
    expect(JSON.parse(await guardado(id)).edges[0].predicado).toBe("dispara");

    const mal = await t.call("set_edge_predicate", { diagramId: id, from: "cmd", to: "evt", predicate: "reacciona_a" });
    expect(mal.isError).toBe(true);
    expect(mal.content[0].text).toMatch(/dispara/);

    await t.call("set_edge_predicate", { diagramId: id, from: "cmd", to: "evt", predicate: null });
    expect(JSON.parse(await guardado(id)).edges[0].predicado).toBeUndefined();
  });
});
