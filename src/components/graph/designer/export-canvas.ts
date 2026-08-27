"use client";

// =============================================================================
// Exportar el lienzo a un SVG autónomo (para presentar a stakeholders).
//
// El lienzo usa clases Tailwind (fill-*, foreignObject con HTML) resueltas por
// la hoja de estilos de la app: un SVG guardado "en crudo" perdería todos los
// colores. Por eso clonamos el <svg>, copiamos los ESTILOS COMPUTADOS a estilo
// en línea (recorriendo original y clon en paralelo) y recortamos el viewBox a
// la caja del contenido. El resultado es vectorial y se abre en cualquier
// navegador — incluido el foreignObject de los nodos.
//
// PNG no se exporta en cliente: rasterizar un SVG con foreignObject contamina el
// canvas y `toDataURL` falla. Para PNG conviene la vía Puppeteer del main.
// =============================================================================

import type { ContentBounds } from "./serialize";

/** Rectángulo de recorte (viewBox) alrededor del contenido, con margen. Puro. */
export function croppedViewBox(
  bounds: ContentBounds,
  pad: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: bounds.minX - pad,
    y: bounds.minY - pad,
    w: bounds.width + pad * 2,
    h: bounds.height + pad * 2,
  };
}

// Propiedades que definen la apariencia tanto de SVG puro como del HTML de los
// foreignObject (texto, iconos, tarjetas de nodo).
const STYLE_PROPS = [
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
  "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity", "color",
  "background-color", "background", "border", "border-color", "border-width",
  "border-style", "border-radius", "box-shadow", "padding", "margin",
  "display", "flex-direction", "align-items", "justify-content", "gap",
  "font-size", "font-family", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "letter-spacing", "line-height", "text-align",
  "white-space", "text-overflow", "overflow", "box-sizing", "width", "height",
];

/** Copia estilos computados a estilo en línea, en paralelo original→clon. */
function inlineComputedStyles(src: Element, dst: Element): void {
  const cs = window.getComputedStyle(src);
  let style = "";
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v && v !== "none" && v !== "normal") style += `${p}:${v};`;
  }
  if (style) dst.setAttribute("style", style);
  const sc = src.children;
  const dc = dst.children;
  for (let i = 0; i < sc.length && i < dc.length; i++) {
    inlineComputedStyles(sc[i], dc[i]);
  }
}

/** Dispara la descarga de un data URL (p. ej. el PNG que devuelve capturePage). */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Dispara la descarga de un texto como archivo. Exportada porque es el ÚNICO
 * mecanismo de descarga del renderer: la ficha de elemento exporta el markdown
 * de su especificación por acá en vez de abrir una segunda ruta de guardado.
 */
export function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoca en el siguiente tick para no cortar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Exporta el <svg> del lienzo como archivo .svg recortado al contenido.
 * @param svg     El elemento <svg> vivo del lienzo.
 * @param bounds  Caja del contenido (viewBox recortado); null → lienzo completo.
 * @param filename Nombre del archivo de descarga.
 */
export function exportCanvasSvg(
  svg: SVGSVGElement,
  bounds: ContentBounds | null,
  filename: string
): void {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg, clone);

  const PAD = 40;
  if (bounds) {
    const { x, y, w, h } = croppedViewBox(bounds, PAD);
    clone.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Fondo blanco: sin él, las zonas transparentes salen negras en algunos visores.
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const vb = (clone.getAttribute("viewBox") || "0 0 2000 2000").split(" ");
  bg.setAttribute("x", vb[0]);
  bg.setAttribute("y", vb[1]);
  bg.setAttribute("width", vb[2]);
  bg.setAttribute("height", vb[3]);
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  downloadText(
    `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`,
    filename,
    "image/svg+xml"
  );
}

/**
 * Región de PANTALLA a capturar para el PNG. Antes se pasaba el rectángulo
 * COMPLETO del contenedor scrolleable: si el contenido no llenaba el viewport
 * (lo normal tras «ajustar a contenido», que topa el zoom en 3×) el PNG salía
 * con media imagen de lienzo vacío. Acá se recorta a la caja del contenido,
 * traducida a píxeles: `mundo * zoom - scroll + origen del contenedor`.
 *
 * Se intersecta con el contenedor: lo que quedó fuera del viewport no está
 * pintado y capturarlo daría bandas vacías. Puro y con prueba.
 */
export function captureRegion(
  // Sólo el origen y el tamaño: `maxX/maxY` no hacen falta para encuadrar.
  bounds: Pick<ContentBounds, "minX" | "minY" | "width" | "height">,
  zoom: number,
  scroll: { left: number; top: number },
  wrapper: { left: number; top: number; width: number; height: number },
  padPx = 24
): { x: number; y: number; width: number; height: number } {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const x0 = wrapper.left + bounds.minX * z - scroll.left - padPx;
  const y0 = wrapper.top + bounds.minY * z - scroll.top - padPx;
  const x1 = x0 + bounds.width * z + padPx * 2;
  const y1 = y0 + bounds.height * z + padPx * 2;
  const left = Math.max(wrapper.left, Math.floor(x0));
  const top = Math.max(wrapper.top, Math.floor(y0));
  const right = Math.min(wrapper.left + wrapper.width, Math.ceil(x1));
  const bottom = Math.min(wrapper.top + wrapper.height, Math.ceil(y1));
  return {
    x: left,
    y: top,
    // Nunca cero: una región vacía hace fallar `capturePage` con un error opaco.
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * Espera a que no quede ningún panel flotante de Radix en el DOM (menús,
 * tooltips, popovers). El menú «Exportar» es un portal `position:fixed` fuera
 * del lienzo: `capturing` no lo tapaba y el PNG salía con los dos ítems del
 * menú dibujados encima del diagrama. Cierre + desmontaje son asíncronos, así
 * que se sondea por frames con tope para no colgar la exportación.
 */
export async function waitForFloatingLayersGone(maxFrames = 30): Promise<void> {
  const SEL = "[data-radix-popper-content-wrapper],[role=menu],[role=tooltip]";
  for (let i = 0; i < maxFrames; i++) {
    if (!document.querySelector(SEL)) return;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
}
