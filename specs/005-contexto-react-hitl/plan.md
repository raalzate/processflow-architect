# plan · 005 — El agente recupera el contexto por partes y consulta al humano

Diseño técnico de [spec.md](spec.md). **Sin dependencias nuevas.** Toda la lógica nueva es pura y
vive en `src/lib/ai/`, que es lo único con cobertura exigida (CONSTITUTION §P3); el contexto y el
chat sólo orquestan y pintan. El ruteo de IA no se toca (§P5).

## Superficie de cambio

| Archivo | Qué cambia |
|---|---|
| `src/lib/ai/` (módulo nuevo `agent-retrieval.ts`) | inventario de vistas, lectura de una vista, búsqueda en el modelo, resolución tolerante de nombres, contabilidad del presupuesto |
| `src/lib/ai/` (módulo nuevo `agent-run.ts`) | máquina de la corrida reanudable: estado serializable, decisión por paso, notas, cobertura y validación de citas |
| `src/lib/agent-types.ts` | tipos de la corrida (`AgentRunState`, `AgentPause`, `AgentNote`) y ampliación de `AgentStep` con los pasos nuevos |
| `src/lib/ai/litert-agent.ts` | el bucle pasa a delegar en `agent-run.ts`: herramientas de lectura, presupuesto, plan y preguntas; `MAX_TURNS` sube |
| `src/context/AgentContext.tsx` | pasa el catálogo de vistas al agente, persiste la corrida en espera, expone `resumeRun` / `cancelRun` |
| `src/components/ai-panel/AgentChatPanel.tsx` | tarjeta de plan (aprobar/ajustar/cancelar), tarjeta de pregunta (opciones), pasos de progreso |

## Modelo de datos

Tres piezas nuevas en `src/lib/agent-types.ts`. Todo **serializable** (va a `localStorage` con el
estado del chat) y sin ciclos.

```ts
/** Nota atribuida: lo que el agente sacó de UNA fuente. Memoria externa + progreso + citas. */
export interface AgentNote {
  source: { type: "view" | "model" | "document" | "artifact"; name: string };
  facts: string[];        // frases cortas, ya condensadas
  nodes?: string[];       // nodos citables de esa fuente
}

/** Por qué la corrida se detuvo y qué se le pide al humano. */
export type AgentPause =
  | { kind: "plan"; title: string; artifactKind: string; sections: { title: string; sources: string[] }[] }
  | { kind: "question"; id: string; text: string; options: string[] };

/** Estado de la corrida. Es lo que se persiste y lo que permite reanudar. */
export interface AgentRunState {
  id: string;
  goal: string;              // el pedido original del usuario
  turn: number;              // turnos consumidos
  budgetLeft: number;        // presupuesto de contexto restante (en caracteres)
  read: string[];            // vistas ya leídas (no se recobran ni se recobran de presupuesto)
  notes: AgentNote[];
  asked: string[];           // ids de preguntas ya hechas: una vez por corrida (FR-009)
  decisions: { questionId: string; answer: string }[];
  pause?: AgentPause;        // presente ⇔ la corrida está esperando al humano
  planApproved?: boolean;
  coverage?: { readViews: string[]; skippedViews: string[]; reason?: string };
}
```

`AgentStep` gana tipos: `read` · `search` · `plan` · `question` · `decision` · `consolidate`, además
de los tres actuales (`thought` · `action` · `observation`). Es un `enum` de Zod, así que el cambio es
una línea y la UI decide el ícono por tipo.

`ChatMessage` gana `run?: AgentRunState` — el mensaje del asistente que está esperando **es** el
portador de la corrida (FR-016). Al reanudar se actualiza en su lugar; al terminar se limpia y quedan
`steps` y `producedArtifactIds` como hoy.

## Decisiones

### D1 · Las herramientas de lectura reciben un CATÁLOGO, no el contexto de React

`agent-retrieval.ts` es puro: su entrada es un catálogo plano que el contexto arma una vez por turno.

```ts
export interface ViewEntry {
  name: string;
  notation: string;
  kind: "design" | "graph" | "mermaid";
  graph?: GraphData;      // "Modelo" trae el grafo del proyecto; las custom el suyo
  mermaidCode?: string;
  pinned?: boolean;       // ya inyectada a mano: no se relee (FR-017)
}
export interface Catalog { views: ViewEntry[] }
```

Así el módulo se prueba con objetos literales, sin React ni `localStorage`, y la misma función sirve
al agente local y —si algún día hace falta— a un tool remoto. El catálogo se deriva de
`ViewsContext` (`views`) + `graphData`: la vista «Modelo» toma el grafo del proyecto.

### D2 · Tres funciones, un contrato de resultado

```ts
listViews(cat: Catalog): { name; notation; nodes; edges; empty; pinned }[]
readView(cat: Catalog, name: string, budget: number): ToolResult
searchModel(cat: Catalog, term: string, limit?: number): ToolResult
```

`ToolResult` es `{ ok: true; text: string; cost: number; note: AgentNote }` o
`{ ok: false; error: string; suggestions?: string[] }`. Un solo tipo de retorno para las tres:
el bucle no necesita saber cuál llamó para decidir qué hacer con el resultado.

- El `text` de `readView` es TOON (`graphToToon`), recortado al presupuesto disponible; si el recorte
  ocurre, el texto lo dice y la `coverage` de la corrida lo registra.
- `searchModel` ordena por relevancia **determinista**: coincidencia exacta de nombre > prefijo >
  substring en nombre > substring en descripción > tipo; empate por orden del catálogo. Nada de
  puntajes flotantes que cambien entre corridas (los tests serían frágiles y el humano no podría
  reproducir lo que vio).
- `mermaid` como fuente: se entrega el código tal cual, acotado. Una vista Mermaid no tiene nodos que
  citar; su nota lleva `nodes: []`.

### D3 · La resolución de nombres es una función aparte y probada

```ts
resolveViewName(cat: Catalog, name: string): { name: string } | { suggestions: string[] }
```

Normaliza igual que `slugify` del constructor MCP (sin acentos, minúsculas, espacios colapsados) y,
si no hay coincidencia, sugiere por distancia de edición acotada (≤ 2 ediciones o prefijo común de
≥ 4 caracteres). El modelo local escribe los nombres de memoria: sin esto, «pagos» por «Pagos ·
Cobro» quema un turno y a veces la corrida entera (§P11: el error debe ser accionable).

### D4 · El presupuesto se mide en CARACTERES, no en tokens

No hay tokenizador disponible en el renderer sin cargar el modelo, y una cuenta aproximada de tokens
sería una mentira precisa. Se mide en caracteres de contexto —la unidad que ya usan los `clamp` de
`buildContext`— con un techo por corrida (`RUN_BUDGET`, por defecto 24 000) y por lectura
(`VIEW_READ_MAX`, 6 000). Releer una vista ya leída cuesta 0 y devuelve un aviso (FR-007).

### D5 · El bucle no decide: `agent-run.ts` decide

`litert-agent.ts` queda como el **adaptador del modelo** (prompt, parseo, streaming) y toda la
transición de estado vive en `agent-run.ts`:

```ts
applyToolCall(state, call, cat): { state: AgentRunState; observation: string }
needsPlan(state): boolean
approvePlan(state) / adjustPlan(state, feedback) / answerQuestion(state, answer)
consolidationPrompt(state): string      // notas + objetivo + cobertura, ya condensado
validateCitations(markdown, state): { ok: boolean; invalid: string[] }
```

Motivo: el bucle es lo único que no se puede probar sin modelo. Sacando las decisiones, la feature
queda cubierta por pruebas puras y el bucle se vuelve trivial (llamar, aplicar, seguir).

### D6 · El plan es un turno más, con su propio contrato

Cuando el modelo pide generar y `needsPlan(state)` es true, se le exige el JSON del plan
(`{"plan":{"title","artifactKind","sections":[{"title","sources"}]}}`) en vez de la acción. El plan
llega a la UI dentro de `pause`; el humano aprueba (sigue), ajusta (texto libre → el plan vuelve al
modelo como observación y se pide otro) o cancela (la corrida termina sin artefactos). **Las fuentes
del plan se validan contra el catálogo**: un plan que cita una vista inexistente se rechaza con
observación accionable antes de molestar al humano.

### D7 · Preguntas: una por tema, con supuesto por defecto

`{"question":{"id","text","options"}}`. El `id` es la clave de dedupe (FR-009): si ya está en
`state.asked`, la pregunta no se muestra y el bucle recibe la decisión previa como observación. La
primera opción es, por convención, el supuesto por defecto: responder «no sé» equivale a elegirla y
queda registrada como decisión con `assumed: true`, que la consolidación arrastra al artefacto.

### D8 · Consolidar con citas validadas

El turno final recibe `consolidationPrompt(state)`: objetivo + notas agrupadas por fuente +
decisiones + cobertura. El markdown que devuelve pasa por `validateCitations`, que exige que cada
cita `↳ Fuente › nodo` corresponda a una nota registrada. Si hay citas inválidas, se le devuelve la
lista y se le pide corregir **una vez**; si insiste, se emite el artefacto **sin** esas citas y con
una nota de cobertura. Nunca se guarda una cita inventada (riesgo del spec).

### D9 · Techo de turnos y agotamiento

`MAX_TURNS` sube de 5 a 12 (exploración + plan + consolidación) y aparece `MAX_TOOL_TURNS = 8` para
las lecturas. Al agotarse turnos o presupuesto **no** se cierra con «Listo.»: se fuerza el turno de
consolidación con lo que haya (FR-013). Es la misma red de seguridad que P8 exige para el lienzo,
aplicada al artefacto.

### D10 · Modo remoto/híbrido sin tocar el router

La corrida es agnóstica del motor: `agent-run.ts` no sabe quién ejecuta. El adaptador local ya existe;
para `hybrid`/`remote` la generación del artefacto sigue pasando por las `AiTask` actuales, que ya
rutean por `tier`/`structured`. Cero cambios en `router.ts` y `providers.ts` (SC-009).

### D11 · Qué expone el contexto al chat

`AgentContext` gana `resumeRun(messageId, answer)` y `cancelRun(messageId)`, y arma el catálogo con
`useMemo`. La persistencia no cambia de forma: `run` viaja dentro del `ChatMessage` en
`agent_state_<fileId>`.

La corrida se **valida al reanudar**, no al cargar: si el proyecto cambió y la vista que citaba el
plan ya no existe, se cancela con motivo visible (FR-016) en vez de reanudar sobre otro modelo. Al
cargar sería demasiado pronto —las vistas del proyecto llegan un tick después que el chat, así que un
chequeo en ese momento cancelaba corridas válidas; se detectó en la verificación manual (M4)—. La
regla de "fuente válida" es una sola función (`unknownPlanSources`) compartida con `registerPlan`:
con dos reglas, un plan legítimo que citaba un PDF adjunto se cancelaba solo.

### D12 · Lo que NO se guarda

El TOON leído no se persiste: sólo las notas. Un proyecto con 40 vistas leídas ocuparía cientos de KB
en `localStorage` y el estado del chat ya compite con el resto del proyecto por la cuota.

## Riesgos técnicos y cómo se acotan

| Riesgo | Acotación |
|---|---|
| El modelo local no emite el JSON del plan/pregunta | mismo rescate que ya existe (`salvageReply`, claves off-contract) + si tras 2 intentos no hay plan válido, se genera sin plan **declarándolo** en el chat |
| La corrida en espera bloquea el chat | el usuario puede escribir: un mensaje nuevo cancela la corrida en espera con aviso (no se acumulan corridas) |
| `localStorage` lleno con corridas | D12 (sólo notas) + al terminar la corrida se borra `run` del mensaje |
| Deriva de tipos entre `AgentStep` y la UI | el `enum` de Zod es la fuente; la UI mapea por tipo y el `default` pinta el ícono neutro (nada de `switch` exhaustivo que rompa el build al agregar un paso) |
| Reanudar sobre un proyecto cambiado | validación al cargar (D11) |

## Pruebas (P3)

`src/lib/ai/__tests__/agent-retrieval.test.ts`: inventario con conteos y vacías · lectura en TOON
con recorte · costo y no-recobro de presupuesto · relectura con aviso y costo 0 · búsqueda con orden
determinista y tope · búsqueda sin resultados · vista Mermaid · resolución tolerante (acentos,
mayúsculas, espacios) · sugerencias por distancia · vista pineada no releída. Objetivo ≥ 95 % stmts.

`src/lib/ai/__tests__/agent-run.test.ts`: `applyToolCall` para las tres herramientas y para una
inexistente · plan requerido antes de generar · plan con fuente inexistente rechazado · aprobar /
ajustar / cancelar · pregunta duplicada no se repite · «no sé» ⇒ supuesto por defecto declarado ·
consolidación con notas agrupadas · citas válidas e inválidas · agotamiento de turnos y de
presupuesto ⇒ consolidar · serialización ida y vuelta del estado. Objetivo ≥ 95 % stmts.

`litert-agent-run.test.ts` (existente, con la convo guionada) suma: corrida que lee dos vistas y
consolida · corrida que se detiene con plan y se reanuda aprobando · corrida que se detiene con
pregunta y se reanuda respondiendo · corrida cancelada no produce artefactos.

La UI (tarjetas de plan y pregunta) se verifica a mano con `npm run electron-dev`: en este repo no hay
runner de componentes, y eso ya está declarado como deuda en `STATUS.md`.
