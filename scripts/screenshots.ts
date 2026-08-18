/**
 * @fileOverview Regenera las capturas del README contra la UI REAL.
 *
 *   npm run screenshots            # levanta `next dev`, captura y lo apaga
 *   BASE=http://localhost:3000 npm run screenshots   # usa un servidor ya vivo
 *
 * Existe porque las capturas envejecen en silencio: las del README llevaban un
 * mes mostrando una UI que ya no existía (piel clara, antes del rediseño) y
 * nadie lo nota hasta que un tercero abre el repo. Con esto rehacerlas es un
 * comando, así que se rehacen.
 *
 * Fidelidad — dos decisiones que valen el ruido de este archivo:
 *  1. El proyecto de ejemplo se construye con el MISMO constructor que usa el
 *     MCP (`src/lib/mcp/diagram-builder`), no con un JSON escrito a mano: la
 *     captura muestra lo que la app produce, incluida su disposición.
 *  2. `window.electronAPI` se simula con el contrato de `preload.ts`, así
 *     Ajustes y la guía MCP se ven como en la app empaquetada (modelo Gemma
 *     descargado, servidor MCP activo) en vez de "sólo en el escritorio".
 *
 * Lo que NO hace: comparar contra las capturas guardadas. El gate no puede
 * juzgar si una captura "se ve bien" — eso lo mira el humano en el diff.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer";
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

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = path.join(REPO_ROOT, "docs", "screenshots");
/** Puerto propio: el 3000 suele estar ocupado por el `electron-dev` del humano. */
const PORT = Number(process.env.PORT || 3210);
const BASE = process.env.BASE || `http://localhost:${PORT}`;
/** Sólo se levanta un servidor si el humano no apuntó a uno ya vivo. */
const OWN_SERVER = !process.env.BASE;

// =============================================================================
// 1 · El proyecto de ejemplo (mismo constructor que el MCP)
// =============================================================================

function seedGraph(): GraphData {
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
    tags?: string[]
  ) => {
    const r = addNode(m, {
      nombre,
      tipo_elemento,
      container,
      descripcion,
      tags_tecnologia: tags ?? null,
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

  const cliente = nodo("Cliente", "Actor", undefined, "Solicita cotizaciones en el portal");
  const cSolicitar = nodo("Solicitar cotización", "Comando", cotizacion, "Datos del vehículo y del conductor");
  const eCotizada = nodo("Cotización emitida", "Evento", cotizacion, "Prima calculada y vigente 15 días");
  const rTarifa = nodo("Tarifa por riesgo", "Regla de Negocio", cotizacion, "Recarga por siniestralidad y zona");
  const cAceptar = nodo("Aceptar cotización", "Comando", poliza, "El cliente acepta la prima ofrecida");
  const ePolizaEmitida = nodo("Póliza emitida", "Evento", poliza, "Número de póliza y vigencia asignados");
  const cCobrar = nodo("Cobrar prima", "Comando", cobro, "Cargo a la tarjeta del cliente");
  const eCobrada = nodo("Prima cobrada", "Evento", cobro, "Pago confirmado por la pasarela", ["Stripe"]);
  const eRechazada = nodo("Prima rechazada", "Evento", cobro, "Fondos insuficientes o tarjeta vencida");
  // Duplicado a propósito (mismo concepto, otro nombre): es el caso de uso que
  // muestra la captura del Agrupador de Nodos.
  const eConfirmado = nodo("Cobro confirmado", "Evento", cobro, "Alta del recibo en contabilidad");
  const pActivar = nodo("Al cobrar, activar póliza", "Política", undefined, "Prima cobrada → póliza en vigor");
  const eActivada = nodo("Póliza activada", "Evento", poliza, "Cobertura vigente desde la fecha de cobro");
  const buro = nodo("Buró de riesgo", "Sistema Externo", undefined, "Historial de siniestros del conductor");
  const pasarela = nodo("Pasarela de pagos", "Sistema Externo", undefined, "Autoriza el cargo de la prima");
  const panel = nodo("Panel de pólizas", "Vista", undefined, "Estado y vencimientos por cliente");

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

// =============================================================================
// 2 · Doble de `preload.ts` (lo que leen las pantallas que se capturan)
// =============================================================================

const MCP_TOOLS = [
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
const electronStubSource = () => `
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
    };
    Object.defineProperty(window, "electronAPI", { value: api, configurable: true });
  })();
`;

/** Proyecto activo en localStorage, también como texto (misma razón que arriba). */
const seedStorageSource = (files: unknown) => `
  (() => {
    localStorage.setItem("saved_json_files", ${JSON.stringify(JSON.stringify(files))});
    localStorage.setItem("last_opened_file_id", "demo");
    localStorage.setItem("litert_model", "gemma-e4b");
  })();
`;

// =============================================================================
// 3 · Las capturas
// =============================================================================

interface Shot {
  file: string;
  path: string;
  /** ¿La pantalla necesita un proyecto cargado? (la bienvenida se ve sin él). */
  seed: boolean;
  wait: number;
  /** Hero: colapsa el panel de análisis y reencuadra el lienzo. */
  hero?: boolean;
  /** Agrupador: elige tipo y nodo principal para que se vea el paso 3. */
  merger?: boolean;
}

const SHOTS: Shot[] = [
  { file: "01-home.png", path: "/", seed: false, wait: 2500 },
  { file: "02-canvas.png", path: "/", seed: true, wait: 4000, hero: true },
  { file: "03-settings.png", path: "/settings", seed: true, wait: 2500 },
  { file: "04-mcp.png", path: "/mcp", seed: true, wait: 2500 },
  { file: "05-docs.png", path: "/docs", seed: true, wait: 2500 },
  { file: "06-merger.png", path: "/merger", seed: true, wait: 2500, merger: true },
];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Levanta `next dev` y espera a que responda; devuelve el proceso para matarlo. */
async function startDevServer(): Promise<ChildProcess> {
  console.log(`▶ levantando next dev en :${PORT} …`);
  const proc = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: REPO_ROOT,
    stdio: "ignore",
    detached: false,
  });
  for (let i = 0; i < 60; i++) {
    await esperar(1000);
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return proc;
    } catch {
      /* todavía arrancando */
    }
  }
  proc.kill();
  throw new Error(`next dev no respondió en ${BASE} tras 60 s`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const content = seedGraph();
  const savedFiles = [{ id: "demo", name: content.nombre_proyecto, content }];

  const server = OWN_SERVER ? await startDevServer() : null;
  const browser = await puppeteer.launch({
    headless: true,
    // 1440×900 @2x: el encuadre de una ventana de escritorio, nítido en retina.
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars"],
  });

  try {
    for (const shot of SHOTS) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error(`  [error de página ${shot.file}]`, e.message));
      await page.evaluateOnNewDocument(electronStubSource());
      if (shot.seed) await page.evaluateOnNewDocument(seedStorageSource(savedFiles));
      await page.goto(BASE + shot.path, { waitUntil: "networkidle2", timeout: 120_000 });
      // El indicador de `next dev` no existe en la app empaquetada.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await esperar(shot.wait);

      if (shot.merger) await prepararMerger(page);
      if (shot.hero) await prepararHero(page);

      await page.screenshot({ path: path.join(OUT_DIR, shot.file) as `${string}.png` });  // el tipo de puppeteer exige el literal .png
      console.log(`✔ ${shot.file}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server?.kill();
  }
  console.log(`\nCapturas en docs/screenshots/. Revisá el diff: el gate no juzga píxeles.`);
}

/** Hero = sólo el lienzo con el proyecto encuadrado. */
async function prepararHero(page: Page) {
  await page.evaluate(() => {
    document.querySelector("svg.lucide-panel-left-close")?.closest("button")?.click();
  });
  await esperar(800);
  await page.evaluate(() => {
    (document.querySelector('button[title="Ajustar a contenido"]') as HTMLElement | null)?.click();
  });
  await esperar(1200);
}

/**
 * Deja el Agrupador con tipo y nodo principal elegidos: sin eso la captura
 * muestra dos selectores vacíos y no se entiende para qué sirve la pantalla.
 * Radix Select responde a eventos de puntero REALES; un `el.click()` sintético
 * abre el menú pero no selecciona nada, así que la opción se elige por typeahead.
 */
async function prepararMerger(page: Page) {
  const elegir = async (indiceVisible: number, texto: string) => {
    const todos = await page.$$('button[role="combobox"]');
    const visibles: typeof todos = [];
    for (const t of todos) if (await t.boundingBox()) visibles.push(t);
    await visibles[indiceVisible]?.click();
    await esperar(500);
    await page.keyboard.type(texto, { delay: 60 });
    await esperar(300);
    await page.keyboard.press("Enter");
    await esperar(800);
  };
  await elegir(0, "Evento");
  await esperar(600);
  await elegir(1, "Prima cobrada");
  await page.keyboard.press("Escape");
  await esperar(600);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
