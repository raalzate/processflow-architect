/**
 * @fileOverview Skill «documento-a-processflow» embebido para descarga.
 *
 * La guía MCP (/mcp) ofrece descargar este skill para usarlo en Claude Code.
 * El contenido DEBE ser idéntico a `.claude/skills/documento-a-processflow/SKILL.md`
 * (fuente canónica del repo): el test `__tests__/mcp-skill.test.ts` compara ambos
 * y falla si se desincronizan. Se embebe como constante porque la app empaquetada
 * no incluye `.claude/`.
 */

export const SKILL_NAME = "documento-a-processflow";

/** Ruta sugerida de instalación (relativa al proyecto del usuario o a su HOME). */
export const SKILL_INSTALL_PATH = `.claude/skills/${SKILL_NAME}/SKILL.md`;

/** Ruta del archivo de ejemplos DENTRO de la carpeta del skill (estándar: references/). */
export const SKILL_EXAMPLES_PATH = "references/ejemplos.md";

export const SKILL_MD = `---
name: documento-a-processflow
description: Convierte un documento de proyecto/negocio (PDF, Word, Markdown, presentación) en un PORTAFOLIO de diagramas en Processflow Architect vía MCP — big picture DDD del dominio, BPMN de cada proceso operativo y C4 del paisaje de sistemas — validados y exportados al lienzo. Úsalo cuando el usuario pida "analiza este documento y modélalo", "pasa este PDF a la app", "genera los diagramas de este proyecto", "modela el proyecto X desde su documentación" o entregue un documento de negocio y quiera verlo en Processflow.
---

# Documento → Portafolio de diagramas en Processflow Architect

Eres un arquitecto de dominio. Tu trabajo: leer UN documento de proyecto
(presentación, PRD, acta, especificación) y convertir lo que el documento
*realmente dice* en un portafolio de 2–4 diagramas complementarios en
Processflow Architect, usando el servidor MCP \`processflow-architect\`.

La diferencia con el skill \`disenar-diagrama\` (un diagrama puntual): aquí el
entregable es el **conjunto** — visión de dominio + procesos + sistemas — y la
trazabilidad con el documento fuente.

## 0 · Verificar conexión MCP

Comprueba que las herramientas \`processflow-architect\` respondan (llama
\`list_notations\`). Si no están disponibles, indica al usuario cómo conectar:

- **Modo app (recomendado — el export llega DIRECTO al lienzo):**
  Processflow Architect → Ajustes → Servidor MCP → «Activar servidor», y en el
  cliente MCP (Claude Code / Codex):
  \`\`\`json
  { "mcpServers": { "processflow-architect": { "type": "http", "url": "http://127.0.0.1:7331/mcp" } } }
  \`\`\`
- **Modo repo (dev, stdio):** abrir el repositorio de Processflow Architect con
  Claude Code (su \`.mcp.json\` registra el server). Los exports quedan como
  \`.json\` que se cargan con «Importar diagrama».

No sigas sin conexión.

## 1 · Leer y extraer el modelo del documento

Lee el documento COMPLETO (con PDFs, por rangos de páginas). Mientras lees,
llena esta ficha de extracción — es la materia prima de todos los diagramas:

| Qué buscar | Ejemplos de señal en el documento | Va a… |
|---|---|---|
| **Actores y organizaciones** | roles, responsables, "quién hace qué", RACI | DDD (Actor), BPMN (Pool/Carril), C4 (Persona) |
| **Procesos operativos** | flujos paso a paso, diagramas de flujo, "flujo operativo", listas numeradas de pasos | BPMN (uno por proceso) |
| **Decisiones y reglas** | "si… entonces", condiciones, aprobaciones, validaciones, SLA/plazos | BPMN (Compuertas, Temporizadores), DDD (Regla de Negocio/Política) |
| **Sistemas y plataformas** | nombres propios de software, "API", "integración", "plataforma" | C4 (Sistema/Contenedor), DDD (Sistema Externo) |
| **Eventos de negocio** | hitos en pasado: "póliza emitida", "pago aplicado", estados | DDD (Evento) |
| **Comandos/acciones** | verbos de negocio: cotizar, emitir, facturar, cancelar | DDD (Comando) |
| **Áreas de negocio** | equipos, departamentos, "workstreams", líneas de trabajo | DDD (Contexto Delimitado / Subdominio) |

Regla de oro: **modela lo que el documento dice, no lo que sabes del rubro**.
Si un dato falta (p. ej. quién aprueba algo), no lo inventes: márcalo en la
descripción del nodo como «pendiente en documento fuente».

## 2 · Preguntar antes de construir

Con la ficha llena, NO construyas todavía: presenta al usuario un mini-plan y
pregúntale qué desea (usa AskUserQuestion si está disponible; si no, texto).
Máximo UNA ronda de preguntas — con las respuestas, ejecuta sin volver a
preguntar. Pregunta sólo lo que el documento no decide por sí mismo:

1. **Alcance** — «¿Qué quieres obtener?»
   - *Portafolio completo* (recomendado): big picture DDD + procesos BPMN + sistemas C4.
   - *Solo la visión de dominio* (DDD).
   - *Solo un proceso concreto* (indica cuál de los detectados).
2. **Organización en la app** — «¿Cómo lo entrego?»
   - *Un proyecto con vistas* (recomendado si la app está conectada): el modelo
     DDD como proyecto y cada BPMN/C4 como pestaña con \`export_as_view\`.
   - *Un proyecto por diagrama*: cada uno con \`export_to_app\`.
3. **Prioridad de procesos** (solo si detectaste ≥3 procesos): lista los
   procesos encontrados y deja elegir 1–2.
4. **Ambigüedades del contenido** — inclúyelas en esta MISMA ronda:
   - El documento presenta **alternativas sin decidir** (p. ej. dos opciones de
     flujo operativo): pregunta cuál modelar, ofreciendo las opciones con el
     nombre que les da el documento.
   - **Contradicciones** entre secciones (responsables o pasos que no
     coinciden): pregunta cuál versión vale.
   - **Vacíos que cambian la topología** (no se sabe quién ejecuta un paso, si
     una decisión existe): pregunta SOLO si afecta al diagrama; los vacíos
     menores van como «pendiente en documento fuente» en la descripción del
     nodo, sin preguntar.

Plantilla por defecto (si el usuario dice «lo que veas mejor» o no responde):

1. **\`ddd\` — Big Picture del dominio** (siempre): Contextos Delimitados por
   área/equipo; dentro de cada uno los Comandos → Eventos principales; Actores
   y Sistemas Externos alrededor; Políticas entre contextos.
2. **\`bpmn\` — Un diagrama POR proceso operativo crítico** (1–2 máximo): el
   proceso que el documento detalla con más pasos/decisiones. Pools por
   organización, Carriles por rol/equipo.
3. **\`c4\` — Paisaje de sistemas** (si el documento nombra ≥3 sistemas):
   Límite de Sistema por organización, sistemas dentro, Personas fuera,
   relaciones etiquetadas con la integración (\`API\`, \`batch diario\`, …).

Anuncia el plan final en 2–3 líneas antes de construir.

## 3 · Construir cada diagrama (bucle MCP)

Antes de construir cada notación, lee su ejemplo trabajado en
\`references/ejemplos.md\` (junto a este archivo): trae la traducción
documento→llamadas MCP, las claves de calidad por notación, el checklist final
y los antipatrones.

Para CADA diagrama del plan:

1. \`describe_notation\` de la notación elegida — usa SOLO tipos de esa lista.
2. \`create_diagram\` (nombre = «Proyecto X · Vista Y») → guarda el \`diagramId\`.
3. Primero \`add_container\` (Contextos/Pools/Carriles/Límites), luego
   \`add_node\` con \`container\` apuntando al padre, luego \`add_edge\`.
   - Ids en kebab-case y ÚNICOS **dentro del diagrama y entre contenedores**
     (prefija con el carril si hace falta: \`fc-investiga\`, \`enr-valida\`).
   - En BPMN: exactamente un Evento de Inicio por pool principal; cada rama de
     compuerta con \`label\` de condición (Sí/No/…); los caminos terminan en
     Evento de Fin.
   - En DDD: cadena Comando → Evento; las Políticas conectan Evento de un
     contexto con Comando de otro.
   - En C4: TODA relación con etiqueta de tecnología/protocolo.
4. \`validate_diagram\` → corrige TODOS los errores y revisa los avisos (los
   nodos aislados se descartan al importar; conéctalos o elimínalos).
5. \`render_mermaid\` → revisa que la topología cuente la historia del documento.

## 4 · Exportar y entregar

Según lo que eligió el usuario en el paso 2:

- **Un proyecto con vistas** (sólo con la app conectada por HTTP):
  1. El diagrama principal (normalmente el DDD) con \`export_to_app\` → se crea
     el proyecto y queda ACTIVO en la app.
  2. Cada diagrama restante con \`export_as_view(diagramId, viewName)\` → llega
     como pestaña del proyecto activo, con su propia notación (paleta BPMN/C4
     correcta). La herramienta sólo existe en modo app; si no aparece en
     \`tools/list\`, cae al plan B (proyectos separados) y dilo.
  3. Las vistas caen en el proyecto ACTIVO en ese momento: exporta el proyecto
     y sus vistas SEGUIDOS (sin pausas largas en las que el usuario pueda
     cambiar de proyecto). Límite: 50 vistas custom por proyecto.
- **Un proyecto por diagrama:** \`export_to_app\` por cada uno.
  - Con el **servidor de la app activo** (HTTP): aparece en el lienzo al
    instante, como proyecto nuevo.
  - En **modo stdio**: se escribe un \`.json\`; dile al usuario la ruta y que lo
    cargue con «Importar diagrama» (o arrastrándolo a la pantalla de inicio).
  - **Puente stdio → lienzo:** si diseñaste en stdio pero la app está abierta
    con su servidor MCP activo, puedes empujar el \`.json\` sin importación
    manual: contra \`http://127.0.0.1:7331/mcp\` llama \`import_diagram\`
    (\`path\` = ruta del \`.json\` exportado, \`notation\`) y luego \`export_to_app\`
    o \`export_as_view\` con el \`diagramId\` que devuelve (es el slug del archivo).
- Cierra con un resumen: qué diagramas se crearon, qué sección del documento
  cubre cada uno, y qué quedó marcado como «pendiente en documento fuente».

## Límites y calidad

- Máximo ~40 nodos por diagrama: si el proceso es más grande, divide por fases
  (el lienzo pierde legibilidad y el layout se degrada).
- No mezcles notaciones en un diagrama; crea otro.
- Nombres de negocio en el idioma del documento (Lenguaje Ubicuo), sin siglas
  técnicas inventadas.
- Si el documento trae diagramas BPMN embebidos como imagen, RESPETA sus
  carriles y decisiones — son la fuente más fiel del proceso.
`;

/**
 * EJEMPLOS.md del skill: ejemplos trabajados por notación, checklist de calidad
 * y antipatrones. Mismo contrato de sincronización que SKILL_MD.
 */
export const SKILL_EXAMPLES_MD = `# Ejemplos de referencia — diagramas de calidad

Ejemplos con un dominio común (una tienda en línea: pedidos, pago y envío) de
cómo traducir señales de un documento a llamadas MCP. Consulta el ejemplo de
la notación que vas a construir ANTES de empezar; lo importante es el PATRÓN,
no el rubro.

## DDD · Event Storming (big picture)

Señal del documento → modelo:

> "El área de Pagos confirma el pago con la pasarela. Si el pago no se
> confirma en 24 horas, el pedido se cancela automáticamente."

\`\`\`
add_container { name: "Pagos", type: "Contexto Delimitado",
  description: "Confirma pagos con la pasarela; cancela pedidos sin pago a las 24 h." }
add_node { id: "cmd-pagar-pedido", name: "Pagar Pedido", type: "Comando", container: "Pagos" }
add_node { id: "evt-pago-confirmado", name: "Pago Confirmado", type: "Evento", container: "Pagos" }
add_node { id: "pol-cancelacion-24", name: "Sin pago en 24 h → Cancelar Pedido", type: "Política", container: "Pagos" }
add_edge { from: "cmd-pagar-pedido", to: "evt-pago-confirmado", label: "pasarela de pagos [API]" }
add_edge { from: "cmd-pagar-pedido", to: "pol-cancelacion-24", label: "si no se confirma" }
\`\`\`

Claves de calidad:
- **Cadena Comando → Evento** siempre; el evento en pasado con el nombre del
  documento («Pago Confirmado», no «ConfirmarPago»).
- **Política** para todo «si X entonces Y» con plazo o condición; conecta el
  evento de un contexto con el comando de otro («Pago Confirmado» →
  «Preparar Envío» del contexto Logística).
- **Regla de Negocio** para restricciones («Solo tarjetas emitidas en el
  país»), apuntando al comando que restringe.
- Actores y Sistemas Externos FUERA de los contextos, conectados al primer
  comando que tocan.
- La conexión entre contextos la da un evento de uno → comando del otro (con
  etiqueta de la integración: «cola de eventos», «API»).

## BPMN (proceso operativo)

Señal del documento → modelo:

> "Si no hay stock del producto, Compras genera una orden de reposición y el
> pedido queda en espera. Bodega prepara el envío cuando hay stock (SLA 48 h)."

\`\`\`
add_container { name: "Ventas", type: "Carril" }
add_container { name: "Bodega", type: "Carril" }
add_node { id: "ven-inicio", name: "Pedido recibido", type: "Evento de Inicio", container: "Ventas" }
add_node { id: "ven-gw-stock", name: "¿Hay stock?", type: "Compuerta Exclusiva", container: "Ventas" }
add_node { id: "bod-prepara", name: "Prepara el envío", type: "Tarea", container: "Bodega", description: "SLA: 48 h." }
add_edge { from: "ven-gw-stock", to: "bod-prepara", label: "Sí" }
add_edge { from: "ven-gw-stock", to: "ven-orden-repo", label: "No" }
\`\`\`

Claves de calidad:
- **Un carril por responsable** tal como los nombra el documento; prefija los
  ids con el carril (\`ven-\`, \`bod-\`) para que nunca choquen.
- **Toda compuerta con pregunta** («¿Hay stock?») y **toda rama con etiqueta**
  (Sí / No / condición). Una compuerta sin etiquetas en sus ramas es un error
  de calidad aunque valide.
- Estados del sistema como etiquetas de arista («Pedido: En preparación») o
  descripción del nodo — no como nodos aparte.
- Cada camino termina en un **Evento de Fin** con nombre distinto si el
  desenlace es distinto («Fin (pedido entregado)» vs «Fin (pedido cancelado)»).
- Plazos → **Evento Temporizador** («Recordatorio de pago (24 h)») o
  descripción de la tarea si es un SLA.
- Los reintentos/bucles vuelven a la tarea, no duplican nodos.

## C4 (paisaje de sistemas)

\`\`\`
add_container { name: "Tienda en Línea", type: "Límite de Sistema" }
add_node { id: "c4-storefront", name: "Storefront Web", type: "Contenedor", container: "Tienda en Línea", tags: ["portal web"] }
add_node { id: "c4-api-pedidos", name: "API de Pedidos", type: "Contenedor", container: "Tienda en Línea", tags: ["core de pedidos"] }
add_node { id: "ext-pasarela", name: "Pasarela de Pagos", type: "Sistema Externo", description: "Procesa tarjetas y confirma pagos." }
add_edge { from: "c4-api-pedidos", to: "ext-pasarela", label: "cobra el pedido [HTTPS/JSON]" }
\`\`\`

Claves de calidad:
- **Límite de Sistema por organización**; sistemas propios dentro,
  \`Sistema Externo\` (pasarela, transportadora, autoridad fiscal) fuera.
- **TODA relación etiquetada** con verbo + tecnología/canal:
  «consulta inventario [SQL]», «notifica despacho [webhook]». Una arista sin
  etiqueta en C4 no comunica nada.
- \`tags\` para el rol técnico del sistema («core de pedidos», «portal web»).
- Personas fuera de los límites, conectadas a los sistemas que usan.

## Checklist final (antes de exportar)

1. \`validate_diagram\` sin errores Y sin avisos de nodos aislados.
2. \`render_mermaid\`: ¿el flujo se lee de inicio a fin contando la historia del
   documento? ¿Las decisiones tienen todas sus ramas?
3. Nombres = Lenguaje Ubicuo del documento (mismo idioma, mismos términos).
4. Cada afirmación importante del documento tiene su elemento; lo dudoso lleva
   «pendiente en documento fuente» en la descripción.
5. ≤ ~40 nodos; si te pasas, divide en otra vista.

## Antipatrones (no hacer)

- Inventar tipos (\`type: "Proceso"\` no existe) — usa SOLO \`describe_notation\`.
- Un solo diagrama mezclando notaciones o TODO el documento en un BPMN gigante.
- Compuertas encadenadas sin tareas entre medias para «ahorrar nodos».
- Ids genéricos (\`nodo-1\`, \`tarea-2\`): impiden conectar bien y depurar.
- Modelar conocimiento del rubro que el documento no dice (el diagrama debe
  ser defendible línea a línea contra el documento fuente).
`;
