/**
 * @fileOverview Content-Security-Policy del renderer (PURO).
 *
 * La app no tenía CSP: un contenido inyectado (un diagrama importado, el markdown de
 * una IA) podía cargar código de cualquier sitio o mandar el proyecto a cualquier
 * servidor. Esta política cierra eso sin romper lo que la app necesita de verdad:
 *
 * - **Scripts en línea** (`'unsafe-inline'`): el export estático de Next hidrata con
 *   scripts en línea y el layout pinta el tema antes del primer fotograma. Sin
 *   servidor no hay nonces; es el límite de esta política, no un descuido.
 * - **WebAssembly** (`'wasm-unsafe-eval'`): LiteRT-LM y el OCR compilan WASM. Eso NO
 *   habilita `eval` de JavaScript.
 * - **Un solo CDN** (`CDN_PERMITIDO`): de ahí salen LiteRT-LM, pdf.js y tesseract.js.
 * - **`litert-model:`**: el scheme con el que el main sirve los modelos del disco.
 *
 * Vive en `lib/` porque la edición web (ADR 0005) usa la misma política.
 */

/** De ahí se importan LiteRT-LM, pdf.js y tesseract.js (`webpackIgnore`). */
export const CDN_PERMITIDO = "https://cdn.jsdelivr.net";

type Directiva = readonly [nombre: string, valores: readonly string[]];

export function directivasCsp(): Directiva[] {
  return [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "blob:", CDN_PERMITIDO]],
    // pdf.js y tesseract.js levantan sus workers desde un blob.
    ["worker-src", ["'self'", "blob:", CDN_PERMITIDO]],
    ["connect-src", ["'self'", "litert-model:", "blob:", "data:", CDN_PERMITIDO]],
    // Tailwind y los diagramas (Mermaid, React Flow) ponen estilos en línea.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["object-src", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ];
}

/** La política lista para el `<meta http-equiv="Content-Security-Policy">`. */
export function politicaCsp(): string {
  return directivasCsp()
    .map(([nombre, valores]) => `${nombre} ${valores.join(" ")}`)
    .join("; ");
}
