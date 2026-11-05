/** Dos perfiles Electron temporales: permisos IA, ubicación, versiones y fluidez. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const output = resolve(process.argv[2] ?? "../../outputs/Pruebas-sesion-19");
mkdirSync(output, { recursive: true });
async function tool(page: Page, name: string, args: unknown, allowError = false) {
  const result = await page.evaluate(({ name, args }) => (window as any).electronAPI.mcpPlaygroundCall(name, args), { name, args });
  if (!allowError) assert(result.ok && !result.isError, result.blocks.join("\n"));
  return result;
}
async function state(page: Page) {
  const result = await tool(page, "manage_collaboration", { command: "inspect" });
  const body = result.blocks.join("\n"); return JSON.parse(body.slice(body.indexOf("\n") + 1));
}
async function until(check: () => Promise<boolean>, message: string) {
  const end = performance.now() + 30_000;
  while (performance.now() < end) { if (await check()) return; await wait(100); }
  throw new Error(message);
}
async function select(page: Page, branchId: string) {
  await tool(page, "manage_collaboration", { command: "switch", branchId });
  await until(async () => (await state(page)).branchId === branchId, "La rama no cambió"); await wait(150);
}
const action = (page: Page, value: unknown, expectedVector?: string) => tool(page, "manage_collaboration", { command: "history", action: { id: crypto.randomUUID(), ...value as any }, expectedVector });
async function seed(page: Page, id: string, name: string) {
  const content = { nombre_proyecto: "Prueba aislada", version: "1", notation: "ddd", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: Array.from({ length: 300 }, (_, i) => ({ id: `node-${i}`, nombre: `Componente ${i}`, tipo_elemento: "Comando", estado_comparativo: "nuevo", x: (i % 15) * 220, y: Math.floor(i / 15) * 120 })), aristas: [] }, politicas_inter_agregados: [] };
  await page.evaluate(({ content, id, name }) => {
    localStorage.setItem("saved_json_files", JSON.stringify([{ id, name: "Prueba aislada", content }]));
    localStorage.setItem("last_opened_file_id", id);
    localStorage.setItem("collaboration-display-name", name);
    localStorage.setItem(`views_${id}`, JSON.stringify({ customViews: [], activeViewId: "design", injectedViewIds: [] }));
  }, { content, id, name });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[aria-label="Colaboración del proyecto"]');
  return { name: "Prueba aislada", content, customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} };
}
async function native(page: Page, command: unknown) {
  const result = await page.evaluate(command => (window as any).electronAPI.collaborationCommand(command), command);
  assert.equal(result.error, undefined); return result;
}
async function main() {
  const host = await puppeteer.connect({ browserURL: "http://127.0.0.1:9271" }), guest = await puppeteer.connect({ browserURL: "http://127.0.0.1:9272" });
  const results: unknown[] = [];
  const passed = (name: string, details?: unknown) => { results.push({ name, details }); console.log(`PASS: ${name}${details ? ` ${JSON.stringify(details)}` : ""}`); };
  try {
    const a = (await host.pages()).find(p => !p.url().startsWith("devtools:"))!, b = (await guest.pages()).find(p => !p.url().startsWith("devtools:"))!;
    for (const p of [a, b]) { await p.setViewport({ width: 1600, height: 1000 }); p.on("pageerror", e => console.error("Renderer:", String(e))); }
    const initial = await seed(a, "test-host", "Ana"); await seed(b, "test-guest", "Nafes");
    await native(a, { type: "create", fileId: "test-host", initial, options: {}, name: "Ana" });
    await a.reload({ waitUntil: "domcontentloaded" });
    await a.waitForSelector("[data-branch-trigger]");
    assert.equal((await state(a)).branches.length, 2);
    passed("el anfitrión solo ve sus ramas antes de que entre nadie");
    const invitation = (await native(a, { type: "invite", fileId: "test-host", role: "editor" })).invitation;
    await native(b, { type: "join", fileId: "test-guest", invitation, name: "Nafes" });
    await b.reload({ waitUntil: "domcontentloaded" }); await b.waitForSelector("[data-branch-trigger]");
    await until(async () => (await state(a)).participants?.length === 2 && (await state(b)).participants?.length === 2, "No aparece la lista completa");
    await a.waitForFunction(() => document.querySelector("[data-branch-activity]")?.textContent?.includes("Nafes"));
    await a.waitForFunction(() => document.querySelector("[data-view-activity]")?.textContent?.includes("Nafes"));
    passed("nombres y descripciones en la rama y vista compartidas");
    const initialState = await state(b), initialCommit = initialState.branches.find((x: any) => x.id === "shared").head;
    await action(b, { type: "branch", branchId: "ensayo", name: "Mi propuesta", fromCommit: initialCommit });
    await until(async () => (await state(b)).branches.some((x: any) => x.id === "ensayo"), "inspect usa historia antigua");
    await select(b, "ensayo");
    await until(async () => !!(await state(a)).participants.find((p: any) => p.name === "Nafes")?.branchIds.includes("ensayo"), "No se actualiza la ubicación");
    assert.equal(await a.$("[data-view-activity]"), null);
    passed("la lista conserva al compañero de otra rama sin atribuirle actividad en esta vista");
    const guestId = (await state(b)).actor.id;
    await action(a, { type: "permission", memberId: guestId, permission: { editMain: true, mergeMain: true } });
    await until(async () => !!(await state(b)).permissions[guestId]?.editMain, "No llegó el permiso humano");
    await select(b, "main");
    const denied = await tool(b, "update_view_element", { name: "Componente 0", description: "No debe entrar en Principal" }, true);
    assert(denied.isError && denied.blocks.join(" ").includes("anfitrión"));
    const deniedCommit = await tool(b, "manage_collaboration", { command: "history", action: { id: crypto.randomUUID(), type: "commit", branchId: "main", scopes: ["design"], message: "No autorizado" } }, true);
    assert(deniedCommit.isError);
    passed("IA invitada no edita ni confirma Principal aunque tenga permiso humano delegado");
    await select(b, "ensayo");
    await b.evaluate(`(() => { const t = window; t.__frames = []; t.__measuring = true; let previous = performance.now(); const frame = (now) => { t.__frames.push(now - previous); previous = now; if (t.__measuring) requestAnimationFrame(frame); }; requestAnimationFrame(frame); })()`);
    const begin = performance.now();
    for (let i = 0; i < 30; i++) await tool(b, "update_view_element", { name: `Componente ${i}`, description: `Edición IA ${i}` });
    const timings = await b.evaluate(() => { const t: any = window; t.__measuring = false; return t.__frames as number[]; });
    timings.sort((x, y) => x - y);
    const performanceResult = { edits: 30, elapsedMs: Math.round(performance.now() - begin), frames: timings.length, p95FrameMs: Math.round(timings[Math.floor(timings.length * .95)] ?? 0), maxFrameMs: Math.round(timings.at(-1) ?? 0) };
    assert(timings.length > 10 && performanceResult.maxFrameMs < 1500, "La interfaz se bloqueó durante las ediciones seriales");
    passed("30 ediciones seriales con 300 componentes conservan actividad de pantalla", performanceResult);
    await action(b, { type: "commit", branchId: "ensayo", scopes: ["design"], message: "Propuesta IA verificada" });
    await until(async () => (await state(a)).commits.some((c: any) => c.message === "Propuesta IA verificada"), "No llegó la versión");
    const current = await state(b), commit = current.branches.find((x: any) => x.id === "ensayo").head;
    await action(b, { type: "propose", branchId: "ensayo", targetId: "main", commitId: commit, scopes: ["design"], message: "Revisar mi propuesta" });
    await until(async () => (await state(a)).proposals.some((p: any) => p.status === "open"), "No llegó la solicitud");
    const hostState = await state(a), proposal = hostState.proposals.find((p: any) => p.status === "open"), head = hostState.branches.find((x: any) => x.id === "main").head;
    const deniedMerge = await tool(b, "manage_collaboration", { command: "history", action: { id: crypto.randomUUID(), type: "merge", proposalId: proposal.id, expectedHead: head, choices: {} }, expectedVector: current.vectors.main }, true);
    assert(deniedMerge.isError);
    await action(a, { type: "merge", proposalId: proposal.id, expectedHead: head, choices: {} }, hostState.vectors.main);
    passed("el chat guarda versión y envía revisión; solo el anfitrión integra en Principal");
    await tool(b, "manage_collaboration", { command: "preview", commitId: initialCommit });
    await b.waitForSelector("[data-history-notice]");
    assert((await b.$eval("[data-history-notice]", e => e.textContent))?.includes("Solo lectura"));
    await b.$eval("[data-history-notice] button", e => (e as HTMLButtonElement).click());
    await until(async () => !(await state(b)).previewCommitId && (await state(b)).branchId === "ensayo", "No volvió a su rama");
    passed("aviso histórico visible y regreso directo a la rama que conserva el borrador");
    const previous = new Set((await host.pages()).map(p => p.target()));
    await a.evaluate(() => (window as any).electronAPI.openProjectWindow("test-host"));
    let second: Page | undefined;
    await until(async () => { second = (await host.pages()).find(p => !previous.has(p.target()) && !p.url().startsWith("devtools:")); return !!second; }, "No abrió segunda ventana");
    await second!.waitForSelector("[data-branch-trigger]");
    await select(second!, "main"); await a.bringToFront();
    assert.equal((await state(second!)).branchId, "main"); assert.equal((await state(a)).branchId, "shared");
    await tool(second!, "update_view_element", { name: "Componente 299", description: "Ventana correcta" });
    passed("MCP interno permanece en su ventana aunque otra tenga foco");
    for (const width of [900, 1280, 1600]) {
      await b.setViewport({ width, height: 1000 }); await wait(200);
      const layout = await b.$eval("[data-project-toolbar]", e => { const box = e.getBoundingClientRect(); const controls = [...e.querySelectorAll("button")].filter(x => x.getBoundingClientRect().width > 0); return { overflow: e.scrollWidth > e.clientWidth + 1, controls: controls.map(x => { const r = x.getBoundingClientRect(); return { x: r.left - box.left, y: r.top - box.top, width: r.width }; }) }; });
      assert.equal(layout.overflow, false);
      await b.screenshot({ path: resolve(output, `barra-${width}.png`) });
    }
    passed("botones distribuidos sin desbordamiento a 900, 1280 y 1600 píxeles");
    writeFileSync(resolve(output, "resultados.json"), JSON.stringify(results, null, 2));
  } finally { await host.disconnect(); await guest.disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
