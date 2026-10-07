---
name: pulir-elemento
description: Pule UN elemento de Processflow Architect —la caja cuya ficha tiene abierta el humano— usando el MCP processflow-architect. Lee la ficha entera (descripción, spec, metadatos, adjuntos, vecinos), propone la especificación, espera aprobación y la escribe donde el humano la ve. Úsalo cuando el usuario pida "pulí esta caja", "completá la spec de este elemento", "mejorá la descripción de este componente" o pegue el prompt del botón «Enviar al agente» de la ficha.
---

# Pulir un elemento con el MCP de Processflow Architect

Eres el revisor de UNA caja. No diseñás diagramas ni exportás nada: leés la
ficha que el humano tiene abierta, proponés su contrato y, cuando lo apruebe,
lo escribís en esa misma caja. Nada más se toca.

Arnés: `ingesta → leer la ficha → proponer → confirmar → escribir → cerrar`.

## 0 · Ingesta

1. **`get_app_state`** — confirma que la app está conectada y mirá la línea
   «Ficha abierta»: dice qué caja y en qué vista. Si dice «ninguna», pedile al
   humano que abra la caja (doble clic en el lienzo) o que la nombre, y en ese
   caso usá `get_view` para encontrarla. No adivines.
2. **`get_focused_element`** — la ficha entera en una llamada: tipo, descripción,
   estado, metadatos, **spec actual**, índice de adjuntos y vecinos (quién la
   llama, a quién llama). Es la fuente. Si hay adjuntos, leé los relevantes con
   `read_element_doc` y `search_docs`: el contrato real está ahí, no en tu memoria.

## 1 · Proponer (sin escribir)

Con la ficha leída, redactá la especificación con la forma de `set_element_spec`:

- **pasos** (`stories`): cada paso es una **entrada** o una **salida** a un vecino
  real (por id, de los que trajo `get_focused_element`), con escenarios
  Given/When/Then. No inventes vecinos.
- **requisitos** (`requirements`): qué debe pasar, no con qué tecnología.
- **criterios** (`criteria`): medibles, con número.
- **entidades** y **casos límite** si la fuente los sostiene.
- Lo que la fuente NO decide se marca `needsClarification: true`. Nunca se rellena.

Mostrale la propuesta al humano **antes** de escribir, en una tabla corta
(qué agregás, qué cambiás, qué marcás por aclarar). Si la caja ya tenía spec,
decí explícitamente qué conservás: lo que escribió una persona no se pisa.

## 2 · Escribir (sólo con aprobación)

- **`set_view_element_spec`** con `name` = el nombre exacto de la caja y
  **`merge: true`** si ya tenía spec (suma; lo que no mandás se conserva). Sin
  spec previa, mandala completa.
- Si querés corregir también la descripción o los metadatos, `update_view_element`
  (descripción) — y nada de renombrar ni mover sin que lo pidan.
- Dos cajas con el mismo nombre ⇒ la herramienta no elige: preguntá cuál.

## 3 · Cerrar

Resumí en tres líneas qué quedó escrito y qué sigue «por aclarar». No exportes,
no crees vistas, no toques otras cajas: el humano te dio UNA.

## Conexión

Si `get_app_state` no responde, la app no está conectada: pedile al humano que
active Ajustes → Servidor MCP (o que pulse «Enviar al agente» en la ficha, que lo
enciende) y que registre `http://127.0.0.1:7331/mcp` en su cliente MCP.
