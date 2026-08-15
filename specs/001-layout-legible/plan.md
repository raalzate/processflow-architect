# plan · 001 — Layout legible de diagramas exportados por MCP

Diseño técnico de [spec.md](spec.md). Sin dependencias nuevas: todo es lógica pura en
`src/lib/`, que es lo único con cobertura exigida (CONSTITUTION §P3).

## Superficie de cambio

| Archivo | Qué cambia |
|---|---|
| `src/lib/mcp/diagram-builder.ts` | `rankByFlow` pasa a ser por grupo y filtra aristas de mensaje; `layout()` se parte en dos estrategias (flujo / roles); ancho de banda por grupo; ancho de nodo variable; `routing` ortogonal al serializar |
| `src/lib/mcp/quality.ts` | `MAX_NAME_CHARS` derivado del ancho de caja; regla nueva `ETIQUETA-LARGA` |
| `src/lib/notations.ts` | sin cambios de datos: se consumen los roles ya declarados (`pool`, `start`, `end`, `actor`, `system`, `external`, `datastore`) |
| `.claude/skills/**` | los dos SKILL.md declaran los límites reales de nombre y etiqueta; regenerar embed |

## Decisiones

### D1 · Dos estrategias de layout, elegidas por los roles de la notación

`layout()` decide con el registro, no con un `if (notation === "bpmn")`:

```
tiene roles start/end  → layoutPorFlujo   (BPMN, UML de actividad/estados)
no los tiene           → layoutPorRol     (C4, DDD)
```

Así una notación nueva entra por el registro de roles y hereda la estrategia correcta (P6).

### D2 · El rango se calcula por grupo

`rankByFlow(ids, edges)` pasa a recibir **los ids de un solo grupo** (los elementos de una
banda) y las aristas **internas** a ese grupo. Elimina la propagación entre pools, que es la
causa raíz. Las columnas siguen siendo globales para que el flujo se alinee entre bandas,
pero el rango arranca en 0 en cada banda.

Aristas excluidas del ranking: `e.dashed === true` cuando la notación declara rol `pool`
(FR-002). En UML `dashed` es retorno y sí ordena.

### D3 · Anclaje de start/end

Tras rankear, se normaliza: rol `start` → columna 0; rol `end` → última columna del grupo.
Un evento de fin en mitad del carril es el síntoma más visible del bug actual.

### D4 · `layoutPorRol` para notaciones sin flujo

Filas por rol en orden fijo: `actor` → `system`/`datastore` → `external` → resto. Dentro de
cada fila, orden de inserción y reparto en rejilla con ancho máximo de columnas
(`MAX_COLS_POR_FILA = 6`) para no producir filas de un elemento (SC-004).

### D5 · Ancho de nodo variable

`nodeWidth(nombre)` = `clamp(NODE_W, NODE_W_MAX, ceil(chars / CHARS_POR_LINEA) …)`; el paso de
columna usa el ancho máximo real de la banda para que las columnas sigan alineadas.
`MAX_NAME_CHARS` deja de ser una constante suelta: se deriva de `NODE_W_MAX`.

### D6 · Ruteo ortogonal sólo entre contenedores

Al serializar (`toGraphData`), una arista cuyos extremos están en contenedores distintos —o
uno dentro y otro fuera— sale con `routing: "orthogonal"` si no traía uno explícito. Es el
caso de la diagonal que cruza el diagrama. Las aristas internas siguen como están.

### D7 · El anclaje de etiqueta no se toca aquí

Dónde se dibuja la etiqueta es del renderer (`DesignerCanvas`), fuera del alcance declarado
en el spec. Lo que sí se hace es acotar su LARGO (FR-008): una etiqueta corta sobre una arista
ortogonal ya no produce la mancha de texto. Si tras verificar sigue estorbando, se abre una
feature aparte para el renderer.

## Modelo de datos

Sin cambios en `DiagramModel` ni en `GraphData`. Sólo cambian los valores de `x`, `y`,
`width`, `height` y `routing` que produce la serialización — FR-010: mismos nodos, aristas y
contenedores antes y después.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Romper el layout swimlane que ya funcionaba para diagramas chicos | tests actuales de `layout()` se mantienen verdes; se agregan casos, no se relajan (P2) |
| El lienzo recalcula geometría al importar y anula el trabajo | se verifica con los 5 modelos reales exportados a la app antes de cerrar |
| Sobre-ajustar a los modelos de Geiser | los criterios de éxito son medidas geométricas generales (relación ancho/alto, columnas por banda), no valores de ese proyecto |

## Verificación

1. Tests unitarios de geometría en `src/lib/mcp/__tests__/diagram-builder.test.ts`.
2. Sonda sobre los 5 modelos REALES del workspace: medir SC-001…SC-004 antes/después.
3. `npm run gate` verde.
4. Re-exportar a la app y mirar el lienzo (US-1…US-6 son visuales).
