# ADR 0002 — Profundidad por VISTAS, no por contenedores anidados

Issue: #225

- **Fecha:** 2026-08-25
- **Estado:** aceptado
- **Contexto previo:** [ADR 0001](0001-arnes-del-agente.md) · [arquitectura MCP](../architecture/mcp.md) · issue #144 (punto E)

## Estado y mecanismo

Aceptado el 2026-08-25. Lo que hace cumplir la decisión no es esta prosa: `addContainer` rechaza el
intento de anidar con un mensaje que **enseña la salida** (crear otra vista y enlazarla con
`viewRef`), y hay una prueba que falla si ese mensaje deja de decirlo
(`src/lib/mcp/__tests__/diagram-builder.test.ts`).

## Contexto

`addContainer` fuerza `container: ""` (`src/lib/mcp/diagram-builder.ts:251`): un contenedor nunca
cuelga de otro. No es un olvido — `GraphData.agregados` es una lista de **un solo nivel** y los
nodos declaran su padre por NOMBRE (`Agregado.nodos[]`), sin más jerarquía posible.

En C4 eso duele: el nivel 3 son **componentes dentro de un contenedor dentro de un sistema**. Al
aplanarlo se pierde uno de los dos encajes. Hoy se resuelve con bandas hermanas —el sistema y su
contenedor como dos cajas al lado— que no es lo que el modelo dice: un lector ve dos elementos
del mismo rango donde hay una relación de composición.

El mismo aplanamiento aparece en BPMN (subproceso dentro de un carril dentro de un pool) y en UML
(clase dentro de un paquete dentro de otro paquete).

Lo que arrastra tocar el formato:

| Pieza | Qué asume hoy |
|---|---|
| `src/lib/types.ts` | `agregados: Agregado[]`, sin padre; `GraphNode.agregado` es un nombre |
| `src/components/graph/designer/serialize.ts` | contenedor ⇄ `agregados[]` 1:1, en un nivel |
| `src/lib/graph-processor.ts` | el árbol del panel es `grupo → tipo → nodos`: dos niveles |
| `src/components/graph/designer/containment.ts` | la regla de pertenencia ya contempla cajas anidadas («a igual solape gana el más chico»), pero sólo se persiste un padre |
| `src/lib/mcp/diagram-builder.ts` | layout por bandas hermanas; clasificación de aristas por *un* contenedor de cada punta |
| Ficheros de proyecto guardados | los `.json` existentes son de un nivel: cualquier cambio necesita lectura retrocompatible |

## Decisión

**No se anidan contenedores en el formato. La profundidad se modela con VISTAS**, que es un
mecanismo que la app ya tiene y que hoy está infrautilizado para esto:

1. Un elemento que contiene un modelo propio declara `viewRef` (`GraphNode.viewRef`,
   `src/lib/view-embeds.ts`): al abrirlo se entra a **otra vista** con su propio lienzo y su propia
   notación. Es el «call activity» de BPMN aplicado a C4: el Contenedor del L2 abre la vista del
   L3 con sus Componentes.
2. Cada nivel de C4 es una vista del mismo proyecto (`export_as_view`), no una banda más del
   mismo lienzo. El paisaje no crece hacia adentro: crece en pestañas.
3. `addContainer` sigue forzando `container: ""` — y el error que hoy lanza pasa a **enseñar la
   salida**: «un contenedor no cuelga de otro; para el nivel de abajo creá otra vista y enlazala
   con `viewRef`».

## Alternativas consideradas

- **`Agregado.parent?: string`.** Un campo y el formato queda anidable. Descartado *por ahora*: el
  campo es barato, lo caro es todo lo que lee ese formato — el árbol del panel (hoy de dos
  niveles), la clasificación de aristas (una arista entre dos nietos de bandas distintas, ¿es
  política o interna?), el layout de bandas, la contención al arrastrar y la lectura de los `.json`
  ya guardados. Un formato a medio anidar es peor que uno plano: cada lector inventa su regla, que
  es exactamente el defecto que arregló #142.
- **Unificar nodo y contenedor (`container` recursivo, sin `agregados[]`).** Es el modelo correcto y
  también el más caro: reescribe el formato de proyecto, el serializador, el procesador y el
  importador del MCP. No se justifica sin un caso de uso que las vistas no cubran.
- **Dejarlo como está y no decir nada.** Es el estado que este ADR corrige: hoy el agente descubre
  el límite chocando contra un error que no explica la salida, y modela bandas hermanas que mienten
  sobre la jerarquía.

## Consecuencias

- Un C4 completo son **tres vistas** (L1 · L2 · L3) enlazadas por `viewRef`, no un lienzo con
  bandas dentro de bandas. El límite de vistas por proyecto (`MAX_CUSTOM_VIEWS`) pasa a ser el
  techo real de profundidad.
- El formato de proyecto no cambia: los `.json` guardados siguen siendo válidos y los dos lectores
  (`serialize.ts`, `graph-processor.ts`) mantienen una sola regla de pertenencia.
- El skill del agente y `describe_notation` deben decir esto **antes** de que el agente lo descubra
  chocando; el mensaje de error de `addContainer` es el último recordatorio, no el primero.
- Si aparece un caso que las vistas no cubran (p. ej. exportar un C4 anidado a otra herramienta que
  sí lo modela), este ADR se revisa: la alternativa `Agregado.parent` queda documentada arriba con
  su costo real, no hay que redescubrirlo.

## Qué haría falta para revertirlo

Un incidente registrado donde la profundidad por vistas pierda información que el humano necesitaba
en una sola pantalla. Mientras eso no exista, anidar es complejidad sin demanda.
