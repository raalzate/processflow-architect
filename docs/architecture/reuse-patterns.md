# Catálogo de reuso — lo que ya está resuelto en este repo

Este archivo existe para responder una sola pregunta antes de escribir código:
**¿esto ya tiene abstracción?** El hook `reuse-guard` bloquea el boilerplate de las filas
marcadas con 🔒; el resto es criterio.

| Necesidad | Ya existe | No hagas |
|---|---|---|
| 🔒 Tipos de componente, iconos, formas, paletas, guía para la IA | `src/lib/notations.ts` (registro por notación DDD/BPMN/C4/UML) | declarar otra lista de tipos o cablear literales (regla NOTACION de `scripts/repo-lint.mjs`) |
| Ayuda/semántica de cada tipo | `src/lib/notation-help.ts` | escribir textos de ayuda en el componente |
| 🔒 Llamar al proceso main desde la UI | `window.electronAPI` (puente de `preload.ts`) | `ipcRenderer` directo en `src/` |
| 🔒 Generación con proveedor de nube | `main/services/ai-remote.ts` vía `fetch` | agregar un SDK de nube como dependencia |
| Una función nueva de IA | declarar una `AiTask` en `src/lib/ai/tasks.ts` | tocar `src/lib/ai/router.ts` o `providers.ts` |
| Elegir motor local vs. nube | `src/lib/ai/remote-settings.ts` (`local` · `hybrid` · `remote`) | condicionales de proveedor esparcidos |
| Meter el grafo en un prompt | `src/lib/ai/graph-toon.ts` (poda geometría, tabula arrays) | serializar `GraphData` a JSON crudo |
| Filtrar/preparar el grafo para el lienzo | `src/lib/graph-processor.ts` (con sus redes de seguridad) | filtrar nodos en el componente |
| Ocultar/mostrar elementos del lienzo (menú «Filtros») | `src/lib/graph-filters.ts` — opciones por notación de la VISTA, conjunto de OCULTOS, `applyGraphFilters` al dibujar | recalcular visibles en el componente, o guardar "visibles" (resucita lo oculto al aparecer un tipo nuevo) |
| Construir/validar un diagrama programáticamente | `src/lib/mcp/diagram-builder.ts` + `src/lib/mcp/to-mermaid.ts` | armar el objeto `GraphData` a mano |
| Renderizar Mermaid | `src/lib/mermaid-diagram.ts` | invocar mermaid-cli desde un componente |
| Prompt de plantilla para la IA | `src/lib/template-prompt.ts` | concatenar strings de prompt en el llamador |
| Tipos del dominio (nodos, aristas, vistas) | `src/lib/types.ts`, `src/lib/views-types.ts` | redeclarar interfaces parecidas |
| Utilidades de markdown / artefactos | `src/lib/markdown-utils.ts`, `src/lib/artifacts/` | parsear markdown a mano |
| Icono de un artefacto | `src/components/ai-panel/artifact-icon.tsx` (`iconForArtifact`, mapa nombre→lucide) | poner `FileText`/`Workflow` fijo, o un `switch` por `kind` |
| Ver un artefacto en modal | `src/components/ai-panel/ArtifactViewerDialog.tsx` | duplicar el `Dialog` con el markdown del artefacto |
| Pedir un artefacto concreto al agente | `src/lib/artifacts/request.ts` + `requestedKind` de `runLitertAgent` | inyectar la orden a mano en el mensaje del usuario |
| Versión, canal beta, crédito y enlaces | `src/lib/credits.ts` | escribir la versión o los links de Sofka en un componente |
| Punta y trazo de una arista según la relación (UML: herencia, composición…) | `src/lib/edge-relations.ts` (`relationStyle`, `edgeIsDashed`) + los marcadores `uml-*` del `<defs>` del lienzo | pintar todas las relaciones con la misma flecha, o decidir el `strokeDasharray` en el componente |
| Acento de una acción asistida por IA («Sugerir», «Siguiente paso») | tokens `ai` del tema: `text-ai`, `bg-ai-surface`, `border-ai-border` (`src/app/globals.css` + `tailwind.config.ts`) | `text-purple-600` u otro color crudo pensado para fondo blanco: la app se muestra oscura y queda a 2,4:1 (regla TOKENS + `theme-contrast.test.ts`) |
| Componentes de UI base | `src/components/ui/` (shadcn) | escribir un botón/diálogo desde cero |

## Cómo se agrega una fila

Cuando el `reviewer` o `/lesson` detectan una reimplementación, la mejora es: (1) documentar la
abstracción aquí y (2) —si el patrón es detectable por regex— agregar la regla a
`.claude/harness.config.json` → `reuse`, con su `see`. El self-test verifica que ese `see` exista.
