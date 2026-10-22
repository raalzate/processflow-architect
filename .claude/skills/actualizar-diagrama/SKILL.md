---
name: actualizar-diagrama
description: Actualiza un diagrama que YA está en Processflow Architect sin dañar lo que el humano dibujó — relaciones, trazos, posiciones, specs y adjuntos — usando el MCP processflow-architect. Lee la vista, planea cambios PUNTUALES (renombrar, describir, citar, agregar, conectar), verifica antes y después que no se perdió ninguna relación y sólo quita algo si el humano lo aprobó. Úsalo cuando el usuario pida "actualizá el diagrama", "agregá X a la vista", "corregí las descripciones", "sincronizá el diagrama con el código", "reflejá este cambio en Processflow" o cualquier cambio sobre una vista existente.
---

# Actualizar un diagrama sin dañar las líneas

La vista que vas a tocar es TRABAJO del humano: acomodó cajas, dibujó el recorrido
de cada relación, escribió specs y adjuntó contratos. Tu cambio tiene que
**sumar** sin borrar nada de eso. La regla de oro:

> **Operaciones puntuales, nunca reemplazar la vista entera para un cambio chico.
> Nunca borrar y recrear un elemento para "corregirlo".**

Borrar y recrear una caja le cambia el id: se pierden sus relaciones, su lugar,
su spec y sus adjuntos. Reemplazar la vista con un grafo armado de memoria omite
relaciones que no viste.

Arnés: `leer → planear → confirmar → aplicar puntual → verificar → cerrar`.

## 0 · Leer lo que hay (ANTES de tocar nada)

1. **`get_app_state`** — proyecto activo, vistas y si la app está conectada.
2. **`get_view`** con el nombre de la vista — su contenido en Mermaid: qué cajas
   hay y qué relaciones las unen. **Anotá el conteo** de elementos y relaciones:
   es la línea base de la verificación.
3. Para cada caja que vas a tocar, **`get_view_element`** — su ficha entera
   (descripción, fuente, metadatos, spec, adjuntos y vecinos). No corrijas una
   caja que no leíste.

## 1 · Planear (sin escribir)

Armá una tabla con CADA operación y la herramienta que la hace. Sólo estas:

| Cambio | Herramienta | Qué conserva |
|---|---|---|
| Renombrar, cambiar tipo, descripción, fuente o contenedor | `update_view_element` | id, relaciones, lugar, spec, adjuntos |
| Agregar una caja | `add_view_element` (con `description` y `source`) | todo lo demás: la caja nueva va a un hueco libre |
| Conectar dos cajas | `add_view_edge` (con etiqueta) | las otras relaciones y sus trazos |
| Cambiar etiqueta o sentido de una relación | `update_view_edge` | su recorrido y sus anclas |
| Escribir o completar la spec | `set_view_element_spec` con `merge: true` | lo que ya escribió una persona |
| **Quitar** una caja o relación | `remove_view_element` / `remove_view_edge` | — (destructivo: sólo con aprobación) |

Reglas del plan:

- **Corregir ≠ recrear.** Una caja mal nombrada o mal tipada se arregla con
  `update_view_element`. Nunca `remove` + `add`.
- **Cada caja nueva lleva `description` y `source`.** La descripción dice qué es
  y qué hace (1 a 3 frases); la fuente es una propiedad aparte (`docs/x.md:36`,
  `src/pagos/api.ts:120`). Nunca pegues «Fuente: …» en la descripción.
- **Quitar se pregunta.** Si el cambio implica quitar algo, listalo aparte y
  esperá el sí del humano para ESO en particular.
- **Nombres repetidos:** si la herramienta dice que hay dos cajas con ese nombre,
  preguntá cuál. No elijas.

Mostrale el plan al humano (qué agregás, qué cambiás, qué quitarías) y esperá
aprobación.

## 2 · Aplicar, de a una operación

Ejecutá las operaciones en este orden: **agregar cajas → corregir cajas →
conectar → specs → (quitar, sólo lo aprobado)**. Conectar después de agregar
evita relaciones colgando de una caja que todavía no existe.

### Reemplazar la vista entera: sólo como último recurso

`set_view_graph` y `export_as_view` con `replace: true` reemplazan el contenido
de la pestaña. Úsalos sólo si el cambio es una reestructuración completa que el
humano pidió. Están protegidos: si el grafo entrante **pierde** elementos o
relaciones, la herramienta lo rechaza con la lista exacta y no aplica nada.

- Si la lista te sorprende, tu grafo está incompleto: agregá lo que falta.
- Si quitar esas cosas es lo aprobado, reintentá con `allowRemovals: true`.
- **Nunca** pongas `allowRemovals: true` "por las dudas": es firmar que se borra.

## 3 · Verificar (siempre)

Volvé a llamar **`get_view`** y compará con la línea base:

- elementos = antes + agregados − quitados aprobados;
- relaciones = antes + conectadas − quitadas aprobadas;
- cada relación que existía antes sigue estando (mismos extremos).

Si un número no cierra, **pará y decilo**: qué esperabas, qué hay. No intentes
"arreglarlo" recreando cosas.

## 4 · Cerrar

Resumí en una tabla corta qué cambió (agregado / corregido / conectado / quitado)
y el conteo antes → después. Si quedaron descripciones pobres o cajas sin fuente,
listalas como pendientes en vez de inventarlas.

## Conexión

Si `get_app_state` no responde, la app no está conectada: pedile al humano que
active Ajustes → Servidor MCP y que registre `http://127.0.0.1:7331/mcp` en su
cliente MCP.
