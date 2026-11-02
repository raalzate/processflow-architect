/** Two real Electron profiles, DOM input events, native IPC, persistence and QUIC.
 * DOM events avoid Windows focus/occlusion differences between two local windows.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Page, type Browser } from "puppeteer";

const content = { nombre_proyecto: "Colaboración de prueba", version: "1", notation: "ddd", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [],
  agregados: [{ id: "group", nombre_agregado: "Equipo", tipo_contenedor: "Agregado", entidad_raiz: "", descripcion: "", x: 120, y: 120, width: 850, height: 420, nodos: [
    { id: "a", nombre: "Componente A", tipo_elemento: "Comando", estado_comparativo: "nuevo", x: 220, y: 270 },
    { id: "b", nombre: "Componente B", tipo_elemento: "Evento", estado_comparativo: "nuevo", x: 620, y: 270 },
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
async function clickView(page: Page, name: string) {
  await page.waitForFunction(name => [...document.querySelectorAll("button span")].some(element => element.childElementCount === 0 && element.textContent === name), { timeout: 15_000, polling: 100 }, name);
  await page.evaluate(name => {
    const label = [...document.querySelectorAll("button span")].find(element => element.childElementCount === 0 && element.textContent === name);
    label!.closest("button")!.click();
  }, name);
}
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
  if (await page.$('[title="Cerrar (Esc)"]')) await clickSelector(page, '[title="Cerrar (Esc)"]');
}
async function startMotionRecording(page: Page, selector: string) {
  await page.evaluate(selector => {
    const samples: { t: number; x: number; y: number }[] = [];
    const start = performance.now();
    const timer = setInterval(() => {
      const element = document.querySelector(selector); if (!element) return;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      samples.push({ t: performance.now() - start, x: matrix.m41, y: matrix.m42 });
    }, 16);
    (window as any).__motionRecording = { samples, timer };
  }, selector);
}
async function isolateSyntheticPointer(page: Page) {
  await page.evaluate(() => {
    // Esta prueba DOM usa perfiles aislados: el ratón físico del usuario puede
    // seguir operando otras ventanas sin alterar su trayectoria programada.
    for (const type of ["mousemove", "mousedown", "mouseup", "mouseover", "mouseout", "pointermove", "pointerdown", "pointerup", "pointerover", "pointerout"]) {
      document.addEventListener(type, event => { if (event.isTrusted) event.stopImmediatePropagation(); }, true);
    }
  });
}
async function finishMotionRecording(page: Page) {
  return page.evaluate(() => {
    const recording = (window as any).__motionRecording;
    clearInterval(recording.timer); delete (window as any).__motionRecording;
    return recording.samples as { t: number; x: number; y: number }[];
  });
}
function checkMotion(samples: { t: number; x: number; y: number }[], label: string) {
  assert.ok(samples.length > 15, `${label}: enough displayed frames`);
  const min = Math.min(...samples.map(s => s.x)), max = Math.max(...samples.map(s => s.x));
  assert.ok(max - min > 80, `${label}: movement traverses a meaningful distance`);
  assert.ok(new Set(samples.map(s => Math.round(s.x))).size >= 10, `${label}: multiple intermediate displayed positions`);
  const maxJump = Math.max(...samples.slice(1).map((s, i) => Math.abs(s.x - samples[i].x)));
  if (maxJump >= (max - min) * .4) console.error(label, JSON.stringify(samples));
  assert.ok(maxJump < (max - min) * .4, `${label}: no single teleport across most of the trajectory (${maxJump})`);
  return { frames: samples.length, intermediatePositions: new Set(samples.map(s => Math.round(s.x))).size, distance: max - min, maxJump, samples };
}
async function testLiveMotion(source: Page, observer: Page) {
  await moveCursor(source, 250, 150); await wait(250);
  await startMotionRecording(observer, '[data-presence-name="Ana"] [data-presence-pointer]');
  for (let step = 1; step <= 32; step++) { await moveCursor(source, 250 + step * 10, 150 + step * 2); await wait(45); }
  await wait(180);
  const pointer = checkMotion(await finishMotionRecording(observer), "remote mouse");
  await startMotionRecording(observer, '[data-presence-name="Ana"] [data-presence-moving="a"]');
  const origin = await source.evaluate(() => {
    const label = [...document.querySelectorAll("svg foreignObject *")].find(el => el.childElementCount === 0 && el.textContent?.trim() === "Componente A editado");
    const node = label?.closest("g.cursor-grab"); if (!node) throw new Error("Draggable component missing");
    const rect = node.getBoundingClientRect(), x = rect.left + 35, y = rect.top + 25;
    node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y }));
    return { x, y, transform: node.getAttribute("transform") };
  });
  await wait(100);
  for (let step = 1; step <= 32; step++) {
    await source.evaluate(({ origin, step }) => {
      const svg = document.querySelector("svg[data-skin]")!;
      const init = { bubbles: true, buttons: 1, clientX: origin.x + step * 5, clientY: origin.y + step * 2 };
      svg.dispatchEvent(new PointerEvent("pointermove", { ...init, pointerType: "mouse" }));
      svg.dispatchEvent(new MouseEvent("mousemove", init));
    }, { origin, step }); await wait(45);
  }
  await wait(180);
  const component = checkMotion(await finishMotionRecording(observer), "remote dragged component");
  await source.evaluate(() => document.querySelector("svg[data-skin]")!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 })));
  await observer.waitForFunction(before => {
    const label = [...document.querySelectorAll("svg foreignObject *")].find(el => el.childElementCount === 0 && el.textContent?.trim() === "Componente A editado");
    const transform = label?.closest("g.cursor-grab")?.getAttribute("transform");
    return !!transform && transform !== before;
  }, { timeout: 15_000, polling: 100 }, origin.transform);
  return { pointer, component };
}
async function testLiveArrow(source: Page, observer: Page) {
  const getShared = () => source.evaluate(async () => (window as any).electronAPI.collaborationCommand({ type: "open", fileId: "ui-demo" }));
  const before = (await getShared()).snapshot.content.agregados[0].aristas.length;
  await startMotionRecording(observer, '[data-presence-name="Ana"] [data-presence-arrow-tip]');
  const origin = await source.evaluate(() => {
    const label = [...document.querySelectorAll("svg foreignObject *")].find(el => el.childElementCount === 0 && el.textContent?.trim() === "Componente A editado");
    const node = label?.closest("g.cursor-grab"), port = node?.querySelectorAll("g.cursor-crosshair")[1];
    if (!port || !node) throw new Error("Connection port missing");
    const circle = port.querySelector("circle")!, point = new DOMPoint(circle.cx.baseVal.value, circle.cy.baseVal.value).matrixTransform(circle.getScreenCTM()!);
    const { x, y } = point;
    const svgPoint = point.matrixTransform(document.querySelector<SVGSVGElement>("svg[data-skin]")!.getScreenCTM()!.inverse());
    port.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y }));
    return { x, y, svgX: svgPoint.x, svgY: svgPoint.y };
  });
  await observer.waitForSelector('[data-presence-name="Ana"] [data-presence-connecting="a"]');
  const remoteOrigin = await observer.$eval('[data-presence-name="Ana"] [data-presence-connecting="a"] > g', element => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform); return { x: matrix.m41, y: matrix.m42 };
  });
  assert.ok(Math.abs(remoteOrigin.x - origin.svgX) < 1 && Math.abs(remoteOrigin.y - origin.svgY) < 1, "the remote arrow starts at the exact selected port");
  for (let step = 1; step <= 32; step++) {
    await source.evaluate(({ origin, step }) => {
      const svg = document.querySelector("svg[data-skin]")!;
      const init = { bubbles: true, buttons: 1, clientX: origin.x + step * 6, clientY: origin.y + step * 2 };
      svg.dispatchEvent(new PointerEvent("pointermove", { ...init, pointerType: "mouse" }));
      svg.dispatchEvent(new MouseEvent("mousemove", init));
    }, { origin, step }); await wait(45);
  }
  await wait(180); const arrow = checkMotion(await finishMotionRecording(observer), "remote connection arrow");
  await source.evaluate(() => {
    const label = [...document.querySelectorAll("svg foreignObject *")].find(el => el.childElementCount === 0 && el.textContent?.trim() === "Componente B editado");
    const node = label?.closest("g.group[transform]"); if (!node) throw new Error("Connection target missing");
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
  });
  await observer.waitForFunction(() => document.body.innerText.includes("interactúa"), { timeout: 15_000, polling: 100 });
  await observer.waitForFunction(() => !document.querySelector('[data-presence-name="Ana"] [data-presence-connecting]'), { timeout: 5000, polling: 100 });
  const edges = (await getShared()).snapshot.content.agregados[0].aristas;
  assert.equal(edges.length, before + 1, "one drag creates one edge even with repeated mouseup");
  const created = edges.find((edge: any) => edge.descripcion === "interactúa");
  assert.deepEqual(created.sourceAnchor, { x: 1, y: .5 }, "the selected port survives in the saved edge");
  return arrow;
}
async function testWindowsAndViews(host: Browser, a: Page, b: Page) {
  await clickSelector(a, 'button[aria-label="Colaboración del proyecto"]');
  const created = host.waitForTarget(target => target.type() === "page" && target.url().includes("project=ui-demo"));
  await clickText(a, "Abrir proyecto en otra ventana"); await closePanel(a);
  const other = await (await created).page(); assert.ok(other);
  try {
    await waitText(other, "Componente A editado");
    await a.evaluate(async () => {
      const key = "agent_state_ui-demo", stored = JSON.parse(localStorage.getItem(key)!);
      stored.messages.push({ id: "private-window-regression", role: "user", content: "Conversación privada que debe conservarse", createdAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(stored));
      const api = (window as any).electronAPI, before = (await api.collaborationCommand({ type: "open", fileId: "ui-demo" })).snapshot;
      const after = structuredClone(before); after.agent.versions.push({ id: "window-regression-version", label: "v2", createdAt: new Date().toISOString() });
      const result = await api.collaborationCommand({ type: "patch", fileId: "ui-demo", before, after }); if (result.error) throw new Error(result.error);
    });
    await other.waitForFunction(() => JSON.parse(localStorage.getItem("agent_state_ui-demo")!).versions.some((version: any) => version.id === "window-regression-version"), { timeout: 10_000, polling: 100 });
    await wait(300);
    assert.ok(await other.evaluate(() => JSON.parse(localStorage.getItem("agent_state_ui-demo")!).messages.some((message: any) => message.id === "private-window-regression")), "shared artifact saves must preserve newer private chat from another window");
    await rename(other, "Componente B editado", "Componente B otra ventana");
    await waitText(a, "Componente B otra ventana"); await waitText(b, "Componente B otra ventana");
    await clickView(b, "Detalle compartido"); await waitText(b, "Detalle A");
    await rename(b, "Detalle A", "Detalle A actualizado");
    await waitText(a, "Componente A editado");
    assert.equal(await a.evaluate(() => document.body.innerText.includes("Detalle A actualizado")), false, "another person's navigation must stay independent");
    await clickView(other, "Detalle compartido"); await waitText(other, "Detalle A actualizado");
    await rename(other, "Detalle B", "Detalle B otra ventana"); await waitText(b, "Detalle B otra ventana");
    await clickView(b, "Modelo"); await waitText(b, "Componente B otra ventana");
    console.log("PASS: multiple native windows share the same project; simultaneous separate views merge without changing another person's view");
  } finally { await other.close(); }
}
async function run() {
  const host = await puppeteer.connect({ browserURL: `http://127.0.0.1:${process.env.PROCESSFLOW_TEST_HOST_PORT || 9227}` });
  const guest = await puppeteer.connect({ browserURL: `http://127.0.0.1:${process.env.PROCESSFLOW_TEST_GUEST_PORT || 9228}` });
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
    await a.evaluate(value => {
      localStorage.setItem("saved_json_files", JSON.stringify([{ id: "ui-demo", name: value.nombre_proyecto, content: value }])); localStorage.setItem("last_opened_file_id", "ui-demo");
      localStorage.setItem("agent_state_ui-demo", JSON.stringify({ versions: [{ id: "v1", label: "v1", createdAt: "2026-11-01T00:00:00Z" }], activeVersionId: "v1", lineages: [], artifacts: [], messages: [] }));
      const detail = structuredClone(value); detail.agregados[0].nodos[0].nombre = "Detalle A"; detail.agregados[0].nodos[1].nombre = "Detalle B";
      localStorage.setItem("views_ui-demo", JSON.stringify({ customViews: [{ id: "shared-detail", name: "Detalle compartido", kind: "graph", graph: detail, createdAt: "2026-11-01T00:00:00Z" }], activeViewId: "design", injectedViewIds: [] }));
    }, content);
    await a.reload({ waitUntil: "domcontentloaded" }); await a.bringToFront(); await waitText(a, "Componente A");
    console.log("PASS: seeded project opens in the desktop renderer");
    await clickSelector(a, 'button[aria-label="Colaboración del proyecto"]');
    await fill(a, "#collaboration-name", "Ana");
    await clickText(a, "Vincular este proyecto y ser anfitrión"); await waitText(a, "Estás alojando el proyecto compartido.");
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
    await isolateSyntheticPointer(a); await isolateSyntheticPointer(b);
    const motion = await testLiveMotion(a, b);
    const arrow = await testLiveArrow(a, b);
    writeFileSync(resolve(output, "prueba-movimiento-en-vivo.json"), JSON.stringify({ ...motion, arrow }, null, 2));
    console.log(`PASS: continuous remote mouse (${motion.pointer.intermediatePositions} positions) and component drag (${motion.component.intermediatePositions} positions); final position persists`);
    console.log(`PASS: remote connection arrow moves through ${arrow.intermediatePositions} displayed positions, then becomes a durable edge`);
    await testWindowsAndViews(host, a, b);
    await moveCursor(a, 250, 150); await moveCursor(b, 500, 230); await wait(500);
    await a.screenshot({ path: resolve(output, "colaboracion-en-vivo.png") });
    await clickSelector(a, 'button[aria-label="Colaboración del proyecto"]'); await wait(300);
    await a.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
    await a.screenshot({ path: resolve(output, "colaboracion-panel.png") });
    await a.keyboard.press("Escape");
    // Reopening the renderer must load its saved native binding automatically.
    await b.reload({ waitUntil: "domcontentloaded" }); await waitText(b, "Componente A editado"); await waitText(b, "Componente B otra ventana");
    await b.bringToFront(); await clickSelector(b, 'button[aria-label="Colaboración del proyecto"]'); await waitText(b, "Puedes editar este proyecto."); await b.keyboard.press("Escape");
    console.log("PASS: renderer restart restores the persistent project link and merged edits");
  } finally { await host.disconnect(); await guest.disconnect(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
