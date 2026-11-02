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
  try {
    await page.waitForFunction(
      t =>
        [...(document.querySelector('[role="dialog"]') ?? document).querySelectorAll("button")].some(
          b => b.textContent?.trim() === t && !b.disabled,
        ),
      { timeout: 30_000 },
      text,
    );
  } catch (error) {
    const state = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const scope = dialog ?? document;
      const buttons = [...scope.querySelectorAll("button")].map(b => ({
        text: b.textContent?.trim(),
        disabled: b.disabled,
      }));
      return { hasDialog: !!dialog, dialogHeading: dialog?.querySelector("h2,h3")?.textContent, buttons };
    });
    throw new Error(`No se encontró botón activo "${text}". Estado DOM: ${JSON.stringify(state)}`, {
      cause: error,
    });
  }
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

async function closeDialogs(page: Page) {
  for (let i = 0; i < 10; i++) {
    const action = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      if (!dialog) return "none";
      const expandedCollab = document.querySelector(
        'button[aria-label="Colaboración del proyecto"][aria-expanded="true"]',
      ) as HTMLButtonElement | null;
      if (expandedCollab && dialog.textContent?.includes("Trabajar en el mismo proyecto")) {
        expandedCollab.click();
        return "clicked-close";
      }
      const expandedBranch = document.querySelector(
        'button[aria-label="Ramas y versiones"][aria-expanded="true"]',
      ) as HTMLButtonElement | null;
      if (expandedBranch && dialog.hasAttribute("data-branch-controls")) {
        expandedBranch.click();
        return "clicked-close";
      }
      const closeBtn = [...dialog.querySelectorAll("button")].find(
        b =>
          !b.disabled &&
          (b.textContent?.trim() === "Cerrar" ||
            b.getAttribute("aria-label") === "Cerrar" ||
            b.getAttribute("aria-label") === "Close" ||
            b.querySelector(".sr-only")?.textContent?.trim() === "Close"),
      ) as HTMLButtonElement | undefined;
      if (closeBtn) {
        closeBtn.click();
        return "clicked-close";
      }
      const focusable =
        (dialog.querySelector(
          "button:not([disabled]), input, select, textarea, [tabindex]",
        ) as HTMLElement | null) ?? dialog;
      focusable.focus();
      return "focused-dialog";
    });
    if (action === "none") return;
    if (action === "focused-dialog") await page.keyboard.press("Escape");
    await wait(150);
  }
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10_000 });
}

async function openBranchPopover(page: Page) {
  await page.waitForSelector('button[aria-label="Ramas y versiones"]', { timeout: 30_000 });
  const alreadyOpen = await page.$eval(
    'button[aria-label="Ramas y versiones"]',
    el => el.getAttribute("aria-expanded") === "true",
  );
  if (!alreadyOpen) {
    await page.click('button[aria-label="Ramas y versiones"]');
  }
  await page.waitForSelector("[data-branch-controls] #current-branch", { timeout: 15_000 });
}

async function selectBranch(page: Page, branchId: string) {
  await openBranchPopover(page);
  await page.select("#current-branch", branchId);
  await page.waitForFunction(
    expected => (document.querySelector("#current-branch") as HTMLSelectElement | null)?.value === expected,
    { timeout: 15_000 },
    branchId,
  );
}

async function currentBranchValue(page: Page): Promise<string> {
  await openBranchPopover(page);
  return page.$eval("#current-branch", e => (e as HTMLSelectElement).value);
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
  await closeDialogs(page);
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
  await closeDialogs(page);
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

    assert.equal(await a.$("[data-branch-trigger]"), null);
    passed("proyecto individual mantiene su interfaz normal");

    await a.click('button[aria-label="Colaboración del proyecto"]');
    await fill(a, "#collaboration-name", "Ana");
    await click(a, "Vincular este proyecto y ser anfitrión");
    await click(a, "Generar invitación");
    await a.waitForSelector("#collaboration-generated");
    const invitation = await a.$eval("#collaboration-generated", e => (e as HTMLTextAreaElement).value);
    await closeDialogs(a);

    await b.click('button[aria-label="Colaboración del proyecto"]');
    await fill(b, "#collaboration-name", "Luis");
    await fill(b, "#collaboration-invitation", invitation);
    await click(b, "Vincular una copia y unirme");
    for (const p of [a, b]) await p.waitForSelector('button[aria-label="Ramas y versiones"]');
    await closeDialogs(b);

    await openBranchPopover(a);
    const hostPopoverInfo = await a.evaluate(() => {
      const box = document.querySelector("[data-branch-controls]")!;
      const buttons = [...box.querySelectorAll("button")].map(btn => btn.textContent?.trim());
      return { text: box.textContent ?? "", buttons };
    });
    assert.ok(hostPopoverInfo.text.includes("Anfitrión"));
    assert.ok(hostPopoverInfo.buttons.some(label => label?.startsWith("Solicitudes")));
    assert.ok(hostPopoverInfo.buttons.includes("Permisos"));
    await closeDialogs(a);

    await openBranchPopover(b);
    const guestPopoverInfo = await b.evaluate(() => {
      const box = document.querySelector("[data-branch-controls]")!;
      const buttons = [...box.querySelectorAll("button")].map(btn => btn.textContent?.trim());
      return { text: box.textContent ?? "", buttons };
    });
    assert.ok(guestPopoverInfo.text.includes("Huésped"));
    assert.equal(
      guestPopoverInfo.buttons.some(label => label?.startsWith("Solicitudes")),
      false,
    );
    assert.equal(guestPopoverInfo.buttons.includes("Permisos"), false);
    passed(
      "ventana emergente compacta muestra rol Anfitrión/Huésped y oculta Solicitudes/Permisos sin permiso",
    );

    await click(b, "Guardar versión");
    await fill(b, "#version-message", "Consultas revisadas");
    await click(b, "Guardar");
    await text(b, "Versión guardada.");

    await click(b, "Nueva");
    await fill(b, "#new-branch", "Ensayo Backend");
    await click(b, "Crear rama");
    await b.waitForFunction(
      () => (document.querySelector("#current-branch") as HTMLSelectElement | null)?.value !== "shared",
      { timeout: 15_000 },
    );
    const branchId = await b.$eval("#current-branch", e => (e as HTMLSelectElement).value);
    assert.notEqual(branchId, "shared");
    await closeDialogs(b);

    await rename(b, "Consulta", "Consulta en borrador");
    await text(a, "Consulta");
    assert.equal(await a.evaluate(() => document.body.innerText.includes("Consulta en borrador")), false);
    passed("rama creada en ventana emergente conserva sus ediciones separadas");

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
    await selectBranch(second, "main");
    await closeDialogs(second);
    await wait(700);
    await rename(second, "Paciente", "Paciente actualizado");
    await openBranchPopover(second);
    await click(second, "Guardar versión");
    await fill(second, "#version-message", "Actualizar paciente en Principal");
    await click(second, "Guardar");
    await text(second, "Versión guardada.");
    await closeDialogs(second);

    assert.equal(await currentBranchValue(a), "shared");
    await closeDialogs(a);
    await text(a, "Paciente");
    assert.equal(await a.evaluate(() => document.body.innerText.includes("Paciente actualizado")), false);
    passed("dos ventanas del mismo dispositivo mantienen ramas independientes");

    await wait(1200);
    await openBranchPopover(b);
    await click(b, "Traer cambios");
    await text(b, "Revisar incorporación");
    await click(b, "Confirmar incorporación");
    await closeDialogs(b);
    await text(b, "Paciente actualizado");
    await text(b, "Consulta en borrador");
    passed("pull desde ventana emergente trae Principal y conserva el borrador sin commit");

    await openBranchPopover(b);
    await click(b, "Historial");
    await b.waitForSelector('[aria-label="Árbol de ramas y versiones"]');
    await b.$eval('g[aria-label^="Ver versión: Versión inicial"]', e =>
      e.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await text(b, "Viendo versión anterior");
    await b.screenshot({ path: resolve(output, "arbol-versiones.png") });
    const before = await nativeState(b);
    await closeDialogs(b);
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

    await openBranchPopover(b);
    await click(b, "Historial");
    await wait(300);
    await b.screenshot({ path: resolve(output, "historial-ramas.png") });
    await closeDialogs(b);

    await b.reload({ waitUntil: "domcontentloaded" });
    await selectBranch(b, branchId);
    await closeDialogs(b);
    await text(b, "Consulta en borrador");
    await text(b, "Paciente actualizado");
    passed("reiniciar renderer conserva ramas y catálogo de Principal sin contaminar");

    await openBranchPopover(b);
    await wait(250);
    await b.screenshot({ path: resolve(output, "trabajo-en-rama.png") });
    await click(b, "Guardar versión");
    await fill(b, "#version-message", "Solicitud final");
    await click(b, "Guardar");
    await text(b, "Versión guardada.");
    await click(b, "Enviar al anfitrión para fusionar");
    await click(b, "Enviar solicitud");
    await text(b, "Enviado al anfitrión: «Solicitud final»");
    assert.equal(await b.$("[data-merge-alert]"), null);
    assert.equal(
      await b.evaluate(() =>
        [...document.querySelectorAll("[data-branch-controls] button")].some(btn =>
          btn.textContent?.trim().startsWith("Solicitudes"),
        ),
      ),
      false,
    );
    await closeDialogs(b);

    const proposalState = await nativeState(b),
      proposal = proposalState.workspace.history.proposals.find((p: any) => p.message === "Solicitud final");
    assert.ok(proposal);

    await a.waitForSelector("[data-merge-alert]", { timeout: 30_000 });
    await text(a, "Solicitud para fusionar");
    await text(a, "Revisar y fusionar");
    await a.screenshot({ path: resolve(output, "alerta-anfitrion.png") });
    await a.click('button[aria-label="Cerrar alerta de fusión"]');
    await a.waitForFunction(() => !document.querySelector("[data-merge-alert]"), { timeout: 5_000 });
    await openBranchPopover(a);
    await text(a, "1 solicitud pendiente para fusionar");
    await text(a, "Revisar y fusionar");
    passed(
      "solo el anfitrión recibe alerta pequeña cerrable y sigue viéndola en su ventana emergente principal",
    );

    await selectBranch(a, "shared");
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
    await text(a, "Permisos actualizados.");
    await closeDialogs(a);

    await wait(800);
    assert.equal(await b.$("[data-merge-alert]"), null);
    await openBranchPopover(b);
    await text(b, "1 solicitud pendiente para fusionar");
    await click(b, "Revisar y fusionar");
    await text(b, "Revisar incorporación a Principal");
    await click(b, "Aprobar y fusionar");
    await closeDialogs(b);

    await selectBranch(second, "shared");
    await selectBranch(second, "main");
    await closeDialogs(second);
    await text(second, "Consulta en borrador");
    passed(
      "el anfitrión concede permiso por solicitud y el compañero autorizado aprueba desde su ventana emergente",
    );

    await selectBranch(b, "main");
    await wait(400);
    const guestOnMainButtons = await b.evaluate(() =>
      [...document.querySelectorAll("[data-branch-controls] button")].map(btn => btn.textContent?.trim()),
    );
    assert.equal(guestOnMainButtons.includes("Guardar versión"), false);
    assert.equal(guestOnMainButtons.includes("Traer cambios"), false);
    await text(b, "Solo lectura aquí");
    await closeDialogs(b);
    passed("huésped en Principal sin permiso de edición directa no ve botones de edición");

    await openBranchPopover(second);
    await click(second, "Historial");
    await second.$eval('g[aria-label^="Ver versión: Versión inicial"]', e =>
      e.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    await click(second, "Restaurar versión");
    await text(second, "Revisar restauración de Principal");
    await second.screenshot({ path: resolve(output, "comparacion-restauracion.png") });
    await click(second, "Confirmar restauración");
    await closeDialogs(second);
    await text(second, "Consulta");
    await text(second, "Paciente");
    const restored = await nativeState(second);
    assert.ok(restored.workspace.history.commits.some((c: any) => c.kind === "merge"));
    assert.equal(restored.workspace.history.commits.at(-1).kind, "restore");
    passed("Principal se restaura con comparación visual y conserva la fusión anterior");

    await openBranchPopover(second);
    await click(second, "Historial");
    await wait(300);
    await second.screenshot({ path: resolve(output, "arbol-fusiones-restauraciones.png") });
    await closeDialogs(second);
    await openBranchPopover(second);
    await wait(250);
    await second.screenshot({ path: resolve(output, "barra-colaboracion.png") });
    await closeDialogs(second);

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
