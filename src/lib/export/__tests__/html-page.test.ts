/**
 * Página HTML autocontenida (spec 024): se arma sin DOM, cumple el contrato
 * accesible y se verifica a sí misma. La página de referencia de este test es
 * lo que el gate exige (SC-002): adulterarla con un <script> la pone roja.
 */
import { describe, it, expect } from "vitest";
import {
  COLORES_POR_DEFECTO,
  PRESETS,
  PRESET_LIST,
  conContratoAccesible,
  descripcionPorDefecto,
  escaparHtml,
  paginaHtml,
  slugDeProyecto,
  verificarPagina,
} from "../html-page";

const SVG =
  '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200"><rect width="400" height="200" fill="#fff"/><foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>Pagar</div></foreignObject></svg>';

const base = () =>
  paginaHtml({
    titulo: "Cobros & pagos",
    descripcion: "Cómo <cobra> la empresa",
    notacion: "DDD / Event Storming",
    skin: "editorial",
    tema: "light",
    preset: "documento",
    svg: SVG,
    fecha: "2026-10-12",
    elementos: 12,
    relaciones: 15,
  });

describe("paginaHtml", () => {
  it("es una página completa, estática, con encabezado, título, descripción, figura y pie", () => {
    const html = base();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="es" data-tema="light" data-skin="editorial">');
    expect(html).toContain("<title>Cobros &amp; pagos</title>");
    expect(html).toContain('<p class="eyebrow">DDD / Event Storming · skin editorial</p>');
    expect(html).toContain("<h1>Cobros &amp; pagos</h1>");
    expect(html).toContain('<p class="descripcion">Cómo &lt;cobra&gt; la empresa</p>');
    expect(html).toContain("<footer>2026-10-12 · Processflow Architect · Página de lectura</footer>");
    expect(html).not.toMatch(/<script/i);
    // Los `xmlns` del SVG son URLs de espacio de nombres, no recursos: lo que
    // no puede haber es un recurso que se descargue.
    expect(html).not.toMatch(/\b(?:src|href)="(?:https?:)?\/\//i);
  });

  it("aplica el contrato accesible al <svg> raíz, con ids prefijados por el proyecto", () => {
    const html = base();
    expect(html).toMatch(/<svg [^>]*role="img" aria-labelledby="cobros-pagos-title cobros-pagos-desc">/);
    expect(html).toContain('<title id="cobros-pagos-title">Cobros &amp; pagos</title><desc id="cobros-pagos-desc">Cómo &lt;cobra&gt; la empresa</desc>');
    // El prólogo XML no vale dentro de HTML.
    expect(html).not.toContain("<?xml");
    // El svg del icono anidado no recibe el contrato.
    expect(html.match(/role="img"/g)).toHaveLength(1);
  });

  it("sin descripción genera una sobre el contenido, no sobre la geometría", () => {
    const html = paginaHtml({ titulo: "P", notacion: "C4 (Arquitectura)", skin: "canon", tema: "dark", preset: "lamina169", svg: SVG, elementos: 3, relaciones: 2 });
    expect(html).toContain("Diagrama C4 (Arquitectura) con 3 elemento(s) y 2 relación(es).");
    expect(descripcionPorDefecto({ notacion: "UML" })).toBe("Diagrama UML.");
  });

  it("el tema elige los colores por defecto y el preset su CSS", () => {
    const oscuro = paginaHtml({ titulo: "P", notacion: "UML", skin: "editorial", tema: "dark", preset: "impresionA4", svg: SVG });
    expect(oscuro).toContain(`--papel:${COLORES_POR_DEFECTO.dark.papel}`);
    expect(oscuro).toContain("@page{size:A4 landscape");
    const lamina = paginaHtml({ titulo: "P", notacion: "UML", skin: "canon", tema: "light", preset: "lamina169", svg: SVG });
    expect(lamina).toContain("width:1920px;height:1080px");
    expect(base()).toContain("--svg-w:400px");
    expect(PRESET_LIST.map((p) => p.id)).toEqual(["documento", "lamina169", "impresionA4"]);
  });

  it("acepta colores propios (perfil de marca) en vez de los de la skin", () => {
    const html = paginaHtml({ titulo: "P", notacion: "UML", skin: "editorial", tema: "light", preset: "documento", svg: SVG, colores: { papel: "#fffaf0", tinta: "#111", atenuado: "#555", regla: "#ddd" } });
    expect(html).toContain("--papel:#fffaf0;--tinta:#111");
  });
});

describe("verificarPagina", () => {
  it("la página de referencia no tiene incumplimientos", () => {
    expect(verificarPagina(base())).toEqual([]);
  });

  it.each([
    ["<script>", (h: string) => h.replace("</main>", "<script>alert(1)</script></main>"), /script/],
    ["atributo de evento", (h: string) => h.replace("<figure", '<figure onload="x()"'), /evento/],
    ["recurso externo", (h: string) => h.replace("<figure", '<img src="https://x.y/z.png"><figure'), /externo/],
    ["hoja externa", (h: string) => h.replace("</head>", '<link rel="stylesheet" href="/a.css"></head>'), /hoja de estilos/],
    ["@import", (h: string) => h.replace("<style>", "<style>@import url(a.css);"), /@import/],
    ["sin role", (h: string) => h.replace(' role="img"', ""), /exactamente un/],
    ["title no primero", (h: string) => h.replace(/(<svg [^>]*>)(<title[^>]*>[^<]*<\/title>)/, "$1<g/>$2"), /primer hijo/],
    ["id sin prefijo", (h: string) => h.replace(/cobros-pagos-title/g, "title"), /prefijado/],
    ["desc vacía", (h: string) => h.replace(/<desc id="([^"]+)">[^<]*<\/desc>/, '<desc id="$1"></desc>'), /vacía/],
  ])("cae con %s", (_n, adulterar, patron) => {
    expect(verificarPagina(adulterar(base())).join(" | ")).toMatch(patron);
  });
});

describe("utilidades", () => {
  it("slugDeProyecto normaliza acentos, símbolos y vacíos", () => {
    expect(slugDeProyecto("Alta de Póliza · v2")).toBe("alta-de-poliza-v2");
    expect(slugDeProyecto("   ")).toBe("diagrama");
  });

  it("escaparHtml cubre los cinco caracteres", () => {
    expect(escaparHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("conContratoAccesible reemplaza un contrato previo en vez de duplicarlo", () => {
    const previo = '<svg role="presentation" aria-labelledby="t" viewBox="0 0 1 1"><title>viejo</title><g/></svg>';
    const out = conContratoAccesible(previo, "p", "Nuevo", "Desc");
    expect(out.match(/role=/g)).toHaveLength(1);
    expect(out).toContain('aria-labelledby="p-title p-desc"');
    expect(out).not.toContain("viejo");
    expect(out).toMatch(/<svg [^>]*><title id="p-title">Nuevo<\/title><desc id="p-desc">Desc<\/desc><g\/>/);
  });

  it("los presets documentan para qué sirven", () => {
    for (const p of Object.values(PRESETS)) {
      expect(p.label.length).toBeGreaterThan(3);
      expect(p.descripcion.length).toBeGreaterThan(20);
      expect(p.css.length).toBeGreaterThan(20);
    }
  });
});
