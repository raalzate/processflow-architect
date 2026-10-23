---
name: contexto-para-codigo
description: Usa Processflow Architect como CONTEXTO de ingeniería para un agente de código, vía el MCP processflow-architect. Antes de programar, lee la ficha de los componentes que vas a tocar (descripción, spec, criterios, adjuntos, vecinos, dónde vive); al terminar, escribe de vuelta lo que el código decidió — fuente en el código, repo, estado de la spec, preguntas abiertas — sin dañar el diagrama. Úsalo cuando vayas a implementar, modificar o revisar código de un sistema modelado en Processflow, o cuando el usuario pida "leé el contexto en Processflow", "implementá según la spec del componente", "dejá documentado en Processflow lo que hiciste" o "sincronizá el diagrama con el código".
---

# Processflow como contexto para agentes de código

Processflow es la **memoria de diseño** del sistema: qué componentes hay, qué
hace cada uno, con quién habla, qué contrato cumple y por qué. Varios agentes
leen y escriben ese contexto. Para que siga sirviendo:

- **Leer antes de escribir código.** La spec y los adjuntos del componente son el
  contrato; no lo reconstruyas de memoria ni del código viejo.
- **Escribir de vuelta lo que el código decidió**, en el lugar donde el próximo
  agente lo va a buscar —no en un comentario perdido ni en el chat.
- **No dañar.** Toda escritura es puntual (ver el skill `actualizar-diagrama`):
  nada de borrar y recrear, nada de reemplazar vistas.

Arnés: `ubicar → leer → implementar → escribir de vuelta → verificar`.

## 0 · Ubicar el componente

1. **`get_app_state`** — proyecto activo y vistas. Si el proyecto no es el del
   repo en el que trabajás, decilo y pedí que lo abran: no escribas en otro.
2. **`list_views`** y **`get_view`** de la vista de arquitectura (C4 de
   contenedores o componentes): qué cajas hay y cómo se conectan.
3. Identificá la(s) caja(s) que tu tarea toca. Si el código ya está mapeado, la
   **fuente** o el metadato **`repo`** de la caja apuntan a él
   (`pagos/api.ts:12`, `https://github.com/acme/pagos`).

## 1 · Leer el contexto (antes de programar)

Por cada caja que vas a tocar, **`get_view_element`** con su nombre. Trae en una
llamada:

| Sección | Para qué te sirve |
|---|---|
| Descripción | la responsabilidad del componente: qué NO debería hacer tu cambio |
| Fuente | de dónde salió (documento o código): leela si tu tarea la contradice |
| Metadatos | dónde vive (`repo`, `puerto`, `owner`) |
| **Spec** | pasos (entradas/salidas con escenarios Given/When/Then), requisitos `FR-00N`, criterios `SC-00N`, entidades, casos límite y lo marcado `needsClarification` |
| Adjuntos | contratos (OpenAPI, esquemas, ejemplos): leelos, son la verdad del contrato |
| Vecinos | quién llama a este componente y a quién llama: tu cambio no puede romperlos |

- Los **adjuntos** se leen importando la vista: `get_view` con `importAs: true`
  devuelve un `diagramId`; con él, `list_element_docs` y `read_element_doc` (o
  `search_docs` para buscar dentro). Borrá la copia con `delete_diagram` al
  terminar.
- Decisiones de arquitectura (ADR, drivers, riesgos): **`list_artifacts`** y
  **`get_artifact`**.
- Lo marcado **`needsClarification`** NO se resuelve inventando: preguntá al
  humano antes de implementar esa parte.

Resumí al humano, antes de tocar código, el contrato que vas a cumplir: los
requisitos y criterios que aplican y los vecinos afectados.

## 2 · Implementar

Programá contra la spec. Cada criterio `SC-00N` debería poder verificarse con
una prueba; cada escenario Given/When/Then es un caso de prueba natural.

## 3 · Escribir de vuelta (lo que el próximo agente necesita)

Con aprobación del humano, y sólo sobre las cajas que tocaste:

1. **Dónde vive** — `update_view_element` con:
   - `source`: el punto de entrada en el código (`pagos/api.ts:12`). Es una
     PROPIEDAD de la caja; nunca la pegues en la descripción.
   - `metadata` por clave, según el tipo de la caja: un servicio `repo`,
     `puerto`, `endpoint`; una base de datos `puerto`, `motor`, `esquema` (no
     tiene `repo`); cualquiera `owner` (las demás claves se conservan).
   - `tags` con las tecnologías que el código usa de verdad (`Node 20`,
     `PostgreSQL 16`): el icono de la caja sale de ahí.
2. **Qué hace, si cambió** — `update_view_element` con una `description` de 1 a
   3 frases: qué es, qué recibe o produce y por qué existe. Si la responsabilidad
   no cambió, no la toques.
3. **El contrato** — `set_view_element_spec` con **`merge: true`**:
   - requisitos y criterios que el código ahora cumple o que descubriste;
   - casos límite que encontraste al programar;
   - lo que quedó sin decidir, con `needsClarification: true`;
   - **estado**: si la spec estaba `aprobada` y la implementaste tal cual, dejala
     `aprobada`; si tuviste que desviarte, pasala a `revision` y decí por qué.
     Nunca la apruebes vos: aprobar es del humano.
4. **Componentes nuevos** — si tu cambio creó un componente o una integración
   que el diagrama no tiene, seguí el skill `actualizar-diagrama`:
   `add_view_element` (con `description` y `source`) y `add_view_edge` con
   etiqueta. No reorganices la vista.

## 4 · Verificar

`get_view_element` sobre cada caja que escribiste: la fuente, los metadatos y la
spec tienen que decir lo que querías, y sus vecinos tienen que seguir siendo los
mismos. Cerrá con una tabla «caja → qué quedó escrito».

## Conexión

Si `get_app_state` no responde, la app no está conectada: pedile al humano que
active Ajustes → Servidor MCP y que registre `http://127.0.0.1:7331/mcp` en su
cliente MCP.
