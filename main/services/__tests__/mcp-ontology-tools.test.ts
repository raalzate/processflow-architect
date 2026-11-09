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

// T25 · FR-030, FR-014: las consultas por MCP responden lo mismo que la API pura,
// sobre el diagrama activo o sobre la org entera.
describe("consultas al conocimiento", () => {
  async function armar() {
    const t = toolsFor();
    const crear = async (name: string, notation: string) =>
      /diagramId="([^"]+)"/.exec(await t.textOf("create_diagram", { name, notation }))![1];
    const es = await crear("Cobros", "ddd");
    await t.call("add_node", { diagramId: es, id: "cmd", name: "Pagar", type: tipo("ddd", "command") });
    await t.call("add_node", { diagramId: es, id: "evt", name: "Pagado", type: tipo("ddd", "event") });
    await t.call("add_edge", { diagramId: es, from: "cmd", to: "evt", label: "emite" });
    const c4 = await crear("Paisaje", "c4");
    await t.call("add_node", { diagramId: c4, id: "s", name: "Pagos", type: tipo("c4", "system") });
    await t.call("add_node", { diagramId: c4, id: "x", name: "Pasarela", type: tipo("c4", "external") });
    await t.call("add_edge", { diagramId: c4, from: "s", to: "x", label: "usa" });
    return { t, es, c4 };
  }

  it("query_knowledge sobre el diagrama pedido; scope org ve los dos", async () => {
    const { t, es } = await armar();
    const solo = await t.textOf("query_knowledge", { diagramId: es, patterns: [["?a", "dispara", "?b"]] });
    expect(solo).toContain("| Pagar | Pagado |");
    expect(await t.textOf("query_knowledge", { diagramId: es, patterns: [["?a", "usa", "?b"]] })).toMatch(/^Sin filas/);
    const org = await t.textOf("query_knowledge", { diagramId: es, patterns: [["?a", "usa", "?b"]], scope: "org" });
    expect(org).toContain("| Pagos | Pasarela |");
  });

  it("find_path, explain_fact y ask_competency", async () => {
    const { t, c4 } = await armar();
    expect(await t.textOf("find_path", { diagramId: c4, from: "Pagos", to: "Pasarela" })).toBe(
      "1 camino(s):\n- Pagos —usa→ Pasarela"
    );
    expect(await t.textOf("explain_fact", { diagramId: c4, subject: "Pagos", predicate: "depende de", object: "Pasarela" })).toMatch(
      /por subpropiedad/
    );
    const pc = await t.textOf("ask_competency", { diagramId: c4, id: "PC-07", args: { sistema: "Pasarela" } });
    expect(pc).toContain("| Pagos | Pasarela |");
  });

  it("un diagrama que no existe es error accionable", async () => {
    const { t } = await armar();
    const r = await t.call("query_knowledge", { diagramId: "nada", patterns: [["?a", "?p", "?b"]] });
    expect(r.isError).toBe(true);
  });
});

// T30 · link_elements: vincular dos diagramas y que la consulta de la org los atraviese.
describe("link_elements", () => {
  it("Sistema realiza Contexto: PC-07 con scope org llega al Contexto", async () => {
    const t = toolsFor();
    const crear = async (name: string, notation: string) =>
      /diagramId="([^"]+)"/.exec(await t.textOf("create_diagram", { name, notation }))![1];
    const es = await crear("Cobros", "ddd");
    await t.call("add_container", { diagramId: es, id: "ctx", name: "Pagos", type: tipo("ddd", "context") });
    const c4 = await crear("Paisaje", "c4");
    await t.call("add_node", { diagramId: c4, id: "s", name: "Pagos", type: tipo("c4", "system") });
    await t.call("add_node", { diagramId: c4, id: "x", name: "Pasarela", type: tipo("c4", "external") });
    await t.call("add_edge", { diagramId: c4, from: "s", to: "x", label: "usa" });

    const mal = await t.call("link_elements", { a: { diagram: c4, element: "Pagos" }, b: { diagram: es, element: "Pagos" }, kind: "same_as" });
    expect(mal.isError).toBe(true);
    const ok = await t.call("link_elements", { a: { diagram: c4, element: "Pagos" }, b: { diagram: es, element: "Pagos" }, kind: "realizes" });
    expect(ok.isError).toBeUndefined();
    expect(JSON.parse(await guardado("vinculos"))).toHaveLength(1);

    const pc = await t.textOf("ask_competency", { diagramId: c4, id: "PC-07", args: { sistema: "Pasarela" }, scope: "org" });
    expect(pc).toMatch(/\| Pagos \[[^\]]+\] \| Pasarela \| Pagos \[[^\]]+\] \|/);
  });
});

// T32 · export_knowledge responde lo mismo que la API pura y es Turtle válido.
describe("export_knowledge", () => {
  it("Turtle del diagrama activo, parseable; con inferred suma lo deducido", async () => {
    const { Parser } = await import("n3");
    const t = toolsFor();
    const id = /diagramId="([^"]+)"/.exec(await t.textOf("create_diagram", { name: "Ventas", notation: "ddd" }))![1];
    await t.call("add_node", { diagramId: id, id: "cmd", name: "Pagar", type: tipo("ddd", "command") });
    await t.call("add_node", { diagramId: id, id: "evt", name: "Pagado", type: tipo("ddd", "event") });
    await t.call("add_edge", { diagramId: id, from: "cmd", to: "evt", label: "emite" });
    const solo = await t.textOf("export_knowledge", { diagramId: id, format: "turtle" });
    const con = await t.textOf("export_knowledge", { diagramId: id, format: "turtle", inferred: true });
    const n = (ttl: string) => new Parser({ format: "Turtle" }).parse(ttl).length;
    expect(n(con)).toBeGreaterThan(n(solo));
    expect(con).toContain("Deducidos por el razonador");
    const ld = JSON.parse(await t.textOf("export_knowledge", { diagramId: id, format: "jsonld" }));
    expect(ld["@context"].pf).toBe("https://processflow.app/ontology#");
  });
});
