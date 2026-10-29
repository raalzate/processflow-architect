/**
 * @fileOverview Motor para grabar un video tutorial manejando la UI REAL (#664).
 *
 * Una escena (`scripts/tutorial/escenas/*.ts`) describe el recorrido con estas
 * primitivas; el kit graba la pantalla y deja en `<dir>/` lo que necesita la
 * posproducción (`post.py`): `raw.webm`, `timeline.json` y `subs.srt`.
 *
 * Decisiones que valen el ruido:
 *  - **La voz marca el ritmo.** La narración se genera ANTES (`voz.sh`) y cada
 *    `voz(i)` espera a que termine la frase anterior. Pegar audio sobre una
 *    grabación hecha a ojo deja la voz adelantada o atrasada; así no.
 *  - **El zoom no se hace en la página.** Escalar el DOM rompe la matemática de
 *    puntero del lienzo; `zoom()` sólo anota el foco y `post.py` encuadra el video.
 *    Por eso los subtítulos tampoco van en la página: el zoom los recortaría.
 *  - **El headless no pinta cursor** ni dispara bien el arrastre HTML5 nativo
 *    (cuelga): hay cursor falso y `dragTile` sintetiza los DragEvent.
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type ElementHandle, type Page } from "puppeteer";
import { demoFiles, electronStubSource, seedStorageSource } from "../demo-seed";

export const BASE = process.env.BASE || "http://localhost:3000";
export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Cursor falso + tarjeta de título. Va como TEXTO: una función de tsx llega con `__name` inyectado. */
const OVERLAY = `
(() => {
  const mk = () => {
    if (!document.body || document.getElementById("__tut_cur")) return;
    const s = document.createElement("style");
    s.textContent = "#__tut_cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none}" +
      "#__tut_cur svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}" +
      "#__tut_ring{position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #facc15;z-index:2147483646;pointer-events:none;opacity:0}" +
      "#__tut_title{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "background:rgba(9,11,17,.94);color:#fff;font:700 54px system-ui;opacity:0;transition:opacity .5s;pointer-events:none;text-align:center}" +
      "#__tut_title small{font:500 24px system-ui;color:#facc15;margin-top:14px}";
    document.head.appendChild(s);
    const c = document.createElement("div"); c.id = "__tut_cur";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>';
    const r = document.createElement("div"); r.id = "__tut_ring";
    const t = document.createElement("div"); t.id = "__tut_title";
    document.body.append(c, r, t);
    const pos = window.__tutPos || { x: 720, y: 450 };
    c.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";
    addEventListener("mousemove", (e) => { window.__tutPos = { x: e.clientX, y: e.clientY }; c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, true);
    addEventListener("mousedown", (e) => { r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      r.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.4)" }], { duration: 450 }); }, true);
    window.__tutTitle = (txt, sub) => { t.innerHTML = txt ? txt + (sub ? "<small>" + sub + "</small>" : "") : ""; t.style.opacity = txt ? "1" : "0"; };
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mk); else mk();
  setInterval(mk, 500);
})();
`;

export interface Tutorial {
  page: Page;
  /** Arranca la narración del bloque `i` cuando terminó la anterior. */
  voz(i: number): Promise<void>;
  /** Espera a que termine la frase en curso (antes de cambiar de pantalla). */
  callar(): Promise<void>;
  /** Subtítulo corto (frase clave). `ms` = cuánto esperar después. */
  say(txt: string, sub?: string, ms?: number): Promise<void>;
  /** Tarjeta de pantalla completa; con `vi` la sostiene mientras dura esa voz. */
  card(txt: string, sub: string, ms: number, vi?: number): Promise<void>;
  /** Foco de cámara en px CSS (lo aplica la posproducción). */
  zoom(x: number, y: number, z: number): void;
  unzoom(): void;
  moveTo(x: number, y: number, ms?: number): Promise<void>;
  click(sel: string, opts?: { double?: boolean }): Promise<void>;
  clickText(t: string, opts?: { double?: boolean; exact?: boolean }): Promise<void>;
  type(s: string): Promise<void>;
  dragTile(tile: string, x: number, y: number): Promise<void>;
  nodeBox(t: string): Promise<{ x: number; y: number; w: number; h: number; tx: number; ty: number }>;
  boxOfText(t: string, exact?: boolean): Promise<{ x: number; y: number }>;
  goto(ruta: string): Promise<void>;
  wheel(x: number, y: number, dy: number, veces?: number): Promise<void>;
  sfx(k: string): void;
  terminar(): Promise<void>;
}

/** Abre la app con el proyecto de ejemplo, carga las duraciones de voz y empieza a grabar. */
export async function iniciar(dir: string, opts: { grabar?: boolean } = {}): Promise<Tutorial> {
  const vozDir = path.join(dir, "voz");
  const DUR: number[] = [];
  for (let i = 0; existsSync(path.join(vozDir, `b${String(i).padStart(2, "0")}.mp3`)); i++) {
    const f = path.join(vozDir, `b${String(i).padStart(2, "0")}.mp3`);
    DUR.push(Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim().replace(",", ".")));
  }
  if (!DUR.length) throw new Error(`No hay voz en ${vozDir}: corré antes scripts/tutorial/voz.sh`);

  const browser: Browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 180_000,
    executablePath: process.env.CHROME || (existsSync(CHROME_MAC) ? CHROME_MAC : undefined),
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e instanceof Error ? e.message : String(e)));
  await page.evaluateOnNewDocument(electronStubSource());
  await page.evaluateOnNewDocument(seedStorageSource(demoFiles(), "local"));
  await page.evaluateOnNewDocument(OVERLAY);
  await page.goto(BASE + "/", { waitUntil: "networkidle2", timeout: 120_000 });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await wait(4000);

  const rec = opts.grabar === false ? null : await page.screencast({ path: path.join(dir, "raw.webm") as `${string}.webm` });
  const T0 = Date.now();
  const now = () => Date.now() - T0;
  const vs: number[] = [];
  const ev: [number, string][] = [];
  const zooms: [number, number, number, number][] = [];
  const subs: { t0: number; t1?: number; txt: string }[] = [];
  let libre = 0;
  const sfx = (k: string) => void ev.push([now(), k]);
  const cerrarSub = () => {
    const l = subs[subs.length - 1];
    if (l && l.t1 === undefined) l.t1 = now();
  };

  // Clics del humano = sonido de clic. `mouse.click` llama a `up` por dentro: el
  // «pop» de soltar se filtra en post.py si cae pegado a un clic.
  const mc = page.mouse.click.bind(page.mouse);
  page.mouse.click = (async (x: number, y: number, o?: Parameters<Page["mouse"]["click"]>[2]) => { sfx("click"); return mc(x, y, o); }) as Page["mouse"]["click"];
  const mu = page.mouse.up.bind(page.mouse);
  page.mouse.up = (async (o?: Parameters<Page["mouse"]["up"]>[0]) => { sfx("pop"); return mu(o); }) as Page["mouse"]["up"];

  const moveTo = async (x: number, y: number, ms = 600) => {
    await page.mouse.move(x, y, { steps: Math.max(8, Math.round(ms / 16)) });
  };
  const centro = async (h: ElementHandle | null, quien: string) => {
    const bb = h && (await h.boundingBox());
    if (!bb) throw new Error("no encontrado: " + quien);
    return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, h: h! };
  };
  /** Elemento visible más profundo cuyo texto es `t` (o lo contiene). */
  const porTexto = async (t: string, exact = true) =>
    (await page.evaluateHandle((t, exact) => {
      const ok = ([...document.querySelectorAll("body *")] as HTMLElement[]).filter((e) => {
        const s = (e.innerText ?? "").trim();
        return (exact ? s === t : s.includes(t)) && e.getBoundingClientRect().width > 0;
      });
      return ok.filter((e) => !ok.some((o) => o !== e && e.contains(o)))[0] ?? null;
    }, t, exact)).asElement() as ElementHandle | null;
  /** Hoja de texto del lienzo (x > 300 evita la paleta, que repite nombres). */
  const textoLienzo = async (t: string) =>
    (await page.evaluateHandle((t) => {
      const ok = ([...document.querySelectorAll("p,span,div,text")] as HTMLElement[]).filter((e) =>
        e.childElementCount === 0 && e.textContent?.trim() === t && e.getBoundingClientRect().x > 300 && e.getBoundingClientRect().width > 0);
      return ok[0] ?? null;
    }, t)).asElement() as ElementHandle | null;

  const tut: Tutorial = {
    page,
    async voz(i) {
      if (i >= DUR.length) throw new Error(`Falta la voz b${String(i).padStart(2, "0")}.mp3`);
      const w = libre - now();
      if (w > 0) await wait(w);
      vs[i] = now();
      libre = now() + DUR[i] * 1000 + 350;
    },
    async callar() {
      const w = libre - now();
      if (w > 0) await wait(w);
    },
    async say(txt, sub = "", ms = 0) {
      cerrarSub();
      subs.push({ t0: now(), txt: sub ? `${txt}\n${sub}` : txt });
      if (ms) await wait(ms);
    },
    async card(txt, sub, ms, vi) {
      cerrarSub();
      await page.evaluate((t, s) => (window as unknown as { __tutTitle?: (a: string, b: string) => void }).__tutTitle?.(t, s), txt, sub);
      sfx("chime");
      if (vi !== undefined) {
        await tut.voz(vi);
        ms = Math.max(ms, DUR[vi] * 1000 + 400);
      }
      await wait(ms);
      await page.evaluate(() => (window as unknown as { __tutTitle?: (a: string, b: string) => void }).__tutTitle?.("", ""));
      await wait(600);
    },
    zoom(x, y, z) {
      zooms.push([now(), x, y, z]);
    },
    unzoom() {
      zooms.push([now(), 720, 450, 1]);
    },
    moveTo,
    async click(sel, o = {}) {
      const { x, y } = await centro(await page.waitForSelector(sel, { visible: true, timeout: 15_000 }), sel);
      await moveTo(x, y, 700);
      await wait(150);
      await page.mouse.click(x, y, { count: o.double ? 2 : 1 });
    },
    async clickText(t, o = {}) {
      const { x, y } = await centro(await porTexto(t, o.exact ?? true), t);
      await moveTo(x, y, 700);
      await wait(150);
      await page.mouse.click(x, y, { count: o.double ? 2 : 1 });
    },
    async type(s) {
      for (const ch of s) {
        sfx("key");
        await page.keyboard.type(ch);
        await wait(70);
      }
    },
    async dragTile(tile, x, y) {
      const a = await centro(await porTexto(tile), tile);
      await moveTo(a.x, a.y, 700);
      await wait(250);
      await moveTo(x, y, 1100);
      await page.evaluate((el, x, y) => {
        const dt = new DataTransfer();
        const src = (el as HTMLElement).closest("[draggable=true]") ?? (el as HTMLElement);
        src.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
        const tgt = document.elementFromPoint(x, y)!;
        const o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y };
        tgt.dispatchEvent(new DragEvent("dragenter", o));
        tgt.dispatchEvent(new DragEvent("dragover", o));
        tgt.dispatchEvent(new DragEvent("drop", o));
        src.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
      }, a.h, x, y);
      sfx("pop");
    },
    async nodeBox(t) {
      const h = await textoLienzo(t);
      if (!h) throw new Error("nodo no encontrado: " + t);
      return page.evaluate((el) => {
        let e = el as HTMLElement | null;
        while (e && (e.getBoundingClientRect().height < 40 || e.getBoundingClientRect().width < 80)) e = e.parentElement;
        const r = (e ?? (el as HTMLElement)).getBoundingClientRect();
        const tr = (el as HTMLElement).getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, tx: tr.x + tr.width / 2, ty: tr.y + tr.height / 2 };
      }, h);
    },
    async boxOfText(t, exact = true) {
      const { x, y } = await centro(await porTexto(t, exact), t);
      return { x, y };
    },
    async goto(ruta) {
      cerrarSub();
      sfx("whoosh_long");
      await page.goto(BASE + ruta, { waitUntil: "networkidle2", timeout: 120_000 });
      await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      await wait(1500);
    },
    async wheel(x, y, dy, veces = 1) {
      await moveTo(x, y, 400);
      for (let i = 0; i < veces; i++) {
        await page.mouse.wheel({ deltaY: dy });
        await wait(120);
      }
    },
    sfx,
    async terminar() {
      await tut.callar();
      const total = now();
      cerrarSub();
      if (rec) await rec.stop();
      await browser.close();
      const ts = (ms: number) => {
        const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
      };
      writeFileSync(
        path.join(dir, "subs.srt"),
        subs.map((s, i) => `${i + 1}\n${ts(s.t0)} --> ${ts(s.t1 ?? total)}\n${s.txt}\n`).join("\n")
      );
      writeFileSync(path.join(dir, "timeline.json"), JSON.stringify({ total, vs, ev, zooms }, null, 1));
      console.log(`grabado ${(total / 1000).toFixed(1)} s · ${vs.length} bloques de voz · ${zooms.length} focos → ${dir}`);
    },
  };
  return tut;
}
