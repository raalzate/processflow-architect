/**
 * @fileOverview Captura de la vista activa para un agente externo (PURO). #670.
 *
 * El agente que diseña por MCP ve el grafo, no el dibujo: no sabe que dos líneas
 * se cruzan o que una caja tapa a otra. `get_view_image` le da la vista tal como
 * la ve el humano. La captura la hace la app (ver `mcp-app-capture.ts`); acá se
 * decide qué viaja y cómo se le explica.
 */

/** Respuesta del renderer a un pedido de captura. */
export type CapturaVista = { ok: true; view: string; dataUrl: string } | { ok: false; error: string };

/**
 * Lo que tarda en encuadrar, esperar dos cuadros y capturar un lienzo grande:
 * bastante más que una lectura (`mcp-app-read`, 2,5 s por intento).
 */
export const CAPTURA_TIMEOUT_MS = 15_000;

/** Contenido `image` de MCP a partir de una data URL; null si no es una imagen en base64. */
export function imagenDeDataUrl(
  dataUrl: string
): { type: "image"; mimeType: string; data: string } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  return { type: "image", mimeType: m[1], data: m[2] };
}

/** El texto que acompaña la imagen: qué vista es y qué hacer con lo que se ve. */
export function textoDeCaptura(view: string): string {
  return [
    `Vista "${view}" tal como se ve en la app (encuadrada a todo el contenido).`,
    "Usala para ver lo que el grafo no dice: líneas que se cruzan o atraviesan cajas, cajas encimadas, etiquetas ilegibles.",
    "Para corregir: set_view_graph con las posiciones nuevas (el lienzo funde la geometría por nombre), o relayout_diagram sobre el diagrama del workspace y export_as_view. Después volvé a pedir la imagen para comprobar.",
  ].join("\n");
}
