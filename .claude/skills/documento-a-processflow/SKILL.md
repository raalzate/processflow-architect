---
name: documento-a-processflow
description: Convierte un documento de proyecto/negocio (PDF, Word, Markdown, presentación) en un PORTAFOLIO de diagramas en Processflow Architect vía MCP — big picture DDD del dominio, BPMN de cada proceso operativo y C4 del paisaje de sistemas — validados y exportados al lienzo. Úsalo cuando el usuario pida "analiza este documento y modélalo", "pasa este PDF a la app", "genera los diagramas de este proyecto", "modela el proyecto X desde su documentación" o entregue un documento de negocio y quiera verlo en Processflow.
---

# Documento → Portafolio de diagramas en Processflow Architect

Eres un arquitecto de dominio. Tu trabajo: leer UN documento de proyecto
(presentación, PRD, acta, especificación) y convertir lo que el documento
*realmente dice* en un portafolio de 2–4 diagramas complementarios en
Processflow Architect, usando el servidor MCP `processflow-architect`.

La diferencia con el skill `disenar-diagrama` (un diagrama puntual): aquí el
entregable es el **conjunto** — visión de dominio + procesos + sistemas — y la
trazabilidad con el documento fuente.

## 0 · Verificar conexión MCP

Comprueba que las herramientas `processflow-architect` respondan (llama
`list_notations`). Si no están disponibles, indica al usuario cómo conectar:

- **Modo app (recomendado — el export llega DIRECTO al lienzo):**
  Processflow Architect → Ajustes → Servidor MCP → «Activar servidor», y en el
  cliente MCP (Claude Code / Codex):
  ```json
  { "mcpServers": { "processflow-architect": { "type": "http", "url": "http://127.0.0.1:7331/mcp" } } }
  ```
- **Modo repo (dev, stdio):** abrir el repositorio de Processflow Architect con
  Claude Code (su `.mcp.json` registra el server). Los exports quedan como
  `.json` que se cargan con «Importar diagrama».

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
     DDD como proyecto y cada BPMN/C4 como pestaña con `export_as_view`.
   - *Un proyecto por diagrama*: cada uno con `export_to_app`.
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

**Precedencia de notación (regla dura):** si el usuario pide EXPLÍCITAMENTE una
notación o un tipo de diagrama —«hazme el BPMN», «el flujo del proceso», «el
diagrama de secuencia», «el C4»—, ESE diagrama es el **entregable principal** y
se exporta con `export_to_app`: es el modelo del proyecto, con su propia paleta
y simbología. **No antepongas un DDD que el usuario no pidió**, ni conviertas el
diagrama pedido en una vista anexa de un DDD. DDD deja de ser obligatorio; solo
es el default cuando el usuario NO declara intención (abajo).

Plantilla por defecto — **SOLO** si el usuario dice «lo que veas mejor» o no
responde (sin notación pedida):

1. **`ddd` — Big Picture del dominio**: Contextos Delimitados por
   área/equipo; dentro de cada uno los Comandos → Eventos principales; Actores
   y Sistemas Externos alrededor; Políticas entre contextos.
2. **`bpmn` — Un diagrama POR proceso operativo crítico** (1–2 máximo): el
   proceso que el documento detalla con más pasos/decisiones. Pools por
   organización, Carriles por rol/equipo.
3. **`c4` — Paisaje de sistemas** (si el documento nombra ≥3 sistemas):
   Límite de Sistema por organización, sistemas dentro, Personas fuera,
   relaciones etiquetadas con la integración (`API`, `batch diario`, …).

Anuncia el plan final en 2–3 líneas antes de construir.

## 3 · Construir cada diagrama (bucle MCP)

Antes de construir cada notación, lee su ejemplo trabajado en
`references/ejemplos.md` (junto a este archivo): trae la traducción
documento→llamadas MCP, las claves de calidad por notación, el checklist final
y los antipatrones.

Para CADA diagrama del plan:

1. `describe_notation` de la notación elegida — usa SOLO tipos de esa lista.
2. `create_diagram` (nombre = «Proyecto X · Vista Y») → guarda el `diagramId`.
3. Primero `add_container` (Contextos/Pools/Carriles/Límites), luego
   `add_node` con `container` apuntando al padre, luego `add_edge`.
   - Ids en kebab-case y ÚNICOS **dentro del diagrama y entre contenedores**
     (prefija con el carril si hace falta: `fc-investiga`, `enr-valida`).
   - En BPMN: exactamente un Evento de Inicio por pool principal; cada rama de
     compuerta con `label` de condición (Sí/No/…); los caminos terminan en
     Evento de Fin.
   - En DDD: cadena Comando → Evento; las Políticas conectan Evento de un
     contexto con Comando de otro.
   - En C4: TODA relación con etiqueta de tecnología/protocolo.
4. `validate_diagram` → corrige TODOS los errores y revisa los avisos (los
   nodos aislados se descartan al importar; conéctalos o elimínalos).
5. `render_mermaid` → revisa que la topología cuente la historia del documento.

## 4 · Exportar y entregar

Según lo que eligió el usuario en el paso 2:

- **Una sola notación pedida** (p. ej. «solo el BPMN»): usa **únicamente**
  `export_to_app` de ESE diagrama. Es el modelo del proyecto y queda ACTIVO con
  su notación correcta. **No** crees un DDD contenedor ni lo mandes como
  `export_as_view` (eso lo dejaría como pestaña anexa de un modelo ajeno y con
  la paleta equivocada — es justo lo que hay que evitar).
- **Un proyecto con vistas** (sólo con la app conectada por HTTP):
  1. El diagrama principal —el de la notación que pidió el usuario; el DDD solo
     si eligió *portafolio completo*— con `export_to_app` → se crea el proyecto
     y queda ACTIVO **con su notación** (no se fuerza a DDD).
  2. Cada diagrama restante con `export_as_view(diagramId, viewName)` → llega
     como pestaña del proyecto activo, con su propia notación (paleta BPMN/C4
     correcta). La herramienta sólo existe en modo app; si no aparece en
     `tools/list`, cae al plan B (proyectos separados) y dilo.
  3. Las vistas caen en el proyecto ACTIVO en ese momento: exporta el proyecto
     y sus vistas SEGUIDOS (sin pausas largas en las que el usuario pueda
     cambiar de proyecto). Límite: 50 vistas custom por proyecto.
- **Un proyecto por diagrama:** `export_to_app` por cada uno.
  - Con el **servidor de la app activo** (HTTP): aparece en el lienzo al
    instante, como proyecto nuevo.
  - En **modo stdio**: se escribe un `.json`; dile al usuario la ruta y que lo
    cargue con «Importar diagrama» (o arrastrándolo a la pantalla de inicio).
  - **Puente stdio → lienzo:** si diseñaste en stdio pero la app está abierta
    con su servidor MCP activo, puedes empujar el `.json` sin importación
    manual: contra `http://127.0.0.1:7331/mcp` llama `import_diagram`
    (`path` = ruta del `.json` exportado, `notation`) y luego `export_to_app`
    o `export_as_view` con el `diagramId` que devuelve (es el slug del archivo).
- Cierra con un resumen: qué diagramas se crearon, qué sección del documento
  cubre cada uno, y qué quedó marcado como «pendiente en documento fuente».

## Presentación (para que se vea profesional, no ambiguo)

El lienzo dibuja cada nodo en una caja de tamaño acotado: **un `name` largo se
recorta**. La legibilidad depende de cómo redactes los nodos, no del layout.

- **Nombre de nodo corto: máx ~4 palabras (~24 caracteres).** Es una etiqueta,
  no una frase. «Validar token», «Cotizar planes», «¿Firma confirmada?».
- **El detalle largo va en `description`, nunca en el `name`.** Contratos,
  endpoints, IDs, aclaraciones «pendiente en documento fuente» → `description`.
- **Las condiciones de una decisión van en el `label` de la arista**, no en el
  nombre del nodo: la Compuerta se llama «¿Usuario existe?» y sus aristas
  «Sí» / «No», no un nodo «Usuario existe → crea perfil».
- **No metas el protocolo/tecnología en el nombre**; va en el `label` de la
  arista (`usa [HTTPS/JSON]`) o en `tags`.
- Prefiere pocos nodos por carril; si un carril acumula muchos, parte el
  proceso por fases (ver límite de ~40 nodos).

## Verificación visual (obligatoria tras exportar)

`render_mermaid` solo revisa la **topología** — el preview auto-ordena y **no**
refleja el layout real del lienzo. Después de `export_to_app`/`export_as_view`:

- Confirma al usuario que el proyecto quedó activo **con la notación correcta**
  (BPMN se ve como BPMN, no bajo la paleta DDD) y que **no** se creó una vista
  duplicada/anexa no deseada.
- Si algún nombre se ve recortado en el lienzo, acórtalo (mueve el texto a
  `description`) y vuelve a exportar. No entregues con labels cortados.

## Límites y calidad

- Máximo ~40 nodos por diagrama: si el proceso es más grande, divide por fases
  (el lienzo pierde legibilidad y el layout se degrada).
- No mezcles notaciones en un diagrama; crea otro.
- Nombres de negocio en el idioma del documento (Lenguaje Ubicuo), sin siglas
  técnicas inventadas.
- Si el documento trae diagramas BPMN embebidos como imagen, RESPETA sus
  carriles y decisiones — son la fuente más fiel del proceso.
