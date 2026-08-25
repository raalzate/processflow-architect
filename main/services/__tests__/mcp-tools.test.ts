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

    // Cambio intencional (issue #144 · D1): lo que ya está se COMPARA con lo que
    // se generaría, en vez de saltarse en silencio. Igual → "al día".
    const segundo = await textOf("install_skill", { skill: "all", scope: "project", projectDir, overwrite: false, configure: false });
    expect(segundo).toContain("Ya estaban al día");
    expect(segundo).not.toContain("DESACTUALIZADOS");

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

describe("metadatos de la caja (referencias): contrato con el agente", () => {
  const TOOLS_CON_METADATA = ["add_node", "add_container", "update_element"];

  it("las tres herramientas declaran el parámetro `metadata`", () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x" });
    for (const nombre of TOOLS_CON_METADATA) {
      expect(tools.get(nombre)!.def.inputSchema.metadata, nombre).toBeDefined();
    }
    // Borrar es explícito y sólo en update: agregar no debe obligar a reenviar todo.
    expect(tools.get("update_element")!.def.inputSchema.metadataRemove).toBeDefined();
    expect(tools.get("add_node")!.def.inputSchema.metadataRemove).toBeUndefined();
  });

  it("su documentación explica para qué sirve y da el ejemplo con repositorio y wiki", () => {
    // FR-008: la descripción de la tool es lo ÚNICO que el agente lee antes de
    // usarla. Si esto se afloja, la propiedad existe y nadie la usa.
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: "/tmp/x" });
    for (const nombre of TOOLS_CON_METADATA) {
      const doc = JSON.stringify(tools.get(nombre)!.def);
      expect(doc, nombre).toContain("repo");
      expect(doc, nombre).toContain("wiki");
      expect(doc, nombre).toMatch(/http\(s\)/);
      // Y la diferencia con la cita de la fuente, que ya se confundió una vez.
      expect(doc, nombre).toContain("source");
    }
  });
});

// =============================================================================
// Metadatos del proyecto y vista de datos desde el MCP (#133)
// =============================================================================

describe("registerProcessflowTools · metadatos del proyecto", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "pfa-meta-"));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  /** Arranca el registro con workspace propio y crea un diagrama. */
  async function conDiagrama() {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws });
    const creado = await tools.get("create_diagram")!.handler({ name: "Seguros", notation: "ddd" });
    const id = /diagramId="([^"]+)"/.exec(creado.content[0].text)![1];
    return { tools, id };
  }

  it("declara hotspots, responsables y notas, y el export los lleva al GraphData", async () => {
    const { tools, id } = await conDiagrama();
    const res = await tools.get("set_project_meta")!.handler({
      diagramId: id,
      hotspots: ["¿Quién cobra la prima?"],
      responsables: ["Ana"],
      notes: "Revisado con negocio.",
    });
    expect(res.isError).toBeUndefined();
    await tools.get("add_node")!.handler({ diagramId: id, name: "Cobrar", type: "Comando" });
    const out = path.join(ws, "salida.json");
    await tools.get("export_to_app")!.handler({ diagramId: id, outPath: out });
    const graph = JSON.parse(await fs.readFile(out, "utf8"));
    expect(graph.big_picture.hotspots).toEqual(["¿Quién cobra la prima?"]);
    expect(graph.responsables).toEqual(["Ana"]);
    expect(graph.notas).toContain("Revisado con negocio.");
  });

  it("una lista desmedida falla como error de la herramienta, no como excepción", async () => {
    const { tools, id } = await conDiagrama();
    const res = await tools.get("set_project_meta")!.handler({
      diagramId: id,
      hotspots: Array.from({ length: 40 }, (_, i) => `h${i}`),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/máximo/i);
  });

  it("añade, reemplaza y quita read models; el nombre inexistente devuelve las opciones", async () => {
    const { tools, id } = await conDiagrama();
    await tools.get("add_read_model")!.handler({ diagramId: id, name: "Panel", description: "v1", projects: ["Prima cobrada"] });
    const rep = await tools.get("add_read_model")!.handler({ diagramId: id, name: "Panel", description: "v2" });
    expect(rep.content[0].text).toContain("Reemplazado");
    await tools.get("add_read_model")!.handler({ diagramId: id, name: "Reportes" });

    // get_diagram declara lo que ya existe: sin esto el agente lo pisa.
    const visto = await tools.get("get_diagram")!.handler({ diagramId: id });
    expect(visto.content[0].text).toContain("Read models: 2");
    expect(visto.content[0].text).toContain("Panel");

    const quitado = await tools.get("remove_read_model")!.handler({ diagramId: id, name: "Panel" });
    expect(quitado.isError).toBeUndefined();
    const falla = await tools.get("remove_read_model")!.handler({ diagramId: id, name: "Panel" });
    expect(falla.isError).toBe(true);
    expect(falla.content[0].text).toContain("Reportes");
  });

  it("reimportar un GraphData con los campos llenos NO los borra al exportar de nuevo", async () => {
    const { tools, id } = await conDiagrama();
    await tools.get("add_node")!.handler({ diagramId: id, name: "Cobrar", type: "Comando" });
    await tools.get("set_project_meta")!.handler({ diagramId: id, hotspots: ["Cobro"], responsables: ["Ana"], notes: "Nota del humano." });
    await tools.get("add_read_model")!.handler({ diagramId: id, name: "Panel" });
    const ida = path.join(ws, "ida.json");
    await tools.get("export_to_app")!.handler({ diagramId: id, outPath: ida });

    const reimportado = await tools.get("import_diagram")!.handler({ path: ida });
    const id2 = /diagramId="([^"]+)"/.exec(reimportado.content[0].text)![1];
    const vuelta = path.join(ws, "vuelta.json");
    await tools.get("export_to_app")!.handler({ diagramId: id2, outPath: vuelta });
    const graph = JSON.parse(await fs.readFile(vuelta, "utf8"));
    expect(graph.big_picture.hotspots).toEqual(["Cobro"]);
    expect(graph.responsables).toEqual(["Ana"]);
    expect(graph.notas).toContain("Nota del humano.");
    expect(graph.read_models.map((r: any) => r.nombre)).toEqual(["Panel"]);
  });
});

// -----------------------------------------------------------------------------
// Issue #144 — la puerta del estado comparativo, el vocabulario del workspace,
// el nombre del proyecto al exportar y la higiene de la instalación del skill.
// -----------------------------------------------------------------------------

describe("estado_comparativo · A", () => {
  let ws = "";
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "pf-estado-"));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  async function conDiagrama() {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws });
    const creado = await tools.get("create_diagram")!.handler({ name: "Seguros", notation: "ddd" });
    const id = /diagramId="([^"]+)"/.exec(creado.content[0].text)![1];
    return { tools, id };
  }

  it("las tres herramientas declaran el parámetro `estado` con el mismo vocabulario", () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws });
    for (const t of ["add_node", "add_container", "update_element"]) {
      const shape = tools.get(t)!.def.inputSchema;
      expect(shape.estado, `${t} sin \`estado\``).toBeDefined();
      const opciones = (shape.estado._def.innerType ?? shape.estado)._def.values;
      expect(opciones).toContain("existente");
      expect(opciones).toContain("modificado");
      expect(opciones).toContain("nuevo");
    }
  });

  it("el estado sobrevive add_node/add_container → export → import → export", async () => {
    const { tools, id } = await conDiagrama();
    await tools.get("add_container")!.handler({
      diagramId: id, name: "Pólizas", type: "Agregado", estado: "existente",
    });
    await tools.get("add_node")!.handler({
      diagramId: id, name: "Cobrar", type: "Comando", container: "Pólizas", estado: "modificado",
    });
    await tools.get("add_node")!.handler({ diagramId: id, name: "Anular", type: "Comando", container: "Pólizas" });

    const ida = path.join(ws, "ida.json");
    await tools.get("export_to_app")!.handler({ diagramId: id, outPath: ida });
    const uno = JSON.parse(await fs.readFile(ida, "utf8"));
    expect(uno.agregados[0].estado_comparativo).toBe("existente");
    expect(uno.agregados[0].nodos.find((n: any) => n.nombre === "Cobrar").estado_comparativo).toBe("modificado");
    // Sin declararlo sigue siendo "nuevo": el default no cambia.
    expect(uno.agregados[0].nodos.find((n: any) => n.nombre === "Anular").estado_comparativo).toBe("nuevo");

    const reimportado = await tools.get("import_diagram")!.handler({ path: ida });
    const id2 = /diagramId="([^"]+)"/.exec(reimportado.content[0].text)![1];
    const vuelta = path.join(ws, "vuelta.json");
    await tools.get("export_to_app")!.handler({ diagramId: id2, outPath: vuelta });
    const dos = JSON.parse(await fs.readFile(vuelta, "utf8"));
    expect(dos.agregados[0].estado_comparativo).toBe("existente");
    expect(dos.agregados[0].nodos.find((n: any) => n.nombre === "Cobrar").estado_comparativo).toBe("modificado");
  });

  it("update_element cambia el estado de un elemento ya creado", async () => {
    const { tools, id } = await conDiagrama();
    await tools.get("add_node")!.handler({ diagramId: id, name: "Cobrar", type: "Comando", id: "cobrar" });
    const res = await tools.get("update_element")!.handler({ diagramId: id, id: "cobrar", estado: "existente" });
    expect(res.isError).toBeUndefined();
    const out = path.join(ws, "s.json");
    await tools.get("export_to_app")!.handler({ diagramId: id, outPath: out });
    const graph = JSON.parse(await fs.readFile(out, "utf8"));
    expect(graph.big_picture.nodos[0].estado_comparativo).toBe("existente");
  });
});

describe("fricción de ingesta y exportación · C", () => {
  let ws = "";
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "pf-fric-"));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  function toolsDe() {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws });
    return tools;
  }
  async function crear(tools: Map<string, any>, name: string) {
    const creado = await tools.get("create_diagram")!.handler({ name, notation: "c4" });
    return /diagramId="([^"]+)"/.exec(creado.content[0].text)![1];
  }

  it("C1 · export_to_app acepta projectName y el GraphData sale con ese nombre", async () => {
    const tools = toolsDe();
    const id = await crear(tools, "Geiser · C4 L1 Contexto");
    await tools.get("add_node")!.handler({ diagramId: id, name: "Portal", type: "Sistema Externo" });
    const out = path.join(ws, "c4.json");
    const res = await tools.get("export_to_app")!.handler({ diagramId: id, projectName: "Geiser", outPath: out });
    expect(res.isError).toBeUndefined();
    const graph = JSON.parse(await fs.readFile(out, "utf8"));
    expect(graph.nombre_proyecto).toBe("Geiser");
  });

  it("C1 · sin projectName manda el nombre del diagrama (no cambia el default)", async () => {
    const tools = toolsDe();
    const id = await crear(tools, "Geiser · C4 L1 Contexto");
    const out = path.join(ws, "c4b.json");
    await tools.get("export_to_app")!.handler({ diagramId: id, outPath: out });
    const graph = JSON.parse(await fs.readFile(out, "utf8"));
    expect(graph.nombre_proyecto).toBe("Geiser · C4 L1 Contexto");
  });

  it("C3 · list_diagrams devuelve el VOCABULARIO, no sólo los ids", async () => {
    const tools = toolsDe();
    const id = await crear(tools, "Paisaje");
    await tools.get("add_node")!.handler({ diagramId: id, name: "OFAC Screening", type: "Sistema Externo" });
    const salida = (await tools.get("list_diagrams")!.handler({ names: true, limit: 40 })).content[0].text;
    expect(salida).toContain("OFAC Screening");
    expect(salida).toContain("Paisaje");
    expect(salida).toMatch(/reus/i);

    const corto = (await tools.get("list_diagrams")!.handler({ names: false, limit: 40 })).content[0].text;
    expect(corto).not.toContain("OFAC Screening");
  });

  it("C3 · el tope de nombres resume el resto en vez de volcarlo entero", async () => {
    const tools = toolsDe();
    const id = await crear(tools, "Grande");
    for (let i = 0; i < 5; i++) {
      await tools.get("add_node")!.handler({ diagramId: id, name: `Sistema ${i}`, type: "Sistema Externo" });
    }
    const salida = (await tools.get("list_diagrams")!.handler({ names: true, limit: 2 })).content[0].text;
    expect(salida).toContain("y 3 más");
  });
});

describe("higiene del skill y de los metadatos · D", () => {
  let ws = "";
  let proj = "";
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "pf-d-"));
    proj = await fs.mkdtemp(path.join(os.tmpdir(), "pf-dproj-"));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
    await fs.rm(proj, { recursive: true, force: true });
  });

  it("D1 · avisa que el skill en disco DIFIERE del que generaría, en vez de saltarlo callado", async () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws });
    const args = { skill: "disenar-diagrama", scope: "project", projectDir: proj, overwrite: false, configure: false };
    await tools.get("install_skill")!.handler(args);

    const skillMd = path.join(proj, ".claude", "skills", "disenar-diagrama", "SKILL.md");
    await fs.writeFile(skillMd, "# skill viejo, de otra versión\n", "utf8");

    const segundo = (await tools.get("install_skill")!.handler(args)).content[0].text;
    expect(segundo).toContain("DESACTUALIZADOS");
    expect(segundo).toContain("overwrite=true");

    const tercero = (await tools.get("install_skill")!.handler({ ...args, overwrite: true })).content[0].text;
    expect(tercero).toContain("Escritos");
    expect(await fs.readFile(skillMd, "utf8")).not.toContain("skill viejo");
  });

  it("D2 · metadata acepta el array serializado como texto (tropiezo de clientes MCP)", () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws });
    const esquema = tools.get("add_node")!.def.inputSchema.metadata;

    const comoTexto = esquema.parse('[{"clave":"repo","valor":"acme/pagos-svc"}]');
    expect(comoTexto).toEqual([{ clave: "repo", valor: "acme/pagos-svc" }]);
    // El array de siempre sigue funcionando.
    expect(esquema.parse([{ clave: "wiki", valor: "Pagos" }])).toEqual([{ clave: "wiki", valor: "Pagos" }]);

    // Un texto que no es JSON falla diciendo CÓMO se manda.
    const malo = esquema.safeParse("repo=acme/pagos-svc");
    expect(malo.success).toBe(false);
    expect(JSON.stringify(malo.error.issues)).toContain("LISTA de objetos");
  });
});

// -----------------------------------------------------------------------------
// Fijar el diagrama de trabajo: `diagramId` deja de repetirse en cada llamada.
// -----------------------------------------------------------------------------

describe("use_diagram · diagrama de trabajo fijado", () => {
  let ws = "";
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "pf-fijar-"));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  function toolsDe(opts: Record<string, unknown> = {}) {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws, ...opts } as any);
    return tools;
  }
  const idDe = (res: any) => /diagramId="([^"]+)"/.exec(res.content[0].text)![1];

  it("create_diagram fija el recién creado y las llamadas siguientes omiten el id", async () => {
    const tools = toolsDe();
    const creado = await tools.get("create_diagram")!.handler({ name: "Seguros", notation: "ddd" });
    expect(creado.content[0].text).toContain("FIJADO");
    const res = await tools.get("add_node")!.handler({ name: "Cobrar", type: "Comando" });
    expect(res.isError).toBeUndefined();
    const visto = await tools.get("get_diagram")!.handler({});
    expect(visto.content[0].text).toContain("Cobrar");
    expect(idDe(creado)).toBe("seguros");
  });

  it("el fijado sobrevive a otro servidor (vive en el workspace, no en memoria)", async () => {
    await toolsDe().get("create_diagram")!.handler({ name: "Seguros", notation: "ddd" });
    // Otro registro = otra petición del transporte HTTP, que es stateless.
    const otro = toolsDe();
    await otro.get("add_node")!.handler({ name: "Anular", type: "Comando" });
    expect((await otro.get("get_diagram")!.handler({})).content[0].text).toContain("Anular");
  });

  it("el `diagramId` explícito gana sobre el fijado", async () => {
    const tools = toolsDe();
    await tools.get("create_diagram")!.handler({ name: "Uno", notation: "ddd" });
    const dos = idDe(await tools.get("create_diagram")!.handler({ name: "Dos", notation: "ddd" }));
    // "Dos" quedó fijado; la llamada apunta a "uno" a propósito.
    await tools.get("add_node")!.handler({ diagramId: "uno", name: "SoloEnUno", type: "Comando" });
    expect((await tools.get("get_diagram")!.handler({ diagramId: "uno" })).content[0].text).toContain("SoloEnUno");
    expect((await tools.get("get_diagram")!.handler({})).content[0].text).not.toContain("SoloEnUno");
    expect(dos).toBe("dos");
  });

  it("use_diagram cambia el fijado, lo informa y lo suelta", async () => {
    const tools = toolsDe();
    await tools.get("create_diagram")!.handler({ name: "Uno", notation: "ddd" });
    await tools.get("create_diagram")!.handler({ name: "Dos", notation: "ddd" });

    expect((await tools.get("use_diagram")!.handler({})).content[0].text).toContain('"dos"');
    await tools.get("use_diagram")!.handler({ diagramId: "uno" });
    await tools.get("add_node")!.handler({ name: "EnUno", type: "Comando" });
    expect((await tools.get("get_diagram")!.handler({ diagramId: "uno" })).content[0].text).toContain("EnUno");

    await tools.get("use_diagram")!.handler({ clear: true });
    const sinFijar = await tools.get("add_node")!.handler({ name: "X", type: "Comando" });
    expect(sinFijar.isError).toBe(true);
    expect(sinFijar.content[0].text).toContain("use_diagram");
  });

  it("un id inexistente en use_diagram devuelve las opciones", async () => {
    const tools = toolsDe();
    await tools.get("create_diagram")!.handler({ name: "Uno", notation: "ddd" });
    const res = await tools.get("use_diagram")!.handler({ diagramId: "fantasma" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('"uno"');
  });

  it("la configuración del servidor sirve de default cuando no hay fijado", async () => {
    const tools = toolsDe({ defaultDiagramId: "uno" });
    await tools.get("create_diagram")!.handler({ name: "Uno", notation: "ddd" });
    await tools.get("create_diagram")!.handler({ name: "Dos", notation: "ddd" });
    await tools.get("use_diagram")!.handler({ clear: true });
    await tools.get("add_node")!.handler({ name: "PorConfig", type: "Comando" });
    expect((await tools.get("get_diagram")!.handler({ diagramId: "uno" })).content[0].text).toContain("PorConfig");
  });
});

// -----------------------------------------------------------------------------
// Entregar al PROYECTO de la app: actualizar el que ya existe en vez de dejar
// una copia nueva por cada diseño.
// -----------------------------------------------------------------------------

describe("export_to_app · actualizar el proyecto de la app", () => {
  let ws = "";
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "pf-proy-"));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  const estado = (activo: string | null, otros: string[] = []) => ({
    projectName: activo,
    counts: { containers: 0, nodes: 0, edges: 0 },
    views: [],
    viewsLimit: 50,
    projects: otros,
    updatedAt: "2026-08-25T00:00:00.000Z",
  });

  async function conApp(opts: Record<string, unknown>) {
    const entregas: { name: string; target?: { project: string } }[] = [];
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, {
      workspace: ws,
      exportToApp: async (name: string, _g: any, target?: { project: string }) => {
        entregas.push({ name, target });
        return true;
      },
      ...opts,
    } as any);
    await tools.get("create_diagram")!.handler({ name: "Enrollment v2", notation: "c4" });
    await tools.get("add_node")!.handler({ name: "Portal", type: "Sistema Externo" });
    return { tools, entregas };
  }

  it("por defecto ACTUALIZA el proyecto abierto en la app", async () => {
    const { tools, entregas } = await conApp({ getAppState: () => estado("Enrollment v2") });
    const res = await tools.get("export_to_app")!.handler({});
    expect(res.isError).toBeUndefined();
    expect(entregas[0].target).toEqual({ project: "Enrollment v2" });
    expect(res.content[0].text).toContain("ACTUALIZADO");
  });

  it("`project` manda al proyecto nombrado, aunque no sea el abierto", async () => {
    const { tools, entregas } = await conApp({
      getAppState: () => estado("Otro", ["Otro", "Enrollment v2"]),
    });
    await tools.get("export_to_app")!.handler({ project: "Enrollment v2" });
    expect(entregas[0].target).toEqual({ project: "Enrollment v2" });
  });

  it("la configuración del servidor fija el proyecto destino sin repetirlo", async () => {
    const { tools, entregas } = await conApp({
      defaultProject: "Enrollment v2",
      getAppState: () => estado("Otro", ["Otro", "Enrollment v2"]),
    });
    await tools.get("export_to_app")!.handler({});
    expect(entregas[0].target).toEqual({ project: "Enrollment v2" });
  });

  it('mode="new" sigue creando un proyecto aparte', async () => {
    const { tools, entregas } = await conApp({ getAppState: () => estado("Enrollment v2") });
    const res = await tools.get("export_to_app")!.handler({ mode: "new" });
    expect(entregas[0].target).toBeUndefined();
    expect(res.content[0].text).toContain("NUEVO");
  });

  it("un proyecto que no existe NO se crea a escondidas: avisa y deja el .json", async () => {
    const { tools, entregas } = await conApp({ getAppState: () => estado("Otro", ["Otro"]) });
    const res = await tools.get("export_to_app")!.handler({ project: "Fantasma" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('"Otro"');
    expect(res.content[0].text).toContain("El .json quedó en:");
    expect(entregas).toHaveLength(0);
  });

  it("sin proyecto abierto y sin pedir uno, crea el primero (pantalla de bienvenida)", async () => {
    const { tools, entregas } = await conApp({ getAppState: () => estado(null, []) });
    const res = await tools.get("export_to_app")!.handler({});
    expect(res.isError).toBeUndefined();
    expect(entregas[0].target).toBeUndefined();
    expect(res.content[0].text).toContain("NUEVO");
  });

  it("pero si PIDIÓ un proyecto por nombre y no existe, no inventa uno", async () => {
    const { tools, entregas } = await conApp({ getAppState: () => estado(null, []) });
    const res = await tools.get("export_to_app")!.handler({ project: "Enrollment v2" });
    expect(res.isError).toBe(true);
    expect(entregas).toHaveLength(0);
  });

  it("en modo stdio (sin app) el .json se escribe igual y nadie habla de proyectos", async () => {
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, { workspace: ws } as any);
    await tools.get("create_diagram")!.handler({ name: "Solo", notation: "ddd" });
    const out = path.join(ws, "solo.json");
    const res = await tools.get("export_to_app")!.handler({ outPath: out });
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(await fs.readFile(out, "utf8")).nombre_proyecto).toBe("Solo");
  });
});

// -----------------------------------------------------------------------------
// #147 — reemplazar una VISTA en vez de dejar dos pestañas con el mismo nombre.
// -----------------------------------------------------------------------------

describe("export_as_view · replace", () => {
  let ws = "";
  beforeEach(async () => {
    ws = await fs.mkdtemp(path.join(os.tmpdir(), "pf-vista-"));
  });
  afterEach(async () => {
    await fs.rm(ws, { recursive: true, force: true });
  });

  const estadoConVistas = (nombres: { name: string; builtin?: boolean }[]) => ({
    projectName: "Seguros",
    counts: { containers: 0, nodes: 0, edges: 0 },
    views: nombres.map((v, i) => ({ id: `v${i}`, name: v.name, kind: "design", builtin: v.builtin, elements: 3 })),
    viewsLimit: 50,
    projects: ["Seguros"],
    updatedAt: "2026-08-25T00:00:00.000Z",
  });

  async function conVistas(vistas: { name: string; builtin?: boolean }[]) {
    const entregas: { name: string; replace?: boolean }[] = [];
    const { server, tools } = fakeServer();
    registerProcessflowTools(server, {
      workspace: ws,
      getAppState: () => estadoConVistas(vistas),
      exportViewToApp: async (name: string, _g: any, _n: any, replace?: boolean) => {
        entregas.push({ name, replace });
        return true;
      },
    } as any);
    await tools.get("create_diagram")!.handler({ name: "Proceso de alta", notation: "bpmn" });
    await tools.get("add_node")!.handler({ name: "Recibir", type: "Tarea" });
    return { tools, entregas };
  }

  it("actualiza la pestaña que ya existe y lo dice", async () => {
    const { tools, entregas } = await conVistas([
      { name: "Modelo", builtin: true },
      { name: "Proceso de alta" },
    ]);
    const res = await tools.get("export_as_view")!.handler({ replace: true });
    expect(res.isError).toBeUndefined();
    expect(entregas[0]).toEqual({ name: "Proceso de alta", replace: true });
    expect(res.content[0].text).toContain("ACTUALIZADA");
  });

  it("sin replace sigue agregando una pestaña", async () => {
    const { tools, entregas } = await conVistas([{ name: "Proceso de alta" }]);
    const res = await tools.get("export_as_view")!.handler({});
    expect(entregas[0].replace).toBeUndefined();
    expect(res.content[0].text).toContain("enviada");
  });

  it("con replace y una vista que no existe, avisa con las opciones y NO entrega", async () => {
    const { tools, entregas } = await conVistas([{ name: "Otra cosa" }]);
    const res = await tools.get("export_as_view")!.handler({ viewName: "Fantasma", replace: true });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('"Otra cosa"');
    expect(entregas).toHaveLength(0);
  });

  it("una vista del sistema no se reemplaza", async () => {
    const { tools, entregas } = await conVistas([{ name: "Modelo", builtin: true }]);
    const res = await tools.get("export_as_view")!.handler({ viewName: "Modelo", replace: true });
    expect(res.isError).toBe(true);
    expect(entregas).toHaveLength(0);
  });
});
