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
import os from "node:os";
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
  removeEdge,
  updateNode,
  updateEdge,
  validate,
  toGraphData,
  fromGraphData,
  slugify,
  relayout,
  recordAmbiguity,
  resolveAmbiguity,
  pendingAmbiguities,
  setProjectMeta,
  addReadModel,
  removeReadModel,
  MAX_LISTA_PROYECTO,
  ESTADOS,
  type Estado,
  type DiagramModel,
} from "../../src/lib/mcp/diagram-builder";
import { resolveDiagramId } from "../../src/lib/mcp/active-diagram";
import { resolveProjectRef, resolveViewRef, vistaInexistente } from "../../src/lib/mcp/project-update";
import { listNotations, describeNotation, isContainerType } from "../../src/lib/mcp/catalog";
import { toMermaid, idsQueCambian } from "../../src/lib/mcp/to-mermaid";
import { qualityFindings, formatFindings, MAX_NODES } from "../../src/lib/mcp/quality";
import { reviewPacket } from "../../src/lib/mcp/review";
import { suggestViews, formatViewPlan } from "../../src/lib/mcp/view-plan";
import { formatAppState, type AppState } from "../../src/lib/mcp/app-state";
import {
  planAppAction,
  describeAccion,
  type AppActionRequest,
  type AppActionResult,
} from "../../src/lib/mcp/app-actions";
import {
  formatArtifact,
  formatArtifactList,
  formatViewList,
  type AppReadRequest,
  type AppReadResult,
} from "../../src/lib/mcp/app-read";
import {
  listSkills,
  renderSkillFiles,
  skillInstallPath,
  SKILL_IDS,
  type SkillConfig,
} from "../../src/lib/mcp-skill";
import { DEFAULT_NOTATION_ID, type NotationId } from "../../src/lib/notations";
import { MAX_CUSTOM_VIEWS } from "../../src/lib/views-types";
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
  exportToApp?: (
    name: string,
    graph: GraphData,
    /**
     * Presente cuando la entrega ACTUALIZA un proyecto existente en vez de
     * crear otro: `project` es el nombre resuelto del proyecto de la app.
     */
    target?: { project: string }
  ) => Promise<boolean>;
  /**
   * Presente sólo en el modo app: entrega el diagrama al renderer como VISTA
   * custom del proyecto ACTIVO (pestaña nueva con su propia notación), en vez
   * de crear un proyecto aparte. Devuelve true si la ventana lo recibió.
   */
  exportViewToApp?: (
    name: string,
    graph: GraphData,
    notation: NotationId,
    /** true ⇒ ACTUALIZAR la pestaña que ya se llama así, no agregar otra. */
    replace?: boolean
  ) => Promise<boolean>;
  /**
   * Presente sólo en el modo app: entrega CÓDIGO MERMAID al renderer como una
   * VISTA Mermaid nueva (pestaña) del proyecto ACTIVO. Devuelve true si la
   * ventana lo recibió.
   */
  exportMermaidToApp?: (name: string, code: string) => Promise<boolean>;
  /**
   * Último retrato del lienzo publicado por el renderer (modo app). Lo sirve
   * `get_app_state`: es la INGESTA que evita que el agente exporte a ciegas.
   */
  getAppState?: () => AppState | null;
  /**
   * Presente sólo en el modo app: LEE contenido de la app bajo demanda
   * (artefactos del agente local, vistas, otro proyecto guardado). Es lo que
   * convierte al agente externo en lector del trabajo del humano y no sólo en
   * escritor. Nunca rechaza: el fallo viaja como `{ ok: false, error }`.
   */
  readApp?: (request: AppReadRequest) => Promise<AppReadResult>;
  /**
   * Presente sólo en el modo app: pide al renderer una ACCIÓN sobre el proyecto
   * (borrar o renombrar una vista). Nunca rechaza: el fallo viaja en el
   * resultado. Sin esto, el agente podía crear pestañas y no recoger las suyas.
   */
  actOnApp?: (request: AppActionRequest) => Promise<AppActionResult>;
  /**
   * Diagrama por defecto de este servidor (`PROCESSFLOW_DIAGRAM` o `--diagram`
   * en `.mcp.json`). Sirve para atar una sesión de trabajo a un diagrama sin
   * repetir `diagramId` en cada llamada; lo pisa `use_diagram` y, sobre todo,
   * el `diagramId` explícito de la llamada.
   */
  defaultDiagramId?: string;
  /**
   * Proyecto de la app al que van las entregas por defecto
   * (`PROCESSFLOW_PROJECT` / `--project`). Con esto, `export_to_app` ACTUALIZA
   * ese proyecto en vez de crear uno nuevo en cada entrega.
   */
  defaultProject?: string;
  /** Transporte por el que llegó el cliente (se inyecta en el skill instalado). */
  transport?: "http" | "stdio";
  /** URL del servidor cuando el transporte es HTTP. */
  serverUrl?: () => string | undefined;
}

// --- Helpers de respuesta MCP ---
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

/**
 * Metadatos de una caja tal como los declara el agente. Se valida y deduplica en
 * `src/lib/element-metadata.ts`; acá sólo se declara la FORMA y —lo que de verdad
 * importa— la documentación que el agente lee antes de usarla.
 */
/**
 * Estado del elemento frente a lo que YA existe. El vocabulario sale de
 * `ESTADOS` (`src/lib/mcp/diagram-builder.ts`), no de una lista a mano acá.
 */
/**
 * A qué diagrama apunta la llamada. Opcional: si no viene, manda el fijado con
 * `use_diagram`, después el de la configuración del servidor y, si hay uno solo
 * en el workspace, ese. La regla vive en `src/lib/mcp/active-diagram.ts`.
 */
const diagramIdSchema = z
  .string()
  .optional()
  .describe(
    "Id del diagrama. Opcional: sin él se usa el fijado con use_diagram, el de la configuración del servidor, o el único que haya en el workspace."
  );

const estadoSchema = z
  .enum(ESTADOS as unknown as [string, ...string[]])
  .optional()
  .describe(
    "Estado frente a lo que ya existe: \"existente\" (documentás algo que ya está en producción), \"modificado\" (existe y este diseño lo cambia), \"nuevo\" (lo trae este diseño), \"sin_cambios\", \"eliminado\". Por defecto \"nuevo\": declaralo al documentar un sistema vivo o el lienzo pinta todo como si fuera a construirse."
  );

/**
 * Metadatos aceptando TAMBIÉN el array serializado como texto: varios clientes
 * MCP mandan el JSON en un string y Zod contestaba `expected "array", received
 * "string"` sin decir cómo arreglarlo. Se parsea antes de validar; si el texto
 * no es JSON, el mensaje explica la forma esperada.
 */
const metadataSchema = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t);
    } catch {
      // Texto que no es JSON: se deja pasar tal cual para que falle en el array
      // con el mensaje de abajo, que sí dice cómo corregirlo.
      return v;
    }
  }, z
  .array(
    z.object({
      clave: z.string().describe('Clave corta: "repo", "wiki", "owner", "SLA".'),
      valor: z.string().describe('Valor legible: "acme/pagos-svc", "Equipo Pagos".'),
      url: z.string().optional().describe("URL donde eso vive. Sólo http(s) se vuelve enlace en la app."),
    }),
    {
      invalid_type_error:
        'metadata es una LISTA de objetos, no texto: [{"clave":"repo","valor":"acme/pagos-svc","url":"https://github.com/acme/pagos-svc"}]. Si tu cliente sólo manda texto, mandá ese mismo JSON como cadena y se parsea solo.',
    }
  )
  .optional());

export function registerProcessflowTools(server: McpServer, opts: McpToolsOptions) {
  const DIAGRAMS_DIR = path.join(opts.workspace, ".processflow", "diagrams");

  // Registro observable: `install_skill` inyecta en el skill la lista de
  // herramientas que este transporte expone de verdad (export_as_view sólo
  // existe en modo app), y así el skill instalado no promete lo que no hay.
  // Se envuelve el método en vez de mantener la lista a mano: una lista paralela
  // se desincroniza en la primera herramienta nueva.
  const registered: string[] = [];
  const rawRegister = server.registerTool.bind(server);
  (server as unknown as { registerTool: unknown }).registerTool = (
    name: string,
    ...rest: unknown[]
  ) => {
    registered.push(name);
    return (rawRegister as (...args: unknown[]) => unknown)(name, ...rest);
  };

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

  // El fijado vive en el WORKSPACE, no en memoria: el transporte HTTP es
  // stateless (un servidor MCP por petición) y una variable de módulo se
  // perdería entre llamadas.
  const ACTIVE_FILE = path.join(DIAGRAMS_DIR, "..", "active.json");

  async function readPinned(): Promise<string | undefined> {
    try {
      const raw = JSON.parse(await fs.readFile(ACTIVE_FILE, "utf8"));
      return typeof raw?.diagramId === "string" ? raw.diagramId : undefined;
    } catch {
      return undefined;
    }
  }

  async function readPinnedProject(): Promise<string | undefined> {
    try {
      const raw = JSON.parse(await fs.readFile(ACTIVE_FILE, "utf8"));
      return typeof raw?.project === "string" ? raw.project : undefined;
    } catch {
      return undefined;
    }
  }

  /** Escribe una clave del archivo de fijados conservando la otra. */
  async function writeActive(patch: { diagramId?: string | null; project?: string | null }): Promise<void> {
    const actual = {
      diagramId: await readPinned(),
      project: await readPinnedProject(),
    };
    const proximo: Record<string, string> = {};
    const diagram = patch.diagramId === undefined ? actual.diagramId : patch.diagramId;
    const project = patch.project === undefined ? actual.project : patch.project;
    if (diagram) proximo.diagramId = diagram;
    if (project) proximo.project = project;

    await ensureDir(path.dirname(ACTIVE_FILE));
    if (!Object.keys(proximo).length) {
      await fs.rm(ACTIVE_FILE, { force: true });
      return;
    }
    await fs.writeFile(ACTIVE_FILE, JSON.stringify(proximo, null, 2), "utf8");
  }

  async function writePinned(id: string | null): Promise<void> {
    await writeActive({ diagramId: id });
  }

  /**
   * A qué diagrama se refiere esta llamada. La regla (y sus errores accionables)
   * vive en `src/lib/mcp/active-diagram.ts`; acá sólo se junta el estado.
   */
  async function activeId(explicit?: string): Promise<string> {
    return resolveDiagramId({
      explicit,
      pinned: await readPinned(),
      configured: opts.defaultDiagramId,
      disponibles: await listModels(),
    }).id;
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
      // Lo que el humano ve en «Metadatos»: si no se dice acá, el agente no
      // sabe que ya existe y lo pisa en el próximo export.
      `Hotspots: ${model.meta.hotspots?.length ?? 0} · Responsables: ${model.meta.responsables?.length ?? 0} · Notas propias: ${model.meta.notas ? "sí" : "no"} · Read models: ${model.readModels?.length ?? 0}`,
      ...(model.readModels?.length
        ? [`Vista de datos: ${model.readModels.map((r) => r.nombre).join(" · ")}`]
        : []),
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
      // Se fija solo: lo normal tras crear es trabajar sobre él, y repetir el id
      // en cada llamada es la fricción que hacía que el agente se equivocara.
      await writePinned(id);
      return text(
        `Diagrama creado y FIJADO. diagramId="${id}", notación=${notation}. Las próximas llamadas pueden omitir \`diagramId\`; cambialo con use_diagram.\n` +
          `Siguiente: usa describe_notation("${notation}") para ver los tipos válidos, luego add_container/add_node/add_edge.`
      );
    }
  );

  server.registerTool(
    "list_diagrams",
    {
      title: "Listar diagramas",
      description:
        "Lista los diagramas en curso del workspace CON su vocabulario: notación, conteos y los nombres de sus elementos. Los nombres son lo que evita construir una segunda versión de la verdad — antes de crear \"Servicio de listas\" mirá si el workspace ya lo llama \"OFAC Screening\".",
      inputSchema: {
        names: z
          .boolean()
          .default(true)
          .describe("false para listar sólo los ids (listado corto)."),
        limit: z
          .number()
          .int()
          .positive()
          .default(40)
          .describe("Tope de nombres por diagrama; el resto se resume como «… y N más»."),
      },
    },
    async ({ names, limit }) => {
      const ids = await listModels();
      if (!ids.length) return text("No hay diagramas. Crea uno con create_diagram.");
      if (!names) return text(ids.map((i) => `- ${i}`).join("\n"));

      const lineas: string[] = [];
      for (const id of ids) {
        let model: DiagramModel;
        try {
          model = await loadModel(id);
        } catch {
          lineas.push(`- ${id} (ilegible)`);
          continue;
        }
        const vocab = model.nodes.map((n) => n.nombre);
        const visibles = vocab.slice(0, limit);
        const resto = vocab.length - visibles.length;
        lineas.push(
          `- ${id} · ${model.meta.nombre_proyecto} · ${model.meta.notation} · ${model.nodes.length} elementos, ${model.edges.length} aristas` +
            (visibles.length
              ? `\n  ${visibles.join(" · ")}${resto > 0 ? ` · … y ${resto} más` : ""}`
              : "")
        );
      }
      return text(
        `${lineas.join("\n")}\n\nSi un nombre de tu diseño describe lo mismo que uno de arriba, reusá ESE nombre (o importá el diagrama con import_diagram) en vez de inventar un sinónimo.`
      );
    }
  );

  server.registerTool(
    "use_diagram",
    {
      title: "Fijar el diagrama de trabajo",
      description:
        "Fija el diagrama sobre el que actúan las demás herramientas cuando no pasás `diagramId`. Queda guardado en el workspace (sobrevive reinicios y el modo HTTP). Llamala sin argumentos para ver cuál está fijado, o con `clear: true` para soltarlo.",
      inputSchema: {
        diagramId: z
          .string()
          .optional()
          .describe("Id a fijar. Sin él, informa el fijado actual."),
        clear: z.boolean().optional().describe("true suelta el diagrama fijado."),
      },
    },
    async ({ diagramId, clear }) => {
      if (clear) {
        await writePinned(null);
        return text("Diagrama fijado: ninguno. Las llamadas vuelven a necesitar `diagramId` (salvo que haya uno solo en el workspace).");
      }
      const existentes = await listModels();
      if (!diagramId) {
        const actual = await readPinned();
        const cfg = opts.defaultDiagramId ? ` · configuración del servidor: "${opts.defaultDiagramId}"` : "";
        return text(
          `Fijado: ${actual ? `"${actual}"` : "ninguno"}${cfg}\nEn el workspace: ${
            existentes.length ? existentes.map((d) => `"${d}"`).join(", ") : "(ninguno)"
          }`
        );
      }
      if (!existentes.includes(diagramId)) {
        return fail(
          `No existe el diagrama "${diagramId}". En el workspace hay: ${
            existentes.length ? existentes.map((d) => `"${d}"`).join(", ") : "(ninguno)"
          }.`
        );
      }
      await writePinned(diagramId);
      const model = await loadModel(diagramId);
      return text(
        `Diagrama fijado: "${diagramId}" (${model.meta.nombre_proyecto}, ${model.meta.notation}). Las próximas llamadas pueden omitir \`diagramId\`.`
      );
    }
  );

  server.registerTool(
    "get_diagram",
    {
      title: "Ver diagrama",
      description:
        "Devuelve un resumen del diagrama (conteos, errores/avisos) y su vista previa Mermaid.",
      inputSchema: { diagramId: diagramIdSchema },
    },
    async ({ diagramId: diagramIdEntrada }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      // Mermaid no admite guiones en un id, así que el dibujo los cambia. Si el
      // agente copia de ahí, llama a un id que no existe: se declara la
      // equivalencia junto al diagrama (issue #149).
      const distintos = idsQueCambian(model);
      const aviso = distintos.length
        ? `\n\n⚠️ En el dibujo estos ids salen con guiones bajos; para llamar a las herramientas usá el id REAL (la izquierda):\n${distintos
            .map((d) => `- ${d.real}  (en el Mermaid: ${d.mermaid})`)
            .join("\n")}`
        : "";
      return text(
        `${summarize(diagramId, model)}\n\n\`\`\`mermaid\n${toMermaid(model)}\n\`\`\`${aviso}`
      );
    }
  );

  // -- 3. Construcción ---------------------------------------------------------

  server.registerTool(
    "add_container",
    {
      title: "Añadir contenedor",
      description:
        "Añade un contenedor (Agregado, Contexto Delimitado, Pool, Carril, Límite de Sistema, Paquete, …). Devuelve su nombre para usarlo como `container` de los nodos hijos. Los contenedores NO se anidan: la profundidad se modela con VISTAS enlazadas por viewRef (ADR 0002).",
      inputSchema: {
        diagramId: diagramIdSchema,
        name: z.string().describe("Nombre del contenedor (también su clave como padre)."),
        type: z.string().describe("Tipo contenedor válido de la notación (ver describe_notation)."),
        description: z.string().optional(),
        estado: estadoSchema,
        container: z
          .string()
          .optional()
          .describe(
            "NO soportado: un contenedor no cuelga de otro (el formato es de un nivel, ADR 0002). Para el nivel de abajo creá otra vista y enlazala con viewRef. Está declarado para poder explicarlo cuando lo intentes."
          ),
        source: z
          .string()
          .optional()
          .describe(
            "Cita de DÓNDE sale en la fuente (\"PRD §3.2 (p. 7)\", \"acta 12-mar\", \"src/pagos/service.ts\"). Sostiene la revisión humana: aparece en la tabla elemento←fuente de review_diagram."
          ),
        metadata: metadataSchema.describe(
            "Referencias y datos externos de la caja: DÓNDE VIVE de verdad. Es lo que conecta el diagrama con los artefactos reales — repositorio del componente, wiki que lo explica, tablero, equipo dueño, SLA— y lo que permite ir del diagrama al código en un clic; sin esto el modelo es una foto. Distinto de `source`: la cita dice de dónde SALIÓ el elemento en la documentación, el metadato dónde VIVE. Una clave repetida reemplaza su valor. Sólo las urls http(s) se vuelven enlace en la app. Ejemplo: [{clave:\"repo\", valor:\"acme/pagos-svc\", url:\"https://github.com/acme/pagos-svc\"}, {clave:\"wiki\", valor:\"Dominio Pagos\", url:\"https://wiki/pagos\"}, {clave:\"owner\", valor:\"Equipo Pagos\"}]"
          ),
      },
    },
    async ({ diagramId: diagramIdEntrada, name, type, description, estado, container, source, metadata }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const r = addContainer(model, {
          nombre: name,
          tipo_elemento: type,
          descripcion: description,
          estado_comparativo: estado as Estado | undefined,
          container,
          source,
          metadata,
        });
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
        diagramId: diagramIdSchema,
        name: z.string(),
        type: z.string().describe("Tipo NO contenedor válido de la notación."),
        container: z.string().optional().describe("Nombre de un contenedor existente."),
        description: z.string().optional(),
        estado: estadoSchema,
        tags: z.array(z.string()).optional().describe("Etiquetas de tecnología."),
        id: z.string().optional().describe("Id explícito (por defecto se deriva del nombre)."),
        source: z
          .string()
          .optional()
          .describe(
            "Cita de DÓNDE sale en la fuente (\"PRD §3.2 (p. 7)\", \"acta 12-mar\", \"src/pagos/service.ts\"). Aparece en la descripción del elemento y en la tabla elemento←fuente de review_diagram: sin ella el humano no puede contrastar el diagrama."
          ),
        metadata: metadataSchema.describe(
            "Referencias y datos externos de la caja: DÓNDE VIVE de verdad. Es lo que conecta el diagrama con los artefactos reales — repositorio del componente, wiki que lo explica, tablero, equipo dueño, SLA— y lo que permite ir del diagrama al código en un clic; sin esto el modelo es una foto. Distinto de `source`: la cita dice de dónde SALIÓ el elemento en la documentación, el metadato dónde VIVE. Una clave repetida reemplaza su valor. Sólo las urls http(s) se vuelven enlace en la app. Ejemplo: [{clave:\"repo\", valor:\"acme/pagos-svc\", url:\"https://github.com/acme/pagos-svc\"}, {clave:\"wiki\", valor:\"Dominio Pagos\", url:\"https://wiki/pagos\"}, {clave:\"owner\", valor:\"Equipo Pagos\"}]"
          ),
      },
    },
    async ({ diagramId: diagramIdEntrada, name, type, container, description, estado, tags, id, source, metadata }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const r = addNode(model, {
          id,
          nombre: name,
          tipo_elemento: type,
          container,
          descripcion: description,
          estado_comparativo: estado as Estado | undefined,
          tags_tecnologia: tags,
          source,
          metadata,
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
        diagramId: diagramIdSchema,
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
    async ({ diagramId: diagramIdEntrada, from, to, label, arrow, dashed }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
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
    "update_element",
    {
      title: "Corregir un elemento",
      description:
        "Cambia nombre, descripción, ESTADO (existente/modificado/nuevo), cita de la fuente, tags o METADATOS (repositorio, wiki, dueño) de un elemento existente SIN perder su id ni sus relaciones. Es la herramienta para arreglar lo que reporta validate_diagram (nombres que el lienzo recorta, elementos sin fuente) en vez de borrar y recrear. Renombrar un contenedor arrastra a sus hijos.",
      inputSchema: {
        diagramId: diagramIdSchema,
        id: z.string().describe("Id del elemento (nodo o contenedor)."),
        name: z.string().optional().describe("Nombre nuevo (corto: el lienzo recorta)."),
        type: z
          .string()
          .optional()
          .describe(
            "Tipo nuevo, de la MISMA familia (nodo→nodo, contenedor→contenedor). Para reclasificar: un Carril que en realidad es un participante independiente pasa a Pool."
          ),
        description: z.string().optional().describe("Descripción nueva (aquí va el detalle largo)."),
        estado: estadoSchema,
        source: z.string().optional().describe("Cita de la fuente."),
        tags: z.array(z.string()).optional(),
        metadata: metadataSchema.describe(
            "Referencias y datos externos de la caja: DÓNDE VIVE de verdad. Es lo que conecta el diagrama con los artefactos reales — repositorio del componente, wiki que lo explica, tablero, equipo dueño, SLA— y lo que permite ir del diagrama al código en un clic; sin esto el modelo es una foto. Distinto de `source`: la cita dice de dónde SALIÓ el elemento en la documentación, el metadato dónde VIVE. Una clave repetida reemplaza su valor. Sólo las urls http(s) se vuelven enlace en la app. Ejemplo: [{clave:\"repo\", valor:\"acme/pagos-svc\", url:\"https://github.com/acme/pagos-svc\"}, {clave:\"wiki\", valor:\"Dominio Pagos\", url:\"https://wiki/pagos\"}, {clave:\"owner\", valor:\"Equipo Pagos\"}]"
          ),
        metadataRemove: z
          .array(z.string())
          .optional()
          .describe(
            "Claves de metadatos a BORRAR. Va aparte de `metadata` —que agrega o reemplaza por clave— para que sumar una referencia no obligue a reenviar las que ya estaban."
          ),
      },
    },
    async ({ diagramId: diagramIdEntrada, id, name, type, description, estado, source, tags, metadata, metadataRemove }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const next = updateNode(model, id, {
          ...(name !== undefined ? { nombre: name } : {}),
          ...(type !== undefined ? { tipo_elemento: type } : {}),
          ...(description !== undefined ? { descripcion: description } : {}),
          ...(estado !== undefined ? { estado_comparativo: estado as Estado } : {}),
          ...(source !== undefined ? { source } : {}),
          ...(tags !== undefined ? { tags_tecnologia: tags } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
          ...(metadataRemove !== undefined ? { metadataRemove } : {}),
        });
        await saveModel(diagramId, next);
        const n = next.nodes.find((x) => x.id === id)!;
        return text(`Elemento "${id}" actualizado: "${n.nombre}" (${n.tipo_elemento}).`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "update_edge",
    {
      title: "Corregir una relación",
      description:
        "Cambia la etiqueta o el estilo de una relación existente (por sus extremos). Úsala para acortar etiquetas largas —se dibujan sueltas sobre la línea y tapan los nodos vecinos— dejando el detalle en la descripción de los elementos que conecta.",
      inputSchema: {
        diagramId: diagramIdSchema,
        from: z.string(),
        to: z.string(),
        label: z.string().optional().describe("Etiqueta nueva, corta: verbo + [tecnología]."),
        dashed: z.boolean().optional(),
        arrow: z.enum(["end", "both", "none"]).optional(),
      },
    },
    async ({ diagramId: diagramIdEntrada, from, to, label, dashed, arrow }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const next = updateEdge(model, from, to, {
          ...(label !== undefined ? { descripcion: label } : {}),
          ...(dashed !== undefined ? { dashed } : {}),
          ...(arrow !== undefined ? { arrow } : {}),
        });
        await saveModel(diagramId, next);
        return text(`Relación ${from} → ${to} actualizada.`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "remove_edge",
    {
      title: "Eliminar una relación",
      description:
        "Borra UNA relación por sus extremos, sin tocar los elementos. Para reconectar: p. ej. una Política que apunta directo a un Evento se corrige quitando ese atajo y pasando por el Comando que dispara.",
      inputSchema: { diagramId: diagramIdSchema, from: z.string(), to: z.string() },
    },
    async ({ diagramId: diagramIdEntrada, from, to }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        await saveModel(diagramId, removeEdge(model, from, to));
        return text(`Relación ${from} → ${to} eliminada.`);
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
      inputSchema: { diagramId: diagramIdSchema, id: z.string() },
    },
    async ({ diagramId: diagramIdEntrada, id }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        // El error viaja como respuesta de la herramienta, no como excepción:
        // el agente tiene que poder LEER que ese id no existía (issue #149).
        await saveModel(diagramId, removeNode(model, id));
      } catch (e: any) {
        return fail(e.message);
      }
      return text(`Elemento "${id}" eliminado.`);
    }
  );

  // -- 4. Revisión --------------------------------------------------------------

  server.registerTool(
    "validate_diagram",
    {
      title: "Validar diagrama",
      description:
        "Dos revisiones en una: VALIDEZ (tipos, ids duplicados, aristas colgantes, nodos aislados que el lienzo descartaría) y CALIDAD DE MODELADO por notación (¿hay inicio y fin?, ¿cada rama de la decisión dice su condición?, ¿la cadena Comando→Evento existe?, ¿las relaciones C4 declaran tecnología?, ¿los nombres caben en el lienzo?). Los errores y los hallazgos `grave` se corrigen antes de exportar.",
      inputSchema: { diagramId: diagramIdSchema },
    },
    async ({ diagramId: diagramIdEntrada }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      const v = validate(model);
      const findings = qualityFindings(model);
      const graves = findings.filter((f) => f.level === "grave").length;
      const parts = [
        v.ok
          ? graves
            ? `⚠️ Importable, pero con ${graves} hallazgo(s) grave(s) de modelado.`
            : "✅ Válido y bien modelado."
          : "❌ Con errores de validez.",
      ];
      if (v.errors.length) parts.push("Errores (rompen la importación):\n- " + v.errors.join("\n- "));
      if (v.warnings.length) parts.push("Avisos de validez:\n- " + v.warnings.join("\n- "));
      parts.push("Calidad de modelado:\n" + formatFindings(findings));
      return text(parts.join("\n\n"));
    }
  );

  server.registerTool(
    "review_diagram",
    {
      title: "Paquete de revisión humana",
      description:
        "Devuelve el artefacto que el HUMANO revisa antes de que el diagrama entre a la app, siempre con la misma estructura: 1) la historia en Mermaid, 2) tabla «elemento ← fuente» agrupada por contenedor, 3) decisiones tomadas y lo que quedó pendiente en la fuente, 4) hallazgos de validez y calidad, 5) veredicto. Muéstralo al usuario y espera su aprobación: con veredicto ❌ no exportes.",
      inputSchema: {
        diagramId: diagramIdSchema,
        sourceLabel: z
          .string()
          .optional()
          .describe("Cómo se llama el material revisado (\"PRD Aurora v3\", \"repo backend\")."),
      },
    },
    async ({ diagramId: diagramIdEntrada, sourceLabel }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      const packet = reviewPacket(model, sourceLabel);
      return text(packet.markdown);
    }
  );

  server.registerTool(
    "suggest_views",
    {
      title: "Sugerir el conjunto de vistas",
      description: `Mira el modelo (roles de sus elementos y tamaño) y propone el conjunto de vistas ideal: CORTES cuando pasa el tamaño legible (~${MAX_NODES} elementos) y COMPLEMENTOS cuando el material sostiene otra mirada (paisaje de sistemas, proceso operativo, visión de dominio). Úsala antes de exportar un diagrama grande: una vista ilegible no se revisa.`,
      inputSchema: { diagramId: diagramIdSchema },
    },
    async ({ diagramId: diagramIdEntrada }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      return text(formatViewPlan(suggestViews(model)));
    }
  );

  // -- 4b. Ambigüedades: lo que la fuente no cierra ------------------------------

  server.registerTool(
    "record_ambiguity",
    {
      title: "Registrar ambigüedad",
      description:
        "Registra en el diagrama una decisión de diseño que la FUENTE no cierra (alternativas sin decidir, contradicciones, vacíos que cambian la topología). Registra primero y pregunta TODO junto en una sola ronda. Lo que quede sin resolver viaja al humano en las notas del proyecto y en review_diagram: declarado, no inventado.",
      inputSchema: {
        diagramId: diagramIdSchema,
        question: z.string().describe("La duda, tal como se le preguntaría al usuario."),
        options: z
          .array(z.string())
          .optional()
          .describe("Alternativas con el nombre que les da la fuente."),
        affects: z.string().optional().describe("Qué parte del diagrama cambia según la respuesta."),
        source: z.string().optional().describe("Cita de dónde nace la duda."),
      },
    },
    async ({ diagramId: diagramIdEntrada, question, options, affects, source }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      const r = recordAmbiguity(model, { pregunta: question, opciones: options, afecta: affects, source });
      await saveModel(diagramId, r.model);
      return text(
        `Ambigüedad registrada (id="${r.id}"). Pendientes: ${pendingAmbiguities(r.model).length}. Ciérrala con resolve_ambiguity cuando el usuario responda.`
      );
    }
  );

  server.registerTool(
    "resolve_ambiguity",
    {
      title: "Resolver ambigüedad",
      description:
        "Cierra una ambigüedad con la respuesta del usuario. Queda en el modelo como «decisión tomada» y aparece en review_diagram y en las notas del proyecto: el humano ve POR QUÉ el diagrama dice lo que dice.",
      inputSchema: {
        diagramId: diagramIdSchema,
        id: z.string().describe("Id devuelto por record_ambiguity."),
        resolution: z.string().describe("Qué se decidió (y quién lo decidió, si aplica)."),
      },
    },
    async ({ diagramId: diagramIdEntrada, id, resolution }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const next = resolveAmbiguity(model, id, resolution);
        await saveModel(diagramId, next);
        return text(`Ambigüedad "${id}" resuelta. Pendientes: ${pendingAmbiguities(next).length}.`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  // -- 3b. Metadatos del proyecto (lo que la app muestra en «Metadatos») -------
  // Sin esto el MCP no podía escribir hotspots, responsables, notas ni read
  // models, y peor: `export_to_app` REEMPLAZA el proyecto, así que un export
  // vaciaba lo que el humano había llenado a mano (#133).

  server.registerTool(
    "set_project_meta",
    {
      title: "Metadatos del proyecto",
      description:
        "Declara los campos del proyecto que el humano ve en «Metadatos»: zonas a discutir (hotspots), responsables y notas. Un hotspot es lo que el equipo TIENE que discutir (una decisión sin dueño, un flujo contradictorio), no cualquier detalle pendiente: para eso está record_ambiguity. Las notas que el humano ya escribió en la app NO se pisan — quedan arriba y el resumen de ambigüedades se agrega debajo. Pasar una lista vacía borra ese campo; omitirlo lo deja como estaba.",
      inputSchema: {
        diagramId: diagramIdSchema,
        hotspots: z
          .array(z.string())
          .optional()
          .describe(`Zonas del modelo a discutir con el equipo (máximo ${MAX_LISTA_PROYECTO}).`),
        responsables: z
          .array(z.string())
          .optional()
          .describe("Quién responde por el modelo (nombres o roles)."),
        notes: z
          .string()
          .optional()
          .describe("Notas del proyecto. Reemplaza las notas propias, no el resumen de ambigüedades."),
      },
    },
    async ({ diagramId: diagramIdEntrada, hotspots, responsables, notes }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const next = setProjectMeta(model, { hotspots, responsables, notas: notes });
        await saveModel(diagramId, next);
        return text(
          `Metadatos de "${diagramId}" actualizados.\n` +
            `Hotspots: ${next.meta.hotspots?.length ?? 0} · Responsables: ${next.meta.responsables?.length ?? 0} · Notas: ${next.meta.notas ? "sí" : "no"}.\n` +
            `Siguiente: export_to_app (o export_as_view) para que el humano las vea.`
        );
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "add_read_model",
    {
      title: "Añadir modelo de lectura",
      description:
        "Declara una proyección (read model) de la vista de datos: qué pantalla o consulta se arma con qué eventos. No es una caja del lienzo: sale en la «Vista de Datos» del proyecto y en su Markdown. Un nombre repetido REEMPLAZA al anterior (dos proyecciones con el mismo nombre no se distinguen).",
      inputSchema: {
        diagramId: diagramIdSchema,
        name: z.string().describe("Nombre de la proyección (p. ej. «Panel de pólizas»)."),
        description: z.string().optional().describe("Para qué sirve, en una línea."),
        projects: z
          .array(z.string())
          .optional()
          .describe("Qué elementos del modelo proyecta (nombres de eventos/entidades)."),
        uiPolicies: z
          .array(z.string())
          .optional()
          .describe("Reglas de la interfaz que dependen de esta vista (sólo lectura, refresco, permisos)."),
        technologies: z.array(z.string()).optional().describe("Tecnologías con las que se implementa."),
      },
    },
    async ({ diagramId: diagramIdEntrada, name, description, projects, uiPolicies, technologies }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const r = addReadModel(model, {
          nombre: name,
          descripcion: description,
          proyecta: projects,
          ui_policies: uiPolicies,
          tecnologias: technologies,
        });
        await saveModel(diagramId, r.model);
        return text(
          `${r.reemplazado ? "Reemplazado" : "Añadido"} el read model "${name}". Total: ${r.model.readModels?.length ?? 0}.`
        );
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "remove_read_model",
    {
      title: "Quitar modelo de lectura",
      description:
        "Quita una proyección de la vista de datos por su nombre. Si no existe, la respuesta lista las que sí hay.",
      inputSchema: {
        diagramId: diagramIdSchema,
        name: z.string().describe("Nombre exacto del read model (ver get_diagram)."),
      },
    },
    async ({ diagramId: diagramIdEntrada, name }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      try {
        const next = removeReadModel(model, name);
        await saveModel(diagramId, next);
        return text(`Read model "${name}" quitado. Quedan ${next.readModels?.length ?? 0}.`);
      } catch (e: any) {
        return fail(e.message);
      }
    }
  );

  server.registerTool(
    "relayout_diagram",
    {
      title: "Rehacer el layout",
      description:
        "Descarta la geometría del diagrama y la recalcula, sin tocar elementos ni relaciones. Úsala con diagramas construidos hace tiempo o importados desde la app (traen posiciones guardadas y por eso volverían a exportarse con la disposición vieja), o para probar otra disposición: `density` cambia cuánto aire tiene y `strategy` cómo se ordena. Son los MISMOS presets que ofrece el botón «Organizar» del lienzo.",
      inputSchema: {
        diagramId: diagramIdSchema,
        density: z
          .enum(["compacto", "comodo", "expandido"])
          .optional()
          .describe("Aire del diagrama. Por defecto, el que ya tenía (o `comodo`)."),
        strategy: z
          .enum(["flujo", "capas", "radial"])
          .optional()
          .describe(
            "flujo = bandas por participante, de izquierda a derecha (procesos); capas = filas por rol, actores arriba y externos abajo (arquitectura); radial = concepto central y anillos de relaciones alrededor (mapas de dominio DDD). Por defecto, la natural de la notación."
          ),
      },
    },
    async ({ diagramId: diagramIdEntrada, density, strategy }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      const next = relayout(model, { density, strategy });
      await saveModel(diagramId, next);
      const bandas = next.nodes.filter((n) => isContainerType(n.tipo_elemento));
      const ancho = Math.max(...next.nodes.map((n) => (n.x ?? 0) + (n.width ?? 160)), 0);
      const alto = Math.max(...next.nodes.map((n) => (n.y ?? 0) + (n.height ?? 60)), 0);
      return text(
        `Layout rehecho para "${diagramId}" (${model.meta.notation}).\n` +
          `Disposición: ${next.meta.layout?.density} · ${next.meta.layout?.strategy}.\n` +
          `Lienzo: ${Math.round(ancho)}×${Math.round(alto)} px · ${bandas.length} banda(s).\n` +
          `Siguiente: export_to_app (o export_as_view) para verlo en la app.`
      );
    }
  );

  server.registerTool(
    "render_mermaid",
    {
      title: "Vista previa Mermaid",
      description: "Devuelve el diagrama en Mermaid para revisarlo visualmente (sequenceDiagram si hay Líneas de Vida, flowchart en el resto de casos).",
      inputSchema: { diagramId: diagramIdSchema },
    },
    async ({ diagramId: diagramIdEntrada }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      return text("```mermaid\n" + toMermaid(model) + "\n```");
    }
  );

  // -- 4c. Ingesta: qué hay en la app antes de tocarla ---------------------------

  server.registerTool(
    "get_app_state",
    {
      title: "Estado de la app",
      description:
        "PRIMERA llamada de cualquier sesión de diseño: qué proyecto está activo en Processflow Architect, con qué notación, qué vistas existen ya y cuánto cupo queda. De aquí sale la decisión entre export_to_app (crea/reemplaza el proyecto) y export_as_view (suma una pestaña al proyecto activo). Sin esta ingesta, exportar duplica vistas o pisa el trabajo del usuario.",
      inputSchema: {},
    },
    async () => text(formatAppState(opts.getAppState?.() ?? null))
  );

  // -- 4c-bis. Lectura del trabajo del humano (sólo modo app) --------------------
  // Sin esto el agente externo sólo escribe: no puede leer los artefactos que
  // generó la IA local ni continuar una vista que ya existe, y termina rehaciendo
  // (o contradiciendo) trabajo que ya estaba hecho.
  if (opts.readApp) {
    /** Traduce el fallo del puente a una respuesta MCP con las opciones que sí hay. */
    const noSePudo = (r: Extract<AppReadResult, { ok: false }>) =>
      fail(r.options?.length ? `${r.error}\nDisponibles: ${r.options.join(" · ")}` : r.error);

    server.registerTool(
      "list_artifacts",
      {
        title: "Listar artefactos de la app",
        description:
          "Artefactos que la IA local de Processflow ya generó en un proyecto (drivers, riesgos, propuesta, roadmap, ADRs, mapas…): título, tipo, revisión vigente y tamaño. Úsala antes de escribir cualquier documento: si ya existe uno, se continúa o se cita, no se duplica. Sin `project` responde sobre el proyecto ACTIVO.",
        inputSchema: {
          project: z
            .string()
            .optional()
            .describe("Nombre de otro proyecto guardado (por defecto, el activo). Leerlo NO cambia el lienzo del usuario."),
        },
      },
      async ({ project }) => {
        const r = await opts.readApp!({ kind: "artifacts", project });
        if (!r.ok) return noSePudo(r);
        return text(formatArtifactList(r.project, r.kind === "artifacts" ? r.artifacts : []));
      }
    );

    server.registerTool(
      "get_artifact",
      {
        title: "Leer un artefacto",
        description:
          "Devuelve el Markdown de un artefacto de la app (el mismo que ve el humano en el visor), con su revisión y el histórico declarado. Úsalo para trabajar SOBRE lo que ya existe: citarlo, criticarlo o extenderlo. El título admite forma corta si resuelve a uno solo; si es ambiguo, la respuesta lista los títulos.",
        inputSchema: {
          title: z.string().describe("Título del artefacto (ver list_artifacts)."),
          project: z.string().optional().describe("Otro proyecto guardado (por defecto, el activo)."),
          revision: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Revisión concreta. Por defecto, la vigente."),
        },
      },
      async ({ title, project, revision }) => {
        const r = await opts.readApp!({ kind: "artifact", title, project, revision });
        if (!r.ok) return noSePudo(r);
        return r.kind === "artifact" ? text(formatArtifact(r.project, r.artifact)) : fail("Respuesta inesperada.");
      }
    );

    server.registerTool(
      "list_views",
      {
        title: "Listar vistas de la app",
        description:
          "Vistas (pestañas) de un proyecto de la app con su notación, origen (sistema/custom) y cuántos elementos tiene cada una. `get_app_state` da esto del proyecto activo; esta herramienta además llega a OTRO proyecto guardado, que es como se reutiliza un modelo ya hecho.",
        inputSchema: {
          project: z.string().optional().describe("Otro proyecto guardado (por defecto, el activo)."),
        },
      },
      async ({ project }) => {
        const r = await opts.readApp!({ kind: "views", project });
        if (!r.ok) return noSePudo(r);
        return text(formatViewList(r.project, r.kind === "views" ? r.views : []));
      }
    );

    server.registerTool(
      "get_view",
      {
        title: "Leer una vista (y opcionalmente traerla como diagrama)",
        description:
          "Contenido de una vista de la app: resumen, Mermaid de lo que dibuja y —con `importAs`— el mismo modelo como diagrama EDITABLE en el workspace, para continuarlo con add_node/add_edge y devolverlo con export_as_view. Es la forma de no rehacer lo que el humano ya modeló. Las vistas Mermaid devuelven su código.",
        inputSchema: {
          name: z.string().describe("Nombre de la vista (ver list_views)."),
          project: z.string().optional().describe("Otro proyecto guardado (por defecto, el activo)."),
          importAs: z
            .boolean()
            .default(false)
            .describe("true = además crea un diagrama editable con ese contenido y devuelve su diagramId."),
        },
      },
      async ({ name, project, importAs }) => {
        const r = await opts.readApp!({ kind: "view", name, project });
        if (!r.ok) return noSePudo(r);
        if (r.kind !== "view") return fail("Respuesta inesperada.");
        const v = r.view;
        const cabecera = `Vista "${v.name}" de "${r.project}" — ${v.kind}${
          v.notation ? ` / ${v.notation}` : ""
        }, ${v.elements} elemento(s)${v.builtin ? " (vista del sistema)" : ""}.`;

        if (v.mermaidCode) {
          return text([cabecera, "", "```mermaid", v.mermaidCode.trim(), "```"].join("\n"));
        }
        if (!v.graph) return fail(`La vista "${v.name}" no trae contenido legible.`);

        // El modelo se nombra por la VISTA, no por el `nombre_proyecto` que traiga
        // su GraphData: una vista importada de "Cobros BPMN" que se llame como el
        // proyecto de origen confunde al devolverla con export_as_view.
        const importado = fromGraphData(v.graph, (v.notation as NotationId) || "ddd");
        const model: DiagramModel = { ...importado, meta: { ...importado.meta, nombre_proyecto: v.name } };
        const partes = [cabecera, "", "```mermaid", toMermaid(model).trim(), "```"];
        if (importAs) {
          const id = await freshId(slugify(`${r.project}-${v.name}`));
          await saveModel(id, model);
          partes.push(
            "",
            `Importada como diagramId="${id}" (${model.nodes.length} elementos, ${model.edges.length} aristas): editala y devolvela con export_as_view para no duplicar la pestaña.`
          );
        }
        return text(partes.join("\n"));
      }
    );
  }

  // -- 4d. Skills: el arnés del agente externo -----------------------------------

  server.registerTool(
    "list_skills",
    {
      title: "Listar skills disponibles",
      description:
        "Skills de Claude Code que este servidor puede instalar en el entorno del usuario: qué hace cada uno, qué archivos trae y dónde se instalan. Son el arnés que hace que un agente externo diseñe con trazabilidad y revisión en vez de improvisar.",
      inputSchema: {},
    },
    async () =>
      text(
        listSkills()
          .map(
            (s) =>
              `## ${s.id}\n${s.summary}\nArchivos: ${s.files
                .map((f) => f.path)
                .join(", ")}\nInstalación: ${skillInstallPath(s.id)}\nComando en Claude Code: /${s.id}`
          )
          .join("\n\n")
      )
  );

  server.registerTool(
    "install_skill",
    {
      title: "Instalar/configurar un skill",
      description:
        "Escribe un skill (o todos) en el entorno del usuario con la CONFIGURACIÓN de este servidor ya inyectada: transporte real (HTTP a la app o stdio del repo), herramientas realmente disponibles, workspace, notación por defecto y límites. Así el skill instalado no menciona herramientas que este transporte no expone. `scope: \"project\"` escribe en <projectDir>/.claude/skills (requiere projectDir); `scope: \"user\"` en ~/.claude/skills (global). Vuelve a llamarla con overwrite para actualizar un skill viejo.",
      inputSchema: {
        skill: z
          .enum([...SKILL_IDS, "all"] as [string, ...string[]])
          .default("all")
          .describe("Id del skill (ver list_skills) o \"all\" para instalar todos."),
        scope: z
          .enum(["project", "user"])
          .default("project")
          .describe("project = .claude/skills del proyecto del usuario; user = ~/.claude/skills."),
        projectDir: z
          .string()
          .optional()
          .describe("Raíz del proyecto del usuario (obligatoria con scope=project)."),
        overwrite: z
          .boolean()
          .default(false)
          .describe("true para sobrescribir un skill ya instalado."),
        configure: z
          .boolean()
          .default(true)
          .describe("Inyectar el bloque «Configuración activa» con el estado real de este servidor."),
      },
    },
    async ({ skill, scope, projectDir, overwrite, configure }) => {
      if (scope === "project" && !projectDir) {
        return fail(
          "Con scope=\"project\" necesito `projectDir` (la raíz del proyecto del usuario, p. ej. el cwd de tu sesión). Con scope=\"user\" se instala en ~/.claude/skills."
        );
      }
      const root =
        scope === "user"
          ? path.join(os.homedir(), ".claude", "skills")
          : path.join(path.resolve(projectDir!), ".claude", "skills");

      const ids = skill === "all" ? [...SKILL_IDS] : [skill];
      const config: SkillConfig | undefined = configure
        ? {
            transport: opts.transport ?? (opts.exportToApp ? "http" : "stdio"),
            url: opts.serverUrl?.(),
            tools: registered,
            workspace: opts.workspace,
            defaultNotation: DEFAULT_NOTATION_ID,
            maxNodes: MAX_NODES,
            viewsLimit: MAX_CUSTOM_VIEWS,
          }
        : undefined;

      const written: string[] = [];
      const alDia: string[] = [];
      const desactualizados: string[] = [];
      for (const id of ids) {
        for (const file of renderSkillFiles(id, config)) {
          const dest = path.join(root, id, ...file.path.split("/"));
          if (!overwrite) {
            // Saltar en silencio dejaba leyendo un skill viejo sin saberlo: se
            // COMPARA con lo que se generaría y se dice cuál difiere.
            let actual: string | null = null;
            try {
              actual = await fs.readFile(dest, "utf8");
            } catch {
              actual = null; // no existe: se escribe
            }
            if (actual !== null) {
              const rel = path.relative(root, dest);
              if (actual === file.content) alDia.push(rel);
              else desactualizados.push(rel);
              continue;
            }
          }
          await ensureDir(path.dirname(dest));
          await fs.writeFile(dest, file.content, "utf8");
          written.push(path.relative(root, dest));
        }
      }

      const parts = [`Raíz de instalación: ${root}`];
      if (written.length) parts.push(`Escritos (${written.length}):\n- ${written.join("\n- ")}`);
      if (desactualizados.length) {
        parts.push(
          `⚠️ DESACTUALIZADOS — el archivo en disco NO es el que este servidor genera (${desactualizados.length}):\n- ${desactualizados.join(
            "\n- "
          )}\nEstás leyendo un skill viejo: llamá de nuevo con overwrite=true para actualizarlo.`
        );
      }
      if (alDia.length) {
        parts.push(`Ya estaban al día (${alDia.length}):\n- ${alDia.join("\n- ")}`);
      }
      if (written.length) {
        parts.push(
          `Siguiente paso para el usuario: reiniciar la sesión de Claude Code para que cargue el skill, y escribir /${ids[0]}.`
        );
      }
      return text(parts.join("\n\n"));
    }
  );

  // -- 5. Integración con la app -------------------------------------------------

  server.registerTool(
    "export_to_app",
    {
      title: "Exportar a la app",
      description: opts.exportToApp
        ? "Serializa el diagrama (GraphData) y lo entrega al lienzo de Processflow Architect (la app está conectada). Por defecto ACTUALIZA el proyecto abierto —o el que diga `project` / la configuración del servidor— conservando la geometría que el humano movió y fusionando sus notas; con `mode=\"new\"` crea un proyecto aparte. También escribe un .json de respaldo."
        : "Serializa el diagrama al formato GraphData y lo escribe como .json en el workspace. Ese archivo se abre en Processflow Architect con «Importar diagrama (JSON)». Devuelve la ruta absoluta.",
      inputSchema: {
        diagramId: diagramIdSchema,
        projectName: z
          .string()
          .optional()
          .describe(
            "Nombre del PROYECTO en la app (por defecto el del diagrama). Útil cuando un diagrama es un nivel de algo mayor: un C4 con L1+L2+L3 no debería llamarse «… · C4 L1 Contexto». Simétrico con `viewName` de export_as_view."
          ),
        project: z
          .string()
          .optional()
          .describe(
            "Proyecto de la app a ACTUALIZAR: su nombre, o \"activo\" para el que está abierto. Por defecto, el de la configuración del servidor (`PROCESSFLOW_PROJECT`) o el activo. Sólo aplica con mode=\"update\"."
          ),
        mode: z
          .enum(["update", "new"])
          .optional()
          .describe(
            "update (por defecto con la app conectada): funde el diseño sobre un proyecto que ya existe, conservando su geometría y sus notas. new: crea un proyecto aparte — dos diseños del mismo dominio dejan dos proyectos y el humano tiene que adivinar cuál vale."
          ),
        outPath: z
          .string()
          .optional()
          .describe("Ruta de salida (por defecto <workspace>/<diagramId>.json)."),
      },
    },
    async ({ diagramId: diagramIdEntrada, projectName, project, mode, outPath }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
      const model = await loadModel(diagramId);
      const v = validate(model);
      const nombre = projectName?.trim() || model.meta.nombre_proyecto;
      const graph: GraphData = { ...toGraphData(model), nombre_proyecto: nombre };
      const dest = path.resolve(outPath || path.join(opts.workspace, `${diagramId}.json`));
      await ensureDir(path.dirname(dest));
      await fs.writeFile(dest, JSON.stringify(graph, null, 2), "utf8");

      const warn = v.warnings.length ? `\n\nAvisos:\n- ${v.warnings.join("\n- ")}` : "";
      const err = v.errors.length
        ? `\n\n⚠️ Con errores (revisa antes de importar):\n- ${v.errors.join("\n- ")}`
        : "";

      // Modo app: entrega directa al lienzo.
      if (opts.exportToApp) {
        // Actualizar es el default: crear un proyecto nuevo en cada entrega es
        // lo que dejaba tres «Enrollment v2» y ninguno claramente vigente.
        const actualiza = (mode ?? "update") === "update";
        let destino: { project: string } | undefined;
        if (actualiza) {
          const estado = opts.getAppState?.() ?? null;
          try {
            destino = {
              project: resolveProjectRef(project ?? (await readPinnedProject()) ?? opts.defaultProject, {
                activo: estado?.projectName ?? null,
                proyectos: estado?.projects ?? [],
              }),
            };
          } catch (e: any) {
            // Pidió un proyecto POR NOMBRE y no existe: se avisa. Entregar a
            // otro (o crear una copia) es peor que no entregar.
            if (project ?? (await readPinnedProject()) ?? opts.defaultProject) {
              return fail(`${e.message}\n\nEl .json quedó en: ${dest}`);
            }
            // Nadie dijo a cuál y no hay ninguno abierto (pantalla de
            // bienvenida): crear el primero es exactamente lo que se quiere.
            destino = undefined;
          }
        }

        const delivered = await opts.exportToApp(nombre, graph, destino);
        if (delivered) {
          return text(
            destino
              ? `✅ Proyecto "${destino.project}" ACTUALIZADO en la app con el diseño "${nombre}". Se conservó la posición de los elementos que ya estaban y sus notas.\nRespaldo: ${dest}${warn}${err}`
              : `✅ Diagrama cargado en el lienzo de la app como proyecto NUEVO "${nombre}".\nRespaldo: ${dest}${warn}${err}`
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
          "Carga el diagrama como VISTA (pestaña) del proyecto ACTIVO en la app, con su propia notación — en vez de crear un proyecto aparte (para eso está export_to_app). Úsala para complementar un modelo con vistas BPMN/C4/UML del mismo dominio. Con `replace: true` ACTUALIZA la pestaña que ya se llama así (conserva la posición que el humano les dio a las cajas y no consume cupo) en vez de dejar una segunda con el mismo nombre. Requiere un proyecto abierto en la app.",
        inputSchema: {
          diagramId: diagramIdSchema,
          viewName: z
            .string()
            .optional()
            .describe("Nombre de la pestaña (por defecto, el nombre del diagrama)."),
          replace: z
            .boolean()
            .optional()
            .describe(
              "true actualiza la pestaña existente con ese nombre. Si no existe ninguna, avisa con las que hay en vez de crearla: rediseñar y entregar dos veces no debería dejar dos pestañas iguales."
            ),
        },
      },
      async ({ diagramId: diagramIdEntrada, viewName, replace }) => {
      // Sin `diagramId` explícito: manda el fijado con use_diagram, el de la
      // configuración, o el único del workspace (`active-diagram.ts`).
      let diagramId: string;
      try {
        diagramId = await activeId(diagramIdEntrada);
      } catch (e: any) {
        return fail(e.message);
      }
        const model = await loadModel(diagramId);
        const v = validate(model);
        const graph: GraphData = toGraphData(model);
        const name = viewName || model.meta.nombre_proyecto;

        const warn = v.warnings.length ? `\n\nAvisos:\n- ${v.warnings.join("\n- ")}` : "";
        const err = v.errors.length
          ? `\n\n⚠️ Con errores (revisa antes de usar):\n- ${v.errors.join("\n- ")}`
          : "";

        // Reemplazar apunta a una pestaña que YA existe: se comprueba antes de
        // entregar (con el retrato que publica el renderer) para poder avisar
        // con las opciones, igual que `export_to_app` con `project`.
        if (replace) {
          const vistas = opts.getAppState?.()?.views ?? [];
          const ref = resolveViewRef(name, vistas);
          if (!ref.existe) return fail(vistaInexistente(name, vistas));
        }

        const delivered = await opts.exportViewToApp!(name, graph, model.meta.notation, replace);
        if (delivered) {
          // Los metadatos son del PROYECTO, no de la vista: la app los fusiona
          // al recibirla (ver `src/lib/mcp/project-meta.ts`). Se declara acá
          // para que el agente no los repita a mano en el chat.
          const meta: string[] = [];
          if (model.meta.hotspots?.length) meta.push(`${model.meta.hotspots.length} hotspots`);
          if (model.meta.responsables?.length)
            meta.push(`${model.meta.responsables.length} responsables`);
          if (model.meta.notas?.trim() || pendingAmbiguities(model).length) meta.push("notas/ambigüedades");
          const metaTxt = meta.length
            ? `\nAl proyecto activo se suman: ${meta.join(" · ")} (no se pisa lo que ya había).`
            : "";
          return text(
            `✅ Vista "${name}" (${model.meta.notation}) ${
              replace ? "ACTUALIZADA" : "enviada"
            } en el proyecto activo de la app.${
              replace ? " Se conservó la posición de los elementos que ya estaban." : ""
            }${metaTxt}${warn}${err}`
          );
        }
        return fail(
          "La app no tiene ventana activa; abre Processflow Architect y reintenta (o usa export_to_app para generar un .json)."
        );
      }
    );
  }

  // Sólo en modo app: fijar el proyecto destino. En HTTP no hay argumentos de
  // línea de comandos que pasarle al servidor —el cliente sólo abre una URL— así
  // que sin esto la única forma de elegir proyecto era tenerlo abierto (#148).
  if (opts.getAppState) {
    server.registerTool(
      "use_project",
      {
        title: "Fijar el proyecto destino",
        description:
          "Fija a qué PROYECTO de la app entrega `export_to_app` cuando no pasás `project`. Queda guardado en el workspace del servidor, así que sobrevive reinicios y sirve en el transporte HTTP, donde no hay argumentos que pasarle al servidor. Llamala sin argumentos para ver cuál está fijo, o con `clear: true` para soltarlo y volver a «el proyecto abierto».",
        inputSchema: {
          project: z.string().optional().describe("Nombre del proyecto a fijar."),
          clear: z.boolean().optional().describe("true suelta el proyecto fijado."),
        },
      },
      async ({ project, clear }) => {
        const estado = opts.getAppState?.() ?? null;
        const conocidos = [
          ...(estado?.projectName ? [estado.projectName] : []),
          ...(estado?.projects ?? []),
        ];
        const lista = conocidos.length
          ? [...new Set(conocidos)].map((p) => `"${p}"`).join(", ")
          : "(ninguno)";

        if (clear) {
          await writeActive({ project: null });
          return text(
            `Proyecto fijado: ninguno. \`export_to_app\` vuelve a actualizar el proyecto ABIERTO${
              estado?.projectName ? ` (ahora "${estado.projectName}")` : ""
            }.`
          );
        }
        if (!project) {
          const fijo = await readPinnedProject();
          const cfg = opts.defaultProject ? ` · configuración del servidor: "${opts.defaultProject}"` : "";
          return text(
            `Proyecto fijado: ${fijo ? `"${fijo}"` : "ninguno"}${cfg}\nAbierto en la app: ${
              estado?.projectName ? `"${estado.projectName}"` : "ninguno"
            }\nProyectos: ${lista}`
          );
        }
        try {
          // Se valida contra lo que la app dice tener: fijar un nombre que no
          // existe sólo mueve el error al momento de entregar.
          const resuelto = resolveProjectRef(project, {
            activo: estado?.projectName ?? null,
            proyectos: estado?.projects ?? [],
          });
          await writeActive({ project: resuelto });
          return text(
            `Proyecto fijado: "${resuelto}". \`export_to_app\` va a ACTUALIZARLO mientras no pases \`project\` ni \`mode: "new"\`.`
          );
        } catch (e: any) {
          return fail(e.message);
        }
      }
    );
  }

  // Sólo en modo app: recoger lo que el agente ensucia. Crear pestañas sin poder
  // borrarlas dejaba el cupo lleno de duplicados que sólo limpiaba el humano.
  if (opts.actOnApp) {
    server.registerTool(
      "delete_view",
      {
        title: "Eliminar una vista",
        description:
          "Elimina una PESTAÑA (vista custom) del proyecto ACTIVO por su nombre exacto. Es destructivo sobre el trabajo del humano: no borra por coincidencia parcial, no borra varias de una vez y no toca las vistas del sistema. Si el nombre no existe, te dice cuáles hay y no borra nada. Para el diagrama en curso están remove_element y remove_edge: esto opera sobre las pestañas del proyecto, no sobre su contenido.",
        inputSchema: {
          name: z.string().describe("Nombre exacto de la pestaña a eliminar."),
        },
      },
      async ({ name }) => {
        const r = await opts.actOnApp!({ kind: "delete-view", name });
        return r.ok ? text(`✅ ${r.message}`) : fail(r.error);
      }
    );

    server.registerTool(
      "rename_view",
      {
        title: "Renombrar una vista",
        description:
          "Cambia el nombre de una PESTAÑA del proyecto ACTIVO. Es la alternativa NO destructiva a borrar y volver a subir: conserva la vista y su contenido. Falla si ya hay otra pestaña con ese nombre — dos pestañas iguales es justo lo que se está evitando.",
        inputSchema: {
          name: z.string().describe("Nombre exacto de la pestaña actual."),
          newName: z.string().describe("Nombre nuevo."),
        },
      },
      async ({ name, newName }) => {
        const r = await opts.actOnApp!({ kind: "rename-view", name, newName });
        return r.ok ? text(`✅ ${r.message}`) : fail(r.error);
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
        relayout: z
          .boolean()
          .default(false)
          .describe(
            "true para rehacer el layout al importar. Un .json de la app trae posiciones guardadas: sin esto conserva su disposición original."
          ),
      },
    },
    async ({ path: p, notation, relayout: rehacer }) => {
      let data: GraphData;
      try {
        data = JSON.parse(await fs.readFile(path.resolve(p), "utf8")) as GraphData;
      } catch (e: any) {
        return fail(`No pude leer/parsear "${p}": ${e.message}`);
      }
      // Precedencia: notación explícita del param → la que trae el propio .json
      // (GraphData.notation) → ddd. Así reimportar un BPMN conserva su notación.
      const importado = fromGraphData(
        data,
        (notation as NotationId) || (data.notation as NotationId) || "ddd"
      );
      const model = rehacer ? relayout(importado) : importado;
      const id = await freshId(slugify(data.nombre_proyecto || "importado"));
      await saveModel(id, model);
      // Igual que create_diagram: retomar un diseño es empezar a trabajar en él.
      await writePinned(id);
      return text(
        `Importado y FIJADO como diagramId="${id}" (${model.nodes.length} elementos, ${model.edges.length} aristas)${
          rehacer ? ", con el layout rehecho" : ". Trae la disposición del archivo; usa relayout_diagram si querés recalcularla"
        }.`
      );
    }
  );
}
