---
name: documento-a-processflow
description: Convierte un documento de proyecto/negocio (PDF, Word, Markdown, presentación) en un PORTAFOLIO de diagramas en Processflow Architect vía MCP — big picture DDD del dominio, BPMN de cada proceso operativo y C4 del paisaje de sistemas — trazados a la fuente, validados y revisados por el humano antes de subir. Úsalo cuando el usuario pida "analiza este documento y modélalo", "pasa este PDF a la app", "genera los diagramas de este proyecto", "modela el proyecto X desde su documentación" o entregue un documento de negocio y quiera verlo en Processflow.
---

# Documento → Portafolio de diagramas en Processflow Architect

Eres un arquitecto de dominio. Tu trabajo: leer UN documento de proyecto
(presentación, PRD, acta, especificación) y convertir lo que el documento
*realmente dice* en un portafolio de 2–4 diagramas complementarios en
Processflow Architect, usando el servidor MCP `processflow-architect`.

Dos cosas te juzgan, no una: que el modelo sea correcto **y** que el humano
pueda verificarlo sin releer el documento. De ahí el arnés de este skill:

```
ingesta → extracción con cita → ambigüedades (1 ronda) → construir
        → validar calidad → paquete de revisión → aprobación → exportar
```

Reglas de oro:

- **Modela lo que el documento dice, no lo que sabes del rubro.** Cada elemento
  lleva su `source` (sección/página). Lo que no diga, se pregunta o se marca
  pendiente — nunca se rellena de memoria.
- **No exportas sin aprobación.** `review_diagram` produce el paquete de
  revisión; el usuario aprueba o pide cambios. Exportar antes es trabajo que el
  humano tiene que auditar en el lienzo, que es donde más cuesta.

## 0 · Ingesta: mira antes de tocar

En este orden, siempre:

1. `list_notations` — confirma que el MCP responde. Si no, ver «Conexión» abajo.
2. **`get_app_state`** — qué proyecto está activo, con qué notación, qué vistas
   ya existen y cuánto cupo queda. De aquí sale la decisión de exportar como
   PROYECTO (`export_to_app`, reemplaza el activo) o como VISTA
   (`export_as_view`, suma una pestaña). Sin esta llamada estarías pisando
   trabajo del usuario a ciegas.
3. **`list_views`** — las pestañas que ya existen, con su notación y tamaño. Con
   `project` mira OTRO proyecto guardado sin abrirlo: así reutilizas un modelo ya
   hecho (p. ej. el paisaje C4 de otro producto) en vez de inventarlo de nuevo.
   `get_view` con `importAs: true` trae esa vista como diagrama EDITABLE.
4. **`list_artifacts`** — documentos que la IA local del usuario ya generó
   (drivers, riesgos, propuesta, roadmap, ADRs). `get_artifact` te da el
   Markdown: es fuente citable de PRIMERA mano sobre lo que el usuario decidió,
   y contradecirla sin decirlo es el error más caro que puedes cometer acá.
5. `list_diagrams` — ¿hay un diseño en curso que retomar (`get_diagram`) en vez
   de empezar de cero? Devuelve también los NOMBRES de los elementos: si uno de
   ellos ya describe lo que ibas a crear, reusá ESE nombre en vez de inventar un
   sinónimo («Servicio de listas» y «OFAC Screening» son el mismo sistema con dos
   nombres, y eso es la segunda versión de la verdad).
   Si el workspace tiene organizaciones (`list_orgs`), `list_diagrams` muestra SÓLO
   la activa: antes de concluir «no hay nada», mirá si estás parado donde va este
   trabajo (`use_org`) o barré todas con `list_diagrams(org: "*")`.
6. `describe_notation` de cada notación que vayas a usar — los `type` válidos
   salen SOLO de ahí.

No sigas sin conexión y sin haber leído el estado.

**Qué hacer con lo que leas:** si un artefacto o una vista ya cubre parte del
material, dilo en el plan («el BPMN de Cobros ya existe: lo extiendo, no lo
recreo») y cita el artefacto en la columna «cita» de la ficha igual que citas el
documento. Un diagrama que contradice un ADR aprobado se declara como
ambigüedad (`record_ambiguity`), no se resuelve por tu cuenta.

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

Esa cita se pasa tal cual en el parámetro `source` de `add_node` /
`add_container`. La app la muestra en la descripción del elemento: el revisor
lee «elemento ← fuente» sin volver al PDF.

### Adjuntá el documento, no sólo su nombre

Una cita a un archivo que la app no tiene es un puntero colgante: el humano que
revisa desde la app —y el agente que ahí le responde— no puede abrirlo. Antes de
citar líneas de un documento, **adjuntá su texto** con `attach_source`:

```
attach_source { name: "contratos/07-pagos.md", origin: "PDF del cliente",
                text: "<el texto del documento>" }
add_node { name: "Pasarela", type: "Componente",
           source: "contratos/07-pagos.md:36" }
```

- Citá con el **mismo nombre** con el que adjuntaste: así la ficha del elemento
  muestra el fragmento y el agente de la app puede leerlo con `read_source`.
- `list_sources` dice qué hay adjunto (sin traer el texto); `read_source` relee
  un rango; `remove_source` lo quita sin borrar las citas.
- `validate_diagram` avisa con **FUENTE-SIN-ADJUNTAR** cuando una caja cita un
  documento que no está: es la señal de que la evidencia se quedó afuera.
- Adjuntá lo que **sostiene el diagrama**, no la biblioteca entera: el tope son
  20 documentos de 60 000 caracteres y lo que pase se recorta.

## 2 · Ambigüedades: una sola ronda, registrada

Con la ficha llena, NO construyas. Primero registra en el diagrama lo que el
documento no cierra —`record_ambiguity`— y después pregunta TODO junto (una
ronda, con `AskUserQuestion` si está disponible):

Registra como ambigüedad sólo lo que cambia el diagrama:

- **Alternativas sin decidir** (dos opciones de flujo): pregunta cuál modelar,
  con el nombre que les da el documento.
- **Contradicciones** entre secciones (responsables o pasos que no coinciden):
  pregunta cuál versión vale.
- **Vacíos que cambian la topología** (no se sabe quién ejecuta un paso, si una
  decisión existe). Los vacíos menores NO se preguntan: van como
  «pendiente en documento fuente» en la `description`.

En la misma ronda decide con el usuario:

1. **Alcance** — portafolio completo (DDD + BPMN + C4), sólo el dominio, o sólo
   un proceso (di cuáles detectaste).
2. **Entrega** — un proyecto con vistas (recomendado si hay app conectada) o un
   proyecto por diagrama. Lo que `get_app_state` diga manda: sin app, no hay
   vistas.
3. **Prioridad de procesos** si detectaste ≥3.

Cada respuesta se cierra con `resolve_ambiguity`: queda en el modelo como
«decisión tomada» y llega al humano en la revisión. Lo que quede sin respuesta
viaja como «pendiente en la fuente» — declarado, no inventado.

**Precedencia de notación (regla dura):** si el usuario pide EXPLÍCITAMENTE una
notación o tipo de diagrama —«hazme el BPMN», «el flujo», «el C4», «la
secuencia»—, ESE es el entregable principal y va con `export_to_app`, con su
propia notación y paleta. **No antepongas un DDD que nadie pidió** ni conviertas
lo pedido en vista anexa de un DDD. El portafolio por defecto (abajo) aplica
SOLO si el usuario dice «lo que veas mejor» o no responde.

Plantilla por defecto:

1. **`ddd` — Big Picture del dominio**: Contextos Delimitados por área; dentro
   Comandos → Eventos; Actores y Sistemas Externos alrededor; Políticas entre
   contextos.
2. **`bpmn` — Un diagrama por proceso crítico** (1–2): el que el documento
   detalla con más pasos/decisiones. Pools por organización, Carriles por rol.
3. **`c4` — Paisaje de sistemas** (si nombra ≥3 sistemas): Límite de Sistema por
   organización, Personas fuera, relaciones etiquetadas con la integración.

Anuncia el plan final en 2–3 líneas antes de construir.

## 3 · Construir (bucle MCP)

Antes de cada notación, lee su ejemplo trabajado en `references/ejemplos.md`
(traducción documento→llamadas MCP, claves de calidad, antipatrones).

Para CADA diagrama:

1. `create_diagram` (nombre = «Proyecto X · Vista Y») → guarda el `diagramId`.
2. `add_container` primero (Contextos/Pools/Carriles/Límites), luego `add_node`
   con `container` y `source`, luego `add_edge`.
   - Ids en kebab-case, únicos en TODO el diagrama; prefija con el carril
     (`fc-investiga`, `enr-valida`).
   - **Los contenedores NO se anidan**: el lienzo dibuja bandas y marcos planos.
     Elige UN nivel — Pools (participantes) *o* Carriles (roles) — y pon los
     elementos dentro de ese nivel. Un Pool con sus Carriles al lado queda vacío
     y el lienzo dibuja una banda en blanco (`validate_diagram` lo reporta como
     `CONTENEDOR-VACIO`).
   - **BPMN**: un Evento de Inicio por pool; cada rama de compuerta con `label`
     de condición; entre Pools sólo flujo de mensaje (`dashed`); dentro del pool,
     secuencia; todo camino cierra en Evento de Fin.
   - **DDD**: cadena Comando → Evento; la Política conecta Evento de un contexto
     con Comando de otro.
   - **C4**: TODA relación con etiqueta de verbo + tecnología.
3. `suggest_views` cuando el diagrama crece: te dice si hay que cortarlo por
   contenedor/fase y qué mirada complementaria sostiene el material. No metas 60
   elementos en una vista.

### El diagrama fijado y el proyecto destino

`create_diagram` e `import_diagram` dejan **fijado** el modelo: las llamadas
siguientes pueden omitir `diagramId`. Con varios modelos en curso, `use_diagram`
cambia cuál es el activo (queda guardado en el workspace). Pasar `diagramId`
explícito siempre gana.

`export_to_app` **actualiza** el proyecto de la app —el que diga `project`, el de
la configuración del servidor, o el abierto— en vez de crear una copia: conserva
la posición que el humano les dio a las cajas y fusiona sus notas. Usá
`mode: "new"` sólo cuando de verdad querés un proyecto aparte. Si el proyecto que
nombraste no existe, la herramienta avisa en vez de inventar uno: mirá
`get_app_state` antes de entregar.

`export_as_view` hace lo mismo con las pestañas: `replace: true` actualiza la vista que ya se
llama así en vez de dejar una segunda igual (y sin gastar cupo de vistas). Si esa pestaña no
existe, avisa con las que hay en vez de crearla por su cuenta.

### Recoger lo que ensuciás

Las pestañas se pueden borrar (`delete_view`) y renombrar (`rename_view`) por nombre exacto. Antes
sólo se podían crear, así que un duplicado lo limpiaba el humano a mano. Borrar es destructivo: no
hay coincidencia parcial ni «todas», y las vistas del sistema no se tocan.

### Los ids se copian de `get_diagram`, no del dibujo

Mermaid no admite guiones en un id, así que en el diagrama salen con guiones bajos. `get_diagram`
declara la equivalencia cuando eso pasa; usá el id REAL. Las herramientas aceptan el id dibujado si
no hay ambigüedad, pero el que vale es el que devuelve `add_node`.

### Profundidad: otra VISTA, no un contenedor dentro de otro

Los contenedores **no se anidan** (el formato de proyecto es de un nivel, ADR 0002). Para el nivel
de abajo —los Componentes de un Contenedor en C4, un subproceso dentro de un carril en BPMN— creá
OTRA vista con ese detalle y enlazala desde el elemento padre con `viewRef`. Meterlo como banda
hermana en el mismo lienzo dice que son del mismo rango, que es justo lo que no son.

### Estado: documentar lo que HAY vs diseñar lo que VIENE

`add_node`, `add_container` y `update_element` aceptan `estado`: `existente` (ya
está en producción), `modificado` (existe y este diseño lo cambia), `nuevo` (lo
trae este diseño), `sin_cambios`, `eliminado`. Por defecto es `nuevo`: si estás
documentando un sistema vivo y no lo declarás, el lienzo pinta como propuesta lo
que ya existe y se pierde justo la distinción que el humano necesita para decidir.

### Propiedades: dónde vive la caja y por dónde se le habla

`add_node`, `add_container` y `update_element` aceptan `metadata`: la tabla de
propiedades del elemento, `{clave, valor, tipo?}` con **dónde vive de verdad** y
los datos que lo enriquecen. Tipos: `texto` · `numero` · `booleano` · `url` ·
`fecha`; el valor se valida según su tipo.

**Claves canónicas — usá estas, no sinónimos:** `repo` (url) · `puerto` (numero) ·
`endpoint` (url) · `owner` (texto) · `wiki` (url).

`repo` y `puerto` son **obligatorias en lo desplegable** (C4: `Sistema`,
`Contenedor`, `Componente`, `Base de Datos`; UML: `Componente`, `Nodo`,
`Artefacto de Despliegue`) y `validate_diagram` FALLA mientras falten: son los
datos que quien va a construir busca a mano. Un documento de negocio muchas veces
no los trae — entonces poné el valor explícito `pendiente` y decílo en el resumen
al humano; nunca inventes una url. En el big picture DDD y en los BPMN no se
exigen.

```
add_node { id: "c4-api-pagos", name: "API de Pagos", type: "Contenedor", container: "Pagos",
  metadata: [ { clave: "repo",   valor: "https://github.com/acme/pagos-svc", tipo: "url" },
              { clave: "puerto", valor: "8080", tipo: "numero" },
              { clave: "owner",  valor: "Equipo Pagos", tipo: "texto" } ] }
```

Reglas: la clave repetida **reemplaza** su valor; sólo las urls `http(s)` se
vuelven enlace en la app; para sumar una propiedad después, `update_element` con
`metadata` (agrega o reemplaza por clave) y `metadataRemove` para borrar. Los
alias (`repositorio`, `port`, `dueño`…) se reconocen, pero `review_diagram` avisa.

No lo confundas con `source`: la cita dice de **dónde salió** el elemento en el
documento (sostiene la revisión); la propiedad dice **dónde vive** el artefacto
real.

### Especificación: el contrato de cada caja

Un documento de negocio suele traer requisitos y criterios de aceptación. Eso NO
va en la descripción: va en la especificación del elemento, que la app muestra en
el tab «Spec» de su ficha.

```
set_element_spec { id: "c4-api-pagos", spec: {
  featureName: "Cobro recurrente",
  input: "<lo que pide el documento, con sus palabras>",
  stories: [ { titulo: "Cobrar la cuota", prioridad: "P1",
               porQue: "…", pruebaIndependiente: "…",
               escenarios: [ { given: "…", when: "…", then: "…" } ] } ],
  requirements: [ { texto: "El sistema MUST …" } ],
  criteria: [ { texto: "… con un número medible" } ] } }
```

- Lo que el documento **no decide, no se inventa**: `needsClarification: true` en
  ese requisito, y además registrá la ambigüedad con `record_ambiguity`.
- **Es una pasada propia, después de crear las cajas.** Un portafolio de
  diagramas sin specs devuelve al documento a la persona que lo trajo: en la app,
  el agente lee el contrato con `read_element`, y si no hay spec sólo puede
  responder con el resumen de la descripción.
- `get_element_spec` antes de reescribir (no pises lo que puso una persona), o
  `set_element_spec { merge: true }` para ir completando caja por caja sin releer
  el contrato entero. `spec_to_markdown` para pegar el contrato en una issue.
- **`review_specs` cierra la pasada**: además de los elementos sin spec, marca
  criterios sin número (no medibles) y requisitos que nombran tecnología. Nada se
  entrega hasta que devuelva lista vacía o le declares la excepción al usuario.

## 4 · Validar calidad (no sólo validez)

`validate_diagram` responde dos cosas: si la app puede importarlo (errores) y si
está bien modelado (hallazgos de calidad, con regla).

- **Errores y hallazgos `grave`**: se corrigen, sin excepción — ramas sin
  condición, proceso sin inicio/fin, relación C4 sin etiqueta.
- Para corregir, **`update_element` / `update_edge`**: cambian nombre, descripción,
  cita o etiqueta conservando el id y las relaciones. No borres y recrees para
  acortar un nombre: perderías sus aristas. Si acortás, dejá el texto completo en
  la `description` — no se pierde y el revisor puede contrastarlo.
- Si retomás un diagrama viejo o importado, **`relayout_diagram`** antes de
  exportar: los modelos con posiciones guardadas conservan su disposición vieja.
- **Avisos**: se corrigen o se justifican al usuario en una línea.
- `render_mermaid` para comprobar que la topología cuenta la historia del
  documento (el preview auto-ordena: NO refleja el layout real del lienzo).

## 5 · Paquete de revisión (antes de subir nada)

`review_diagram(diagramId, sourceLabel)` devuelve, siempre en el mismo orden:
la historia en Mermaid · la tabla elemento ← fuente agrupada por contenedor ·
decisiones tomadas y pendientes · hallazgos · veredicto.

Muéstralo al usuario y **espera aprobación**. Si el veredicto es ❌, ni lo
presentes como listo: corrige primero. Este paso existe para que revisar cueste
minutos y no una tarde: no lo resumas ni lo saltes «porque el diagrama se ve
bien».

## 6 · Exportar según el estado real de la app

Con lo que dijo `get_app_state` (vuelve a llamarlo si pasó tiempo):

- **Una sola notación pedida**: `export_to_app` de ESE diagrama y nada más. Es
  el modelo del proyecto, con su notación. No crees un DDD contenedor.
- **Proyecto con vistas** (sólo con app conectada por HTTP):
  1. El principal con `export_to_app` (el DDD sólo si eligió portafolio
     completo) → crea el proyecto y queda activo con SU notación.
  2. Cada diagrama restante con `export_as_view(diagramId, viewName)` → pestaña
     del proyecto activo, con su paleta. Si la herramienta no está en
     `tools/list`, cae a proyectos separados y dilo.
  3. Las vistas caen en el proyecto ACTIVO: exporta proyecto y vistas SEGUIDOS.
     Límite: 50 vistas por proyecto (`get_app_state` te dice el cupo usado).
- **Un proyecto por diagrama**: `export_to_app` por cada uno. Con app activa
  aparece al instante; en stdio queda un `.json` que el usuario carga con
  «Importar diagrama».
- **Puente stdio → lienzo**: si diseñaste en stdio y la app está abierta con su
  servidor activo, contra `http://127.0.0.1:7331/mcp` llama `import_diagram`
  (`path` del `.json`, `notation`) y luego `export_to_app`/`export_as_view` con
  el `diagramId` devuelto.

## 7 · Cierre

Resume: qué diagramas se crearon, qué sección del documento cubre cada uno, qué
quedó «pendiente en la fuente» y qué decisiones tomó el usuario. Si algún nombre
se ve recortado en el lienzo, acórtalo y vuelve a exportar.

## Conexión

- **Modo app (recomendado — el export llega DIRECTO al lienzo):**
  Processflow Architect → Ajustes → Servidor MCP → «Activar servidor», y en el
  cliente MCP:
  ```json
  { "mcpServers": { "processflow-architect": { "type": "http", "url": "http://127.0.0.1:7331/mcp" } } }
  ```
- **Modo repo (dev, stdio):** abrir el repositorio con Claude Code (su
  `.mcp.json` registra el server). Los exports quedan como `.json` importables.

## Presentación y límites

Estos dos números salen de cómo dibuja el lienzo, no de una preferencia: pasarse
significa que el usuario ve texto cortado o tapado.

- **Nombre de nodo: máx ~21 caracteres.** «Validar token», «Cotizar planes»,
  «¿Firma confirmada?». Más largo se recorta con «…» dentro de la caja. El
  detalle completo va en `description`.
- **Etiqueta de arista: máx ~30 caracteres**, verbo + `[tecnología]` («cobra el
  pedido [HTTPS]»). Se dibuja suelta sobre la línea, sin caja: más larga invade
  los nodos vecinos y, con varias juntas, tapa el diagrama. El detalle largo va
  en la descripción de la relación.
- Las condiciones van en el `label` de la arista, no en el nombre del nodo; el
  protocolo también, o en `tags`.
- Máximo ~40 elementos por diagrama; si te pasas, `suggest_views` y divide.
- No mezcles notaciones en un diagrama.
- Nombres en el idioma del documento (Lenguaje Ubicuo), sin siglas inventadas.
- Si el documento trae BPMN embebido como imagen, respeta sus carriles y
  decisiones: es la fuente más fiel del proceso.
