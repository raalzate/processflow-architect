/**
 * @fileOverview Página HTML autocontenida de un diagrama (PURO, spec 024 · ADR 0006).
 *
 * Un `.html` que se abre con doble clic, sin la app, sin red y sin scripts:
 * encabezado (notación · skin), título, descripción, el SVG del lienzo con su
 * CONTRATO ACCESIBLE (rol de imagen, nombre y descripción referenciados,
 * `<title>` primer hijo, ids prefijados por el proyecto) y un pie. El tamaño lo
 * fija un PRESET que piensa en el destino —documento, lámina, impresión— y no
 * en píxeles sueltos. Adaptado de diagram-design: su `template.html`, su
 * contrato SVG y su `self_check.py`, acá como `verificarPagina`.
 *
 * Recibe el SVG ya serializado (con los estilos computados en línea, como lo
 * produce `export-canvas.ts`): esta página no sabe de DOM ni de Tailwind.
 */

import type { SkinId } from "../skin";

export type PresetId = "documento" | "lamina169" | "impresionA4";

export interface Preset {
  id: PresetId;
  label: string;
  descripcion: string;
  /** CSS propio del preset: la caja del diagrama y, en impresión, la regla de página. */
  css: string;
}

export const PRESETS: Record<PresetId, Preset> = {
  documento: {
    id: "documento",
    label: "Página de lectura",
    descripcion: "Ancho de lectura; el diagrama se desplaza en su caja si es más ancho (blog, wiki, correo).",
    css: [
      "main{max-width:960px;margin:0 auto;padding:32px 16px}",
      // La caja desplaza; la página no. Un `overflow:hidden` arriba cortaría el
      // diagrama sin barra, así que el SVG conserva su ancho natural.
      "figure{margin:24px 0;overflow-x:auto;overflow-y:hidden}",
      "figure svg{display:block;min-width:min(100%,var(--svg-w))}",
    ].join("\n"),
  },
  lamina169: {
    id: "lamina169",
    label: "Lámina 16:9",
    descripcion: "Una lámina de 1920×1080 con el diagrama centrado y a escala (proyección, captura).",
    css: [
      "html,body{height:100%}",
      "main{width:1920px;height:1080px;margin:0 auto;padding:48px 64px;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr auto;gap:16px}",
      "figure{margin:0;min-height:0;display:flex;align-items:center;justify-content:center}",
      "figure svg{max-width:100%;max-height:100%;width:auto;height:auto}",
    ].join("\n"),
  },
  impresionA4: {
    id: "impresionA4",
    label: "Impresión A4 apaisada",
    descripcion: "Hoja A4 apaisada con márgenes; el diagrama se escala para no cortarse al imprimir.",
    css: [
      "@page{size:A4 landscape;margin:12mm}",
      "main{max-width:none;padding:0 8mm}",
      "figure{margin:16px 0;overflow:hidden}",
      "figure svg{max-width:100%;height:auto}",
      "@media print{footer{position:fixed;bottom:0}}",
    ].join("\n"),
  },
};

export const PRESET_LIST: Preset[] = Object.values(PRESETS);

/** Colores de la página; por defecto los tokens de la skin editorial. */
export interface ColoresDePagina {
  papel: string;
  tinta: string;
  atenuado: string;
  regla: string;
}

export const COLORES_POR_DEFECTO: Record<"light" | "dark", ColoresDePagina> = {
  light: { papel: "#f5f5f5", tinta: "#2d3142", atenuado: "#4f5d75", regla: "rgba(45,49,66,0.12)" },
  dark: { papel: "#2d3142", tinta: "#f5f5f5", atenuado: "#bfc0c0", regla: "rgba(245,245,245,0.12)" },
};

export interface PaginaOpts {
  titulo: string;
  /** Sin ella, se genera una con la notación y el conteo. */
  descripcion?: string;
  /** Etiqueta de la notación («C4 (Arquitectura)»). */
  notacion: string;
  skin: SkinId;
  tema: "light" | "dark";
  preset: PresetId;
  /** Marcado del `<svg>` del lienzo, ya con estilos en línea. */
  svg: string;
  fecha?: string;
  elementos?: number;
  relaciones?: number;
  colores?: ColoresDePagina;
}

/** Slug del nombre del proyecto: prefijo de los ids accesibles y nombre del archivo. */
export function slugDeProyecto(nombre: string): string {
  const s = (nombre || "diagrama")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "diagrama";
}

export function escaparHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Una frase sobre el contenido, no sobre la geometría (contrato de diagram-design). */
export function descripcionPorDefecto(i: { notacion: string; elementos?: number; relaciones?: number }): string {
  const partes = [`Diagrama ${i.notacion}`];
  if (i.elementos !== undefined) partes.push(`con ${i.elementos} elemento(s)`);
  if (i.relaciones !== undefined) partes.push(`y ${i.relaciones} relación(es)`);
  return partes.join(" ") + ".";
}

/** Ancho y alto declarados en el `<svg>` raíz, si los trae. */
function tamanoDe(svg: string): { w?: number; h?: number } {
  const raiz = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
  const w = /\swidth="([\d.]+)"/.exec(raiz)?.[1];
  const h = /\sheight="([\d.]+)"/.exec(raiz)?.[1];
  return { w: w ? Number(w) : undefined, h: h ? Number(h) : undefined };
}

/**
 * Aplica el contrato accesible al `<svg>` raíz: `role="img"`, `aria-labelledby`
 * con ids prefijados, y `<title>` + `<desc>` como primeros hijos. Quita el
 * prólogo XML y cualquier `role`/`aria-labelledby` previo para no duplicar.
 */
export function conContratoAccesible(svg: string, slug: string, titulo: string, descripcion: string): string {
  const sinProlog = svg.replace(/^\s*<\?xml[^>]*\?>\s*/i, "");
  const m = /<svg\b([^>]*)>/i.exec(sinProlog);
  if (!m) return sinProlog;
  const attrs = m[1]
    .replace(/\srole="[^"]*"/gi, "")
    .replace(/\saria-labelledby="[^"]*"/gi, "")
    // El `<title>` del contrato no es el `<title>` de un hijo: para que sea
    // inequívocamente el primero, un title raíz previo se descarta.
    .trim();
  const apertura = `<svg ${attrs} role="img" aria-labelledby="${slug}-title ${slug}-desc">`;
  const cabecera = `<title id="${slug}-title">${escaparHtml(titulo)}</title><desc id="${slug}-desc">${escaparHtml(descripcion)}</desc>`;
  const resto = sinProlog.slice(m.index + m[0].length).replace(/^\s*<title>[^<]*<\/title>/i, "");
  return apertura + cabecera + resto;
}

const CSS_BASE = (c: ColoresDePagina, svgW?: number) =>
  [
    `:root{--papel:${c.papel};--tinta:${c.tinta};--atenuado:${c.atenuado};--regla:${c.regla};--svg-w:${svgW ? `${svgW}px` : "100%"}}`,
    "html{background:var(--papel)}",
    "body{margin:0;color:var(--tinta);background:var(--papel);font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.45;-webkit-font-smoothing:antialiased}",
    "header{display:flex;flex-direction:column;gap:4px}",
    ".eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--atenuado)}",
    "h1{font-family:ui-serif,Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;margin:0}",
    "p.descripcion{margin:0;color:var(--atenuado);max-width:72ch}",
    "footer{border-top:1px solid var(--regla);padding-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--atenuado)}",
  ].join("\n");

/** El `.html` completo. Sin scripts, sin enlaces externos, sin fuentes de red. */
export function paginaHtml(o: PaginaOpts): string {
  const slug = slugDeProyecto(o.titulo);
  const descripcion = o.descripcion?.trim() || descripcionPorDefecto(o);
  const colores = o.colores ?? COLORES_POR_DEFECTO[o.tema];
  const { w } = tamanoDe(o.svg);
  const svg = conContratoAccesible(o.svg, slug, o.titulo, descripcion);
  const fecha = o.fecha ?? new Date().toISOString().slice(0, 10);
  const skin = o.skin === "editorial" ? "editorial" : "canónica";
  return [
    "<!doctype html>",
    `<html lang="es" data-tema="${o.tema}" data-skin="${o.skin}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escaparHtml(o.titulo)}</title>`,
    `<meta name="description" content="${escaparHtml(descripcion)}">`,
    `<meta name="generator" content="Processflow Architect">`,
    "<style>",
    CSS_BASE(colores, w),
    PRESETS[o.preset].css,
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<header>",
    `<p class="eyebrow">${escaparHtml(o.notacion)} · skin ${skin}</p>`,
    `<h1>${escaparHtml(o.titulo)}</h1>`,
    `<p class="descripcion">${escaparHtml(descripcion)}</p>`,
    "</header>",
    `<figure aria-label="${escaparHtml(o.titulo)}">`,
    svg,
    "</figure>",
    `<footer>${escaparHtml(fecha)} · Processflow Architect · ${escaparHtml(PRESETS[o.preset].label)}</footer>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

/**
 * Autocomprobación de una página (el `self_check.py` de diagram-design): lo
 * que devuelve son INCUMPLIMIENTOS; una página válida devuelve `[]`. No usa
 * DOM a propósito: corre en el gate sobre una página de referencia.
 */
export function verificarPagina(html: string): string[] {
  const fallas: string[] = [];
  if (/<script\b/i.test(html)) fallas.push("contiene <script>: la página debe ser estática");
  if (/\son[a-z]+\s*=\s*["']/i.test(html)) fallas.push("contiene un atributo de evento (on*=)");
  if (/\b(?:src|href|xlink:href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html)) fallas.push("referencia un recurso externo (src/href con http)");
  if (/url\(\s*["']?\s*(?:https?:)?\/\//i.test(html)) fallas.push("el CSS referencia un recurso externo (url(http…))");
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) fallas.push("enlaza una hoja de estilos externa");
  if (/@import\b/i.test(html)) fallas.push("el CSS importa otra hoja (@import)");

  const raices = html.match(/<svg\b[^>]*\brole="img"[^>]*>/gi) ?? [];
  if (raices.length !== 1) {
    fallas.push(`debe haber exactamente un <svg role="img"> (hay ${raices.length})`);
    return fallas;
  }
  const raiz = raices[0];
  const ids = /aria-labelledby="([^"]+)"/.exec(raiz)?.[1]?.split(/\s+/) ?? [];
  if (ids.length !== 2) fallas.push("el <svg> no referencia título y descripción con aria-labelledby");
  for (const id of ids) {
    if (!new RegExp(`\\sid="${id}"`).test(html)) fallas.push(`aria-labelledby apunta a #${id}, que no existe`);
    if (id === "title" || id === "desc") fallas.push(`el id "${id}" no está prefijado por el proyecto`);
  }
  const trasRaiz = html.slice(html.indexOf(raiz) + raiz.length);
  if (!/^\s*<title\s+id="[^"]+">/i.test(trasRaiz)) fallas.push("<title> no es el primer hijo del <svg>");
  if (!/^\s*<title\s+id="[^"]+">[^<]*<\/title>\s*<desc\s+id="[^"]+">[^<]*<\/desc>/i.test(trasRaiz))
    fallas.push("<desc> no sigue inmediatamente al <title>");
  if (/<title\s+id="[^"]+">\s*<\/title>/i.test(trasRaiz)) fallas.push("el <title> accesible está vacío");
  if (/<desc\s+id="[^"]+">\s*<\/desc>/i.test(trasRaiz)) fallas.push("la <desc> accesible está vacía");
  return fallas;
}

/** Tamaño a partir del cual se avisa que el archivo pesa (los estilos en línea abultan). */
export const AVISO_TAMANO_BYTES = 5 * 1024 * 1024;
