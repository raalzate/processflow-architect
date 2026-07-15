/**
 * @fileOverview Registro COMPARTIDO de las herramientas MCP de Processflow.
 *
 * Lo usan DOS transportes:
 *  - el servidor stdio del repo (`mcp-server/index.ts`, modo desarrollo), y
 *  - el servidor HTTP embebido en la app (`main/services/mcp-http.ts`), que se
 *    activa desde Ajustes y permite a Claude Code/Codex conectarse a la app
 *    empaquetada sin tener el repo.
 *
 * La lógica de diagramas es PURA y vive en `src/lib/mcp` (testeada); aquí sólo
 * está el mapeo herramienta→función y la persistencia en disco del modelo en
 * curso. `opts.exportToApp` distingue los modos: si está presente (app), el
 * export inyecta el diagrama DIRECTO al lienzo además de escribir el .json.
 */

import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Import directo de cada módulo (no del barrel): `export *` no sobrevive la
// interop CJS de tsx/esbuild y perdería los nombres.
import {
  emptyDiagram,
  addContainer,
  addNode,
  addEdge,
  removeNode,
  validate,
  toGraphData,
  fromGraphData,
  slugify,
  type DiagramModel,
} from "../../src/lib/mcp/diagram-builder";
import { listNotations, describeNotation } from "../../src/lib/mcp/catalog";
import { toMermaid } from "../../src/lib/mcp/to-mermaid";
import type { NotationId } from "../../src/lib/notations";
import type { GraphData } from "../../src/lib/types";

const NOTATION = z.enum(["ddd", "bpmn", "c4", "uml"]);

export interface McpToolsOptions {
  /** Directorio donde persisten los modelos en curso y las exportaciones. */
  workspace: string;
  /**
   * Presente sólo en el modo app (HTTP embebido): entrega el diagrama al
   * renderer para cargarlo en el lienzo al momento. Devuelve true si la
   * ventana lo recibió.
   */
  exportToApp?: (name: string, graph: GraphData) => Promise<boolean>;
  /**
   * Presente sólo en el modo app: entrega el diagrama al renderer como VISTA
   * custom del proyecto ACTIVO (pestaña nueva con su propia notación), en vez
   * de crear un proyecto aparte. Devuelve true si la ventana lo recibió.
   */
  exportViewToApp?: (name: string, graph: GraphData, notation: NotationId) => Promise<boolean>;
  /**
   * Presente sólo en el modo app: entrega CÓDIGO MERMAID al renderer como una
   * VISTA Mermaid nueva (pestaña) del proyecto ACTIVO. Devuelve true si la
   * ventana lo recibió.
   */
  exportMermaidToApp?: (name: string, code: string) => Promise<boolean>;
}

// --- Helpers de respuesta MCP ---
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

export function registerProcessflowTools(server: McpServer, opts: McpToolsOptions) {
  const DIAGRAMS_DIR = path.join(opts.workspace, ".processflow", "diagrams");

  const ensureDir = (dir: string) => fs.mkdir(dir, { recursive: true });
  const modelPath = (id: string) => path.join(DIAGRAMS_DIR, `${id}.json`);

  async function saveModel(id: string, model: DiagramModel): Promise<void> {
    await ensureDir(DIAGRAMS_DIR);
    await fs.writeFile(modelPath(id), JSON.stringify(model, null, 2), "utf8");
  }

  async function loadModel(id: string): Promise<DiagramModel> {
    try {
      const raw = await fs.readFile(modelPath(id), "utf8");
      return JSON.parse(raw) as DiagramModel;
    } catch {
      throw new Error(
        `No existe el diagrama "${id}". Usa create_diagram o list_diagrams primero.`
      );
    }
  }

  async function listModels(): Promise<string[]> {
    try {
      const files = await fs.readdir(DIAGRAMS_DIR);
      return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  }

  async function freshId(base: string): Promise<string> {
    const existing = await listModels();
    let id = base || "diagrama";
    let i = 2;
    while (existing.includes(id)) id = `${base}-${i++}`;
    return id;
  }

  function summarize(id: string, model: DiagramModel): string {
    const v = validate(model);
    return [
      `Diagrama "${id}" (${model.meta.nombre_proyecto}, notación ${model.meta.notation})`,
      `Elementos: ${model.nodes.length} · Aristas: ${model.edges.length}`,
      v.errors.length ? `Errores: ${v.errors.length}` : "Sin errores",
      v.warnings.length ? `Avisos: ${v.warnings.length}` : "Sin avisos",
    ].join("\n");
  }

  // -- 1. Contexto: notaciones ------------------------------------------------

  server.registerTool(
    "list_notations",
    {
      title: "Listar notaciones",
      description:
        "Devuelve las notaciones soportadas (DDD/Event Storming, BPMN, C4, UML) con su descripción y la guía de diseño de cada una. Úsala primero para saber qué notación conviene al documento que analizas.",
      inputSchema: {},
    },
    async () => {
      const lines = listNotations().map(
        (n) =>
          `## ${n.id} — ${n.label}\n${n.description}\nTipos: ${n.elements.length}\nGuía: ${n.aiGuidance}`
      );
      return text(lines.join("\n\n"));
    }
  );

  server.registerTool(
    "describe_notation",
    {
      title: "Describir notación",
      description:
        "Devuelve los TIPOS de componente válidos de una notación (el valor exacto para `type` en add_node/add_container), si son contenedores y su forma. Consúltala antes de construir para no inventar tipos.",
      inputSchema: { notation: NOTATION },
    },
    async ({ notation }) => {
      const n = describeNotation(notation);
      const byGroup: Record<string, string[]> = {};
      for (const e of n.elements) {
        (byGroup[e.group] ||= []).push(
          `${e.type}${e.container ? " [contenedor]" : ""} (${e.shape})`
        );
      }
      const groups = Object.entries(byGroup)
        .map(([g, items]) => `### ${g}\n- ${items.join("\n- ")}`)
        .join("\n\n");
      return text(`# ${n.label}\n${n.description}\n\n${groups}\n\n## Guía\n${n.aiGuidance}`);
    }
  );

  // -- 2. Ciclo de vida del diagrama ------------------------------------------

  server.registerTool(
    "create_diagram",
    {
      title: "Crear diagrama",
      description:
        "Abre un diagrama nuevo con un nombre y una notación. Devuelve su `diagramId`, que se usa en el resto de herramientas. El estado se guarda en disco (sobrevive reinicios).",
      inputSchema: {
        name: z.string().describe("Nombre del proyecto/diagrama."),
        notation: NOTATION.describe("Notación: ddd | bpmn | c4 | uml."),
        description: z.string().optional().describe("Descripción corta del dominio."),
      },
    },
    async ({ name, notation, description }) => {
      const id = await freshId(slugify(name));
      const model = emptyDiagram({
        nombre_proyecto: name,
        notation: notation as NotationId,
        descripcion: description,
      });
      await saveModel(id, model);
      return text(
        `Diagrama creado. diagramId="${id}", notación=${notation}.\n` +
          `Siguiente: usa describe_notation("${notation}") para ver los tipos válidos, luego add_container/add_node/add_edge.`
      );
    }
  );

  server.registerTool(
    "list_diagrams",
    {
      title: "Listar diagramas",
      description: "Lista los diagramas en curso guardados en el workspace.",
      inputSchema: {},
    },
    async () => {
      const ids = await listModels();
      if (!ids.length) return text("No hay diagramas. Crea uno con create_diagram.");
      return text(ids.map((i) => `- ${i}`).join("\n"));
    }
  );

  server.registerTool(
    "get_diagram",
    {
      title: "Ver diagrama",
      description:
        "Devuelve un resumen del diagrama (conteos, errores/avisos) y su vista previa Mermaid.",
      inputSchema: { diagramId: z.string() },
    },
    async ({ diagramId }) => {
      const model = await loadModel(diagramId);
      return text(
        `${summarize(diagramId, model)}\n\n\`\`\`mermaid\n${toMermaid(model)}\n\`\`\``
      );
    }
  );

  // -- 3. Construcción ---------------------------------------------------------

  server.registerTool(
    "add_container",
    {
      title: "Añadir contenedor",
      description:
        "Añade un contenedor (Agregado, Contexto Delimitado, Pool, Carril, Límite de Sistema, Paquete, …). Devuelve su nombre para usarlo como `container` de los nodos hijos.",
      inputSchema: {
        diagramId: z.string(),
        name: z.string().describe("Nombre del contenedor (también su clave como padre)."),
        type: z.string().describe("Tipo contenedor válido de la notación (ver describe_notation)."),
        description: z.string().optional(),
      },
    },
    async ({ diagramId, name, type, description }) => {
      const model = await loadModel(diagramId);
      try {
        const r = addContainer(model, { nombre: name, tipo_elemento: type, descripcion: description });
        await saveModel(diagramId, r.model);
        return text(`Contenedor "${name}" añadido (id=${r.id}). Úsalo como container="${name}".`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "add_node",
    {
      title: "Añadir nodo",
      description:
        "Añade un nodo (Comando, Evento, Tarea, Clase, …). Si indicas `container` (nombre de un contenedor existente) el nodo queda dentro de él. Devuelve el `id` del nodo (para conectarlo con add_edge).",
      inputSchema: {
        diagramId: z.string(),
        name: z.string(),
        type: z.string().describe("Tipo NO contenedor válido de la notación."),
        container: z.string().optional().describe("Nombre de un contenedor existente."),
        description: z.string().optional(),
        tags: z.array(z.string()).optional().describe("Etiquetas de tecnología."),
        id: z.string().optional().describe("Id explícito (por defecto se deriva del nombre)."),
      },
    },
    async ({ diagramId, name, type, container, description, tags, id }) => {
      const model = await loadModel(diagramId);
      try {
        const r = addNode(model, {
          id,
          nombre: name,
          tipo_elemento: type,
          container,
          descripcion: description,
          tags_tecnologia: tags,
        });
        await saveModel(diagramId, r.model);
        return text(`Nodo "${name}" añadido (id=${r.id}).`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "add_edge",
    {
      title: "Conectar nodos",
      description:
        "Crea una arista entre dos elementos (por id). El clasificador la ubica sola: interna al contenedor, política entre contenedores o del big picture.",
      inputSchema: {
        diagramId: z.string(),
        from: z.string().describe("Id del elemento origen."),
        to: z.string().describe("Id del elemento destino."),
        label: z.string().optional().describe("Etiqueta de la relación (ej. 'dispara', 'usa [HTTPS]')."),
        arrow: z.enum(["end", "both", "none"]).optional(),
        dashed: z
          .boolean()
          .optional()
          .describe(
            "Línea discontinua. En un diagrama de secuencia UML marca un MENSAJE DE RETORNO (respuesta); las llamadas síncronas van sólidas."
          ),
      },
    },
    async ({ diagramId, from, to, label, arrow, dashed }) => {
      const model = await loadModel(diagramId);
      try {
        const next = addEdge(model, { fuente: from, destino: to, descripcion: label, arrow, dashed });
        await saveModel(diagramId, next);
        return text(`Arista ${from} → ${to} añadida.`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "remove_element",
    {
      title: "Eliminar elemento",
      description:
        "Elimina un nodo o contenedor por id y las aristas que lo tocan. Los hijos de un contenedor borrado quedan sueltos.",
      inputSchema: { diagramId: z.string(), id: z.string() },
    },
    async ({ diagramId, id }) => {
      const model = await loadModel(diagramId);
      await saveModel(diagramId, removeNode(model, id));
      return text(`Elemento "${id}" eliminado.`);
    }
  );

  // -- 4. Revisión --------------------------------------------------------------

  server.registerTool(
    "validate_diagram",
    {
      title: "Validar diagrama",
      description:
        "Comprueba tipos, ids duplicados, aristas colgantes y nodos aislados (que el lienzo descartaría). Devuelve errores (rompen la importación) y avisos.",
      inputSchema: { diagramId: z.string() },
    },
    async ({ diagramId }) => {
      const model = await loadModel(diagramId);
      const v = validate(model);
      const parts = [v.ok ? "✅ Válido." : "❌ Con errores."];
      if (v.errors.length) parts.push("Errores:\n- " + v.errors.join("\n- "));
      if (v.warnings.length) parts.push("Avisos:\n- " + v.warnings.join("\n- "));
      return text(parts.join("\n\n"));
    }
  );

  server.registerTool(
    "render_mermaid",
    {
      title: "Vista previa Mermaid",
      description: "Devuelve el diagrama en Mermaid para revisarlo visualmente (sequenceDiagram si hay Líneas de Vida, flowchart en el resto de casos).",
      inputSchema: { diagramId: z.string() },
    },
    async ({ diagramId }) => {
      const model = await loadModel(diagramId);
      return text("```mermaid\n" + toMermaid(model) + "\n```");
    }
  );

  // -- 5. Integración con la app -------------------------------------------------

  server.registerTool(
    "export_to_app",
    {
      title: "Exportar a la app",
      description: opts.exportToApp
        ? "Serializa el diagrama (GraphData) y lo CARGA DIRECTO en el lienzo de Processflow Architect (la app está conectada). También escribe un .json de respaldo en el workspace."
        : "Serializa el diagrama al formato GraphData y lo escribe como .json en el workspace. Ese archivo se abre en Processflow Architect con «Importar diagrama (JSON)». Devuelve la ruta absoluta.",
      inputSchema: {
        diagramId: z.string(),
        outPath: z
          .string()
          .optional()
          .describe("Ruta de salida (por defecto <workspace>/<diagramId>.json)."),
      },
    },
    async ({ diagramId, outPath }) => {
      const model = await loadModel(diagramId);
      const v = validate(model);
      const graph: GraphData = toGraphData(model);
      const dest = path.resolve(outPath || path.join(opts.workspace, `${diagramId}.json`));
      await ensureDir(path.dirname(dest));
      await fs.writeFile(dest, JSON.stringify(graph, null, 2), "utf8");

      const warn = v.warnings.length ? `\n\nAvisos:\n- ${v.warnings.join("\n- ")}` : "";
      const err = v.errors.length
        ? `\n\n⚠️ Con errores (revisa antes de importar):\n- ${v.errors.join("\n- ")}`
        : "";

      // Modo app: entrega directa al lienzo.
      if (opts.exportToApp) {
        const delivered = await opts.exportToApp(model.meta.nombre_proyecto, graph);
        if (delivered) {
          return text(
            `✅ Diagrama cargado en el lienzo de la app como proyecto "${model.meta.nombre_proyecto}".\nRespaldo: ${dest}${warn}${err}`
          );
        }
        return text(
          `La app no tiene ventana activa; quedó el .json en:\n${dest}\nImpórtalo con «Importar diagrama».${warn}${err}`
        );
      }

      return text(
        `Exportado a:\n${dest}\n\nEn la app: «Importar diagrama» → elige ese archivo (o arrástralo a la pantalla de bienvenida).${warn}${err}`
      );
    }
  );

  // Sólo en modo app: convertir un diagrama en VISTA del proyecto activo.
  if (opts.exportViewToApp) {
    server.registerTool(
      "export_as_view",
      {
        title: "Exportar como vista",
        description:
          "Carga el diagrama como una VISTA nueva (pestaña) del proyecto ACTIVO en la app, con su propia notación — en vez de crear un proyecto aparte (para eso está export_to_app). Úsala para complementar un modelo con vistas BPMN/C4/UML del mismo dominio. Requiere un proyecto abierto en la app.",
        inputSchema: {
          diagramId: z.string(),
          viewName: z
            .string()
            .optional()
            .describe("Nombre de la pestaña (por defecto, el nombre del diagrama)."),
        },
      },
      async ({ diagramId, viewName }) => {
        const model = await loadModel(diagramId);
        const v = validate(model);
        const graph: GraphData = toGraphData(model);
        const name = viewName || model.meta.nombre_proyecto;

        const warn = v.warnings.length ? `\n\nAvisos:\n- ${v.warnings.join("\n- ")}` : "";
        const err = v.errors.length
          ? `\n\n⚠️ Con errores (revisa antes de usar):\n- ${v.errors.join("\n- ")}`
          : "";

        const delivered = await opts.exportViewToApp!(name, graph, model.meta.notation);
        if (delivered) {
          return text(
            `✅ Vista "${name}" (${model.meta.notation}) enviada al proyecto activo de la app.${warn}${err}`
          );
        }
        return fail(
          "La app no tiene ventana activa; abre Processflow Architect y reintenta (o usa export_to_app para generar un .json)."
        );
      }
    );
  }

  if (opts.exportMermaidToApp) {
    server.registerTool(
      "export_mermaid_view",
      {
        title: "Enviar diagrama Mermaid a la app",
        description:
          "Crea una VISTA Mermaid nueva (pestaña) en el proyecto ACTIVO de la app con el código Mermaid dado y lo muestra renderizado. Vale para CUALQUIER diagrama Mermaid: sequenceDiagram (secuencia), flowchart, classDiagram, stateDiagram-v2, erDiagram, gantt, etc. No usa el modelo de nodos/aristas (no requiere diagramId); pasa el código completo. Requiere un proyecto abierto en la app. OJO: en sequenceDiagram no uses 'actor' como identificador de participante (es palabra reservada): usa un alias, p. ej. `actor U as Usuario`.",
        inputSchema: {
          name: z.string().describe("Nombre de la pestaña de la vista."),
          code: z
            .string()
            .describe(
              "Código Mermaid completo, empezando por su palabra clave (sequenceDiagram, flowchart TD, classDiagram, ...)."
            ),
        },
      },
      async ({ name, code }) => {
        if (!code.trim()) return fail("El código Mermaid está vacío.");
        const delivered = await opts.exportMermaidToApp!(name, code);
        if (delivered) return text(`✅ Vista Mermaid "${name}" enviada al proyecto activo de la app.`);
        return fail(
          "La app no tiene ventana activa; abre Processflow Architect y reintenta."
        );
      }
    );
  }

  server.registerTool(
    "import_diagram",
    {
      title: "Importar diseño existente",
      description:
        "Carga un .json de GraphData (exportado por la app o por export_to_app) como un diagrama editable nuevo. Sirve para retomar un diseño previo y adquirir contexto de él.",
      inputSchema: {
        path: z.string().describe("Ruta al .json de GraphData."),
        notation: NOTATION.optional(),
      },
    },
    async ({ path: p, notation }) => {
      let data: GraphData;
      try {
        data = JSON.parse(await fs.readFile(path.resolve(p), "utf8")) as GraphData;
      } catch (e: any) {
        return fail(`No pude leer/parsear "${p}": ${e.message}`);
      }
      const model = fromGraphData(data, (notation as NotationId) || "ddd");
      const id = await freshId(slugify(data.nombre_proyecto || "importado"));
      await saveModel(id, model);
      return text(
        `Importado como diagramId="${id}" (${model.nodes.length} elementos, ${model.edges.length} aristas).`
      );
    }
  );
}
