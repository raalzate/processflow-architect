# IA, IA Local y las Nuevas Disciplinas de Ingeniería

### Cómo lo estamos aplicando en *Processflow Architect*

> Charla técnica · Event Storming asistido por IA **local por defecto**
> Proyecto: app de escritorio (Electron + Next.js) con IA que corre en la máquina del usuario (LiteRT-LM sobre WebGPU).

---

## 0. Punto de partida: ¿de qué hablamos?

Durante dos años "usar IA" fue sinónimo de "mandar un prompt a la nube". Ese modelo se está rompiendo por tres frentes:

1. **Privacidad y costo** — cada token es un dato que sale de la organización y una factura que crece.
2. **Latencia y offline** — un arquitecto diseñando un dominio no puede depender de la red.
3. **Control** — queremos decidir *qué* modelo, *dónde* corre y *cuándo* interviene un humano.

La respuesta de este proyecto: **IA local por defecto, nube opt-in**, y un conjunto de disciplinas de ingeniería alrededor del modelo. No basta con "tener un LLM"; hay que rodearlo de estructura. Esa estructura es lo que llamamos *prompt / context / intent / flow / loop / harness engineering* + *human-in-the-loop*.

Esta charla recorre cada disciplina **con el código real del proyecto** como ejemplo.

---

## 1. IA Local: la decisión de arquitectura

**Regla del proyecto:** el motor de IA es **local por defecto**; la nube es *opt-in* y está apagada hasta que el usuario ponga su propia llave.

- Motor local: **LiteRT-LM** corriendo en el *renderer* de Electron sobre **WebGPU** (siempre disponible, offline, gratis).
- Motor remoto (opcional): Gemini / OpenAI / Anthropic vía `fetch` nativo desde el **proceso main** — nunca desde el renderer.

Tres modos de operación (`src/lib/ai/remote-settings.ts`):

```ts
export type AiMode = "local" | "remote" | "hybrid";
// local  → todo en el modelo local.
// remote → todo en el proveedor de nube elegido.
// hybrid → local para sugerencias ligeras; nube para lo complejo o entradas grandes.

export const DEFAULT_AI_SETTINGS: AiRemoteSettings = {
  mode: "local",          // ← el default es local. No se cambia sin pedirlo el usuario.
  provider: "gemini",
  models: {},
};
```

**Seguridad de llaves** — no es un detalle, es parte del diseño:

- Las API keys se guardan **cifradas con `safeStorage`** en el proceso main (`userData/ai-keys.json`).
- **Nunca** llegan al renderer, **nunca** se loguean.
- Las peticiones HTTP a los proveedores se hacen **solo en el main**.

> **Takeaway:** "IA local" no es solo elegir un modelo pequeño. Es una decisión de arquitectura completa: dónde corre el cómputo, dónde viven los secretos, qué sale de la máquina y qué no.

---

## 2. 🕸️ La jugada estratégica: el grafo COMO contexto

> Esta es la tesis central de la charla. Todo lo táctico (prompt, router, loop…) existe para servir esta idea.

La pregunta estratégica no es *"¿qué modelo uso?"* sino *"¿cómo le doy el mundo al modelo?"*. Y la respuesta del proyecto es: **no le des prosa, dale un grafo.**

Un diagrama de Event Storming / DDD no es un dibujo bonito. Es **contexto estructurado**: un conjunto de nodos tipados (`Comando`, `Evento`, `Agregado`…) y aristas con relación explícita (`produce`, `dispara`, `invoca`). Esa estructura cambia radicalmente lo que la IA puede hacer — y es *precisamente* lo que hace viable la IA local.

### El argumento en una imagen

```
PROSA (contexto no estructurado)          GRAFO (contexto estructurado)
─────────────────────────────            ──────────────────────────────
"Cuando el cliente registra un            Registrar Pago ──produce──▶ Pago Registrado
pago, se genera el evento de pago                                        │
registrado, que a su vez dispara                                      dispara
la actualización de la cartera y                                        ▼
notifica a cobranza..."                   Actualizar Cartera ◀──── (Política)

El modelo debe LEER, inferir las           Las relaciones YA están resueltas.
entidades, deducir las relaciones          El modelo solo razona SOBRE ellas.
y recién ahí razonar. Dos trabajos.        Un solo trabajo.
```

### Por qué esto mejora las respuestas de la IA

1. **El grafo es razonamiento pre-computado.** En prosa, las relaciones están *implícitas* — el modelo tiene que inferir "qué causa qué" antes de poder responder. En un grafo, la relación `A --produce--> B` ya está resuelta por un humano (o por una corrida previa). El modelo no gasta capacidad *descubriendo* la estructura; la gasta *razonando sobre* ella.

2. **Separa dos trabajos que la prosa mezcla.** Entender la estructura y razonar sobre el dominio son tareas distintas. La prosa obliga al modelo a hacer ambas en un solo paso. El grafo hace la primera por él → toda la "inteligencia" del modelo se concentra en la segunda.

3. **Ancla el Lenguaje Ubicuo → menos alucinación.** Los nodos tienen nombres reales del negocio ("Cartera", "Registrar Pago"). Cuando el modelo genera drivers o un ADR, *reusa esos nombres* en vez de inventar sinónimos. La superficie de alucinación se reduce porque el vocabulario ya está fijado en el contexto.

4. **Es denso en información por token.** Un grafo `{nodes, edges}` codifica en 300 tokens lo que en prosa ocuparía dos páginas. Con una ventana de contexto pequeña, esa **densidad es oro**: cabe más dominio en menos espacio.

### Por qué esto es lo que HABILITA la IA local (el puente estratégico)

Este es el punto que une todo:

> Un modelo local pequeño (2–4B) tiene un **presupuesto de razonamiento escaso**: pocos parámetros y una ventana de contexto chica. No puedes hacerlo más inteligente. Pero **puedes hacer su contexto más inteligente.**

| | Modelo grande en nube + prosa | Modelo local pequeño + grafo |
|---|---|---|
| Quién resuelve la **estructura** | El modelo (le sobra capacidad) | El **grafo** (ya viene resuelta) |
| En qué gasta el modelo su capacidad | Estructura **+** razonamiento | Solo **razonamiento** |
| Tokens de contexto necesarios | Muchos (prosa) | Pocos (grafo denso) |
| Riesgo de deriva de vocabulario | Alto | Bajo (Lenguaje Ubicuo anclado) |
| ¿Privado / offline / gratis? | No | **Sí** |

La estrategia del grafo **compensa la debilidad del modelo local con estructura**. No competimos con GPT-4 haciendo un modelo mejor; competimos **moviendo el trabajo difícil (estructurar el dominio) fuera del modelo y hacia el grafo**. El resultado: un modelo de 4B produce drivers, ADRs y diagramas *útiles* sobre *tu* dominio — algo impensable si le tiras un PDF crudo y esperas magia.

### El círculo virtuoso (bidireccional)

La relación IA↔grafo va en dos sentidos y **se retroalimenta**:

```
        lee como contexto
   ┌──────────────────────────┐
   │                          ▼
 GRAFO                    IA LOCAL
(dominio                 (razona con
estructurado)            poco presupuesto)
   ▲                          │
   │   produce artefactos     │
   └──────────────────────────┘
     (drivers, ADRs, C4…) que
      enriquecen el modelo
```

Cuanto más rico el grafo → mejor el contexto → mejores respuestas → más artefactos que refinan el entendimiento del dominio → grafo más rico. **El activo estratégico no son los pesos del modelo (intercambiables); es el modelo de dominio estructurado que el equipo construye.** Ese es el *moat*.

> **Takeaway estratégico:** con IA en la nube, el contexto puede ser descuidado porque el modelo es potente. Con IA local, **el contexto ES la estrategia**. El grafo convierte un modelo débil pero privado en un asistente de dominio competente — porque le entrega el mundo ya estructurado, no en prosa que tendría que descifrar. Trabajar los diagramas no es "documentar bonito": es *construir el contexto que hace posible la IA local*.

---

## 3. 🗣️ Prompt Engineering

**Definición:** diseñar instrucciones para que la IA produzca resultados útiles.

**Realidad con modelos locales pequeños:** un modelo de 2–4B parámetros se *sesga* y *alucina* mucho más que GPT-4. El prompt tiene que ser una jaula, no una sugerencia.

### Cómo lo hacemos

Los prompts viven **separados de la lógica**, como funciones puras testeables, en `src/lib/template-prompt.ts`. Ejemplo: describir un nodo de Event Storming.

```ts
export const promptDescribeNode = (tipo, nombre, descripcion) => {
  const hint = NODE_TYPE_HINT[tipo] || "un elemento del modelo de dominio";
  return `Eres analista DDD/Event Storming. ${tarea}
El elemento es de tipo "${tipo}" (es decir, ${hint}). Descríbelo SEGÚN ESE TIPO.
Reglas ESTRICTAS:
- UNA sola frase, máximo 22 palabras, en español.
- NO digas "componente del modelo de dominio de software" ni hables de software genérico.
- Sin comillas, sin preámbulos. Responde solo la frase.`;
};
```

**Técnicas de prompt que aparecen aquí y por qué:**

| Técnica | En el código | Por qué |
|---|---|---|
| **Asignar un rol** | `"Eres analista DDD/Event Storming"` | Ancla el vocabulario del modelo |
| **Inyectar una definición (hint)** | `NODE_TYPE_HINT[tipo]` | Un modelo chico se sesga a "componente de software" si no le anclas el tipo |
| **Reglas negativas explícitas** | `NO digas "componente..."` | Los modelos pequeños repiten muletillas; hay que prohibirlas |
| **Formato de salida rígido** | `TIPO \| NOMBRE \| RELACION` en `promptSuggestNext` | Facilita el *parsing* determinista posterior |
| **System prompt conciso** | `SYSTEM_PROMPT_DESIGNER` | "sin preámbulos, sin comillas, sin explicar tu razonamiento" |

**Defensa en la salida:** nunca confiamos en que el modelo obedezca. Cada tarea trae su `parse()` que limpia lo que el modelo *igual* devuelve mal:

```ts
// El modelo local suele devolver `  "texto"  `. Trim → quita comillas → trim.
const stripQuotes = (s) => s.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
```

### Ejemplo concreto, de punta a punta

Situación real: el usuario crea un nodo llamado **"Aprobar Reembolso"** sin elegir el tipo, y pulsa "clasificar con IA". Se dispara `classifyTypeTask`.

**1. Entrada (lo que sabe la app):**
```ts
{ nombre: "Aprobar Reembolso", descripcion: "" }
```

**2. Prompt que se construye** (`promptClassifyType` con la lista real `NODE_TYPES`):
```text
Eres analista DDD/Event Storming. Clasifica este elemento eligiendo UNO de estos tipos:
Actor, Sistema Externo, Hotspot, Comando, Evento, Política, Entidad Raíz, Agregado,
Read Model, Vista, Proyección, Regla de Negocio, Política de UI, Raíz de Agregado,
Entidad, Objeto de Valor, Servicio de Dominio, Repositorio, Fábrica
Nombre: Aprobar Reembolso
Descripción: (sin descripción)
Pistas: un Comando es una acción/intención; un Evento es un hecho ya ocurrido; ...
Responde SOLO con el nombre EXACTO del tipo, sin nada más.
```

**3. Lo que devuelve el modelo local** (sucio — así responde de verdad un modelo pequeño):
```text
  "Comando"
```
o incluso `El tipo correcto es: Comando.`

**4. El parser lo domestica** (`parse` de la tarea):
```ts
const clean = stripQuotes(raw).toLowerCase();          // 'comando'
return NODE_TYPES.find((t) => clean === t.toLowerCase())        // "Comando" ✓
    || NODE_TYPES.find((t) => clean.includes(t.toLowerCase()))  // rescate: 'el tipo... comando'
    || "";                                                       // si nada casa, vacío (no rompe)
```

**5. Resultado final tipado:** `"Comando"` → se pinta el nodo como Comando (amarillo). Si el modelo hubiera alucinado `"Acción"` (no está en `NODE_TYPES`), el parser devuelve `""` y la UI simplemente no cambia el tipo. **Nunca** entra basura al modelo de dominio.

> **Takeaway:** con IA local, el prompt engineering va acompañado *siempre* de *output parsing* defensivo. El prompt reduce el error; el parser lo tolera. Fíjate que el `.includes()` es un *segundo intento* de rescate, y el `|| ""` es la red final: tres capas para una tarea trivial.

---

## 4. 🧠 Context Engineering

**Definición:** darle a la IA el contexto, los datos y las reglas de negocio necesarias para tomar mejores decisiones.

Un LLM sin contexto inventa. La calidad de la respuesta ≈ calidad del contexto que le montaste. Esto es *el* diferenciador entre una demo y un producto.

### Cómo lo hacemos

**(a) Material de referencia del proyecto** — los documentos que el usuario sube se anteponen a cada sugerencia para que el modelo use la terminología real del dominio:

```ts
export const withReference = (prompt, referencia) =>
  referencia?.trim()
    ? `MATERIAL DE REFERENCIA del proyecto (úsalo como fuente de dominio:
respeta su terminología y nombres; priorízalos sobre suposiciones):
"""${referencia.trim()}"""

${prompt}`
    : prompt;
```

**(b) Contexto ensamblado para el agente** — el ReAct agent (`litert-agent.ts`) construye un contexto estructurado a partir de *todo* lo que sabe la app, con recortes (`clamp`) para no reventar la ventana del modelo:

```ts
function buildContext(input) {
  let ctx = "";
  if (input.graphData)        ctx += `### Modelo de dominio actual (SOLO LECTURA)\n${clamp(JSON.stringify(input.graphData), 8000)}`;
  if (input.views?.length)    ctx += `### Vistas del diseñador\n...`;
  if (input.contextArtifacts) ctx += `### Artefactos en contexto\n...`;      // clamp 3000
  if (docs.length)            ctx += `### Documentos adjuntos (fuente principal)\n...`;  // clamp 12000
  return ctx;
}
```

**(c) Contexto que elige el usuario, no la máquina** — en el chat (`AgentChatPanel.tsx`):
- `@nombre-vista` inyecta una vista del diseñador como contexto.
- Chips de "Artefactos en contexto" y "Documentos adjuntos".
- El usuario decide *qué* ve el modelo → contexto curado, no basura.

### Ejemplo concreto: qué "ve" realmente el modelo

Situación real: el usuario adjunta `Proyecto_Geiser.pdf`, tiene una vista "Cobranza" en el diseñador y pide *"genera los drivers de arquitectura"*. Esto es lo que `buildContext` **arma y le pasa al modelo** (recortado con `clamp`):

```text
### Modelo de dominio actual (SOLO LECTURA)
{"nodes":[{"nombre":"Registrar Pago","tipo":"Comando"},
{"nombre":"Pago Registrado","tipo":"Evento"},
{"nombre":"Cartera","tipo":"Agregado"}, ...]}          ← recortado a 8000 chars

### Vistas del diseñador
- Cobranza (graph, ddd)
- Aplicación de Pagos (graph, bpmn)

### Documentos adjuntos (fuente principal — léelos y básate en su contenido)
#### Proyecto_Geiser.pdf
El sistema de cobranza gestiona la cartera vencida... [texto extraído del PDF]  ← recortado a 12000 chars
```

**Las decisiones de context engineering, visibles en ese texto:**

| Decisión | En el ejemplo | Por qué |
|---|---|---|
| **Jerarquía por confiabilidad** | PDF = "fuente principal"; modelo = "SOLO LECTURA" | El modelo debe priorizar el documento del usuario sobre suposiciones |
| **Presupuesto por sección** | 8000 chars al grafo, 12000 al PDF, 3000 a artefactos | La ventana es finita; el PDF gana más espacio porque es la fuente |
| **Lenguaje Ubicuo inyectado** | Nombres reales: "Registrar Pago", "Cartera" | El modelo genera drivers usando *los nombres del negocio*, no inventados |
| **Curación humana** | Solo la vista "Cobranza" se inyectó (vía `@`) | El usuario decide qué entra; no se vuelca todo |

> **Takeaway:** context engineering es priorización bajo presupuesto de tokens. Nótese el `clamp(..., 8000)`: el modelo local tiene una ventana finita, así que el contexto se *jerarquiza* (documentos adjuntos = "fuente principal", modelo = "solo lectura") y se *recorta*. El orden y las etiquetas ("fuente principal") no son decorativos: le dicen al modelo *a qué hacer caso primero*.

---

## 5. 🎯 Intent Engineering

**Definición:** traducir necesidades de negocio en objetivos claros que un agente de IA pueda ejecutar.

El usuario dice "necesito entender este sistema". Eso no es ejecutable. Hay que convertirlo en *tareas con contrato*.

### Cómo lo hacemos

**Cada capacidad de IA es una `AiTask` declarativa** (`src/lib/ai/tasks.ts`). Una tarea es un contrato: entrada tipada → prompt → parser → salida tipada.

```ts
export const classifyTypeTask: AiTask<{ nombre; descripcion?; referencia? }, string> = {
  id: "classify-type",
  tier: "light",                              // intención de costo/complejidad
  maxLocalChars: 800,                         // límite operativo
  buildPrompt: (i) => ({ prompt: ..., system: SYSTEM_PROMPT_DESIGNER }),
  parse: (raw) => {                           // valida contra el dominio real
    const clean = stripQuotes(raw).toLowerCase();
    return NODE_TYPES.find((t) => clean === t.toLowerCase())
        || NODE_TYPES.find((t) => clean.includes(t.toLowerCase())) || "";
  },
};
```

**Regla del proyecto:** *añadir una función de IA = declarar una `AiTask`, nada más.* No se toca el router ni los proveedores. La intención ("clasificar un tipo DDD") queda encapsulada y aislada del *cómo* se ejecuta.

En el agente, la intención del usuario se traduce a **acciones concretas de un menú cerrado** (`toolMenu()`): `generate_document`, `generate_diagram` con un `kind` del catálogo. El lenguaje natural entra; una intención ejecutable y verificable sale.

### Ejemplo concreto: de "quiero X" a intención ejecutable

Intención de negocio difusa → tarea con contrato:

| Necesidad del usuario (difusa) | Intención declarada (`AiTask`) | Contrato |
|---|---|---|
| "no sé qué tipo poner a este nodo" | `classifyTypeTask` | `{nombre, descripcion} → string ∈ NODE_TYPES` |
| "ponme un nombre decente" | `suggestNameTask` | `{tipo, descripcion} → string` (2–5 palabras) |
| "¿qué sigue en el flujo?" | `suggestNextTask` | `{tipo, nombre} → {tipo, nombre, relacion}` |
| "diséñame el sistema completo" | agente ReAct → menú de `kind`s | lenguaje natural → artefactos |

Para el agente, la intención libre se **acota a un menú cerrado de acciones verificables** (`toolMenu()`): el modelo no puede "hacer cualquier cosa", solo elegir un `kind` del catálogo real (`drivers`, `constraints`, `proposal`, `roadmap`, `adr`, `c4-container`, `sequence-diagram`, …). Esto convierte una petición ambigua en una operación con resultado inspeccionable.

**Añadir una intención nueva** (p. ej. "sugiéreme métricas SLO") = una entrada más en `tasks.ts`. Cero cambios en router, providers o UI:
```ts
export const suggestSloTask: AiTask<{ servicio: string }, string[]> = {
  id: "suggest-slo", tier: "light", maxLocalChars: 500,
  buildPrompt: (i) => ({ prompt: promptSuggestSlo(i.servicio), system: SYSTEM_PROMPT_DESIGNER }),
  parse: (raw) => stripQuotes(raw).split(/[,\n]/).map(s => s.trim()).filter(Boolean),
};
```

> **Takeaway:** el intent engineering aquí toma forma de *tipos*. `AiTask<Input, Output>` obliga a nombrar la intención, su entrada y su salida antes de escribir una línea de modelo. Es el contrato lo que hace la intención ejecutable.

---

## 6. 🌊 Flow Engineering

**Definición:** orquestar modelos, agentes, APIs y herramientas para automatizar procesos de extremo a extremo.

Aquí es donde "tengo varios modelos y herramientas" se vuelve "tengo un sistema".

### Cómo lo hacemos: el Router

El corazón del flow es `src/lib/ai/router.ts`. Decide **qué motor** atiende cada tarea, con una política explícita y *fallback asimétrico*:

```ts
// 1. Complejo / estructurado → remoto (sin degradar a local).
if (task.tier === "heavy" || task.structured) {
  if (remote) return { provider: "remote", reason: "tarea compleja/estructurada → remoto" };
  return { provider: null, reason: "tarea compleja sin IA remota (configura la API key)" };
}
// 2. Ligera → local primero…
const tooBig = task.maxLocalChars != null && inputSize > task.maxLocalChars;
if (!tooBig && local) return { provider: "local", reason: "tarea ligera → local" };
// 3. Fallback: local no da (no disponible o entrada grande) → remoto.
if (runnableRemote && remote) return { provider: "remote", fellBack: true, reason: "..." };
```

**Las reglas del flujo, en prosa:**
- Tarea *pesada* o *estructurada* (JSON con esquema) → **nube**. El modelo local pequeño **nunca** recibe trabajo que no puede hacer.
- Tarea *ligera* → **local** (corto, frecuente, gratis, offline)… salvo que la entrada exceda `maxLocalChars` → **nube**.
- **Fallback asimétrico:** una tarea ligera *puede degradar* a la nube si el local no está; una pesada **no puede degradar** a local (no le da la capacidad) → error claro.

**Desacople total** — los componentes de UI no saben qué motor corre. Llaman a un único hook (`useAi.ts`):

```ts
const res = await route(task, input, { mode, provider, model });
```

`UI → useAi → route → providers`. Añadir un motor nuevo = añadir un proveedor. Nada más cambia. *Eso* es flow engineering: la orquestación es un punto único, versionable y testeable.

### Ejemplo concreto: la misma tarea, tres decisiones distintas

`describeNodeTask` (`tier: "light"`, `maxLocalChars: 600`). Veamos cómo el router la enruta según el estado, en **modo híbrido**:

**Caso A — entrada corta, hay modelo local:**
```ts
chooseProvider(describeNodeTask, /* inputSize */ 140, { mode: "hybrid" })
// → { provider: "local", fellBack: false, reason: "tarea ligera → local" }
```
Corre gratis y offline. El 95% de las sugerencias del diseñador caen aquí.

**Caso B — el usuario pegó una descripción enorme (900 chars > 600):**
```ts
chooseProvider(describeNodeTask, /* inputSize */ 900, { mode: "hybrid" })
// tooBig = true  → local no da  → busca remoto
// → { provider: "remote", fellBack: true, reason: "entrada grande → remoto" }
```
`fellBack: true` → la UI muestra un *toast*: "Motor de IA alterno: se usó la IA remota como respaldo." El usuario se entera de que salió a la nube.

**Caso C — una tarea pesada sin llave configurada:**
```ts
chooseProvider(proposalTask /* tier: "heavy" */, 2000, { mode: "hybrid" })
// heavy → remoto, pero remote = false (sin API key)
// → { provider: null, reason: "tarea compleja sin IA remota disponible (configura la API key)" }
```
`provider: null` → `route()` lanza un error con *esa* razón exacta. El modelo local pequeño **jamás** recibe una tarea de razonamiento complejo que no puede hacer (eso es el *fallback asimétrico*).

**El contrato de retorno** hace todo esto auditable:
```ts
interface RouteResult { provider; fellBack; reason; output; }
//                       ↑ dónde     ↑ ¿fue    ↑ por qué  ↑ el resultado
//                         corrió      respaldo?  esa ruta
```

> **Takeaway:** el flow no es un `if` disperso por la app. Es una **política declarada en un solo lugar** con un contrato (`RouteResult` incluye `provider`, `fellBack`, `reason`) — sabes siempre *por qué* corrió donde corrió. Y como `chooseProvider` es una función pura, esos tres casos son *tres tests* (ver §9).

---

## 7. 🔁 Loop Engineering

**Definición:** diseñar ciclos iterativos donde los agentes planifican, ejecutan, evalúan resultados y refinan hasta alcanzar un objetivo.

Un solo prompt no resuelve una tarea compleja. Se necesita un **bucle Razonamiento → Acción → Observación** (patrón *ReAct*).

### Cómo lo hacemos: el ReAct Agent local

`src/lib/ai/litert-agent.ts` implementa el bucle **en el renderer, sobre el modelo local**. El modelo emite **una acción JSON por turno**; ejecutamos la herramienta; le devolvemos la observación; repetimos hasta `{"final": "..."}`.

```ts
const MAX_TURNS = 5;                          // ← cota dura: no hay bucles infinitos

for (let turn = 0; turn < MAX_TURNS; turn++) {
  const prompt = input.message +
    (transcript.length ? `\n### Acciones y observaciones previas\n${transcript.join("\n")}` : "") +
    `\nResponde con el JSON de la próxima acción, o {"final":"..."} si ya puedes responder.`;

  const raw = await litertGenerate(input.modelFile, [{ role: "system", content: system }, ...]);
  const parsed = parseJson(raw);

  if (parsed.final != null || !parsed.action) { reply = String(parsed.final); break; }  // ← salida

  // Ejecuta la acción, captura la observación, la mete al transcript → próximo turno.
  const md = await genDocument(...);
  transcript.push(`Acción: generate_document ${kind}\nObservación: documento generado.`);
}
```

**Decisiones de ingeniería del bucle (todas importan):**

1. **Cota de turnos** (`MAX_TURNS = 5`) — un agente sin límite es un incidente de producción. El bucle *siempre* termina.
2. **Memoria de trabajo** — el `transcript` acumula acciones+observaciones y se re-inyecta cada turno. El modelo *ve su propio historial*.
3. **Parsing tolerante a fallos** — modelos pequeños producen JSON malo. Tenemos capas: `parseJson` (quita fences, comas colgantes), y si falla, `extractField(raw, "final")` rescata la respuesta por regex.
4. **Trazabilidad** — cada paso se guarda como `thought`/`action`/`observation` y se muestra al usuario ("Razonamiento — 3 pasos").

### Ejemplo concreto: una corrida completa del bucle

El usuario escribe: *"Genera los drivers de arquitectura y luego un diagrama C4 de contenedores."* Esto es lo que ocurre turno a turno (lo que emite el modelo ↔ lo que hace el bucle):

**Turno 0** — el modelo planifica y pide la primera herramienta:
```json
{"thought":"Primero extraigo los drivers del contexto del dominio.",
 "action":"generate_document",
 "args":{"kind":"drivers","title":"Drivers de Arquitectura","instructions":"a partir del modelo y el PDF"}}
```
El bucle ejecuta `genDocument("drivers", ...)`, crea el artefacto y **anexa al transcript**:
```text
Acción: generate_document drivers (Drivers de Arquitectura)
Observación: documento generado.
```

**Turno 1** — el modelo *ve su propio historial* y encadena la segunda acción:
```json
{"thought":"Ya tengo los drivers; ahora el C4 de contenedores.",
 "action":"generate_diagram",
 "args":{"kind":"c4-container","title":"C4 - Contenedores","instructions":"backend, DB, frontend"}}
```
Ejecuta `genDiagram("c4-container", ...)` → Mermaid → artefacto. Transcript actualizado.

**Turno 2** — no queda nada por hacer, el modelo cierra:
```json
{"thought":"Completé ambos artefactos.",
 "final":"Listo: generé los Drivers de Arquitectura y el diagrama C4 de Contenedores en el lienzo."}
```
`parsed.final != null` → `break`. Fin del bucle en 3 turnos (de un máximo de 5).

**Lo que ve el usuario** (los `steps[]` renderizados en el panel — §9):
```
🧠 Primero extraigo los drivers del contexto del dominio.
🔧 generate_document · Drivers de Arquitectura (drivers)
👁 Documento "Drivers de Arquitectura" generado.
🧠 Ya tengo los drivers; ahora el C4 de contenedores.
🔧 generate_diagram · C4 - Contenedores (c4-container)
👁 Diagrama "C4 - Contenedores" generado.
```

**¿Y si el modelo devuelve JSON roto?** (pasa seguido con modelos pequeños). Ejemplo real de salida corrupta:
```text
{"thought":"...","final":"Generé los drivers.",}   ← coma colgante + posible "}
```
- `parseJson` prueba primero tal cual, luego `stripTrailingCommas` → recupera el objeto.
- Si *aun así* falla, `extractField(raw, "final")` saca el texto por regex.
- Si todo falla, se muestra el texto crudo. **El bucle nunca lanza una excepción hacia la UI.**

> **Takeaway:** loop engineering local = tolerancia a fallos + cota dura + memoria de trabajo. El modelo pequeño *va a* devolver basura a veces; el bucle está diseñado para no romperse cuando eso pasa. El `transcript` es lo que convierte 3 llamadas aisladas en *un agente* que razona sobre sus propios resultados.

---

## 8. 🔁 Human-in-the-Loop

**Definición:** definir cuándo debe intervenir una persona para validar decisiones y mejorar la calidad del sistema.

Con IA local (más propensa a error) esto no es opcional: **el humano es parte del sistema de calidad.**

### Cómo lo hacemos

El principio de diseño clave del proyecto: **la IA sugiere; el humano dispone.** Concretamente:

- **La IA nunca edita el lienzo.** El agente ReAct *solo lee* contexto y *produce artefactos* (documentos/diagramas) que aparecen aparte. Comentario textual del código:
  ```ts
  // NO edita el lienzo: solo lee contexto (graphData/vistas/artefactos) y produce artefactos.
  ```
- **Salidas editables, no finales.** Las sugerencias del diseñador (nombre, tipo, descripción) llegan como borrador que el usuario acepta, edita o descarta.
- **El usuario cura el contexto** (§4): decide qué vistas/documentos ve el modelo con `@menciones` y chips.
- **Trazabilidad visible** — el panel muestra el razonamiento paso a paso, así el humano *audita* la decisión, no solo el resultado.
- **Consentimiento explícito para la nube** — nada sale de la máquina hasta que el usuario activa el modo remoto y pone su llave. El default (`mode: "local"`) es la postura conservadora.
- **Avisos de degradación** — cuando el router hace fallback, un *toast* le dice al usuario qué motor se usó de respaldo (`res.fellBack` en `useAi.ts`).

### Ejemplo concreto: dónde está la frontera

Comparación de dos diseños posibles para "el agente genera los drivers":

| Diseño ingenuo (IA decide) | Diseño del proyecto (IA sugiere) |
|---|---|
| El agente **escribe** los drivers en el lienzo | El agente **produce un artefacto aparte**; el lienzo no se toca |
| El resultado es final | El resultado es un borrador editable/descartable |
| El usuario ve solo el output | El usuario ve `steps[]`: pensamiento → acción → observación |
| Todo va a la nube "porque es mejor" | `mode:"local"` por defecto; la nube exige llave + activación |

El comentario en el propio código marca la frontera dura:
```ts
// NO edita el lienzo: solo lee contexto (graphData/vistas/artefactos) y produce artefactos.
```

Y la degradación se le **avisa** al usuario, no se oculta (`useAi.ts`):
```ts
if (res.fellBack) toast({ title: "Motor de IA alterno",
  description: `Se usó ${res.provider === "local" ? "la IA local" : "la IA remota"} como respaldo.` });
```

> **Takeaway:** human-in-the-loop no es un botón de "aprobar". Es un conjunto de fronteras de diseño: qué puede tocar la IA (nada crítico), qué ve el usuario (todo el razonamiento) y qué requiere consentimiento (salir a la nube).

---

## 9. 🧪 Harness Engineering

**Definición:** diseñar entornos de prueba, evaluación y observabilidad para validar que agentes y aplicaciones de IA funcionen de forma confiable.

Sin *harness* no sabes si tu sistema de IA funciona; solo *crees* que funciona. Este es el punto más descuidado en la industria y el que separa un prototipo de un producto.

### Cómo lo hacemos

**(a) La lógica pura es lo único con cobertura exigida.** Regla del proyecto: *la lógica va en `src/lib/` (sin React, sin Electron); es lo único con cobertura exigida.* Los componentes orquestan; `lib/` decide → y `lib/` se testea.

**(b) TDD para toda función de IA.** Tests junto al módulo, en `__tests__/`:

```
src/lib/ai/__tests__/router.test.ts    ← la política de enrutamiento
src/lib/ai/__tests__/tasks.test.ts     ← cada AiTask: prompt + parser
src/lib/__tests__/template-prompt.test.ts
```

Como el router y los parsers son **funciones puras deterministas**, se testean *sin llamar al modelo*. Ejemplo del tipo de aserción posible sobre `chooseProvider`:
- tarea `heavy` + sin remoto → `provider: null` con razón clara.
- tarea `light` + entrada > `maxLocalChars` → cae a remoto con `fellBack: true`.
- modo `local` → nunca elige remoto.

Esto es *evaluación del harness*, no del modelo: verifica que la **orquestación** haga lo correcto ante cada combinación de estado.

**Ejemplo concreto — testear el router SIN encender el modelo** (los tres casos de §6 son tres tests):
```ts
describe("chooseProvider (política de enrutamiento)", () => {
  it("tarea ligera con local disponible → local", () => {
    const r = chooseProvider(describeNodeTask, 140, { mode: "hybrid" });
    expect(r.provider).toBe("local");
    expect(r.fellBack).toBe(false);
  });

  it("entrada > maxLocalChars → cae a remoto con aviso", () => {
    const r = chooseProvider(describeNodeTask, 900, { mode: "hybrid" });
    expect(r.provider).toBe("remote");
    expect(r.fellBack).toBe(true);              // ← la UI mostrará el toast
  });

  it("tarea heavy sin llave → null con razón clara", () => {
    const r = chooseProvider(proposalTask, 2000, { mode: "hybrid" });
    expect(r.provider).toBeNull();
    expect(r.reason).toMatch(/API key/);
  });

  it("modo local NUNCA sale a la nube", () => {
    expect(chooseProvider(proposalTask, 5000, { mode: "local" }).provider).not.toBe("remote");
  });
});
```

**Ejemplo concreto — testear el parser con salidas SUCIAS reales del modelo** (esto es *eval* del contrato, no del LLM):
```ts
describe("classifyTypeTask.parse", () => {
  it("limpia comillas y espacios", () => {
    expect(classifyTypeTask.parse(`  "Comando"  `)).toBe("Comando");
  });
  it("rescata el tipo dentro de prosa", () => {
    expect(classifyTypeTask.parse("El tipo correcto es: Comando.")).toBe("Comando");
  });
  it("descarta alucinaciones fuera de NODE_TYPES", () => {
    expect(classifyTypeTask.parse("Acción")).toBe("");   // ← no contamina el dominio
  });
});
```
Ninguno de estos tests llama al modelo. Fijan el comportamiento del *harness* ante las salidas que sabemos que el modelo produce.

**(c) Gates de CI** — antes de dar algo por terminado:

```bash
npm run typecheck      # tsc renderer + electron
npm test               # vitest (todas las pruebas pasan)
npm run test:coverage  # mismo gate que CI
```

CI corre typecheck + pruebas con cobertura en cada push/PR. No se mergea en rojo.

**(d) Observabilidad del agente** — cada corrida del ReAct agent devuelve `steps[]` (thoughts/actions/observations) que se renderizan en la UI. Es *tracing* de agente: cuando algo sale mal, ves *dónde* del bucle.

### Cómo evaluar IA (la parte que falta en la industria)

El testing tradicional asume salidas deterministas. Un LLM no lo es. Estrategia por capas:

| Capa | Qué evalúa | Cómo (determinista) |
|---|---|---|
| **Parsers** (`parse`, `stripQuotes`, `parseJson`) | ¿toleramos salida sucia? | Tests unitarios con outputs "malos" reales del modelo |
| **Router** (`chooseProvider`) | ¿la política enruta bien? | Tests exhaustivos por combinación de estado |
| **Contratos** (`AiTask` types) | ¿entrada/salida bien tipadas? | `typecheck` |
| **Modelo** (la generación) | ¿la respuesta es buena? | *Eval sets* + juicio humano / LLM-as-judge |

La clave: **maximiza la superficie determinista** (parsers, router, contratos) para que la parte no-determinista (el modelo) sea la mínima porción que dependa de evaluación probabilística.

> **Takeaway:** el harness es lo que te deja *dormir*. Todo lo que rodea al modelo (prompt building, routing, parsing, loop control) es código puro y testeable. El modelo es una caja negra; el harness es la caja transparente alrededor.

---

## 10. Cómo encajan las piezas

```
🕸️ GRAFO (modelo de dominio estructurado)  ← el activo estratégico; resuelve la estructura
   │  alimenta el contexto denso, con Lenguaje Ubicuo anclado
   ▼
Usuario (necesidad de negocio)
   │  🎯 Intent Engineering → AiTask<Input, Output>  (contrato tipado)
   ▼
🗣️ Prompt Engineering  ── template-prompt.ts ──┐
🧠 Context Engineering ── buildContext/withReference ──┤→ prompt final (grafo + docs + vistas)
   ▼                                                    │
🌊 Flow Engineering ── router.ts (local vs nube, fallback)
   ▼
🔁 Loop Engineering ── litert-agent.ts (ReAct, MAX_TURNS, transcript)
   ▼
🔁 Human-in-the-Loop ── sugiere/produce, no decide; usuario cura y aprueba
   ▼
🧪 Harness Engineering ── tests puros + CI + tracing envuelven TODO lo anterior
   ▼
Artefactos producidos (drivers, ADR, C4…) ──▶ enriquecen el 🕸️ GRAFO (círculo virtuoso)
```

**Una idea central atraviesa todo:** con IA **local** (modelos pequeños, más propensos a error), el valor no está en el modelo — está en la **ingeniería que lo rodea** y, sobre todo, en el **grafo que le da el dominio ya estructurado** (§2). Prompt rígido, contexto curado *desde el grafo*, contrato tipado, router con política, bucle acotado, humano al mando y harness que lo verifica. El modelo es intercambiable; el grafo y la ingeniería son el activo.

---

## 11. 🔌 MCP: construir el grafo desde afuera

Todo lo anterior describe la IA **dentro** de la app leyendo el grafo. Pero, ¿quién construye ese grafo la primera vez, a partir de un PDF de 60 páginas? Ahí entra **MCP (Model Context Protocol)**.

MCP es un estándar abierto (Anthropic) para que un cliente de IA (Claude Code, Codex…) **descubra y llame herramientas** de un servidor externo por un contrato común (JSON-RPC sobre stdio o HTTP). Es "USB-C para LLMs": un modelo, muchas herramientas, un solo protocolo.

### El servidor MCP del proyecto

`processflow-architect` (`mcp-server/index.ts`, registrado en `.mcp.json`) le da a un modelo potente en la nube herramientas para **diseñar un diagrama y exportarlo al formato que la app importa** (`GraphData`):

| Grupo | Herramientas |
|---|---|
| Descubrir notación | `list_notations`, `describe_notation` |
| Construir | `create_diagram`, `add_container`, `add_node`, `add_edge`, `remove_element` |
| Revisar | `validate_diagram`, `render_mermaid`, `get_diagram`, `list_diagrams` |
| Puente con la app | `export_to_app` (escribe el `.json`), `import_diagram` (retoma contexto) |

### Arquitectura: dos transportes, la misma lógica pura

```
Claude Code ──stdio──▶ mcp-server/index.ts ────┐
                                               ├─▶ main/services/mcp-tools.ts
App empaquetada ──HTTP──▶ 127.0.0.1:<puerto>/mcp ┘        │
                                                          ▼
                                        src/lib/mcp  (lógica PURA, testeada en vitest)
```

- **Dev:** `npx tsx mcp-server/index.ts` (stdio); Claude Code lo descubre solo al abrir el repo.
- **Prod:** modo HTTP embebido (Ajustes → Servidor MCP), con las **mismas** herramientas.
- La construcción/validación/serialización vive en `src/lib/mcp/` (pura, sin Electron ni React). El proceso MCP es solo transporte + persistencia. **Mismo principio de todo el proyecto: lo testeable vive en `lib/`.**

### Por qué es estratégico: MCP es la dirección INVERSA del §2

El grafo-como-contexto (§2) funciona en dos sentidos, y MCP cierra el círculo:

| | Dentro de la app | Vía MCP |
|---|---|---|
| Modelo | local pequeño (LiteRT-LM) | grande en la nube (Claude Code) |
| Rol frente al grafo | lo **lee** como contexto | lo **construye** desde documentos crudos |
| Trabajo que hace | razona sobre estructura ya dada | *crea* la estructura (lo caro) |
| Cuándo | operación diaria, offline | una vez, al arrancar el dominio |

**La jugada completa:** usas un modelo potente (nube, vía MCP) para **construir el grafo UNA vez** desde el PDF crudo; después el modelo **local lo explota para siempre**, gratis y offline. El trabajo caro —estructurar el dominio— se paga una vez con un modelo grande; la operación cotidiana queda local y privada. **MCP es quien *puebla* el activo estratégico del que vive la IA local.**

Y encaja con las disciplinas ya vistas:
- 🎯 **Intent** — cada herramienta MCP es un contrato tipado, igual que una `AiTask`.
- 🧪 **Harness** — `src/lib/mcp/__tests__/` prueba el *builder* sin encender ningún modelo.
- 🌊 **Flow** — dos transportes (stdio/HTTP) desacoplados de la lógica: el mismo patrón de desacople del router.

> **Takeaway:** el grafo tiene dos productores. La IA **local** lo lee y lo enriquece con artefactos (§10). La IA **de nube, vía MCP**, lo construye desde cero cuando no existe. Entre ambas, el activo estructurado nunca parte de blanco — y esa es la condición para que la IA local sea *suficiente*.

---

## 12. Conclusiones para llevar

0. **El grafo ES la estrategia** (§2). Con IA local no compites subiendo el modelo; compites *bajando el trabajo al contexto*. El diagrama estructurado hace por el modelo lo que su tamaño no le permite: resuelve la estructura del dominio de antemano. Trabajar los diagramas = construir el activo que habilita la IA local.
1. **IA local es una decisión de arquitectura**, no una elección de modelo — cómputo, secretos y datos se rediseñan.
2. **El default importa.** `mode: "local"` significa privado y offline por defecto; la nube es una elección consciente.
3. **Con modelos pequeños, la defensa está en el código, no en el modelo** — parsers tolerantes, cotas de turnos, fallbacks.
4. **Las 7 disciplinas no son buzzwords**: cada una es un archivo concreto con una responsabilidad clara (`tasks.ts`, `template-prompt.ts`, `router.ts`, `litert-agent.ts`, `useAi.ts`, `remote-settings.ts`, `__tests__/`).
5. **Evaluar IA = maximizar la superficie determinista.** Lo que puedas hacer función pura, testéalo. Deja al modelo la mínima porción no-determinista.
6. **El humano no es un obstáculo, es un componente de calidad** — la IA sugiere y produce; nunca decide lo irreversible.

---

### Apéndice: mapa disciplina → archivo

| Disciplina | Archivo(s) clave |
|---|---|
| 🕸️ Grafo como contexto (estrategia) | `src/lib/types.ts` (`NODE_TYPES`), `graph-processor.ts`, `src/context/GraphContext.tsx`, `buildContext` en `litert-agent.ts` |
| 🗣️ Prompt Engineering | `src/lib/template-prompt.ts` |
| 🧠 Context Engineering | `src/lib/ai/litert-agent.ts` (`buildContext`), `withReference` |
| 🎯 Intent Engineering | `src/lib/ai/tasks.ts`, `src/lib/ai/router.ts` (`AiTask`) |
| 🌊 Flow Engineering | `src/lib/ai/router.ts`, `src/lib/ai/providers.ts`, `src/hooks/useAi.ts` |
| 🔁 Loop Engineering | `src/lib/ai/litert-agent.ts` (bucle ReAct) |
| 🔁 Human-in-the-Loop | `src/components/ai-panel/AgentChatPanel.tsx`, `src/lib/ai/remote-settings.ts` |
| 🧪 Harness Engineering | `src/lib/**/__tests__/`, `.github/workflows/ci.yml`, `steps[]` en el agente |
| 🔌 MCP (construir el grafo desde afuera) | `mcp-server/index.ts`, `.mcp.json`, `main/services/mcp-tools.ts`, `src/lib/mcp/` |
| IA local / seguridad | `src/lib/ai/remote-settings.ts`, `providers.ts`, `main/services/ai-remote.ts` |
