/** Two real Electron profiles, DOM input events, native IPC, persistence and QUIC.
 * DOM events avoid Windows focus/occlusion differences between two local windows.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer";

const content = { nombre_proyecto: "Colaboración de prueba", version: "1", notation: "ddd", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [],
  agregados: [{ id: "group", nombre_agregado: "Equipo", tipo_contenedor: "Agregado", entidad_raiz: "", descripcion: "", x: 120, y: 120, width: 850, height: 420, nodos: [
    { id: "a", nombre: "Componente A", tipo_elemento: "Comando", estado_comparativo: "nuevo", x: 220, y: 270, width: 220, height: 100 },
    { id: "b", nombre: "Componente B", tipo_elemento: "Evento", estado_comparativo: "nuevo", x: 620, y: 270, width: 220, height: 100 },
  ], aristas: [{ id: "ab", fuente: "a", destino: "b", descripcion: "Colaboran" }] }], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function clickSelector(page: Page, selector: string) {
  await page.waitForSelector(selector);
  await page.$eval(selector, element => (element as HTMLElement).click());
}
async function fill(page: Page, selector: string, text: string) {
  await page.waitForSelector(selector);
  await page.$eval(selector, (element, value) => {
    (element as HTMLElement).focus();
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, text);
}
async function closePanel(page: Page) {
  const selector = 'button[aria-label="Colaboración del proyecto"]';
  if (await page.$eval(selector, element => element.getAttribute("data-state") === "open")) await clickSelector(page, selector);
}
async function moveCursor(page: Page, dx: number, dy: number) {
  await page.evaluate(({ dx, dy }) => {
    const svg = document.querySelector("svg[data-skin]"); if (!svg) throw new Error("Canvas missing");
    const r = svg.parentElement!.getBoundingClientRect();
    svg.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: r.left + dx, clientY: r.top + dy }));
  }, { dx, dy });
}
async function clickText(page: Page, text: string) {
  await page.bringToFront();
  await page.waitForFunction(t => [...document.querySelectorAll("button")].some(b => b.textContent?.trim() === t && !b.disabled), { timeout: 40_000, polling: 100 }, text);
  for (const button of await page.$$("button")) if (await button.evaluate((b, t) => b.textContent?.trim() === t, text)) { await button.evaluate(b => b.click()); return; }
  throw new Error(`Button missing: ${text}`);
}
async function waitText(page: Page, text: string) { await page.waitForFunction(t => document.body.innerText.includes(t), { timeout: 40_000, polling: 100 }, text); }
async function rename(page: Page, before: string, after: string) {
  await page.bringToFront();
  await page.evaluate(value => {
    const element = [...document.querySelectorAll("svg foreignObject *")].find(el => el.childElementCount === 0 && el.textContent?.trim() === value);
    if (!element) throw new Error(`Missing component ${value}`);
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  }, before);
  await page.waitForSelector('input[aria-label="Nombre del elemento"], #node-name', { timeout: 10_000 });
  const selector = await page.$('input[aria-label="Nombre del elemento"]') ? 'input[aria-label="Nombre del elemento"]' : '#node-name';
  await fill(page, selector, after); await page.$eval(selector, element => (element as HTMLElement).blur());
}
async function run() {
  const host = await puppeteer.connect({ browserURL: "http://127.0.0.1:9227" });
  const guest = await puppeteer.connect({ browserURL: "http://127.0.0.1:9228" });
  const output = resolve(process.argv[2] || "../ui-evidence"); mkdirSync(output, { recursive: true });
  try {
    const a = (await host.pages()).find(p => !p.url().startsWith("devtools:"))!;
    const b = (await guest.pages()).find(p => !p.url().startsWith("devtools:"))!;
    assert.ok(a && b, "Both Electron windows must be open");
    for (const page of [a, b]) { await page.setViewport({ width: 1440, height: 900 }); page.on("pageerror", e => console.error("UI error:", e instanceof Error ? e.message : String(e))); }
    for (const page of [a, b]) await page.goto(process.env.PROCESSFLOW_TEST_URL || "http://127.0.0.1:43219", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await b.evaluate(value => {
      const placeholder = { ...value, nombre_proyecto: "Invitación de prueba", agregados: [], politicas_inter_agregados: [] };
      const files = JSON.parse(localStorage.getItem("saved_json_files") || "[]").filter((file: { id: string }) => file.id !== "ui-guest-home");
      localStorage.setItem("saved_json_files", JSON.stringify([...files, { id: "ui-guest-home", name: "Invitación de prueba", content: placeholder }]));
      localStorage.setItem("last_opened_file_id", "ui-guest-home");
    }, content);
    await b.reload({ waitUntil: "domcontentloaded" }); await waitText(b, "Invitación de prueba");
    await a.evaluate(async value => {
      const api = (window as any).electronAPI;
      const opened = await api.collaborationCommand({ type: "open", fileId: "ui-demo", initial: { content: value } });
      if (opened.status) await api.collaborationCommand({ type: "leave", fileId: "ui-demo" });
    }, content);
    await a.evaluate(value => { localStorage.setItem("saved_json_files", JSON.stringify([{ id: "ui-demo", name: value.nombre_proyecto, content: value }])); localStorage.setItem("last_opened_file_id", "ui-demo"); }, content);
    await a.reload({ waitUntil: "domcontentloaded" }); await a.bringToFront(); await waitText(a, "Componente A");
    console.log("PASS: seeded project opens in the desktop renderer");
    await clickSelector(a, 'button[aria-label="Colaboración del proyecto"]');
    await fill(a, "#collaboration-name", "Ana");
    await clickText(a, "Vincular este proyecto y ser anfitrión"); await waitText(a, "Este equipo es el anfitrión.");
    await clickText(a, "Generar invitación"); await a.waitForSelector("#collaboration-generated");
    const invitation = await a.$eval("#collaboration-generated", el => (el as HTMLTextAreaElement).value);
    await closePanel(a);
    console.log("STEP: opening guest collaboration control");
    await b.bringToFront(); await clickSelector(b, 'button[aria-label="Colaboración del proyecto"]');
    await fill(b, "#collaboration-name", "Luis"); await fill(b, "#collaboration-invitation", invitation);
    await clickText(b, "Vincular una copia y unirme"); await waitText(b, "Puedes editar este proyecto."); await closePanel(b); await waitText(b, "Componente A");
    console.log("PASS: create and join through the actual Electron interface");
    await moveCursor(a, 250, 150); await moveCursor(b, 500, 230);
    await a.waitForFunction(() => [...document.querySelectorAll("svg text")].some(t => t.textContent?.includes("Luis")), { timeout: 10_000, polling: 100 });
    await b.waitForFunction(() => [...document.querySelectorAll("svg text")].some(t => t.textContent?.includes("Ana")), { timeout: 10_000, polling: 100 });
    console.log("PASS: named, colored native live cursors in both windows");
    await rename(a, "Componente A", "Componente A editado"); await waitText(b, "Componente A editado"); await a.keyboard.press("Escape");
    await rename(b, "Componente B", "Componente B editado"); await waitText(a, "Componente B editado"); await b.keyboard.press("Escape");
    console.log("PASS: editing component names in either canvas updates the other");
    await moveCursor(a, 250, 150); await moveCursor(b, 500, 230); await wait(500);
    await a.screenshot({ path: resolve(output, "colaboracion-en-vivo.png") });
    await clickSelector(a, 'button[aria-label="Colaboración del proyecto"]'); await a.screenshot({ path: resolve(output, "colaboracion-panel.png") });
    await a.keyboard.press("Escape");
    // Reopening the renderer must load its saved native binding automatically.
    await b.reload({ waitUntil: "domcontentloaded" }); await waitText(b, "Componente A editado"); await waitText(b, "Componente B editado");
    await b.bringToFront(); await clickSelector(b, 'button[aria-label="Colaboración del proyecto"]'); await waitText(b, "Puedes editar este proyecto."); await b.keyboard.press("Escape");
    console.log("PASS: renderer restart restores the persistent project link and merged edits");
  } finally { await host.disconnect(); await guest.disconnect(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
