/**
 * @fileOverview Proyecto de ejemplo + doble del host para manejar la UI real con Puppeteer.
 *
 * Lo comparten `scripts/screenshots.ts` (capturas del README) y `scripts/tutorial/`
 * (videos tutoriales, #664): las dos cosas muestran la app al público, así que
 * tienen que mostrar EL MISMO proyecto. Antes vivía dentro de screenshots.ts.
 */

import {
  emptyDiagram,
  addContainer,
  addNode,
  addEdge,
  layout,
  toGraphData,
  validate,
} from "../src/lib/mcp/diagram-builder";
import type { GraphData } from "../src/lib/types";

// =============================================================================
// 1 · El proyecto de ejemplo (mismo constructor que el MCP)
// =============================================================================

export function seedGraph(): GraphData {
  let m = emptyDiagram({
    nombre_proyecto: "Marketplace de Seguros",
    notation: "ddd",
    descripcion: "Cotización, emisión y cobro de pólizas de auto",
    // Fecha fija: si fuera `new Date()` cada corrida cambiaría el encabezado del
    // proyecto y toda captura saldría "modificada" en el diff sin motivo.
    fecha_analisis: "2026-08-18",
  });

  const cont = (nombre: string, descripcion: string) => {
    m = addContainer(m, { nombre, tipo_elemento: "Agregado", descripcion }).model;
    return nombre;
  };
  const nodo = (
    nombre: string,
    tipo_elemento: string,
    container?: string,
    descripcion?: string,
    tags?: string[],
    icono?: string
  ) => {
    const r = addNode(m, {
      nombre,
      tipo_elemento,
      container,
      descripcion,
      tags_tecnologia: tags ?? null,
      // Logo de tecnología (spec 025): la captura muestra que una caja puede
      // decir con qué está hecha, no sólo de qué tipo es.
      icono,
    });
    m = r.model;
    return r.id;
  };
  const arista = (fuente: string, destino: string, descripcion?: string) => {
    m = addEdge(m, { fuente, destino, descripcion });
  };

  const cotizacion = cont("Cotización", "Cotización");
  const poliza = cont("Póliza", "Póliza");
  const cobro = cont("Cobro", "Pago");

  const cliente = nodo("Cliente", "Actor", undefined, "Solicita cotizaciones en el portal", undefined, "lu-User");
  const cSolicitar = nodo("Solicitar cotización", "Comando", cotizacion, "Datos del vehículo y del conductor");
  const eCotizada = nodo("Cotización emitida", "Evento", cotizacion, "Prima calculada y vigente 15 días");
  const rTarifa = nodo("Tarifa por riesgo", "Regla de Negocio", cotizacion, "Recarga por siniestralidad y zona");
  const cAceptar = nodo("Aceptar cotización", "Comando", poliza, "El cliente acepta la prima ofrecida");
  const ePolizaEmitida = nodo("Póliza emitida", "Evento", poliza, "Número de póliza y vigencia asignados");
  const cCobrar = nodo("Cobrar prima", "Comando", cobro, "Cargo a la tarjeta del cliente");
  const eCobrada = nodo("Prima cobrada", "Evento", cobro, "Pago confirmado por la pasarela", ["Stripe"], "si-stripe");
  const eRechazada = nodo("Prima rechazada", "Evento", cobro, "Fondos insuficientes o tarjeta vencida");
  // Duplicado a propósito (mismo concepto, otro nombre): es el caso de uso que
  // muestra la captura del Agrupador de Nodos.
  const eConfirmado = nodo("Cobro confirmado", "Evento", cobro, "Alta del recibo en contabilidad");
  const pActivar = nodo("Al cobrar, activar póliza", "Política", undefined, "Prima cobrada → póliza en vigor");
  const eActivada = nodo("Póliza activada", "Evento", poliza, "Cobertura vigente desde la fecha de cobro");
  const buro = nodo("Buró de riesgo", "Sistema Externo", undefined, "Historial de siniestros del conductor", undefined, "lu-ShieldCheck");
  const pasarela = nodo("Pasarela de pagos", "Sistema Externo", undefined, "Autoriza el cargo de la prima", undefined, "si-stripe");
  const panel = nodo("Panel de pólizas", "Vista", undefined, "Estado y vencimientos por cliente", undefined, "lu-BarChart3");

  arista(cliente, cSolicitar, "solicita");
  arista(cSolicitar, eCotizada, "dispara");
  arista(rTarifa, eCotizada, "calcula la prima");
  arista(buro, rTarifa, "aporta historial");
  arista(eCotizada, cAceptar, "habilita");
  arista(cAceptar, ePolizaEmitida, "dispara");
  arista(ePolizaEmitida, cCobrar, "exige cobro");
  arista(cCobrar, pasarela, "autoriza");
  arista(pasarela, eCobrada, "confirma");
  arista(pasarela, eRechazada, "declina");
  arista(pasarela, eConfirmado, "confirma");
  arista(eCobrada, pActivar, "dispara");
  arista(pActivar, eActivada, "activa");
  arista(eActivada, panel, "proyecta");

  const v = validate(m);
  if (!v.ok) {
    console.error("El diagrama de ejemplo no es válido:", v.errors.join(" · "));
    process.exit(1);
  }
  // Bandas por agregado: es la lectura que promete el README.
  return toGraphData(layout(m, { strategy: "capas", density: "compacto" }));
}

/** Organización de ejemplo: la portada muestra su galería de proyectos. */
export const ORG = "aseguradora-andina";

/**
 * Proyectos hermanos del de ejemplo, para que la galería tenga qué comparar. Se
 * arman con el mismo constructor; la geometría no importa (la tarjeta no la dibuja).
 */
export function proyectosHermanos(): GraphData[] {
  const armar = (
    nombre_proyecto: string,
    notation: "c4" | "bpmn",
    descripcion: string,
    fecha_analisis: string,
    nodos: [string, string][],
    contenedor?: string
  ) => {
    let m = emptyDiagram({ nombre_proyecto, notation, descripcion, fecha_analisis });
    if (contenedor) m = addContainer(m, { nombre: contenedor.split("|")[0], tipo_elemento: contenedor.split("|")[1] }).model;
    const ids = nodos.map(([nombre, tipo_elemento], i) => {
      const r = addNode(m, { nombre, tipo_elemento, container: contenedor && i > 1 ? contenedor.split("|")[0] : undefined });
      m = r.model;
      return r.id;
    });
    for (let i = 1; i < ids.length; i++) m = addEdge(m, { fuente: ids[i - 1], destino: ids[i] });
    return toGraphData(layout(m, { strategy: "capas", density: "compacto" }));
  };
  return [
    armar(
      "Paisaje de sistemas de pólizas",
      "c4",
      "Portal de clientes, core de pólizas y las integraciones con el buró de riesgo y la pasarela de pagos.",
      "2026-08-12",
      [
        ["Asegurado", "Persona"],
        ["Portal de clientes", "Sistema"],
        ["API de pólizas", "Contenedor"],
        ["Base de pólizas", "Base de Datos"],
        ["Pasarela de pagos", "Sistema Externo"],
      ],
      "Core de pólizas|Límite de Sistema"
    ),
    armar(
      "Atención de siniestros",
      "bpmn",
      "Desde el aviso del siniestro hasta el pago de la indemnización, con la inspección del perito.",
      "2026-07-29",
      [
        ["Aviso de siniestro", "Evento de Inicio"],
        ["Registrar reclamo", "Tarea"],
        ["Inspección del perito", "Tarea"],
        ["Liquidar indemnización", "Tarea"],
        ["Indemnización pagada", "Evento de Fin"],
      ]
    ),
  ];
}

// =============================================================================
// 2 · Doble de `preload.ts` (lo que leen las pantallas que se capturan)
// =============================================================================

const MCP_TOOLS = [
  "list_orgs", "create_org", "use_org", "rename_org", "delete_org", "move_diagram",
  "create_diagram", "list_diagrams", "get_diagram", "describe_notation", "list_notations",
  "add_container", "add_node", "add_edge", "remove_element", "remove_edge",
  "relayout_diagram", "render_mermaid", "validate_diagram", "review_diagram",
  "record_ambiguity", "resolve_ambiguity", "get_app_state", "export_to_app",
  "export_as_view", "install_skill",
].map((name) => ({ name, description: "", inputSchema: {} }));

const MODELS = {
  totalRamGB: 36,
  models: [
    {
      id: "gemma-e2b", label: "Gemma 4 · E2B", file: "gemma-4-E2B-it-web.litertlm", url: "",
      approxGB: 2.0, downloaded: false, sizeBytes: 0,
      blurb: "Más liviano y rápido. Buena opción por defecto en equipos con poca VRAM.",
    },
    {
      id: "gemma-e4b", label: "Gemma 4 · E4B", file: "gemma-4-E4B-it-web.litertlm", url: "",
      approxGB: 3.0, downloaded: true, sizeBytes: 3_221_225_472,
      blurb: "Máxima calidad agéntica/multimodal. Requiere GPU/VRAM más holgada.",
    },
  ],
};

const SYSTEM_INFO = {
  osName: "macOS", osVersion: "14.5", arch: "arm64",
  cpuModel: "Apple M3 Pro", cpuCores: 12,
  totalRamGB: 36, freeRamGB: 14, diskTotalGB: 994, diskFreeGB: 312,
  appVersion: "0.2.0", electronVersion: "39.0.0", chromeVersion: "134.0.0.0",
  nodeVersion: "22.14.0", userDataPath: "~/Library/Application Support/processflow-architect",
};

/**
 * Doble de `preload.ts`, como TEXTO a evaluar en la página. Va en string a
 * propósito: pasar una función de este archivo la manda transformada por esbuild
 * (`tsx`), que le inyecta su helper `__name` — inexistente en el navegador, así
 * que el stub moría con "__name is not defined" y Ajustes salía en su estado
 * "sólo en la app de escritorio".
 */
export const electronStubSource = () => `
  (() => {
    const noop = () => () => {};
    const mcp = { running: true, port: 7331, url: "http://127.0.0.1:7331/mcp" };
    const models = ${JSON.stringify(MODELS)};
    const sysinfo = ${JSON.stringify(SYSTEM_INFO)};
    const tools = ${JSON.stringify(MCP_TOOLS)};
    const api = {
      generatePdf: async () => ({ ok: true }),
      navigate: noop,
      onDesignerAction: noop,
      copyToClipboard: async () => true,
      captureCanvas: async () => "",
      litertModelsList: async () => models,
      litertModelDownload: async () => ({ ok: true }),
      litertModelDelete: async () => ({ ok: true }),
      litertModelReveal: async () => ({ ok: true }),
      onLitertModelProgress: noop,
      mcpServerStart: async () => mcp,
      mcpServerStop: async () => ({ ...mcp, running: false, url: "" }),
      mcpServerStatus: async () => mcp,
      onMcpImportDiagram: noop,
      onMcpImportView: noop,
      mcpPublishAppState: () => {},
      mcpPlaygroundListTools: async () => tools,
      mcpPlaygroundCall: async () => ({ ok: true, blocks: ["{}"], isError: false }),
      systemInfo: async () => sysinfo,
      setAiKey: async () => ({ ok: true }),
      deleteAiKey: async () => ({ ok: true }),
      getAiKeyStatus: async () => ({}),
      remoteGenerate: async () => ({ ok: false, error: "sin llave" }),
      // Los tres arneses instalados: Ajustes muestra su versión al elegir uno.
      agentCliStatus: async () => [
        { cli: "claude", installed: true, version: "2.1.293 (Claude Code)", loggedIn: true },
        { cli: "codex", installed: true, version: "codex-cli 0.46.0" },
        { cli: "agy", installed: true, version: "1.4.10" },
      ],
      agentCliGenerate: async () => ({ ok: true, text: "OK" }),
      mcpOrgsStatus: async () => ({ pinned: null, orgs: [{ slug: "${ORG}", nombre: "Aseguradora Andina" }] }),
    };
    Object.defineProperty(window, "electronAPI", { value: api, configurable: true });
  })();
`;

/**
 * Proyecto activo en localStorage, también como texto (misma razón que arriba).
 * `aiMode`: las capturas muestran Ajustes en modo «Arnés» con Claude Code; un
 * tutorial arranca en `local`, que es el default real de la app.
 */
export const seedStorageSource = (files: unknown, aiMode: "local" | "cli" = "cli") => `
  (() => {
    localStorage.setItem("saved_json_files", ${JSON.stringify(JSON.stringify(files))});
    localStorage.setItem("last_opened_file_id", "demo");
    localStorage.setItem("litert_model", "gemma-e4b");
    localStorage.setItem("ai_remote_settings", JSON.stringify({ mode: "${aiMode}", provider: "gemini", models: {}, cli: "claude" }));
  })();
`;

/** El proyecto de ejemplo y sus hermanos, como los guarda la app (`saved_json_files`). */
export function demoFiles() {
  const content = seedGraph();
  return [
    { id: "demo", name: content.nombre_proyecto, orgId: ORG, content },
    ...proyectosHermanos().map((c, i) => ({ id: `demo-${i + 1}`, name: c.nombre_proyecto, orgId: ORG, content: c })),
  ];
}
