/** Flujo por pantalla en perfiles Electron de prueba, IPC nativo y conexión reales. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function connectDevice(port: number) {
  for (let i = 0; i < 100; i++) {
    try {
      return await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
    } catch {
      await wait(100);
    }
  }
  throw new Error(`Electron no abrió el puerto de prueba ${port}`);
}
async function click(page: Page, text: string) {
  await page.waitForFunction(
    t =>
      [...(document.querySelector('[role="dialog"]') ?? document).querySelectorAll("button")].some(
        b => b.textContent?.trim() === t && !b.disabled,
      ),
    { timeout: 30_000 },
    text,
  );
  await page.evaluate(
    t =>
      (
        [...(document.querySelector('[role="dialog"]') ?? document).querySelectorAll("button")].find(
          b => b.textContent?.trim() === t && !b.disabled,
        ) as HTMLButtonElement
      ).click(),
    text,
  );
}
async function fill(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector);
  await page.$eval(
    selector,
    (e, v) => {
      Object.getOwnPropertyDescriptor(
        e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        "value",
      )!.set!.call(e, v);
      e.dispatchEvent(new Event("input", { bubbles: true }));
    },
    value,
  );
}
async function text(page: Page, value: string) {
  await page.waitForFunction(t => document.body.innerText.includes(t), { timeout: 30_000 }, value);
}
async function rename(page: Page, before: string, after: string) {
  await page.evaluate(name => {
    const e = [...document.querySelectorAll("svg foreignObject *")].find(
      e => e.childElementCount === 0 && e.textContent?.trim() === name,
    );
    if (!e) throw new Error(`Falta ${name}`);
    e.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  }, before);
  const selector = (await page.$('input[aria-label="Nombre del elemento"]'))
    ? 'input[aria-label="Nombre del elemento"]'
    : "#node-name";
  await fill(page, selector, after);
  await page.$eval(selector, e =>
    e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })),
  );
  await text(page, after);
  await wait(600);
}
async function nativeState(page: Page) {
  return page.evaluate(async () => {
    const id = localStorage.getItem("last_opened_file_id");
    return (window as any).electronAPI.collaborationCommand({ type: "open", fileId: id, initial: {} });
  });
}
const content = {
  nombre_proyecto: "Clínica de prueba",
  version: "1",
  notation: "ddd",
  fecha_analisis: "",
  responsables: [],
  notas: "",
  transcript: "",
  read_models: [],
  agregados: [
    {
      id: "group",
      nombre_agregado: "Atención",
      tipo_contenedor: "Agregado",
      entidad_raiz: "",
      descripcion: "",
      x: 100,
      y: 120,
      width: 850,
      height: 420,
      nodos: [
        {
          id: "a",
          nombre: "Consulta",
          tipo_elemento: "Comando",
          estado_comparativo: "nuevo",
          x: 200,
          y: 250,
        },
        { id: "b", nombre: "Paciente", tipo_elemento: "Evento", estado_comparativo: "nuevo", x: 600, y: 250 },
      ],
      aristas: [{ id: "ab", fuente: "a", destino: "b", descripcion: "Atiende" }],
    },
  ],
  big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
  politicas_inter_agregados: [],
};
async function run() {
  const host = await connectDevice(9271),
    guest = await connectDevice(9272);
  const output = resolve(process.argv[2] || "../../outputs/Pruebas-ramas");
  mkdirSync(output, { recursive: true });
  const results: string[] = [],
    passed = (s: string) => {
      results.push(s);
      console.log(`PASS: ${s}`);
    };
  try {
    const a = (await host.pages()).find(p => !p.url().startsWith("devtools:"))!,
      b = (await guest.pages()).find(p => !p.url().startsWith("devtools:"))!;
    for (const p of [a, b]) {
      await p.setViewport({ width: 1600, height: 1000 });
      p.on("pageerror", e => console.error("Renderer:", String(e)));
    }
    for (const [p, id] of [
      [a, "ui-history"],
      [b, "ui-home"],
    ] as const) {
      await p.evaluate(
        ({ content, id }) => {
          localStorage.setItem(
            "saved_json_files",
            JSON.stringify([{ id, name: "Clínica de prueba", content }]),
          );
          localStorage.setItem("last_opened_file_id", id);
          localStorage.setItem(
            `views_${id}`,
            JSON.stringify({ customViews: [], activeViewId: "design", injectedViewIds: [] }),
          );
        },
        { content, id },
      );
      await p.reload({ waitUntil: "domcontentloaded" });
      await text(p, "Consulta");
    }
    assert.equal(await a.$("[data-branch-controls]"), null);
    passed("proyecto individual mantiene su interfaz normal");
    await a.click('button[aria-label="Colaboración del proyecto"]');
    await fill(a, "#collaboration-name", "Ana");
    await click(a, "Vincular este proyecto y ser anfitrión");
    await click(a, "Generar invitación");
    await a.waitForSelector("#collaboration-generated");
    const invitation = await a.$eval("#collaboration-generated", e => (e as HTMLTextAreaElement).value);
    await a.keyboard.press("Escape");
    await b.click('button[aria-label="Colaboración del proyecto"]');
    await fill(b, "#collaboration-name", "Luis");
    await fill(b, "#collaboration-invitation", invitation);
    await click(b, "Vincular una copia y unirme");
    await b.keyboard.press("Escape");
    for (const p of [a, b]) await p.waitForSelector("#current-branch");
    passed("segundo participante activa las ramas en ambas ventanas");
    await click(b, "Guardar versión");
    await fill(b, "#version-message", "Consultas revisadas");
    await click(b, "Guardar versión");
    await text(b, "Operación guardada");
    await fill(b, "#new-branch", "Ensayo Backend");
    await click(b, "Crear rama");
    await wait(700);
    await b.keyboard.press("Escape");
    const branchId = await b.$eval("#current-branch", e => (e as HTMLSelectElement).value);
    assert.notEqual(branchId, "shared");
    await rename(b, "Consulta", "Consulta en borrador");
    await text(a, "Consulta");
    assert.equal(await a.evaluate(() => document.body.innerText.includes("Consulta en borrador")), false);
    passed("rama creada por pantalla conserva sus ediciones separadas");
    const beforePages = new Set((await host.pages()).map(p => p.target()));
    await a.evaluate(() => (window as any).electronAPI.openProjectWindow("ui-history"));
    let second: Page | undefined;
    for (let i = 0; i < 50 && !second; i++) {
      second = (await host.pages()).find(
        p => !beforePages.has(p.target()) && !p.url().startsWith("devtools:"),
      );
      if (!second) await wait(100);
    }
    assert.ok(second);
    await second.setViewport({ width: 1600, height: 1000 });
    await second.waitForSelector("#current-branch");
    await second.select("#current-branch", "main");
    await wait(700);
    await rename(second, "Paciente", "Paciente actualizado");
    await click(second, "Guardar versión");
    await fill(second, "#version-message", "Actualizar paciente en Principal");
    await click(second, "Guardar versión");
    await text(second, "Operación guardada");
    await second.keyboard.press("Escape");
    assert.equal(await a.$eval("#current-branch", e => (e as HTMLSelectElement).value), "shared");
    await text(a, "Paciente");
    assert.equal(await a.evaluate(() => document.body.innerText.includes("Paciente actualizado")), false);
    passed("dos ventanas del mismo dispositivo mantienen ramas independientes");
    await wait(1200);
    await click(b, "Guardar versión");
    await click(b, "Traer cambios de Principal");
    await text(b, "Revisar incorporación");
    await click(b, "Confirmar incorporación");
    await b.keyboard.press("Escape");
    await text(b, "Paciente actualizado");
    await text(b, "Consulta en borrador");
    passed("pull por pantalla trae Principal y conserva el borrador sin commit");
    await click(b, "Guardar versión");
    await click(b, "Historial y árbol");
    await b.waitForSelector('[aria-label="Árbol de ramas y versiones"]');
    await b.$eval('g[aria-label^="Ver versión: Versión inicial"]', e =>
      e.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await text(b, "Viendo versión anterior");
    await b.screenshot({ path: resolve(output, "arbol-versiones.png") });
    const before = await nativeState(b);
    await b.keyboard.press("Escape");
    await text(b, "Consulta");
    assert.equal(await b.evaluate(() => document.body.innerText.includes("Consulta en borrador")), false);
    await click(b, "Volver al trabajo actual");
    await text(b, "Consulta en borrador");
    await text(b, "Paciente actualizado");
    const after = await nativeState(b);
    assert.deepEqual(after.workspace.snapshots[branchId], before.workspace.snapshots[branchId]);
    passed("clic en árbol consulta una versión sin alterar la rama y vuelve al borrador");
    const catalog = await b.evaluate(() => JSON.parse(localStorage.getItem("saved_json_files") || "[]"));
    const active = after.status.fileId;
    const persisted = catalog.find((p: any) => p.id === active);
    assert.equal(persisted.content.agregados[0].nodos[0].nombre, "Consulta");
    await click(b, "Guardar versión");
    await click(b, "Historial y árbol");
    await b.screenshot({ path: resolve(output, "historial-ramas.png") });
    await b.keyboard.press("Escape");
    await b.reload({ waitUntil: "domcontentloaded" });
    await b.waitForSelector("#current-branch");
    await b.select("#current-branch", branchId);
    await text(b, "Consulta en borrador");
    await text(b, "Paciente actualizado");
    passed("reiniciar renderer conserva ramas y catálogo de Principal sin contaminar");
    await b.screenshot({ path: resolve(output, "trabajo-en-rama.png") });
    await click(b, "Guardar versión");
    await fill(b, "#version-message", "Solicitud final");
    await click(b, "Guardar versión");
    await text(b, "Operación guardada");
    await click(b, "Historial y árbol");
    await b.$eval('button[aria-label="Ver Solicitud final"]', e => (e as HTMLButtonElement).click());
    await text(b, "Viendo versión anterior");
    await click(b, "Solicitar incorporación a Principal");
    const proposalState = await nativeState(b),
      proposal = proposalState.workspace.history.proposals.find((p: any) => p.message === "Solicitud final");
    assert.ok(proposal);
    await a.select("#current-branch", "shared");
    await click(a, "Permisos");
    await a.select("#permission-person", proposalState.workspace.actor.id);
    await a.evaluate(() => {
      const label = [...document.querySelectorAll('[role="dialog"] label')].find(l =>
        l.textContent?.includes("Aprobar fusiones hacia Principal"),
      );
      (label!.querySelector("input") as HTMLInputElement).click();
    });
    await a.select("#permission-proposal", proposal.id);
    await click(a, "Guardar permisos");
    await text(a, "Operación guardada");
    await a.keyboard.press("Escape");
    await wait(1200);
    await click(b, "Revisar cambios");
    await click(b, "Aprobar y fusionar");
    await b.keyboard.press("Escape");
    await second.select("#current-branch", "shared");
    await second.select("#current-branch", "main");
    await text(second, "Consulta en borrador");
    passed("el anfitrión concede permiso por solicitud y el compañero aprueba desde la pantalla");
    await b.select("#current-branch", "main");
    await wait(700);
    assert.equal(
      await b.$eval("[data-branch-controls] button", () =>
        [...document.querySelectorAll("[data-branch-controls] button")]
          .find(b => b.textContent?.trim() === "Guardar versión")
          ?.hasAttribute("disabled"),
      ),
      true,
    );
    passed("permiso de fusionar mantiene protegida la edición directa de Principal");
    await click(second, "Historial");
    await second.$eval('g[aria-label^="Ver versión: Versión inicial"]', e =>
      e.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await click(second, "Restaurar vistas seleccionadas");
    await text(second, "Revisar restauración de Principal");
    await second.screenshot({ path: resolve(output, "comparacion-restauracion.png") });
    await click(second, "Confirmar restauración");
    await second.keyboard.press("Escape");
    await text(second, "Consulta");
    await text(second, "Paciente");
    const restored = await nativeState(second);
    assert.ok(restored.workspace.history.commits.some((c: any) => c.kind === "merge"));
    assert.equal(restored.workspace.history.commits.at(-1).kind, "restore");
    passed("Principal se restaura con comparación visual y conserva la fusión anterior");
    await click(second, "Historial");
    await second.screenshot({ path: resolve(output, "arbol-fusiones-restauraciones.png") });
    await second.keyboard.press("Escape");
    await second.screenshot({ path: resolve(output, "barra-colaboracion.png") });
    writeFileSync(
      resolve(output, "resultado.json"),
      JSON.stringify({ passed: results, at: new Date().toISOString() }, null, 2),
    );
  } finally {
    await host.disconnect();
    await guest.disconnect();
  }
}
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
