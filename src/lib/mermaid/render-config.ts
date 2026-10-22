/**
 * @fileOverview Configuración con la que se inicializa Mermaid. DATOS PUROS
 * (sin React ni Electron) para que la regla que importa tenga prueba.
 *
 * `suppressErrorRendering` NO es cosmético (#353): sin él, un código que no
 * parsea hace que Mermaid dibuje su bomba de "Syntax error in text" en un div
 * temporal que cuelga de `document.body` y lance ANTES de borrarlo
 * (`mermaid/dist/mermaid.core.mjs`: `if (parseEncounteredException) throw …`
 * está justo encima de `removeTempElements()`). Ese div queda fuera del árbol
 * de React: nadie lo puede limpiar y la bomba flota sobre la app, una por cada
 * render fallido. Con la bandera en `true`, Mermaid limpia y sólo lanza, que es
 * lo que `MermaidDiagram` ya sabe atender mostrando el error y el código.
 *
 * El tema de Mermaid NO es fijo (#621): el SVG sale transparente y hereda el
 * fondo del contenedor, así que `neutral` (trazos y texto oscuros pensados para
 * fondo blanco) sobre la app en oscuro deja mensajes, flechas y notas casi
 * invisibles. `configMermaidParaTema` elige el tema que contrasta con el fondo.
 */

import type { EffectiveTheme } from "@/lib/theme";

export const MERMAID_INIT_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  /** Ver el porqué arriba: el error lo muestra la app, no el DOM de Mermaid. */
  suppressErrorRendering: true,
  flowchart: { useMaxWidth: true, htmlLabels: true },
  // Diagramas de secuencia: márgenes cómodos, actores espejados abajo y
  // ancho adaptable para que no se aplaste con pocos participantes.
  sequence: {
    useMaxWidth: true,
    mirrorActors: true,
    showSequenceNumbers: false,
    wrap: true,
    actorMargin: 60,
    boxMargin: 12,
  },
} as const;

/**
 * El tema de Mermaid que se lee sobre el fondo de la app. `dark` es el tema
 * oscuro propio de Mermaid: texto y trazos claros; `neutral` queda para claro,
 * que es como se vio siempre.
 */
export function temaMermaid(tema: EffectiveTheme): "dark" | "neutral" {
  return tema === "dark" ? "dark" : "neutral";
}

/**
 * La config completa para el tema que se está pintando. Mermaid es un singleton:
 * quien renderiza la vuelve a aplicar cuando el tema cambia, o el diagrama nuevo
 * sale con los colores del anterior.
 */
export function configMermaidParaTema(tema: EffectiveTheme) {
  return { ...MERMAID_INIT_CONFIG, theme: temaMermaid(tema), darkMode: tema === "dark" };
}
