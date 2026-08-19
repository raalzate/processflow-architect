import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerProcessflowTools } from "../mcp-tools";
import { typesWithRole } from "../../../src/lib/notations";

/** Server MCP falso: captura las herramientas registradas (nombre → handler). */
function fakeServer() {
  const tools = new Map<string, { def: any; handler: (args: any) => Promise<any> }>();
  return {
    server: { registerTool: (name: string, def: any, handler: any) => tools.set(name, { def, handler }) } as any,
    tools,
  };
}

describe("registerProcessflowTools · export_mermaid_view", () => {
  it("NO registra la herramienta si falta exportMermaidToApp", () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x" });
    expect(tools.has("export_mermaid_view")).toBe(false);
  });

  it("registra la herramienta y entrega el código Mermaid al callback", async () => {
    const { server, tools } = fakeServer();
    let captured: { name: string; code: string } | null = null;
    registerProcessflowTools(server, {
      workspace: "/tmp/x",
      exportMermaidToApp: async (name, code) => {
        captured = { name, code };
        return true;
      },
    });

    expect(tools.has("export_mermaid_view")).toBe(true);
    const res = await tools.get("export_mermaid_view")!.handler({
      name: "Demo",
      code: "sequenceDiagram\n  U->>S: hola",
    });
    expect(captured).toEqual({ name: "Demo", code: "sequenceDiagram\n  U->>S: hola" });
    expect(res.content[0].text).toContain("✅");
    expect(res.isError).toBeUndefined();
  });

  it("falla (isError) si el código está vacío", async () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x", exportMermaidToApp: async () => true });
    const res = await tools.get("export_mermaid_view")!.handler({ name: "X", code: "   " });
    expect(res.isError).toBe(true);
  });

  it("devuelve error si la ventana no está disponible (callback → false)", async () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x", exportMermaidToApp: async () => false });
    const res = await tools.get("export_mermaid_view")!.handler({ name: "X", code: "flowchart TD\n A-->B" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("ventana activa");
  });
});

// -----------------------------------------------------------------------------
// El arnés del agente externo: ingesta del estado, trazabilidad a la fuente,
// ambigüedades registradas, calidad y paquete de revisión antes de exportar.
// -----------------------------------------------------------------------------

let workspace = "";
let projectDir = "";

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "pf-ws-"));
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "pf-proj-"));
});
afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.rm(projectDir, { recursive: true, force: true });
});

/** Herramientas registradas contra un workspace temporal. */
function toolsFor(opts: Record<string, unknown> = {}) {
  const { server, tools } = fakeServer();
  registerProcessflowTools(server, { workspace, ...opts } as any);
  const call = (name: string, args: any = {}) => tools.get(name)!.handler(args);
  const textOf = async (name: string, args: any = {}) => (await call(name, args)).content[0].text as string;
  return { tools, call, textOf };
}

const tipo = (notation: string, role: Parameters<typeof typesWithRole>[1]) =>
  typesWithRole(notation, role)[0];

describe("get_app_state", () => {
  it("sin estado publicado explica las implicaciones (modo stdio)", async () => {
    const { textOf } = toolsFor();
    const out = await textOf("get_app_state");
    expect(out).toContain("export_as_view");
  });

  it("sirve el retrato publicado por el renderer", async () => {
    const { textOf } = toolsFor({
      getAppState: () => ({
        projectName: "Aurora",
        notation: "bpmn",
        counts: { containers: 2, nodes: 9, edges: 8 },
        views: [{ id: "v1", name: "Proceso de pago", kind: "graph", notation: "bpmn", elements: 9 }],
        viewsLimit: 50,
        projects: ["Aurora"],
        updatedAt: "2026-08-14T10:00:00.000Z",
      }),
    });
    const out = await textOf("get_app_state");
    expect(out).toContain("Aurora");
    expect(out).toContain("Proceso de pago");
    expect(out).toContain("REEMPLAZA");
  });
});

describe("trazabilidad y ambigüedades", () => {
  /** DDD mínimo con cadena Comando → Evento y cita de la fuente. */
  async function diagramaConFuente(t: ReturnType<typeof toolsFor>) {
    const created = await t.textOf("create_diagram", { name: "Ventas", notation: "ddd" });
    const id = /diagramId="([^"]+)"/.exec(created)![1];
    await t.call("add_container", {
      diagramId: id,
      name: "Pagos",
      type: tipo("ddd", "context"),
      source: "PRD §4",
    });
    await t.call("add_node", {
      diagramId: id,
      id: "cmd",
      name: "Pagar Pedido",
      type: tipo("ddd", "command"),
      container: "Pagos",
      source: "PRD §4.2 (p. 11)",
    });
    await t.call("add_node", {
      diagramId: id,
      id: "evt",
      name: "Pago Confirmado",
      type: tipo("ddd", "event"),
      container: "Pagos",
      source: "PRD §4.2 (p. 11)",
    });
    await t.call("add_edge", { diagramId: id, from: "cmd", to: "evt", label: "dispara" });
    return id;
  }

  it("la cita viaja al .json exportado y a la tabla de revisión", async () => {
    const t = toolsFor();
    const id = await diagramaConFuente(t);

    const review = await t.textOf("review_diagram", { diagramId: id, sourceLabel: "PRD Aurora v3" });
    expect(review).toContain("PRD Aurora v3");
    expect(review).toContain("Elemento ← fuente");
    expect(review).toContain("PRD §4.2 (p. 11)");
    expect(review).toContain("Listo para exportar");

    await t.call("export_to_app", { diagramId: id });
    const graph = JSON.parse(await fs.readFile(path.join(workspace, `${id}.json`), "utf8"));
    const nodo = graph.agregados[0].nodos.find((n: any) => n.id === "cmd");
    expect(nodo.descripcion).toContain("Fuente: PRD §4.2 (p. 11)");
  });

  it("registra, resuelve y entrega las ambigüedades al humano", async () => {
    const t = toolsFor();
    const id = await diagramaConFuente(t);

    const rec = await t.textOf("record_ambiguity", {
      diagramId: id,
      question: "¿Quién aprueba el reembolso?",
      options: ["Tesorería", "Gerencia"],
      affects: "Responsable de la tarea de aprobación",
    });
    const ambId = /id="([^"]+)"/.exec(rec)![1];
    expect(await t.textOf("review_diagram", { diagramId: id })).toContain("Pendiente en la fuente");

    await t.call("resolve_ambiguity", { diagramId: id, id: ambId, resolution: "Tesorería" });
    const review = await t.textOf("review_diagram", { diagramId: id });
    expect(review).toContain("Decisiones tomadas");
    expect(review).toContain("Tesorería");

    // Y llega a la app: las notas del proyecto exportado las llevan.
    await t.call("export_to_app", { diagramId: id });
    const graph = JSON.parse(await fs.readFile(path.join(workspace, `${id}.json`), "utf8"));
    expect(graph.notas).toContain("¿Quién aprueba el reembolso?");
  });

  it("resolve_ambiguity con id desconocido devuelve error accionable", async () => {
    const t = toolsFor();
    const id = await diagramaConFuente(t);
    const res = await t.call("resolve_ambiguity", { diagramId: id, id: "nope", resolution: "x" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("No hay una ambigüedad");
  });
});

describe("validate_diagram · calidad de modelado", () => {
  it("reporta las ramas de compuerta sin condición y bloquea la revisión", async () => {
    const t = toolsFor();
    const created = await t.textOf("create_diagram", { name: "Proceso", notation: "bpmn" });
    const id = /diagramId="([^"]+)"/.exec(created)![1];
    await t.call("add_node", { diagramId: id, id: "ini", name: "Pedido recibido", type: tipo("bpmn", "start") });
    await t.call("add_node", { diagramId: id, id: "t1", name: "Revisar pedido", type: tipo("bpmn", "task") });
    await t.call("add_node", { diagramId: id, id: "gw", name: "¿Hay stock?", type: tipo("bpmn", "gateway") });
    await t.call("add_node", { diagramId: id, id: "fin", name: "Fin", type: tipo("bpmn", "end") });
    await t.call("add_edge", { diagramId: id, from: "ini", to: "t1", label: "inicia" });
    await t.call("add_edge", { diagramId: id, from: "t1", to: "gw", label: "evalúa" });
    await t.call("add_edge", { diagramId: id, from: "gw", to: "fin" });
    await t.call("add_edge", { diagramId: id, from: "gw", to: "t1" });

    const out = await t.textOf("validate_diagram", { diagramId: id });
    expect(out).toContain("Calidad de modelado");
    expect(out).toContain("RAMAS");
    expect(await t.textOf("review_diagram", { diagramId: id })).toContain("No exportes todavía");
  });
});

describe("update_element / update_edge", () => {
  it("acorta nombre y etiqueta sin perder relaciones ni id", async () => {
    const t = toolsFor();
    const created = await t.textOf("create_diagram", { name: "Ventas", notation: "ddd" });
    const id = /diagramId="([^"]+)"/.exec(created)![1];
    await t.call("add_node", {
      diagramId: id,
      id: "cmd",
      name: "Registrar el medio de pago del titular",
      type: tipo("ddd", "command"),
    });
    await t.call("add_node", { diagramId: id, id: "evt", name: "Medio registrado", type: tipo("ddd", "event") });
    await t.call("add_edge", {
      diagramId: id,
      from: "cmd",
      to: "evt",
      label: "registra tarjeta o cuenta y compensa [HTTPS/JSON]",
    });

    expect(await t.textOf("validate_diagram", { diagramId: id })).toMatch(/NOMBRE-LARGO|ETIQUETA-LARGA/);

    await t.call("update_element", {
      diagramId: id,
      id: "cmd",
      name: "Registrar medio pago",
      description: "Nombre completo: Registrar el medio de pago del titular.",
    });
    await t.call("update_edge", { diagramId: id, from: "cmd", to: "evt", label: "registra medio [HTTPS]" });

    const out = await t.textOf("validate_diagram", { diagramId: id });
    expect(out).not.toContain("NOMBRE-LARGO");
    expect(out).not.toContain("ETIQUETA-LARGA");
    // La relación sigue en pie y el detalle no se perdió.
    const review = await t.textOf("review_diagram", { diagramId: id });
    expect(review).toContain("Registrar medio pago");
    expect(review).toContain("Nombre completo");
  });

  it("devuelve error accionable si el elemento o la relación no existen", async () => {
    const t = toolsFor();
    const created = await t.textOf("create_diagram", { name: "X", notation: "ddd" });
    const id = /diagramId="([^"]+)"/.exec(created)![1];
    const a = await t.call("update_element", { diagramId: id, id: "nope", name: "X" });
    expect(a.isError).toBe(true);
    const b = await t.call("update_edge", { diagramId: id, from: "a", to: "b", label: "x" });
    expect(b.isError).toBe(true);
  });
});

describe("relayout_diagram", () => {
  it("rehace la geometría de un diagrama con posiciones viejas guardadas", async () => {
    const t = toolsFor();
    const created = await t.textOf("create_diagram", { name: "Proceso", notation: "bpmn" });
    const id = /diagramId="([^"]+)"/.exec(created)![1];
    await t.call("add_container", { diagramId: id, name: "A", type: tipo("bpmn", "pool") });
    await t.call("add_node", { diagramId: id, id: "ini", name: "Inicio", type: tipo("bpmn", "start"), container: "A" });
    await t.call("add_node", { diagramId: id, id: "t1", name: "Revisar", type: tipo("bpmn", "task"), container: "A" });
    await t.call("add_node", { diagramId: id, id: "fin", name: "Fin", type: tipo("bpmn", "end"), container: "A" });
    await t.call("add_edge", { diagramId: id, from: "ini", to: "t1", label: "inicia" });
    await t.call("add_edge", { diagramId: id, from: "t1", to: "fin", label: "cierra" });

    // Simula un modelo guardado con la disposición vieja (todo en x=9999).
    const file = path.join(workspace, ".processflow", "diagrams", `${id}.json`);
    const viejo = JSON.parse(await fs.readFile(file, "utf8"));
    viejo.nodes = viejo.nodes.map((n: any) => ({ ...n, x: 9999, y: 9999, width: 999 }));
    await fs.writeFile(file, JSON.stringify(viejo), "utf8");

    const out = await t.textOf("relayout_diagram", { diagramId: id });
    expect(out).toContain("Layout rehecho");
    expect(out).toMatch(/Lienzo: \d+×\d+ px/);

    const nuevo = JSON.parse(await fs.readFile(file, "utf8"));
    expect(nuevo.nodes.every((n: any) => n.x !== 9999)).toBe(true);
    // Semántica intacta.
    expect(nuevo.nodes.map((n: any) => n.id).sort()).toEqual(
      viejo.nodes.map((n: any) => n.id).sort()
    );
    expect(nuevo.edges).toEqual(viejo.edges);
  });
});

describe("suggest_views", () => {
  it("propone el paisaje C4 cuando el modelo nombra varios sistemas", async () => {
    const t = toolsFor();
    const created = await t.textOf("create_diagram", { name: "Ventas", notation: "ddd" });
    const id = /diagramId="([^"]+)"/.exec(created)![1];
    await t.call("add_node", { diagramId: id, id: "cmd", name: "Pagar", type: tipo("ddd", "command") });
    for (const [i, nombre] of ["Pasarela", "ERP", "Courier"].entries()) {
      await t.call("add_node", { diagramId: id, id: `s${i}`, name: nombre, type: tipo("ddd", "external") });
      await t.call("add_edge", { diagramId: id, from: "cmd", to: `s${i}`, label: "usa" });
    }
    expect(await t.textOf("suggest_views", { diagramId: id })).toContain("Paisaje de sistemas");
  });
});

describe("list_skills / install_skill", () => {
  it("lista los skills entregables con su ruta de instalación", async () => {
    const { textOf } = toolsFor();
    const out = await textOf("list_skills");
    expect(out).toContain("documento-a-processflow");
    expect(out).toContain("disenar-diagrama");
    expect(out).toContain(".claude/skills/");
  });

  it("instala en el proyecto del usuario con la configuración del transporte inyectada", async () => {
    const { textOf } = toolsFor({
      exportToApp: async () => true,
      exportViewToApp: async () => true,
      transport: "http",
      serverUrl: () => "http://127.0.0.1:7331/mcp",
    });
    const out = await textOf("install_skill", {
      skill: "disenar-diagrama",
      scope: "project",
      projectDir,
      overwrite: false,
      configure: true,
    });
    expect(out).toContain("Escritos");

    const md = await fs.readFile(
      path.join(projectDir, ".claude", "skills", "disenar-diagrama", "SKILL.md"),
      "utf8"
    );
    expect(md).toContain("## Configuración activa (generada al instalar)");
    expect(md).toContain("http://127.0.0.1:7331/mcp");
    // Las herramientas anunciadas son las REALMENTE registradas en este servidor.
    expect(md).toContain("get_app_state");
    expect(md).toContain("export_as_view");
    // El frontmatter sigue primero (si no, Claude Code no reconoce el skill).
    expect(md.startsWith("---\nname: disenar-diagrama\n")).toBe(true);
  });

  it("en modo stdio el skill instalado declara lo que NO está disponible", async () => {
    const { textOf } = toolsFor();
    await textOf("install_skill", { skill: "disenar-diagrama", scope: "project", projectDir, overwrite: false, configure: true });
    const md = await fs.readFile(
      path.join(projectDir, ".claude", "skills", "disenar-diagrama", "SKILL.md"),
      "utf8"
    );
    expect(md).toContain("stdio");
    expect(md).toContain("No disponibles aquí");
    expect(md).toContain("export_as_view");
  });

  it("instala todos los skills con sus references y no pisa sin overwrite", async () => {
    const { textOf } = toolsFor();
    const primero = await textOf("install_skill", { skill: "all", scope: "project", projectDir, overwrite: false, configure: false });
    expect(primero).toContain("documento-a-processflow/references/ejemplos.md");

    const segundo = await textOf("install_skill", { skill: "all", scope: "project", projectDir, overwrite: false, configure: false });
    expect(segundo).toContain("Ya existían");
    expect(segundo).toContain("overwrite=true");

    const tercero = await textOf("install_skill", { skill: "all", scope: "project", projectDir, overwrite: true, configure: false });
    expect(tercero).toContain("Escritos");
  });

  it("exige projectDir con scope=project", async () => {
    const { call } = toolsFor();
    const res = await call("install_skill", { skill: "all", scope: "project", overwrite: false, configure: true });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("projectDir");
  });
});

// -----------------------------------------------------------------------------
// Lectura de la app: artefactos, vistas y otro proyecto (sólo modo app).
// -----------------------------------------------------------------------------

describe("lectura de la app (list_artifacts · get_artifact · list_views · get_view)", () => {
  const graph = (nombre: string, nodos: number) => ({
    nombre_proyecto: nombre,
    version: "1.0.0",
    fecha_analisis: "2026-08-19",
    notation: "ddd",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: Array.from({ length: nodos }, (_, i) => ({
        id: `n${i}`,
        nombre: `Nodo ${i}`,
        tipo_elemento: tipo("ddd", "command"),
        descripcion: "",
        estado_comparativo: "nuevo",
      })),
      aristas: [],
    },
    agregados: [],
  });

  /** Puente falso: contesta como lo haría el renderer. */
  const readApp = async (req: any) => {
    if (req.project && req.project !== "Otro") {
      return { ok: false, error: `No hay un proyecto que resuelva a "${req.project}".`, options: ["Seguros", "Otro"] };
    }
    const project = req.project === "Otro" ? "Otro" : "Seguros";
    if (req.kind === "artifacts") {
      return {
        ok: true,
        project,
        kind: "artifacts",
        artifacts: [
          { title: "Drivers de Arquitectura", kind: "drivers", render: "markdown", revision: 2, createdAt: "2026-08-19T00:00:00.000Z", chars: 120, revisions: [1, 2] },
        ],
      };
    }
    if (req.kind === "artifact") {
      if (req.title === "roadmap") {
        return { ok: false, error: "no resuelve", options: ["Drivers de Arquitectura (v2)"] };
      }
      return {
        ok: true,
        project,
        kind: "artifact",
        artifact: {
          title: "Drivers de Arquitectura",
          kind: "drivers",
          render: "markdown",
          revision: 2,
          createdAt: "2026-08-19T00:00:00.000Z",
          chars: 20,
          revisions: [1, 2],
          markdown: "## Contexto\ncuerpo del artefacto",
        },
      };
    }
    if (req.kind === "views") {
      return {
        ok: true,
        project,
        kind: "views",
        views: [{ name: "Modelo", kind: "design", notation: "ddd", builtin: true, elements: 3 }],
      };
    }
    if (req.name === "Secuencia") {
      return { ok: true, project, kind: "view", view: { name: "Secuencia", kind: "mermaid", elements: 0, mermaidCode: "sequenceDiagram\n  U->>S: hola" } };
    }
    return {
      ok: true,
      project,
      kind: "view",
      view: { name: "Modelo", kind: "design", notation: "ddd", builtin: true, elements: 2, graph: graph(project, 2) },
    };
  };

  it("sin readApp (modo stdio) las herramientas NO se registran", () => {
    const { tools } = toolsFor();
    for (const t of ["list_artifacts", "get_artifact", "list_views", "get_view"]) {
      expect(tools.has(t)).toBe(false);
    }
  });

  it("lista los artefactos del proyecto activo con su revisión", async () => {
    const { textOf } = toolsFor({ readApp });
    const t = await textOf("list_artifacts");
    expect(t).toContain('Artefactos de "Seguros"');
    expect(t).toContain("Drivers de Arquitectura");
    expect(t).toContain("v2 (de 2)");
  });

  it("devuelve el Markdown del artefacto", async () => {
    const { textOf } = toolsFor({ readApp });
    const t = await textOf("get_artifact", { title: "drivers" });
    expect(t).toContain("# Drivers de Arquitectura (v2)");
    expect(t).toContain("cuerpo del artefacto");
  });

  it("un título que no resuelve devuelve isError con las opciones", async () => {
    const { call } = toolsFor({ readApp });
    const res = await call("get_artifact", { title: "roadmap" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Disponibles: Drivers de Arquitectura (v2)");
  });

  it("un proyecto inexistente propone los que hay", async () => {
    const { call } = toolsFor({ readApp });
    const res = await call("list_artifacts", { project: "Aurora" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Disponibles: Seguros · Otro");
  });

  it("lista vistas y llega a otro proyecto", async () => {
    const { textOf } = toolsFor({ readApp });
    expect(await textOf("list_views")).toContain('Vistas de "Seguros"');
    expect(await textOf("list_views", { project: "Otro" })).toContain('Vistas de "Otro"');
  });

  it("get_view devuelve Mermaid de la vista y NO crea diagrama sin importAs", async () => {
    const { textOf } = toolsFor({ readApp });
    const t = await textOf("get_view", { name: "Modelo" });
    expect(t).toContain('Vista "Modelo" de "Seguros"');
    expect(t).toContain("```mermaid");
    expect(t).not.toContain("diagramId");
  });

  it("una vista Mermaid devuelve su código tal cual", async () => {
    const { textOf } = toolsFor({ readApp });
    expect(await textOf("get_view", { name: "Secuencia" })).toContain("sequenceDiagram");
  });

  it("con importAs deja un diagrama EDITABLE en el workspace", async () => {
    const { textOf, call } = toolsFor({ readApp });
    const t = await textOf("get_view", { name: "Modelo", importAs: true });
    const id = /diagramId="([^"]+)"/.exec(t)?.[1];
    expect(id).toBeTruthy();
    // El diagrama existe de verdad: get_diagram lo encuentra y trae sus elementos.
    const resumen = (await call("get_diagram", { diagramId: id })).content[0].text as string;
    expect(resumen).toContain("Elementos: 2");
    // Y se llama como la VISTA, no como el proyecto que venía en su GraphData.
    expect(resumen).toContain("Modelo");
  });
});
