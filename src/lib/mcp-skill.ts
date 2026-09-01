/**
 * @fileOverview Skills de Claude Code embebidos (descarga desde /mcp e
 * instalación vía la herramienta MCP `install_skill`).
 *
 * Por qué embebidos: la app empaquetada no incluye `.claude/`, y un agente
 * externo (Claude Code, Codex) que sólo tiene el servidor MCP delante no puede
 * leer el repo. El contenido de este archivo es la copia entregable de
 * `.claude/skills/**`, que sigue siendo la fuente canónica.
 *
 * Sincronía: el bloque CONTENIDO GENERADO lo escribe `scripts/sync-skills.mjs`
 * (`npm run skills:sync`) leyendo `.claude/skills/`, y el test
 * `__tests__/mcp-skill.test.ts` compara byte a byte con esos archivos: editar un
 * skill sin regenerar deja el gate en rojo.
 *
 * PURO: sin React, sin Electron, sin fs — sólo datos y funciones de texto.
 */

import type { NotationId } from "./notations";

/** Un archivo del skill, con su ruta relativa a la carpeta del skill. */
export interface SkillFile {
  /** Ruta dentro de la carpeta del skill ("SKILL.md", "references/ejemplos.md"). */
  path: string;
  content: string;
}

export interface SkillDefinition {
  /** Id = nombre de la carpeta y del comando (`/documento-a-processflow`). */
  id: string;
  /** Para qué sirve, en una línea (lo muestra `list_skills` y la guía /mcp). */
  summary: string;
  files: SkillFile[];
}

/**
 * Estado real del entorno que se inyecta en el skill instalado. Sin esto, el
 * skill repite instrucciones de conexión que no aplican y menciona herramientas
 * que ese transporte no expone — la fuente más común de que un agente intente
 * `export_as_view` contra un servidor stdio.
 */
export interface SkillConfig {
  /** Transporte por el que el agente llegó: app (HTTP) o repo (stdio). */
  transport: "http" | "stdio";
  /** URL del servidor cuando el transporte es HTTP. */
  url?: string;
  /** Herramientas realmente disponibles en este servidor (de `tools/list`). */
  tools?: string[];
  /** Directorio donde el servidor guarda diagramas y exportaciones. */
  workspace?: string;
  /** Notación por defecto cuando el usuario no declara intención. */
  defaultNotation?: NotationId;
  /** Elementos recomendados por vista antes de cortar. */
  maxNodes?: number;
  /** Cupo de vistas custom por proyecto. */
  viewsLimit?: number;
}

// <<<SKILLS_CONTENT_START>>> generado por scripts/sync-skills.mjs — no editar a mano
export const SKILL_CONTENT: Record<string, Record<string, string>> = {
  "documento-a-processflow": {
    "SKILL.md": `---
name: documento-a-processflow
description: Convierte un documento de proyecto/negocio (PDF, Word, Markdown, presentación) en un PORTAFOLIO de diagramas en Processflow Architect vía MCP — big picture DDD del dominio, BPMN de cada proceso operativo y C4 del paisaje de sistemas — trazados a la fuente, validados y revisados por el humano antes de subir. Úsalo cuando el usuario pida "analiza este documento y modélalo", "pasa este PDF a la app", "genera los diagramas de este proyecto", "modela el proyecto X desde su documentación" o entregue un documento de negocio y quiera verlo en Processflow.
---

# Documento → Portafolio de diagramas en Processflow Architect

Eres un arquitecto de dominio. Tu trabajo: leer UN documento de proyecto
(presentación, PRD, acta, especificación) y convertir lo que el documento
*realmente dice* en un portafolio de 2–4 diagramas complementarios en
Processflow Architect, usando el servidor MCP \`processflow-architect\`.

Dos cosas te juzgan, no una: que el modelo sea correcto **y** que el humano
pueda verificarlo sin releer el documento. De ahí el arnés de este skill:

\`\`\`
ingesta → extracción con cita → ambigüedades (1 ronda) → construir
        → validar calidad → paquete de revisión → aprobación → exportar
\`\`\`

Reglas de oro:

- **Modela lo que el documento dice, no lo que sabes del rubro.** Cada elemento
  lleva su \`source\` (sección/página). Lo que no diga, se pregunta o se marca
  pendiente — nunca se rellena de memoria.
- **No exportas sin aprobación.** \`review_diagram\` produce el paquete de
  revisión; el usuario aprueba o pide cambios. Exportar antes es trabajo que el
  humano tiene que auditar en el lienzo, que es donde más cuesta.

## 0 · Ingesta: mira antes de tocar

En este orden, siempre:

1. \`list_notations\` — confirma que el MCP responde. Si no, ver «Conexión» abajo.
2. **\`get_app_state\`** — qué proyecto está activo, con qué notación, qué vistas
   ya existen y cuánto cupo queda. De aquí sale la decisión de exportar como
   PROYECTO (\`export_to_app\`, reemplaza el activo) o como VISTA
   (\`export_as_view\`, suma una pestaña). Sin esta llamada estarías pisando
   trabajo del usuario a ciegas.
3. **\`list_views\`** — las pestañas que ya existen, con su notación y tamaño. Con
   \`project\` mira OTRO proyecto guardado sin abrirlo: así reutilizas un modelo ya
   hecho (p. ej. el paisaje C4 de otro producto) en vez de inventarlo de nuevo.
   \`get_view\` con \`importAs: true\` trae esa vista como diagrama EDITABLE.
4. **\`list_artifacts\`** — documentos que la IA local del usuario ya generó
   (drivers, riesgos, propuesta, roadmap, ADRs). \`get_artifact\` te da el
   Markdown: es fuente citable de PRIMERA mano sobre lo que el usuario decidió,
   y contradecirla sin decirlo es el error más caro que puedes cometer acá.
5. \`list_diagrams\` — ¿hay un diseño en curso que retomar (\`get_diagram\`) en vez
   de empezar de cero? Devuelve también los NOMBRES de los elementos: si uno de
   ellos ya describe lo que ibas a crear, reusá ESE nombre en vez de inventar un
   sinónimo («Servicio de listas» y «OFAC Screening» son el mismo sistema con dos
   nombres, y eso es la segunda versión de la verdad).
   Si el workspace tiene organizaciones (\`list_orgs\`), \`list_diagrams\` muestra SÓLO
   la activa: antes de concluir «no hay nada», mirá si estás parado donde va este
   trabajo (\`use_org\`) o barré todas con \`list_diagrams(org: "*")\`.
6. \`describe_notation\` de cada notación que vayas a usar — los \`type\` válidos
   salen SOLO de ahí.

No sigas sin conexión y sin haber leído el estado.

**Qué hacer con lo que leas:** si un artefacto o una vista ya cubre parte del
material, dilo en el plan («el BPMN de Cobros ya existe: lo extiendo, no lo
recreo») y cita el artefacto en la columna «cita» de la ficha igual que citas el
documento. Un diagrama que contradice un ADR aprobado se declara como
ambigüedad (\`record_ambiguity\`), no se resuelve por tu cuenta.

## 1 · Leer la fuente y extraer CON CITA

Lee el documento COMPLETO (con PDFs, por rangos de páginas). Llena esta ficha;
la columna «cita» es obligatoria, es la que sostiene la revisión humana:

| Qué buscar | Señal en el documento | Va a… | Cita |
|---|---|---|---|
| Actores y organizaciones | roles, responsables, RACI | DDD (Actor), BPMN (Pool/Carril), C4 (Persona) | §/pág. |
| Procesos operativos | flujos paso a paso, listas numeradas | BPMN (uno por proceso) | §/pág. |
| Decisiones y reglas | "si… entonces", aprobaciones, SLA/plazos | BPMN (Compuertas, Temporizadores), DDD (Política/Regla) | §/pág. |
| Sistemas y plataformas | nombres propios de software, "API", "integración" | C4 (Sistema/Contenedor), DDD (Sistema Externo) | §/pág. |
| Eventos de negocio | hitos en pasado: "póliza emitida" | DDD (Evento) | §/pág. |
| Comandos/acciones | verbos: cotizar, emitir, facturar | DDD (Comando) | §/pág. |
| Áreas de negocio | equipos, departamentos, workstreams | DDD (Contexto Delimitado/Subdominio) | §/pág. |

Esa cita se pasa tal cual en el parámetro \`source\` de \`add_node\` /
\`add_container\`. La app la muestra en la descripción del elemento: el revisor
lee «elemento ← fuente» sin volver al PDF.

## 2 · Ambigüedades: una sola ronda, registrada

Con la ficha llena, NO construyas. Primero registra en el diagrama lo que el
documento no cierra —\`record_ambiguity\`— y después pregunta TODO junto (una
ronda, con \`AskUserQuestion\` si está disponible):

Registra como ambigüedad sólo lo que cambia el diagrama:

- **Alternativas sin decidir** (dos opciones de flujo): pregunta cuál modelar,
  con el nombre que les da el documento.
- **Contradicciones** entre secciones (responsables o pasos que no coinciden):
  pregunta cuál versión vale.
- **Vacíos que cambian la topología** (no se sabe quién ejecuta un paso, si una
  decisión existe). Los vacíos menores NO se preguntan: van como
  «pendiente en documento fuente» en la \`description\`.

En la misma ronda decide con el usuario:

1. **Alcance** — portafolio completo (DDD + BPMN + C4), sólo el dominio, o sólo
   un proceso (di cuáles detectaste).
2. **Entrega** — un proyecto con vistas (recomendado si hay app conectada) o un
   proyecto por diagrama. Lo que \`get_app_state\` diga manda: sin app, no hay
   vistas.
3. **Prioridad de procesos** si detectaste ≥3.

Cada respuesta se cierra con \`resolve_ambiguity\`: queda en el modelo como
«decisión tomada» y llega al humano en la revisión. Lo que quede sin respuesta
viaja como «pendiente en la fuente» — declarado, no inventado.

**Precedencia de notación (regla dura):** si el usuario pide EXPLÍCITAMENTE una
notación o tipo de diagrama —«hazme el BPMN», «el flujo», «el C4», «la
secuencia»—, ESE es el entregable principal y va con \`export_to_app\`, con su
propia notación y paleta. **No antepongas un DDD que nadie pidió** ni conviertas
lo pedido en vista anexa de un DDD. El portafolio por defecto (abajo) aplica
SOLO si el usuario dice «lo que veas mejor» o no responde.

Plantilla por defecto:

1. **\`ddd\` — Big Picture del dominio**: Contextos Delimitados por área; dentro
   Comandos → Eventos; Actores y Sistemas Externos alrededor; Políticas entre
   contextos.
2. **\`bpmn\` — Un diagrama por proceso crítico** (1–2): el que el documento
   detalla con más pasos/decisiones. Pools por organización, Carriles por rol.
3. **\`c4\` — Paisaje de sistemas** (si nombra ≥3 sistemas): Límite de Sistema por
   organización, Personas fuera, relaciones etiquetadas con la integración.

Anuncia el plan final en 2–3 líneas antes de construir.

## 3 · Construir (bucle MCP)

Antes de cada notación, lee su ejemplo trabajado en \`references/ejemplos.md\`
(traducción documento→llamadas MCP, claves de calidad, antipatrones).

Para CADA diagrama:

1. \`create_diagram\` (nombre = «Proyecto X · Vista Y») → guarda el \`diagramId\`.
2. \`add_container\` primero (Contextos/Pools/Carriles/Límites), luego \`add_node\`
   con \`container\` y \`source\`, luego \`add_edge\`.
   - Ids en kebab-case, únicos en TODO el diagrama; prefija con el carril
     (\`fc-investiga\`, \`enr-valida\`).
   - **Los contenedores NO se anidan**: el lienzo dibuja bandas y marcos planos.
     Elige UN nivel — Pools (participantes) *o* Carriles (roles) — y pon los
     elementos dentro de ese nivel. Un Pool con sus Carriles al lado queda vacío
     y el lienzo dibuja una banda en blanco (\`validate_diagram\` lo reporta como
     \`CONTENEDOR-VACIO\`).
   - **BPMN**: un Evento de Inicio por pool; cada rama de compuerta con \`label\`
     de condición; entre Pools sólo flujo de mensaje (\`dashed\`); dentro del pool,
     secuencia; todo camino cierra en Evento de Fin.
   - **DDD**: cadena Comando → Evento; la Política conecta Evento de un contexto
     con Comando de otro.
   - **C4**: TODA relación con etiqueta de verbo + tecnología.
3. \`suggest_views\` cuando el diagrama crece: te dice si hay que cortarlo por
   contenedor/fase y qué mirada complementaria sostiene el material. No metas 60
   elementos en una vista.

### El diagrama fijado y el proyecto destino

\`create_diagram\` e \`import_diagram\` dejan **fijado** el modelo: las llamadas
siguientes pueden omitir \`diagramId\`. Con varios modelos en curso, \`use_diagram\`
cambia cuál es el activo (queda guardado en el workspace). Pasar \`diagramId\`
explícito siempre gana.

\`export_to_app\` **actualiza** el proyecto de la app —el que diga \`project\`, el de
la configuración del servidor, o el abierto— en vez de crear una copia: conserva
la posición que el humano les dio a las cajas y fusiona sus notas. Usá
\`mode: "new"\` sólo cuando de verdad querés un proyecto aparte. Si el proyecto que
nombraste no existe, la herramienta avisa en vez de inventar uno: mirá
\`get_app_state\` antes de entregar.

\`export_as_view\` hace lo mismo con las pestañas: \`replace: true\` actualiza la vista que ya se
llama así en vez de dejar una segunda igual (y sin gastar cupo de vistas). Si esa pestaña no
existe, avisa con las que hay en vez de crearla por su cuenta.

### Recoger lo que ensuciás

Las pestañas se pueden borrar (\`delete_view\`) y renombrar (\`rename_view\`) por nombre exacto. Antes
sólo se podían crear, así que un duplicado lo limpiaba el humano a mano. Borrar es destructivo: no
hay coincidencia parcial ni «todas», y las vistas del sistema no se tocan.

### Los ids se copian de \`get_diagram\`, no del dibujo

Mermaid no admite guiones en un id, así que en el diagrama salen con guiones bajos. \`get_diagram\`
declara la equivalencia cuando eso pasa; usá el id REAL. Las herramientas aceptan el id dibujado si
no hay ambigüedad, pero el que vale es el que devuelve \`add_node\`.

### Profundidad: otra VISTA, no un contenedor dentro de otro

Los contenedores **no se anidan** (el formato de proyecto es de un nivel, ADR 0002). Para el nivel
de abajo —los Componentes de un Contenedor en C4, un subproceso dentro de un carril en BPMN— creá
OTRA vista con ese detalle y enlazala desde el elemento padre con \`viewRef\`. Meterlo como banda
hermana en el mismo lienzo dice que son del mismo rango, que es justo lo que no son.

### Estado: documentar lo que HAY vs diseñar lo que VIENE

\`add_node\`, \`add_container\` y \`update_element\` aceptan \`estado\`: \`existente\` (ya
está en producción), \`modificado\` (existe y este diseño lo cambia), \`nuevo\` (lo
trae este diseño), \`sin_cambios\`, \`eliminado\`. Por defecto es \`nuevo\`: si estás
documentando un sistema vivo y no lo declarás, el lienzo pinta como propuesta lo
que ya existe y se pierde justo la distinción que el humano necesita para decidir.

### Propiedades: dónde vive la caja y por dónde se le habla

\`add_node\`, \`add_container\` y \`update_element\` aceptan \`metadata\`: la tabla de
propiedades del elemento, \`{clave, valor, tipo?}\` con **dónde vive de verdad** y
los datos que lo enriquecen. Tipos: \`texto\` · \`numero\` · \`booleano\` · \`url\` ·
\`fecha\`; el valor se valida según su tipo.

**Claves canónicas — usá estas, no sinónimos:** \`repo\` (url) · \`puerto\` (numero) ·
\`endpoint\` (url) · \`owner\` (texto) · \`wiki\` (url).

\`repo\` y \`puerto\` son **obligatorias en lo desplegable** (C4: \`Sistema\`,
\`Contenedor\`, \`Componente\`, \`Base de Datos\`; UML: \`Componente\`, \`Nodo\`,
\`Artefacto de Despliegue\`) y \`validate_diagram\` FALLA mientras falten: son los
datos que quien va a construir busca a mano. Un documento de negocio muchas veces
no los trae — entonces poné el valor explícito \`pendiente\` y decílo en el resumen
al humano; nunca inventes una url. En el big picture DDD y en los BPMN no se
exigen.

\`\`\`
add_node { id: "c4-api-pagos", name: "API de Pagos", type: "Contenedor", container: "Pagos",
  metadata: [ { clave: "repo",   valor: "https://github.com/acme/pagos-svc", tipo: "url" },
              { clave: "puerto", valor: "8080", tipo: "numero" },
              { clave: "owner",  valor: "Equipo Pagos", tipo: "texto" } ] }
\`\`\`

Reglas: la clave repetida **reemplaza** su valor; sólo las urls \`http(s)\` se
vuelven enlace en la app; para sumar una propiedad después, \`update_element\` con
\`metadata\` (agrega o reemplaza por clave) y \`metadataRemove\` para borrar. Los
alias (\`repositorio\`, \`port\`, \`dueño\`…) se reconocen, pero \`review_diagram\` avisa.

No lo confundas con \`source\`: la cita dice de **dónde salió** el elemento en el
documento (sostiene la revisión); la propiedad dice **dónde vive** el artefacto
real.

### Especificación: el contrato de cada caja

Un documento de negocio suele traer requisitos y criterios de aceptación. Eso NO
va en la descripción: va en la especificación del elemento, que la app muestra en
el tab «Spec» de su ficha.

\`\`\`
set_element_spec { id: "c4-api-pagos", spec: {
  featureName: "Cobro recurrente",
  input: "<lo que pide el documento, con sus palabras>",
  stories: [ { titulo: "Cobrar la cuota", prioridad: "P1",
               porQue: "…", pruebaIndependiente: "…",
               escenarios: [ { given: "…", when: "…", then: "…" } ] } ],
  requirements: [ { texto: "El sistema MUST …" } ],
  criteria: [ { texto: "… con un número medible" } ] } }
\`\`\`

- Lo que el documento **no decide, no se inventa**: \`needsClarification: true\` en
  ese requisito, y además registrá la ambigüedad con \`record_ambiguity\`.
- **Es una pasada propia, después de crear las cajas.** Un portafolio de
  diagramas sin specs devuelve al documento a la persona que lo trajo: en la app,
  el agente lee el contrato con \`read_element\`, y si no hay spec sólo puede
  responder con el resumen de la descripción.
- \`get_element_spec\` antes de reescribir (no pises lo que puso una persona), o
  \`set_element_spec { merge: true }\` para ir completando caja por caja sin releer
  el contrato entero. \`spec_to_markdown\` para pegar el contrato en una issue.
- **\`review_specs\` cierra la pasada**: además de los elementos sin spec, marca
  criterios sin número (no medibles) y requisitos que nombran tecnología. Nada se
  entrega hasta que devuelva lista vacía o le declares la excepción al usuario.

## 4 · Validar calidad (no sólo validez)

\`validate_diagram\` responde dos cosas: si la app puede importarlo (errores) y si
está bien modelado (hallazgos de calidad, con regla).

- **Errores y hallazgos \`grave\`**: se corrigen, sin excepción — ramas sin
  condición, proceso sin inicio/fin, relación C4 sin etiqueta.
- Para corregir, **\`update_element\` / \`update_edge\`**: cambian nombre, descripción,
  cita o etiqueta conservando el id y las relaciones. No borres y recrees para
  acortar un nombre: perderías sus aristas. Si acortás, dejá el texto completo en
  la \`description\` — no se pierde y el revisor puede contrastarlo.
- Si retomás un diagrama viejo o importado, **\`relayout_diagram\`** antes de
  exportar: los modelos con posiciones guardadas conservan su disposición vieja.
- **Avisos**: se corrigen o se justifican al usuario en una línea.
- \`render_mermaid\` para comprobar que la topología cuenta la historia del
  documento (el preview auto-ordena: NO refleja el layout real del lienzo).

## 5 · Paquete de revisión (antes de subir nada)

\`review_diagram(diagramId, sourceLabel)\` devuelve, siempre en el mismo orden:
la historia en Mermaid · la tabla elemento ← fuente agrupada por contenedor ·
decisiones tomadas y pendientes · hallazgos · veredicto.

Muéstralo al usuario y **espera aprobación**. Si el veredicto es ❌, ni lo
presentes como listo: corrige primero. Este paso existe para que revisar cueste
minutos y no una tarde: no lo resumas ni lo saltes «porque el diagrama se ve
bien».

## 6 · Exportar según el estado real de la app

Con lo que dijo \`get_app_state\` (vuelve a llamarlo si pasó tiempo):

- **Una sola notación pedida**: \`export_to_app\` de ESE diagrama y nada más. Es
  el modelo del proyecto, con su notación. No crees un DDD contenedor.
- **Proyecto con vistas** (sólo con app conectada por HTTP):
  1. El principal con \`export_to_app\` (el DDD sólo si eligió portafolio
     completo) → crea el proyecto y queda activo con SU notación.
  2. Cada diagrama restante con \`export_as_view(diagramId, viewName)\` → pestaña
     del proyecto activo, con su paleta. Si la herramienta no está en
     \`tools/list\`, cae a proyectos separados y dilo.
  3. Las vistas caen en el proyecto ACTIVO: exporta proyecto y vistas SEGUIDOS.
     Límite: 50 vistas por proyecto (\`get_app_state\` te dice el cupo usado).
- **Un proyecto por diagrama**: \`export_to_app\` por cada uno. Con app activa
  aparece al instante; en stdio queda un \`.json\` que el usuario carga con
  «Importar diagrama».
- **Puente stdio → lienzo**: si diseñaste en stdio y la app está abierta con su
  servidor activo, contra \`http://127.0.0.1:7331/mcp\` llama \`import_diagram\`
  (\`path\` del \`.json\`, \`notation\`) y luego \`export_to_app\`/\`export_as_view\` con
  el \`diagramId\` devuelto.

## 7 · Cierre

Resume: qué diagramas se crearon, qué sección del documento cubre cada uno, qué
quedó «pendiente en la fuente» y qué decisiones tomó el usuario. Si algún nombre
se ve recortado en el lienzo, acórtalo y vuelve a exportar.

## Conexión

- **Modo app (recomendado — el export llega DIRECTO al lienzo):**
  Processflow Architect → Ajustes → Servidor MCP → «Activar servidor», y en el
  cliente MCP:
  \`\`\`json
  { "mcpServers": { "processflow-architect": { "type": "http", "url": "http://127.0.0.1:7331/mcp" } } }
  \`\`\`
- **Modo repo (dev, stdio):** abrir el repositorio con Claude Code (su
  \`.mcp.json\` registra el server). Los exports quedan como \`.json\` importables.

## Presentación y límites

Estos dos números salen de cómo dibuja el lienzo, no de una preferencia: pasarse
significa que el usuario ve texto cortado o tapado.

- **Nombre de nodo: máx ~21 caracteres.** «Validar token», «Cotizar planes»,
  «¿Firma confirmada?». Más largo se recorta con «…» dentro de la caja. El
  detalle completo va en \`description\`.
- **Etiqueta de arista: máx ~30 caracteres**, verbo + \`[tecnología]\` («cobra el
  pedido [HTTPS]»). Se dibuja suelta sobre la línea, sin caja: más larga invade
  los nodos vecinos y, con varias juntas, tapa el diagrama. El detalle largo va
  en la descripción de la relación.
- Las condiciones van en el \`label\` de la arista, no en el nombre del nodo; el
  protocolo también, o en \`tags\`.
- Máximo ~40 elementos por diagrama; si te pasas, \`suggest_views\` y divide.
- No mezcles notaciones en un diagrama.
- Nombres en el idioma del documento (Lenguaje Ubicuo), sin siglas inventadas.
- Si el documento trae BPMN embebido como imagen, respeta sus carriles y
  decisiones: es la fuente más fiel del proceso.
`,
    "references/ejemplos.md": `# Ejemplos de referencia — diagramas de calidad

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
  description: "Confirma pagos con la pasarela; cancela pedidos sin pago a las 24 h.",
  source: "PRD §4.2 (p. 11)" }
add_node { id: "cmd-pagar-pedido", name: "Pagar Pedido", type: "Comando", container: "Pagos", source: "PRD §4.2 (p. 11)" }
add_node { id: "evt-pago-confirmado", name: "Pago Confirmado", type: "Evento", container: "Pagos", source: "PRD §4.2 (p. 11)" }
add_node { id: "pol-cancelacion-24", name: "Cancelar sin pago", type: "Política", container: "Pagos", description: "Si el pago no se confirma en 24 h, el pedido se cancela.", source: "PRD §4.2 (p. 11)" }
add_edge { from: "cmd-pagar-pedido", to: "evt-pago-confirmado", label: "pasarela de pagos [API]" }
add_edge { from: "cmd-pagar-pedido", to: "pol-cancelacion-24", label: "si no se confirma" }
\`\`\`

\`source\` es la cita de dónde sale cada elemento. No es decorativo: la tabla
«elemento ← fuente» de \`review_diagram\` se construye con eso, y sin ella el
revisor tiene que releer el documento (que es cuando la revisión no ocurre).

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

1. \`validate_diagram\` sin errores, sin hallazgos \`grave\` y sin avisos de nodos
   aislados.
2. \`render_mermaid\`: ¿el flujo se lee de inicio a fin contando la historia del
   documento? ¿Las decisiones tienen todas sus ramas etiquetadas?
3. Nombres = Lenguaje Ubicuo del documento (mismo idioma, mismos términos),
   **de máx ~21 caracteres**, y etiquetas de arista **de máx ~30** (verbo +
   \`[tecnología]\`); el detalle y las condiciones «si X → Y» van en \`description\`,
   no en el \`name\` (se recorta) ni en una etiqueta kilométrica (tapa el lienzo).
4. Cada elemento con su \`source\`; lo dudoso, registrado con \`record_ambiguity\` o
   marcado «pendiente en documento fuente» en la descripción.
5. ≤ ~40 nodos; si te pasas, \`suggest_views\` y divide.
6. \`review_diagram\` con veredicto ✅ y **aprobado por el usuario**. Recién ahí
   \`export_to_app\` / \`export_as_view\`, según lo que diga \`get_app_state\`.

## Antipatrones (no hacer)

- Inventar tipos (\`type: "Proceso"\` no existe) — usa SOLO \`describe_notation\`.
- Un solo diagrama mezclando notaciones o TODO el documento en un BPMN gigante.
- Compuertas encadenadas sin tareas entre medias para «ahorrar nodos».
- Ids genéricos (\`nodo-1\`, \`tarea-2\`): impiden conectar bien y depurar.
- Modelar conocimiento del rubro que el documento no dice (el diagrama debe
  ser defendible línea a línea contra el documento fuente).
- Exportar sin \`get_app_state\`: crea proyectos duplicados o reemplaza el que el
  usuario tenía abierto.
- Exportar sin mostrar \`review_diagram\`: la revisión se termina haciendo en el
  lienzo, que es donde más cuesta y donde ya no hay trazabilidad a la fuente.
`,
  },
  "disenar-diagrama": {
    "SKILL.md": `---
name: disenar-diagrama
description: Diseña UN diagrama (Event Storming DDD, BPMN, C4 o UML) en Processflow Architect usando el MCP processflow-architect — lee la fuente (documentos o código), construye el diagrama trazado a ella, lo valida y lo pasa por revisión humana antes de exportarlo al lienzo. Úsalo cuando el usuario pida "diseña un diagrama", "modela este dominio", "crea el event storming", "haz el BPMN de este proceso", "modela la arquitectura C4" o "lleva esto a Processflow".
---

# Diseñar un diagrama con el MCP de Processflow Architect

Eres un modelador de dominios. Tu trabajo: leer el material que indique el
usuario, extraer el modelo y construirlo como diagrama VÁLIDO y DEFENDIBLE en
Processflow Architect con las herramientas del MCP \`processflow-architect\`.

Defendible = cada elemento se puede contrastar contra la fuente sin releerla, y
el humano aprueba antes de que el diagrama toque su lienzo. Para un portafolio
completo desde un documento largo, usa el skill \`documento-a-processflow\`.

Arnés: \`ingesta → extracción con cita → ambigüedades → construir → validar →
revisión → exportar\`.

## 0 · Ingesta (antes de crear nada)

1. \`list_notations\` — comprueba que el MCP responde (si no, ver «Conexión»).
2. **\`get_app_state\`** — proyecto activo, su notación, vistas existentes y cupo.
   Decide con eso si el diagrama va como PROYECTO (\`export_to_app\`, reemplaza el
   activo) o como VISTA (\`export_as_view\`, suma pestaña). Sin esta llamada,
   exportar es pisar trabajo del usuario a ciegas.
3. **\`list_views\`** — qué vistas tiene el proyecto (y \`list_views\` con \`project\`
   para mirar OTRO proyecto guardado sin abrirlo). Si tu diagrama ya existe como
   vista, \`get_view\` con \`importAs: true\` te lo trae como diagrama EDITABLE:
   continúas ese modelo en vez de rehacerlo y devolverlo duplicado.
4. **\`list_artifacts\`** — documentos que la IA local ya generó (drivers, riesgos,
   propuesta, roadmap, ADRs). Si hay uno que describe lo que vas a modelar,
   \`get_artifact\` y trátalo como FUENTE citable: \`source: "Drivers v2 §NFR"\`.
5. \`list_diagrams\` / \`get_diagram\` — ¿hay un diseño en curso que retomar?
   \`list_diagrams\` devuelve los NOMBRES de los elementos de cada diagrama: si uno
   ya describe lo que ibas a crear, reusá ESE nombre en vez de un sinónimo.
   \`import_diagram\` si el usuario trae un \`.json\` exportado. Ojo: si hay
   organizaciones (\`list_orgs\`), sólo ves la ACTIVA — \`use_org\` para cambiar, o
   \`list_diagrams(org: "*")\` para barrer todas antes de dar algo por inexistente.

Reutilizar es la regla: rehacer a mano algo que ya está en la app es trabajo
duplicado y, peor, una segunda versión de la verdad que el humano tiene que
reconciliar.

## 1 · Elegir notación

| Material | Notación |
|---|---|
| Dominio de negocio, requisitos, historias de usuario | \`ddd\` (Event Storming) |
| Proceso paso a paso, flujo operativo, swimlanes | \`bpmn\` |
| Arquitectura de sistemas, servicios, despliegue | \`c4\` |
| Clases, estados de un objeto, casos de uso | \`uml\` |

**Si el usuario pide una notación EXPLÍCITAMENTE** («haz el BPMN», «el C4», «la
secuencia»), usa ESA — no la cambies por \`ddd\`. Sólo si el material es ambiguo y
no declara intención: pregunta UNA vez; por defecto \`ddd\`.

Después, SIEMPRE \`describe_notation\`: el \`type\` de \`add_node\`/\`add_container\`
debe ser EXACTAMENTE uno de los devueltos (están en español). Nunca inventes
tipos.

## 2 · Analizar la fuente y extraer con cita

Lee los documentos/código ANTES de crear nodos. Por cada elemento anota de dónde
sale (sección, página, archivo:línea) y pásalo en el parámetro \`source\`: la app
lo muestra en la descripción y es lo que el revisor contrasta.

- **ddd**: actores, comandos (imperativo), eventos (pasado), agregados y
  contextos (contenedores), políticas, sistemas externos.
- **bpmn**: pools/carriles por responsable, eventos de inicio/fin, tareas,
  una compuerta por CADA decisión con sus ramas etiquetadas.
- **c4**: personas, sistemas, contenedores dentro de Límite de Sistema,
  relaciones etiquetadas con tecnología.
- **uml**: clases/estados/casos de uso según el subtipo.

Lo que la fuente no diga no se rellena de memoria.

## 3 · Ambigüedades: una ronda, registrada

Lo que la fuente no cierra y **cambia el diagrama** (quién ejecuta un paso, dos
alternativas sin decidir, contradicciones) se registra con \`record_ambiguity\` y
se pregunta TODO junto en una sola ronda (\`AskUserQuestion\` si está disponible).
Cada respuesta se cierra con \`resolve_ambiguity\`. Lo menor no se pregunta: va
como «pendiente en la fuente» en la \`description\`.

## 3b · Metadatos del proyecto: lo que el humano lee aparte del dibujo

La app tiene un formulario «Metadatos del proyecto» y \`export_to_app\` **reemplaza
el proyecto**: lo que no declares desaparece. Antes de exportar sobre algo que ya
existe, \`get_diagram\` dice qué hay (hotspots, responsables, notas propias, read
models); si retomaste el diseño con \`import_diagram\`, esos campos ya vienen
cargados y no hay que reescribirlos.

- \`set_project_meta\` — **hotspots**: lo que el equipo TIENE que discutir (una
  decisión sin dueño, un flujo contradictorio, un límite que nadie confirma), no
  cualquier detalle pendiente; lo que la fuente no cierra y cambia el diagrama va
  en \`record_ambiguity\`. **responsables**: quién responde por el modelo.
  **notes**: las notas del proyecto. Las **notas del humano no se pisan**: quedan
  arriba y el resumen de ambigüedades se agrega debajo, sin duplicarse en cada
  export.
- \`add_read_model\` / \`remove_read_model\` — una proyección de la vista de datos:
  qué pantalla o consulta se arma con qué eventos (\`projects\`), con qué reglas de
  interfaz (\`uiPolicies\`) y con qué tecnologías. No es una caja del lienzo. El
  mismo nombre reemplaza, no duplica.

## 4 · Construir

1. \`create_diagram\` → guarda el \`diagramId\`.
2. \`add_container\` PRIMERO (agregados, contextos, pools, límites, paquetes): su
   \`name\` es la clave que usan los hijos. Los contenedores **no se anidan** (el
   lienzo dibuja bandas planas): elige UN nivel —participante o rol— y mete los
   elementos ahí; un contenedor sin hijos se dibuja como banda vacía y
   \`validate_diagram\` lo reporta (\`CONTENEDOR-VACIO\`).
3. \`add_node\` con \`container\` y \`source\`; sin \`container\` va al Big Picture.
4. \`add_edge\` para TODAS las relaciones — regla dura: **ningún nodo sin aristas**
   (el lienzo descarta los aislados). Etiqueta las aristas: condición de la rama
   en BPMN, verbo + tecnología en C4, «dispara»/«consulta» en DDD.

Convenciones: nombres en el idioma de la fuente, **\`name\` de máx ~21 caracteres**
(más largo lo recorta el lienzo) y **\`label\` de arista de máx ~30** (verbo +
\`[tecnología]\`; se dibuja suelta sobre la línea y tapa los nodos vecinos). El
detalle va en \`description\`. Ids autogenerados salvo necesidad.

### El diagrama fijado y el proyecto destino

\`create_diagram\` e \`import_diagram\` dejan **fijado** el modelo: las llamadas
siguientes pueden omitir \`diagramId\`. Con varios modelos en curso, \`use_diagram\`
cambia cuál es el activo (queda guardado en el workspace). Pasar \`diagramId\`
explícito siempre gana.

\`export_to_app\` **actualiza** el proyecto de la app —el que diga \`project\`, el de
la configuración del servidor, o el abierto— en vez de crear una copia: conserva
la posición que el humano les dio a las cajas y fusiona sus notas. Usá
\`mode: "new"\` sólo cuando de verdad querés un proyecto aparte. Si el proyecto que
nombraste no existe, la herramienta avisa en vez de inventar uno: mirá
\`get_app_state\` antes de entregar.

\`export_as_view\` hace lo mismo con las pestañas: \`replace: true\` actualiza la vista que ya se
llama así en vez de dejar una segunda igual (y sin gastar cupo de vistas). Si esa pestaña no
existe, avisa con las que hay en vez de crearla por su cuenta.

### Recoger lo que ensuciás

Las pestañas se pueden borrar (\`delete_view\`) y renombrar (\`rename_view\`) por nombre exacto. Antes
sólo se podían crear, así que un duplicado lo limpiaba el humano a mano. Borrar es destructivo: no
hay coincidencia parcial ni «todas», y las vistas del sistema no se tocan.

### Los ids se copian de \`get_diagram\`, no del dibujo

Mermaid no admite guiones en un id, así que en el diagrama salen con guiones bajos. \`get_diagram\`
declara la equivalencia cuando eso pasa; usá el id REAL. Las herramientas aceptan el id dibujado si
no hay ambigüedad, pero el que vale es el que devuelve \`add_node\`.

### Profundidad: otra VISTA, no un contenedor dentro de otro

Los contenedores **no se anidan** (el formato de proyecto es de un nivel, ADR 0002). Para el nivel
de abajo —los Componentes de un Contenedor en C4, un subproceso dentro de un carril en BPMN— creá
OTRA vista con ese detalle y enlazala desde el elemento padre con \`viewRef\`. Meterlo como banda
hermana en el mismo lienzo dice que son del mismo rango, que es justo lo que no son.

### Estado: documentar lo que HAY vs diseñar lo que VIENE

\`add_node\`, \`add_container\` y \`update_element\` aceptan \`estado\`: \`existente\` (ya
está en producción), \`modificado\` (existe y este diseño lo cambia), \`nuevo\` (lo
trae este diseño), \`sin_cambios\`, \`eliminado\`. Por defecto es \`nuevo\`: si estás
documentando un sistema vivo y no lo declarás, el lienzo pinta como propuesta lo
que ya existe y se pierde justo la distinción que el humano necesita para decidir.

### Propiedades: dónde vive la caja y por dónde se le habla

\`add_node\`, \`add_container\` y \`update_element\` aceptan \`metadata\`: la tabla de
propiedades del elemento, una lista de \`{clave, valor, tipo?}\` con **dónde vive de
verdad** y **los datos que lo enriquecen**. Es lo que convierte el diagrama en
algo navegable: un clic desde la ficha al código.

Tipos del valor: \`texto\` · \`numero\` · \`booleano\` · \`url\` · \`fecha\`. El valor se
**valida** según su tipo, así que \`{clave:"puerto", valor:"ocho mil",
tipo:"numero"}\` se rechaza.

**Claves canónicas — usá estas, no sinónimos:**

| Clave | Tipo | ¿Obligatoria? | Para qué |
|---|---|---|---|
| \`repo\` | url | **sí**, en lo desplegable | dónde está el código |
| \`puerto\` | numero | **sí**, en lo desplegable | por dónde se le habla |
| \`endpoint\` | url | no | la dirección pública por la que se consume |
| \`owner\` | texto | no | a quién se le pregunta |
| \`wiki\` | url | no | dónde está explicado con más detalle |

**Desplegable** = tiene código y se despliega: en C4 \`Sistema\`, \`Contenedor\`,
\`Componente\`, \`Base de Datos\`; en UML \`Componente\`, \`Nodo\`, \`Artefacto de
Despliegue\`. Un \`Sistema Externo\` no lo es (no es nuestro código), y un mapa de
dominio (DDD) o un proceso (BPMN) tampoco: ahí no se exige nada.

\`validate_diagram\` **falla** mientras un elemento desplegable no declare \`repo\` y
\`puerto\`: son los datos que quien va a construir busca a mano cuando faltan. Si
todavía no se saben, el valor explícito \`pendiente\` cuenta como declaración
consciente — lo que no se acepta es el silencio.

\`\`\`
add_node { id: "c4-api-pagos", name: "API de Pagos", type: "Contenedor", container: "Pagos",
  metadata: [ { clave: "repo",     valor: "https://github.com/acme/pagos-svc", tipo: "url" },
              { clave: "puerto",   valor: "8080", tipo: "numero" },
              { clave: "endpoint", valor: "https://api.acme.com/pagos", tipo: "url" },
              { clave: "owner",    valor: "Equipo Pagos", tipo: "texto" } ] }
\`\`\`

Reglas: la clave repetida **reemplaza** su valor (no duplica); sólo las urls
\`http(s)\` se vuelven enlace en la app; para sumar una propiedad después usá
\`update_element\` con \`metadata\` —agrega o reemplaza por clave, no pisa las que ya
estaban— y \`metadataRemove\` para borrar por clave. Los alias (\`repositorio\`,
\`repo_url\`, \`port\`, \`dueño\`…) se reconocen, pero \`review_diagram\` avisa: escribí
la canónica.

No lo confundas con \`source\`: la cita dice de **dónde salió** el elemento en la
documentación (sostiene la revisión); la propiedad dice **dónde vive** el
artefacto real. Poné propiedades cuando la fuente las da o cuando estás modelando
desde código; no las inventes: una url adivinada es peor que ninguna, y para eso
está \`pendiente\`.

### Especificación: qué debe hacer la caja y cómo se sabe

Cada elemento puede llevar su **contrato**, que en la app se ve en el tab «Spec»
de su ficha. Se escribe con \`set_element_spec\`:

\`\`\`
set_element_spec { id: "c4-api-pagos", spec: {
  featureName: "Cobro recurrente",
  input: "que la cuota se cobre sola cada mes",
  stories: [ { titulo: "Cobrar la cuota", prioridad: "P1",
               porQue: "sin cobro no hay negocio",
               pruebaIndependiente: "con una cuota vencida",
               escenarios: [ { given: "una cuota vencida", when: "corre el cobro",
                               then: "la cuota queda pagada" } ] } ],
  edgeCases: ["¿y si la tarjeta se rechaza?"],
  requirements: [ { texto: "El sistema MUST reintentar el cobro 3 veces" } ],
  entities: [ { nombre: "Cuota", descripcion: "lo que se cobra cada mes" } ],
  criteria: [ { texto: "99 % de los cobros se resuelven en un intento" } ] } }
\`\`\`

- **La spec no es opcional ni es el final del trabajo: es una PASADA propia.**
  Creá primero los elementos y las relaciones; después volvé caja por caja a
  escribir el contrato. Lo que no quepa en el nombre va a la \`description\`, pero
  lo que el documento DECIDE —qué debe hacer, con qué se verifica— va acá: la
  descripción la lee el humano de reojo, la spec la lee quien construye.
- Por defecto **reemplaza** la spec anterior. Para completarla sin reescribirla,
  \`set_element_spec { merge: true }\`: lo que mandás pisa (nombre, estado) o se
  suma (historias, requisitos, criterios, entidades, casos límite) y lo que no
  mandás se conserva. Un ítem con el mismo texto se reemplaza en su sitio, así
  reintentar no duplica ni renumera los \`FR-00N\` que alguien ya citó afuera.
  Sin \`merge\`, una spec vacía borra la que hubiera.
- Lo que la fuente **no decide, no se inventa**: el requisito se marca
  \`needsClarification: true\` y queda visible como pendiente.
- Los requisitos van sin tecnología («El sistema MUST …») y los criterios de
  éxito **con número**: son la parte verificable.
- \`spec_to_markdown\` devuelve la plantilla lista para pegar en una issue o un PR
  (de un elemento, o de todo el diagrama sin \`id\`).
- \`review_specs\` dice qué elementos no tienen spec, cuáles tienen requisitos sin
  ningún criterio con el que verificarlos, cuáles tienen historias sin
  escenarios, **qué criterio no tiene ningún número** (no se puede medir), **qué
  requisito nombra una tecnología** (dice el cómo, no el qué) y qué quedó por
  aclarar. **Es el cierre de la pasada de spec: no des el diseño por terminado
  hasta que lo que devuelve sea lista vacía o una excepción que le declarás al
  usuario en una línea.**
- En la app, el agente lee ese contrato con \`read_element\`: si la spec está
  vacía, lo único que va a poder contestarle al humano es el resumen de la
  descripción. Escribir la spec ES lo que hace útil al diagrama después.

Si el diagrama crece, \`suggest_views\`: dice si conviene cortarlo por
contenedor/fase (legible hasta ~40 elementos) y qué mirada complementaria
sostiene el material.

## 5 · Validar calidad

\`validate_diagram\` devuelve errores de validez (rompen la importación) y
hallazgos de calidad con su regla:

- **errores y \`grave\`** se corrigen siempre: nodo aislado, tipo inválido, rama de
  compuerta sin condición, proceso sin inicio/fin, relación C4 sin etiqueta.
- Corregí con **\`update_element\` / \`update_edge\`** (conservan id y relaciones), no
  borrando y recreando; al acortar un nombre o una etiqueta, el texto completo va
  a \`description\`. Si el diagrama viene de antes o de un import,
  **\`relayout_diagram\`** antes de exportar.
- **avisos** se corrigen o se justifican en una línea al usuario.

\`render_mermaid\` para comprobar la topología (el preview auto-ordena: no es el
layout real del lienzo).

## 6 · Revisión humana y exportación

1. \`review_diagram(diagramId, sourceLabel)\` → paquete de revisión: historia en
   Mermaid · tabla elemento ← fuente · decisiones y pendientes · hallazgos ·
   veredicto. Muéstralo y **espera aprobación**; con veredicto ❌ no lo presentes
   como listo.
2. Exporta según \`get_app_state\`:
   - \`export_to_app\`: el diagrama es el modelo del proyecto (con app conectada
     aparece directo en el lienzo; en stdio devuelve la ruta de un \`.json\` que el
     usuario importa con «Importar diagrama»).
   - \`export_as_view(diagramId, viewName)\`: pestaña del proyecto ACTIVO con su
     propia notación. Sólo existe en modo app y requiere proyecto abierto.
3. Cierra diciendo qué cubre el diagrama y qué quedó pendiente en la fuente.

## Conexión

- **Modo app (recomendado):** Ajustes → Servidor MCP → «Activar servidor», y en
  el cliente:
  \`\`\`json
  { "mcpServers": { "processflow-architect": { "type": "http", "url": "http://127.0.0.1:7331/mcp" } } }
  \`\`\`
  El icono 🔌 del header muestra punto VERDE cuando está activo.
- **Modo repo (dev):** abrir el repositorio con Claude Code (\`.mcp.json\` registra
  el transporte stdio).

## Reglas duras

- Tipos SOLO del \`describe_notation\` de la notación elegida.
- Contenedores antes que hijos; los hijos referencian el \`name\` exacto.
- Todo nodo con al menos una arista; toda arista de decisión con su condición.
- Un diagrama por petición salvo que el usuario pida varios; no mezcles
  notaciones en el mismo diagrama.
- No exportes con hallazgos \`grave\` ni sin haber mostrado el paquete de revisión.
`,
  },
};
// <<<SKILLS_CONTENT_END>>>

/** Descripción de cada skill entregable (el contenido viene del bloque generado). */
const SKILL_SUMMARIES: Record<string, string> = {
  "documento-a-processflow":
    "Convierte un documento de negocio (PDF, PRD, presentación) en un PORTAFOLIO de diagramas trazados a la fuente: ingesta del estado de la app, extracción con cita, una ronda de ambigüedades, validación de calidad y paquete de revisión antes de exportar.",
  "disenar-diagrama":
    "Diseña UN diagrama (DDD, BPMN, C4 o UML) con el mismo arnés en versión corta: ingesta, cita de la fuente, ambigüedades registradas, validación de calidad y revisión humana antes de exportar.",
};

/** Orden de entrega: primero el flujo completo, luego el puntual. */
export const SKILL_IDS = ["documento-a-processflow", "disenar-diagrama"] as const;

export function listSkills(): SkillDefinition[] {
  return SKILL_IDS.filter((id) => SKILL_CONTENT[id]).map((id) => ({
    id,
    summary: SKILL_SUMMARIES[id] ?? "",
    files: Object.entries(SKILL_CONTENT[id]).map(([path, content]) => ({ path, content })),
  }));
}

export function getSkill(id: string): SkillDefinition | undefined {
  return listSkills().find((s) => s.id === id);
}

/** Ruta de instalación de un skill relativa al proyecto (o al HOME) del usuario. */
export function skillInstallPath(id: string, file = "SKILL.md"): string {
  return `.claude/skills/${id}/${file}`;
}

/**
 * Bloque «Configuración activa» que se inyecta en el SKILL.md instalado. Dice el
 * estado REAL del entorno del usuario, para que el agente no adivine transporte
 * ni herramientas.
 */
export function skillConfigBlock(config: SkillConfig): string {
  const lines: string[] = [
    "## Configuración activa (generada al instalar)",
    "",
    config.transport === "http"
      ? `- **Transporte:** HTTP — la app está conectada en \`${config.url ?? "http://127.0.0.1:7331/mcp"}\`. \`export_to_app\` carga el diagrama DIRECTO en el lienzo.`
      : "- **Transporte:** stdio (modo repo) — `export_to_app` escribe un `.json` que el usuario importa con «Importar diagrama». No hay vistas ni estado de app.",
  ];
  if (config.workspace) lines.push(`- **Workspace del servidor:** \`${config.workspace}\``);
  if (config.tools?.length) {
    lines.push(`- **Herramientas disponibles:** ${config.tools.join(", ")}.`);
    const faltan = [
      "get_app_state",
      "export_as_view",
      "review_diagram",
      // Lectura de la app: existen sólo en el modo app. Un skill que las
      // mencione en stdio manda al agente a intentar algo que no está.
      "list_artifacts",
      "get_artifact",
      "list_views",
      "get_view",
    ].filter(
      (t) => !config.tools!.includes(t)
    );
    if (faltan.length) {
      lines.push(
        `- **No disponibles aquí:** ${faltan.join(", ")} — omite los pasos del arnés que dependen de ellas y dilo al usuario en vez de intentarlas.`
      );
    }
  }
  if (config.defaultNotation) {
    lines.push(
      `- **Notación por defecto:** \`${config.defaultNotation}\` (sólo cuando el usuario no declara intención).`
    );
  }
  if (config.maxNodes) {
    lines.push(`- **Tamaño legible por vista:** ~${config.maxNodes} elementos; más allá, corta con \`suggest_views\`.`);
  }
  if (config.viewsLimit) {
    lines.push(`- **Cupo de vistas por proyecto:** ${config.viewsLimit}.`);
  }
  return lines.join("\n");
}

/**
 * Archivos del skill listos para escribir en disco, con la configuración
 * inyectada justo después del frontmatter del `SKILL.md` (así es lo primero que
 * el agente lee, antes del arnés). Sin `config`, el skill se entrega tal cual.
 */
export function renderSkillFiles(id: string, config?: SkillConfig): SkillFile[] {
  const skill = getSkill(id);
  if (!skill) throw new Error(`No existe el skill "${id}". Disponibles: ${SKILL_IDS.join(", ")}.`);
  if (!config) return skill.files;

  const block = skillConfigBlock(config);
  return skill.files.map((f) => {
    if (f.path !== "SKILL.md") return f;
    // El frontmatter YAML termina en el segundo `---` a principio de línea.
    const end = f.content.indexOf("\n---\n", 3);
    if (end === -1) return { ...f, content: `${block}\n\n${f.content}` };
    const head = f.content.slice(0, end + 5);
    const body = f.content.slice(end + 5);
    return { ...f, content: `${head}\n${block}\n${body}` };
  });
}

// --- Compatibilidad con la guía /mcp (descarga del skill principal) ----------

export const SKILL_NAME = "documento-a-processflow";
export const SKILL_INSTALL_PATH = skillInstallPath(SKILL_NAME);
export const SKILL_EXAMPLES_PATH = "references/ejemplos.md";
export const SKILL_MD = SKILL_CONTENT[SKILL_NAME]?.["SKILL.md"] ?? "";
export const SKILL_EXAMPLES_MD = SKILL_CONTENT[SKILL_NAME]?.[SKILL_EXAMPLES_PATH] ?? "";
