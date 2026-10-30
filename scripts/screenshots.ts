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
 * Fidelidad — dos decisiones, hoy en `scripts/demo-seed.ts` (las comparte el tutorial):
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
import { demoFiles, electronStubSource, seedStorageSource } from "./demo-seed";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = path.join(REPO_ROOT, "docs", "screenshots");
/** Puerto propio: el 3000 suele estar ocupado por el `electron-dev` del humano. */
const PORT = Number(process.env.PORT || 3210);
const BASE = process.env.BASE || `http://localhost:${PORT}`;
/** Sólo se levanta un servidor si el humano no apuntó a uno ya vivo. */
const OWN_SERVER = !process.env.BASE;

// =============================================================================
// Las capturas (proyecto de ejemplo y doble del host: `./demo-seed.ts`)
// =============================================================================

interface Shot {
  file: string;
  path: string;
  /** ¿La pantalla necesita un proyecto cargado? (la bienvenida se ve sin él). */
  seed: boolean;
  wait: number;
  /**
   * Texto que TIENE que estar en pantalla antes de capturar (#592). Sin esto,
   * un dev server lento (compilando, o compartido con electron-dev) dejaba
   * capturas de la pantalla de carga o de Ajustes sin modelos, y nadie lo
   * notaba hasta mirar el PNG. Si no aparece en `ESPERA_MAX_MS`, el script falla.
   */
  listo: string;
  /** Hero: colapsa el panel de análisis y reencuadra el lienzo. */
  hero?: boolean;
  /** Agrupador: elige tipo y nodo principal para que se vea el paso 3. */
  merger?: boolean;
  /** Portada: elige la organización en el chip para que el lienzo muestre su galería. */
  galeria?: boolean;
  /** Ajustes: lleva a la vista la tarjeta «Motor de IA». */
  motor?: boolean;
}

const SHOTS: Shot[] = [
  { file: "01-home.png", path: "/", seed: true, wait: 2500, galeria: true, listo: "Leyenda" },
  { file: "02-canvas.png", path: "/", seed: true, wait: 4000, hero: true, listo: "Leyenda" },
  // «Descargado» sólo aparece con el stub del host funcionando: es la prueba
  // de que Ajustes ve los modelos y no cayó a «sólo en la app de escritorio».
  { file: "03-settings.png", path: "/settings", seed: true, wait: 2500, motor: true, listo: "Descargado" },
  { file: "04-mcp.png", path: "/mcp", seed: true, wait: 2500, listo: "MCP" },
  { file: "05-docs.png", path: "/docs", seed: true, wait: 2500, listo: "Documentación" },
  { file: "06-merger.png", path: "/merger", seed: true, wait: 2500, merger: true, listo: "Agrupador de Nodos" },
];

const ESPERA_MAX_MS = 60_000;

/** Espera a que `texto` esté en el documento, o falla con la pantalla que había. */
async function esperarListo(page: Page, shot: Shot) {
  const inicio = Date.now();
  while (Date.now() - inicio < ESPERA_MAX_MS) {
    const hay = await page.evaluate((t) => document.body?.innerText.includes(t), shot.listo);
    if (hay) return;
    await esperar(500);
  }
  const visible = await page.evaluate(() => document.body?.innerText.slice(0, 200).replace(/\s+/g, " "));
  throw new Error(`${shot.file}: no apareció «${shot.listo}» en ${ESPERA_MAX_MS / 1000} s. En pantalla: «${visible}»`);
}

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
  const savedFiles = demoFiles();

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
      // puppeteer 25 tipa el error como `unknown`: puede no ser un Error.
      page.on("pageerror", (e) => console.error(`  [error de página ${shot.file}]`, e instanceof Error ? e.message : String(e)));
      await page.evaluateOnNewDocument(electronStubSource());
      if (shot.seed) await page.evaluateOnNewDocument(seedStorageSource(savedFiles));
      await page.goto(BASE + shot.path, { waitUntil: "networkidle2", timeout: 120_000 });
      // El indicador de `next dev` no existe en la app empaquetada.
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await esperarListo(page, shot);
      await esperar(shot.wait);

      if (shot.merger) await prepararMerger(page);
      if (shot.hero) await prepararHero(page);
      if (shot.galeria) await prepararGaleria(page);
      if (shot.motor) await prepararMotor(page);

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

/**
 * Hero = el lienzo con el proyecto encuadrado y la paleta de la notación a la
 * vista (en dos columnas: entra el grupo entero sin desplazarse).
 */
async function prepararHero(page: Page) {
  await page.evaluate(() => {
    (document.querySelector('button[title="Ajustar a contenido"]') as HTMLElement | null)?.click();
  });
  await esperar(1200);
}

/**
 * Portada = la galería de la organización. Se llega como el humano: abriendo el
 * chip del header y eligiendo la organización (Radix necesita eventos reales).
 */
async function prepararGaleria(page: Page) {
  await page.click('button[title^="Filtro de organización"]');
  await esperar(500);
  const items = await page.$$('[role="menuitem"]');
  for (const it of items) {
    const t = await it.evaluate((el) => el.textContent ?? "");
    if (t.includes("Aseguradora Andina")) {
      await it.click();
      break;
    }
  }
  await esperar(1500);
  const hay = await page.evaluate(() => document.body.innerText.includes("elegí uno para abrirlo"));
  if (!hay) throw new Error("01-home.png: la galería de la organización no apareció.");
}

/** Ajustes = la tarjeta «Motor de IA» arriba, con el selector del arnés entero. */
async function prepararMotor(page: Page) {
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h3, div")].find((el) => el.textContent?.trim() === "Motor de IA");
    h?.closest(".rounded-lg, [class*='card']")?.scrollIntoView({ block: "start" });
  });
  await esperar(800);
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
