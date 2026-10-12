/**
 * @fileOverview Saneado y verificación de un icono SVG (PURO, spec 025).
 *
 * Vive aparte de `catalog.ts` porque lo usa el SCRIPT que genera el catálogo:
 * si estuviera junto a la lista, el script tendría que importar un catálogo
 * que todavía no existe. Es la única definición de «qué puede traer un logo».
 */

import type { IconoDeCatalogo } from "./catalog";

/** Etiquetas que un logo necesita; cualquier otra se descarta con su contenido. */
const ETIQUETAS_PERMITIDAS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "defs", "lineargradient", "radialgradient", "stop", "clippath", "mask", "use",
]);

export interface SvgSaneado {
  viewBox: string;
  /** Marcado interno (sin la etiqueta `<svg>`), listo para incrustar. */
  inner: string;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Deja el SVG como DIBUJO y nada más: sin `<script>`, sin `on*`, sin
 * `href`/`xlink:href` que no apunten a un `#id` propio, sin `<foreignObject>`,
 * sin `<style>` y sin `<title>` (el nombre accesible lo pone el lienzo). Los
 * `id` de `<defs>` se prefijan con `prefijo` para que dos logos con un
 * gradiente llamado `a` no se pisen en el mismo documento. Devuelve `null` si
 * no hay un `<svg>` raíz con `viewBox` o si tras limpiar no queda dibujo.
 */
export function sanearSvg(markup: string, prefijo: string): SvgSaneado | null {
  const raiz = /<svg\b([^>]*)>([\s\S]*?)<\/svg>\s*$/i.exec(markup.trim());
  if (!raiz) return null;
  const viewBox = /\bviewBox="([^"]+)"/i.exec(raiz[1])?.[1]?.trim();
  if (!viewBox || !/^-?[\d.]+(\s+-?[\d.]+){3}$/.test(viewBox)) return null;

  let inner = raiz[2]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    // Elementos peligrosos o inútiles, con su contenido.
    .replace(/<(script|style|foreignObject|title|desc|metadata|image|a)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|foreignObject|title|desc|metadata|image|a)\b[^>]*\/>/gi, "");

  // Etiquetas fuera de la lista: fuera (abiertas, cerradas y autocerradas).
  inner = inner.replace(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g, (tag, nombre: string) =>
    ETIQUETAS_PERMITIDAS.has(nombre.toLowerCase()) ? tag : ""
  );
  // Atributos de evento y referencias externas.
  inner = inner
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s+(xlink:href|href)\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/\s+style\s*=\s*("[^"]*url\([^"]*"|'[^']*url\([^']*')/gi, "");
  // Ids propios, prefijados, y sus referencias (`url(#x)`, `href="#x"`).
  const ids = new Set([...inner.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const id of ids) {
    const nuevo = `${prefijo}-${id}`;
    inner = inner
      .replace(new RegExp(`\\sid="${escapar(id)}"`, "g"), ` id="${nuevo}"`)
      .replace(new RegExp(`url\\(#${escapar(id)}\\)`, "g"), `url(#${nuevo})`)
      .replace(new RegExp(`href="#${escapar(id)}"`, "g"), `href="#${nuevo}"`);
  }
  inner = inner.replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
  if (!/<(path|circle|ellipse|rect|line|polyline|polygon)\b/i.test(inner)) return null;
  return { viewBox, inner };
}

/** Lo que una verificación (test, script) no acepta en un icono ya generado. */
export function fallasDeIcono(i: IconoDeCatalogo): string[] {
  const fallas: string[] = [];
  if (!/^(si|dv|lu)-[A-Za-z0-9][A-Za-z0-9-]*$/.test(i.id)) fallas.push(`id «${i.id}» fuera de forma`);
  if (i.fuente === "lucide") {
    if (!i.lucide) fallas.push(`${i.id}: lucide sin nombre`);
    return fallas;
  }
  if (!i.svg || !i.viewBox) fallas.push(`${i.id}: sin dibujo`);
  const svg = i.svg ?? "";
  if (/<script|<foreignObject|<style|<image/i.test(svg)) fallas.push(`${i.id}: elemento prohibido`);
  if (/\son[a-z]+\s*=/i.test(svg)) fallas.push(`${i.id}: atributo de evento`);
  if (/(xlink:href|href)\s*=\s*"(?!#)/i.test(svg)) fallas.push(`${i.id}: referencia externa`);
  if (/url\(\s*["']?\s*(?:https?:)?\/\//i.test(svg)) fallas.push(`${i.id}: url externa`);
  return fallas;
}
