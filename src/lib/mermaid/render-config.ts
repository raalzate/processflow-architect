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
 */

export const MERMAID_INIT_CONFIG = {
  startOnLoad: false,
  theme: "neutral",
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
