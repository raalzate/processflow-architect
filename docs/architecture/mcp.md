# El servidor MCP — qué cubre y cómo se extiende

Referencia **interna**. Para conectar un cliente desde afuera: `mcp-server/README.md`
(stdio, repo clonado) y la guía en la app (`/mcp`, modo HTTP). Acá está lo que hay que
saber para **tocarlo**: qué herramientas existen, quién las sirve, qué es puro y qué no,
y dónde se rompe.

## Para qué existe

Claude Code (o Codex, o cualquier cliente MCP) es bueno leyendo documentos y código. Este
servidor le da herramientas para convertir ese análisis en un **diagrama válido** de una
notación soportada y llevarlo a Processflow Architect —con trazabilidad a la fuente y
revisión humana antes de subir nada— sin que el agente tenga que conocer el formato
`GraphData` ni la geometría del lienzo.

## Mapa: un registro, tres transportes

```
Claude Code / Codex ──stdio──▶ mcp-server/index.ts ───┐
Claude Code / Codex ──HTTP───▶ main/services/mcp-http.ts ──┤
Guía /mcp (playground) ─memoria─▶ main/services/mcp-playground.ts ──┤
                                                      │
                                    main/services/mcp-tools.ts   ← registro ÚNICO
                                                      │            (herramienta → función)
                                                      ▼
                                            src/lib/mcp/**  ← lógica PURA y testeada
```

| Archivo | Rol |
|---|---|
| `main/services/mcp-tools.ts` | `registerProcessflowTools(server, opts)`: **la** definición de las herramientas. Lo comparten los tres transportes. |
| `mcp-server/index.ts` | transporte **stdio** (modo desarrollo, `.mcp.json`). Workspace = `PROCESSFLOW_WORKSPACE` o cwd. |
| `main/services/mcp-http.ts` | transporte **HTTP Streamable** embebido en la app; se activa en Ajustes → Servidor MCP (apagado por defecto). |
| `main/services/mcp-playground.ts` | cliente+servidor por transporte **en memoria** para el playground de `/mcp`: prueba herramientas sin abrir el puerto. |
| `main/services/mcp-app-state.ts` | cachea en el main el último retrato del lienzo que publica el renderer. |
| `main/services/mcp-app-read.ts` | puente de LECTURA bajo demanda (main pregunta → renderer contesta, con timeout). |
| `src/lib/mcp/*` | modelo, layout, validación, calidad, revisión, plan de vistas, estado de la app. Sin Electron, sin React (§P3). |
| `src/lib/mcp-skill.ts` | los skills instalables y su plantilla (se renderizan con la config del transporte real). |

**Regla al importar:** desde `mcp-tools.ts` se importa cada módulo directo, **nunca** el
barrel `src/lib/mcp/index.ts`: `export *` no sobrevive la interop CJS de tsx/esbuild y los
nombres se pierden en silencio.

## Las herramientas (30)

Agrupadas por fase del ciclo. Las marcadas **app** sólo se registran cuando el transporte
las puede cumplir (existe el callback correspondiente en `McpToolsOptions`), así el cliente
nunca ve una herramienta que su transporte no soporta.

### 1 · Contexto — antes de modelar

| Herramienta | Qué da |
|---|---|
| `list_notations` | notaciones soportadas (DDD/Event Storming, BPMN, C4, UML) con su guía de diseño. |
| `describe_notation` | los `type` válidos de una notación, si son contenedores y su forma. |
| `get_app_state` **app** | proyecto activo, notación, vistas ya existentes y cupo libre. La **ingesta**: sin esto se exporta a ciegas y se duplican vistas. |
| `list_views` **app** | vistas (pestañas) de un proyecto con notación, origen y tamaño. Acepta `project`: llega a **otro proyecto guardado** sin abrirlo. |
| `get_view` **app** | contenido de una vista: resumen + Mermaid; con `importAs` la deja como diagrama **editable** en el workspace para continuarla. |
| `list_artifacts` **app** | artefactos que generó la IA local (drivers, riesgos, propuesta, roadmap, ADRs): título, tipo, revisión vigente, tamaño. |
| `get_artifact` **app** | el Markdown del artefacto (el mismo que ve el humano), con su revisión y el histórico declarado. |

### 2 · Ciclo de vida del diagrama

| Herramienta | Qué hace |
|---|---|
| `create_diagram` | abre un modelo nuevo (nombre + notación) → `diagramId`. |
| `list_diagrams` | los modelos en curso del workspace. |
| `get_diagram` | resumen + vista previa Mermaid. |
| `import_diagram` | carga un `GraphData` exportado como modelo editable (retomar contexto). |

### 3 · Construcción

| Herramienta | Qué hace |
|---|---|
| `add_container` | contenedor (Agregado, Pool, Límite de Sistema, Paquete…). |
| `add_node` | nodo, opcionalmente dentro de un contenedor. |
| `add_edge` | conecta dos elementos y clasifica la relación (interna / política / big picture). |
| `update_element` / `update_edge` | corrigen sin borrar y recrear (conserva id, citas y geometría). |
| `remove_element` / `remove_edge` | borran nodo/contenedor (con sus aristas) o una relación. |
| `relayout_diagram` | rehace la disposición con estrategia y densidad (`src/lib/mcp/layout-presets.ts`). |
| `render_mermaid` | vista previa Mermaid del modelo. |

### 4 · Revisión — el filtro antes de subir

| Herramienta | Qué responde |
|---|---|
| `validate_diagram` | *¿la app puede importar esto?* tipos, ids duplicados, aristas colgantes, aislados **+** hallazgos de calidad. |
| `review_diagram` | *¿esto es defendible como modelo?* Paquete para el humano: historia en Mermaid · tabla «elemento ← fuente» por contenedor · decisiones y pendientes · hallazgos · **veredicto**. |
| `suggest_views` | cuando el modelo pasa el tamaño legible (~40 elementos) propone **cortes**; y **complementos** cuando el material sostiene otra mirada. |
| `record_ambiguity` | registra una decisión que la FUENTE no cierra (alternativas, contradicciones, vacíos que cambian la topología). |
| `resolve_ambiguity` | cierra una ambigüedad con la respuesta del humano; lo que quede abierto viaja en `review_diagram`. |

Dos preguntas distintas, dos módulos: `validate()` (`diagram-builder.ts`) es
importabilidad; `qualityFindings()` (`quality.ts`) es calidad de modelado. Las reglas de
calidad se escriben sobre **roles semánticos** (`roleOfType` de `src/lib/notations.ts`),
nunca sobre literales de tipo: una notación nueva las hereda declarando sus roles (§P6).
Hoy son once — `FLUJO-INICIO`, `FLUJO-FIN`, `CADENA`, `POLITICA`, `RAMAS`,
`DECISION-PREGUNTA`, `RELACION-SIN-ETIQUETA`, `CONTENEDOR-VACIO`, `NOMBRE-LARGO`,
`ETIQUETA-LARGA`, `TAMANO` — y un hallazgo `grave` **no** rompe la importación: dice que el
diagrama no se sostiene ante un revisor.

Los límites de texto (`MAX_NAME_CHARS`, `MAX_EDGE_LABEL_CHARS`) salen de la geometría real
del lienzo, no de números elegidos a ojo: un umbral inventado deja pasar nombres que se
recortan al dibujar.

### 5 · Entrega a la app

| Herramienta | Qué hace |
|---|---|
| `export_to_app` | escribe el `.json` (`GraphData`) y —en modo app— lo **inyecta al lienzo** por IPC. En stdio queda el archivo para «Importar diagrama». |
| `export_as_view` **app** | suma una **pestaña** (vista custom con su propia notación) al proyecto ACTIVO, sin crear proyecto aparte. |
| `export_mermaid_view` **app** | suma una pestaña de vista **Mermaid** al proyecto activo. |

### 6 · Skills — el arnés del agente externo

| Herramienta | Qué hace |
|---|---|
| `list_skills` | skills instalables, qué traen y dónde van. |
| `install_skill` | los escribe en `.claude/skills` (proyecto) o `~/.claude/skills` (usuario) **con la config del transporte real inyectada**: URL o stdio, herramientas realmente disponibles, workspace, notación por defecto y límites. |

Hoy hay dos (`SKILL_IDS` en `src/lib/mcp-skill.ts`): `documento-a-processflow` (documento →
portafolio de diagramas) y `disenar-diagrama` (un diagrama trazado a su fuente). El
embed de `.claude/skills/**` en ese módulo lo verifica el gate
(`node scripts/sync-skills.mjs --check`): editar el skill del repo sin re-sincronizar
falla.

## Leer la app: el puente de contenido

`get_app_state` es **inventario** (nombres y conteos) y se PUBLICA: renderer → main
en cada cambio, barato y siempre fresco. El **contenido** (el Markdown de un
artefacto, los elementos de una vista, un proyecto que no es el activo) no se puede
publicar igual: sería cachear todo de todos los proyectos en el proceso main para
nada. Así que el contenido se PIDE:

```
list_artifacts / get_artifact / list_views / get_view
        │  opts.readApp
        ▼
main/services/mcp-app-read.ts ──"mcp-app-read" {id, request}──▶ renderer (AppContent)
        ◀──"mcp-app-read-reply" {id, result}──  resolveAppRead(request, ctx)
```

- La decisión vive en `src/lib/mcp/app-read.ts` (**puro, testeado**): selección por
  nombre —exacto, o el único parcial; con dos candidatos **no adivina**, devuelve las
  opciones—, agrupación de artefactos por linaje (una fila por artefacto, el
  histórico declarado), recorte del cuerpo largo diciendo cuánto quedó afuera, y el
  formato de la respuesta.
- El renderer sólo aporta datos: proyecto activo y vistas desde los contextos;
  los demás proyectos desde `localStorage` (`views_<fileId>`, `agent_state_<fileId>`)
  vía `readStoredCustomViews` / `readStoredArtifacts`. **Leer otro proyecto no cambia
  el lienzo del usuario** — abrirlo para leerlo sí lo haría, y eso es inaceptable.
- El puente tiene **timeout de 2,5 s** y nunca rechaza: si la ventana está cerrada o
  tarda, la herramienta contesta "la app no respondió" en vez de colgar la sesión del
  cliente. Ésa es la razón por la que ahora sí se puede preguntar al renderer, algo
  que `mcp-app-state.ts` había descartado.
- Las citas de nodos de un artefacto se resuelven con el grafo **del proyecto
  abierto**: en otro proyecto el cuerpo llega sin ellas (declarado, no silencioso).

Por qué importa: sin esto el agente externo sólo escribía. Podía subir un BPMN que
contradecía un ADR aprobado, o rehacer una vista que ya existía, porque no tenía
forma de leer el trabajo del humano.

## El ciclo canónico

1. `get_app_state` — qué hay abierto (modo app).
2. `list_views` / `list_artifacts` — qué ya existe. Si la vista está, `get_view`
   con `importAs`; si el documento está, `get_artifact` y se cita como fuente.
   Rehacer lo que ya está hecho crea una segunda versión de la verdad.
3. `list_notations` → `describe_notation` — qué notación y qué `type` existen.
4. `create_diagram` → `add_container` / `add_node` / `add_edge` mientras se lee la fuente,
   **citando la fuente en cada elemento** (`source`).
5. `record_ambiguity` cuando la fuente no cierra algo; preguntar TODO junto, una ronda.
6. `validate_diagram` → `suggest_views` si es grande → `relayout_diagram`.
7. `review_diagram` → mostrar al humano y **esperar aprobación**. Veredicto ❌ no se
   presenta como propuesta: se corrige.
8. `export_to_app` (proyecto) o `export_as_view` (pestaña del proyecto activo).

El paso 7 no es decorativo: es el único punto donde un humano contrasta el diagrama contra
la fuente. Un elemento sin cita aparece en `untraced` del paquete.

## Modo stdio vs modo app

| | stdio (`mcp-server/index.ts`) | app (`mcp-http.ts`) |
|---|---|---|
| Requiere | el repo clonado + `npx tsx` | la app instalada, servidor activado en Ajustes |
| Registro | `.mcp.json` del repo (Claude Code lo descubre) | `http://127.0.0.1:<puerto>/mcp` |
| Workspace | `PROCESSFLOW_WORKSPACE` o cwd | `userData/mcp-workspace` |
| `export_to_app` | escribe `.json`, el humano lo importa | inyecta al lienzo al momento |
| `export_as_view`, `export_mermaid_view`, `get_app_state` | no se registran | disponibles |
| Lectura de la app (`list_views`, `get_view`, `list_artifacts`, `get_artifact`) | no se registran | disponibles (puente con timeout) |

Persistencia común: el modelo en curso vive en `<workspace>/.processflow/diagrams/<id>.json`
y las exportaciones en `<workspace>/<id>.json`. Sobreviven reinicios; el playground comparte
el mismo workspace, así que un diagrama creado ahí lo ve Claude Code y al revés.

**Seguridad del modo app:** escucha sólo en `127.0.0.1`; transporte *stateless* (un servidor
MCP nuevo por petición, sin sesiones); un POST cross-origin de navegador dispara un preflight
CORS que el servidor no responde, así que queda bloqueado.

## Cómo se agrega una herramienta

1. La lógica va en `src/lib/mcp/` — pura, con su prueba en `__tests__/` al lado (§P3).
   Si decide algo sobre tipos de elemento, se escribe sobre **roles** (§P6).
2. `registerProcessflowTools` sólo mapea: parseo con `zod`, cargar/guardar el modelo,
   formatear la respuesta con `text()` / `fail()`.
3. Si la herramienta necesita la app viva, va detrás de su callback en `McpToolsOptions`
   (`if (opts.exportViewToApp) { … }`): en stdio no debe ni aparecer.
4. La `description` es la interfaz de usuario del agente: dice **cuándo** usarla y qué pasa
   si se salta el paso, no sólo qué hace. Es lo que lee un modelo que no vio este repo.
5. Si cambia el ciclo, se actualiza el skill (`src/lib/mcp-skill.ts`) y se re-sincroniza
   (`npm run skills:sync`), o el gate falla.

## Qué está probado y qué no

| Señal | Dónde | Estado |
|---|---|---|
| Lógica pura (modelo, layout, calidad, revisión, mermaid, app-state) | `src/lib/mcp/__tests__/` | cubierta, en el gate |
| Registro de herramientas (export como vista, trazabilidad, ambigüedades, calidad, update/relayout, suggest_views, skills, **lectura de la app**) | `main/services/__tests__/mcp-tools.test.ts` | cubierta, en el gate |
| Resolución de la lectura (proyecto/vista/artefacto por nombre, ambigüedad, revisiones, recorte) | `src/lib/mcp/__tests__/app-read.test.ts` | cubierta, en el gate |
| El puente IPC real (timeout, ventana cerrada, respuesta tardía) | — | **deuda**: probado por unidad con un `readApp` falso, no con Electron vivo |
| Arnés completo por stdio (ingesta → citas → ambigüedades → calidad → revisión → export → install_skill) | script manual contra `mcp-server/index.ts` | verificado a mano (ver `STATUS.md`) |
| Modo app end-to-end (`get_app_state` con la app viva, `export_as_view`, la banda vacía en el lienzo) | — | **deuda declarada**: se verifica a ojo |
| Cobertura exigida de `main/` y `mcp-server/` | `vitest.config.ts` | **no hay**: la cobertura se exige sólo en `src/lib/**` |

## Gotchas

- **Barrel prohibido** en `mcp-tools.ts` (ver arriba): `export *` + tsx = nombres perdidos.
- **stdout es el protocolo** en el modo stdio: todo log va a `stderr`. Un `console.log`
  suelto rompe la sesión del cliente.
- El skill instalado se **renderiza con la config del transporte**: si agregás una
  herramienta app-only, revisá que la plantilla no la mencione en modo stdio.
- Más síntomas y sus mecanismos: `docs/harness/gotchas.md`.
