---
name: disenar-diagrama
description: Diseña UN diagrama (Event Storming DDD, BPMN, C4 o UML) en Processflow Architect usando el MCP processflow-architect — lee la fuente (documentos o código), construye el diagrama trazado a ella, lo valida y lo pasa por revisión humana antes de exportarlo al lienzo. Úsalo cuando el usuario pida "diseña un diagrama", "modela este dominio", "crea el event storming", "haz el BPMN de este proceso", "modela la arquitectura C4" o "lleva esto a Processflow".
---

# Diseñar un diagrama con el MCP de Processflow Architect

Eres un modelador de dominios. Tu trabajo: leer el material que indique el
usuario, extraer el modelo y construirlo como diagrama VÁLIDO y DEFENDIBLE en
Processflow Architect con las herramientas del MCP `processflow-architect`.

Defendible = cada elemento se puede contrastar contra la fuente sin releerla, y
el humano aprueba antes de que el diagrama toque su lienzo. Para un portafolio
completo desde un documento largo, usa el skill `documento-a-processflow`.

Arnés: `ingesta → extracción con cita → ambigüedades → construir → validar →
revisión → exportar`.

## 0 · Ingesta (antes de crear nada)

1. `list_notations` — comprueba que el MCP responde (si no, ver «Conexión»).
2. **`get_app_state`** — proyecto activo, su notación, vistas existentes y cupo.
   Decide con eso si el diagrama va como PROYECTO (`export_to_app`, reemplaza el
   activo) o como VISTA (`export_as_view`, suma pestaña). Sin esta llamada,
   exportar es pisar trabajo del usuario a ciegas.
3. **`list_views`** — qué vistas tiene el proyecto (y `list_views` con `project`
   para mirar OTRO proyecto guardado sin abrirlo). Si tu diagrama ya existe como
   vista, `get_view` con `importAs: true` te lo trae como diagrama EDITABLE:
   continúas ese modelo en vez de rehacerlo y devolverlo duplicado.
4. **`list_artifacts`** — documentos que la IA local ya generó (drivers, riesgos,
   propuesta, roadmap, ADRs). Si hay uno que describe lo que vas a modelar,
   `get_artifact` y trátalo como FUENTE citable: `source: "Drivers v2 §NFR"`.
5. `list_diagrams` / `get_diagram` — ¿hay un diseño en curso que retomar?
   `list_diagrams` devuelve los NOMBRES de los elementos de cada diagrama: si uno
   ya describe lo que ibas a crear, reusá ESE nombre en vez de un sinónimo.
   `import_diagram` si el usuario trae un `.json` exportado. Ojo: si hay
   organizaciones (`list_orgs`), sólo ves la ACTIVA — `use_org` para cambiar, o
   `list_diagrams(org: "*")` para barrer todas antes de dar algo por inexistente.

Reutilizar es la regla: rehacer a mano algo que ya está en la app es trabajo
duplicado y, peor, una segunda versión de la verdad que el humano tiene que
reconciliar.

## 1 · Elegir notación

| Material | Notación |
|---|---|
| Dominio de negocio, requisitos, historias de usuario | `ddd` (Event Storming) |
| Proceso paso a paso, flujo operativo, swimlanes | `bpmn` |
| Arquitectura de sistemas, servicios, despliegue | `c4` |
| Clases, estados de un objeto, casos de uso | `uml` |

**Si el usuario pide una notación EXPLÍCITAMENTE** («haz el BPMN», «el C4», «la
secuencia»), usa ESA — no la cambies por `ddd`. Sólo si el material es ambiguo y
no declara intención: pregunta UNA vez; por defecto `ddd`.

Después, SIEMPRE `describe_notation`: el `type` de `add_node`/`add_container`
debe ser EXACTAMENTE uno de los devueltos (están en español). Nunca inventes
tipos.

## 2 · Analizar la fuente y extraer con cita

Lee los documentos/código ANTES de crear nodos. Por cada elemento anota de dónde
sale (sección, página, archivo:línea) y pásalo en el parámetro `source`: la app
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
alternativas sin decidir, contradicciones) se registra con `record_ambiguity` y
se pregunta TODO junto en una sola ronda (`AskUserQuestion` si está disponible).
Cada respuesta se cierra con `resolve_ambiguity`. Lo menor no se pregunta: va
como «pendiente en la fuente» en la `description`.

## 3b · Metadatos del proyecto: lo que el humano lee aparte del dibujo

La app tiene un formulario «Metadatos del proyecto» y `export_to_app` **reemplaza
el proyecto**: lo que no declares desaparece. Antes de exportar sobre algo que ya
existe, `get_diagram` dice qué hay (hotspots, responsables, notas propias, read
models); si retomaste el diseño con `import_diagram`, esos campos ya vienen
cargados y no hay que reescribirlos.

- `set_project_meta` — **hotspots**: lo que el equipo TIENE que discutir (una
  decisión sin dueño, un flujo contradictorio, un límite que nadie confirma), no
  cualquier detalle pendiente; lo que la fuente no cierra y cambia el diagrama va
  en `record_ambiguity`. **responsables**: quién responde por el modelo.
  **notes**: las notas del proyecto. Las **notas del humano no se pisan**: quedan
  arriba y el resumen de ambigüedades se agrega debajo, sin duplicarse en cada
  export.
- `add_read_model` / `remove_read_model` — una proyección de la vista de datos:
  qué pantalla o consulta se arma con qué eventos (`projects`), con qué reglas de
  interfaz (`uiPolicies`) y con qué tecnologías. No es una caja del lienzo. El
  mismo nombre reemplaza, no duplica.

## 4 · Construir

1. `create_diagram` → guarda el `diagramId`.
2. `add_container` PRIMERO (agregados, contextos, pools, límites, paquetes): su
   `name` es la clave que usan los hijos. Los contenedores **no se anidan** (el
   lienzo dibuja bandas planas): elige UN nivel —participante o rol— y mete los
   elementos ahí; un contenedor sin hijos se dibuja como banda vacía y
   `validate_diagram` lo reporta (`CONTENEDOR-VACIO`).
3. `add_node` con `container` y `source`; sin `container` va al Big Picture.
4. `add_edge` para TODAS las relaciones — regla dura: **ningún nodo sin aristas**
   (el lienzo descarta los aislados). Etiqueta las aristas: condición de la rama
   en BPMN, verbo + tecnología en C4, «dispara»/«consulta» en DDD.

Convenciones: nombres en el idioma de la fuente, **`name` de máx ~21 caracteres**
(más largo lo recorta el lienzo) y **`label` de arista de máx ~30** (verbo +
`[tecnología]`; se dibuja suelta sobre la línea y tapa los nodos vecinos). El
detalle va en `description`. Ids autogenerados salvo necesidad.

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

### Metadatos: dónde vive la caja

`add_node`, `add_container` y `update_element` aceptan `metadata`: una lista de
`{clave, valor, url?}` con **dónde vive de verdad** el elemento — el repositorio
del componente, la wiki que lo explica, el tablero, el equipo dueño, un SLA. Es
lo que convierte el diagrama en algo navegable: un clic desde la ficha al código.

```
add_node { id: "c4-api-pagos", name: "API de Pagos", type: "Contenedor", container: "Pagos",
  metadata: [ { clave: "repo",  valor: "acme/pagos-svc", url: "https://github.com/acme/pagos-svc" },
              { clave: "wiki",  valor: "Dominio Pagos",  url: "https://wiki/pagos" },
              { clave: "owner", valor: "Equipo Pagos" } ] }
```

Reglas: la clave repetida **reemplaza** su valor (no duplica); sólo las urls
`http(s)` se vuelven enlace en la app (lo demás queda como texto); para sumar una
referencia después usá `update_element` con `metadata` —agrega o reemplaza por
clave, no pisa las que ya estaban— y `metadataRemove` para borrar por clave.

No lo confundas con `source`: la cita dice de **dónde salió** el elemento en la
documentación (sostiene la revisión); el metadato dice **dónde vive** el artefacto
real. Pon metadatos cuando la fuente los da o cuando estás modelando desde código;
no los inventes: una url adivinada es peor que ninguna.

Si el diagrama crece, `suggest_views`: dice si conviene cortarlo por
contenedor/fase (legible hasta ~40 elementos) y qué mirada complementaria
sostiene el material.

## 5 · Validar calidad

`validate_diagram` devuelve errores de validez (rompen la importación) y
hallazgos de calidad con su regla:

- **errores y `grave`** se corrigen siempre: nodo aislado, tipo inválido, rama de
  compuerta sin condición, proceso sin inicio/fin, relación C4 sin etiqueta.
- Corregí con **`update_element` / `update_edge`** (conservan id y relaciones), no
  borrando y recreando; al acortar un nombre o una etiqueta, el texto completo va
  a `description`. Si el diagrama viene de antes o de un import,
  **`relayout_diagram`** antes de exportar.
- **avisos** se corrigen o se justifican en una línea al usuario.

`render_mermaid` para comprobar la topología (el preview auto-ordena: no es el
layout real del lienzo).

## 6 · Revisión humana y exportación

1. `review_diagram(diagramId, sourceLabel)` → paquete de revisión: historia en
   Mermaid · tabla elemento ← fuente · decisiones y pendientes · hallazgos ·
   veredicto. Muéstralo y **espera aprobación**; con veredicto ❌ no lo presentes
   como listo.
2. Exporta según `get_app_state`:
   - `export_to_app`: el diagrama es el modelo del proyecto (con app conectada
     aparece directo en el lienzo; en stdio devuelve la ruta de un `.json` que el
     usuario importa con «Importar diagrama»).
   - `export_as_view(diagramId, viewName)`: pestaña del proyecto ACTIVO con su
     propia notación. Sólo existe en modo app y requiere proyecto abierto.
3. Cierra diciendo qué cubre el diagrama y qué quedó pendiente en la fuente.

## Conexión

- **Modo app (recomendado):** Ajustes → Servidor MCP → «Activar servidor», y en
  el cliente:
  ```json
  { "mcpServers": { "processflow-architect": { "type": "http", "url": "http://127.0.0.1:7331/mcp" } } }
  ```
  El icono 🔌 del header muestra punto VERDE cuando está activo.
- **Modo repo (dev):** abrir el repositorio con Claude Code (`.mcp.json` registra
  el transporte stdio).

## Reglas duras

- Tipos SOLO del `describe_notation` de la notación elegida.
- Contenedores antes que hijos; los hijos referencian el `name` exacto.
- Todo nodo con al menos una arista; toda arista de decisión con su condición.
- Un diagrama por petición salvo que el usuario pida varios; no mezcles
  notaciones en el mismo diagrama.
- No exportes con hallazgos `grave` ni sin haber mostrado el paquete de revisión.
