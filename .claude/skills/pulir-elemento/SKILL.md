---
name: pulir-elemento
description: Pule UN elemento de Processflow Architect —la caja cuya ficha tiene abierta el humano, o la que nombre— usando el MCP processflow-architect. Lee la ficha entera (descripción, fuente, spec, metadatos, adjuntos, vecinos), propone una especificación que un agente de código pueda implementar y probar, espera aprobación y la escribe donde el humano la ve. Úsalo cuando el usuario pida "pulí esta caja", "completá la spec de este elemento", "mejorá la descripción de este componente" o pegue el prompt del botón «Enviar al agente» de la ficha.
---

# Pulir un elemento con el MCP de Processflow Architect

Eres el revisor de UNA caja. No diseñás diagramas ni exportás nada: leés la
ficha que el humano tiene abierta, proponés su contrato y, cuando lo apruebe,
lo escribís en esa misma caja. Nada más se toca.

Arnés: `ingesta → leer la ficha → proponer → confirmar → escribir → cerrar`.

## 0 · Ingesta

1. **`get_app_state`** — confirma que la app está conectada y mirá la línea
   «Ficha abierta»: dice qué caja y en qué vista.
2. La ficha entera en una llamada —tipo, descripción, **fuente**, estado,
   metadatos, **spec actual**, índice de adjuntos y vecinos (quién la llama, a
   quién llama)—:
   - **`get_focused_element`** si hay una ficha abierta;
   - **`get_view_element`** con el nombre si el humano la NOMBRÓ (o si no hay
     ficha abierta). Si el nombre está en varias vistas, te lo dice: preguntá
     cuál. No adivines.
3. Si hay adjuntos, leé los relevantes (`get_view` con `importAs: true`, después
   `read_element_doc` y `search_docs`): el contrato real está ahí, no en tu
   memoria. Si la caja tiene **fuente**, leé esa sección del documento o ese
   archivo del código.

## 1 · Proponer (sin escribir)

Con la ficha leída, redactá la especificación con la forma de `set_element_spec`:

- **pasos** (`stories`): cada paso es una **entrada** o una **salida** a un vecino
  real (por id, de los que trajo `get_focused_element`), con escenarios
  Given/When/Then. No inventes vecinos.
- **requisitos** (`requirements`): qué debe pasar, no con qué tecnología.
- **criterios** (`criteria`): medibles, con número.
- **entidades** y **casos límite** si la fuente los sostiene.
- Lo que la fuente NO decide se marca `needsClarification: true`. Nunca se rellena.

### Lista de calidad de la spec (revisala antes de mostrarla)

La spec la van a leer humanos y **agentes de código que la toman como contrato**
para implementar. Tiene que poder programarse y probarse sin preguntarte nada:

| Pregunta | Si la respuesta es no |
|---|---|
| ¿Cada paso nombra un vecino REAL y dice qué hace la conexión (`hace`)? | quitalo o conectá la caja primero |
| ¿Cada paso tiene al menos un escenario Given/When/Then con datos concretos? | escribilo; un escenario vago no es una prueba |
| ¿Cada requisito dice QUÉ, sin tecnología («valida el medio de pago», no «usa Stripe»)? | reescribilo |
| ¿Cada criterio es medible, con número y unidad («p95 < 300 ms», «0 cobros duplicados»)? | ponele número o marcalo `needsClarification` |
| ¿Están los casos límite que la fuente menciona (timeouts, reintentos, duplicados, vacíos)? | agregalos |
| ¿Lo que no está decidido quedó marcado y no inventado? | marcá `needsClarification: true` |

**Estado de la spec** (`status`): una spec nueva nace `borrador`; pasala a
`revision` cuando la propongas para aprobar. **Nunca** la marques `aprobada`:
aprobar es del humano.

### Descripción y fuente de la caja

Si la descripción no dice qué es y qué hace (menos de seis palabras, el nombre
repetido, o con «Fuente: …» pegado al final), proponé también una nueva: 1 a 3
frases con su responsabilidad, qué recibe o produce y por qué existe. La cita va
en la **fuente** de la caja, que es una propiedad aparte.

### Tecnologías, icono y propiedades según el tipo

- **Tecnologías** (`tags`): las que la fuente nombra (`Node 20`, `SQLite`). El
  **icono** sale solo de ellas; pasá `icon` (de `list_icons`) sólo si hay que
  forzar otro logo.
- **Propiedades** (`metadata`): las que corresponden al TIPO de la caja, nunca la
  misma lista para todas.
  - servicio (Contenedor, Componente, Nodo): `repo`, `puerto`, `endpoint`;
  - almacén (Base de Datos): `puerto`, `motor`, `esquema`, `respaldo` — **sin
    `repo`**: una base de datos no tiene repositorio;
  - cualquiera: `owner`, `wiki`.
  Lo que la fuente no dice va con el valor `pendiente`, nunca inventado. No
  repitas una clave que ya está (con su alias tampoco: `port` ya es `puerto`).

Mostrale la propuesta al humano **antes** de escribir, en una tabla corta
(qué agregás, qué cambiás, qué marcás por aclarar). Si la caja ya tenía spec,
decí explícitamente qué conservás: lo que escribió una persona no se pisa.

## 2 · Escribir (sólo con aprobación)

- **`set_view_element_spec`** con `name` = el nombre exacto de la caja y
  **`merge: true`** si ya tenía spec (suma; lo que no mandás se conserva). Sin
  spec previa, mandala completa.
- Si corregís también la descripción, la fuente, las tecnologías o los metadatos,
  `update_view_element` con `description`, `source`, `tags` y `metadata` (por
  clave: las demás se conservan) — y nada de renombrar, mover ni borrar sin que
  lo pidan.
- Dos cajas con el mismo nombre ⇒ la herramienta no elige: preguntá cuál.

## 3 · Cerrar

Resumí en tres líneas qué quedó escrito y qué sigue «por aclarar». No exportes,
no crees vistas, no toques otras cajas: el humano te dio UNA.

## Conexión

Si `get_app_state` no responde, la app no está conectada: pedile al humano que
active Ajustes → Servidor MCP (o que pulse «Enviar al agente» en la ficha, que lo
enciende) y que registre `http://127.0.0.1:7331/mcp` en su cliente MCP.
