# Ejemplos de referencia — diagramas de calidad

Ejemplos con un dominio común (una tienda en línea: pedidos, pago y envío) de
cómo traducir señales de un documento a llamadas MCP. Consulta el ejemplo de
la notación que vas a construir ANTES de empezar; lo importante es el PATRÓN,
no el rubro.

## DDD · Event Storming (big picture)

Señal del documento → modelo:

> "El área de Pagos confirma el pago con la pasarela. Si el pago no se
> confirma en 24 horas, el pedido se cancela automáticamente."

```
add_container { name: "Pagos", type: "Contexto Delimitado",
  description: "Confirma pagos con la pasarela; cancela pedidos sin pago a las 24 h.",
  source: "PRD §4.2 (p. 11)" }
add_node { id: "cmd-pagar-pedido", name: "Pagar Pedido", type: "Comando", container: "Pagos", source: "PRD §4.2 (p. 11)" }
add_node { id: "evt-pago-confirmado", name: "Pago Confirmado", type: "Evento", container: "Pagos", source: "PRD §4.2 (p. 11)" }
add_node { id: "pol-cancelacion-24", name: "Cancelar sin pago", type: "Política", container: "Pagos", description: "Si el pago no se confirma en 24 h, el pedido se cancela.", source: "PRD §4.2 (p. 11)" }
add_edge { from: "cmd-pagar-pedido", to: "evt-pago-confirmado", label: "pasarela de pagos [API]" }
add_edge { from: "cmd-pagar-pedido", to: "pol-cancelacion-24", label: "si no se confirma" }
```

`source` es la cita de dónde sale cada elemento. No es decorativo: la tabla
«elemento ← fuente» de `review_diagram` se construye con eso, y sin ella el
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

```
add_container { name: "Ventas", type: "Carril" }
add_container { name: "Bodega", type: "Carril" }
add_node { id: "ven-inicio", name: "Pedido recibido", type: "Evento de Inicio", container: "Ventas" }
add_node { id: "ven-gw-stock", name: "¿Hay stock?", type: "Compuerta Exclusiva", container: "Ventas" }
add_node { id: "bod-prepara", name: "Prepara el envío", type: "Tarea", container: "Bodega", description: "SLA: 48 h." }
add_edge { from: "ven-gw-stock", to: "bod-prepara", label: "Sí" }
add_edge { from: "ven-gw-stock", to: "ven-orden-repo", label: "No" }
```

Claves de calidad:
- **Un carril por responsable** tal como los nombra el documento; prefija los
  ids con el carril (`ven-`, `bod-`) para que nunca choquen.
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

```
add_container { name: "Tienda en Línea", type: "Límite de Sistema" }
add_node { id: "c4-storefront", name: "Storefront Web", type: "Contenedor", container: "Tienda en Línea", tags: ["portal web"] }
add_node { id: "c4-api-pedidos", name: "API de Pedidos", type: "Contenedor", container: "Tienda en Línea", tags: ["core de pedidos"] }
add_node { id: "ext-pasarela", name: "Pasarela de Pagos", type: "Sistema Externo", description: "Procesa tarjetas y confirma pagos." }
add_edge { from: "c4-api-pedidos", to: "ext-pasarela", label: "cobra el pedido [HTTPS/JSON]" }
```

Claves de calidad:
- **Límite de Sistema por organización**; sistemas propios dentro,
  `Sistema Externo` (pasarela, transportadora, autoridad fiscal) fuera.
- **TODA relación etiquetada** con verbo + tecnología/canal:
  «consulta inventario [SQL]», «notifica despacho [webhook]». Una arista sin
  etiqueta en C4 no comunica nada.
- `tags` para el rol técnico del sistema («core de pedidos», «portal web»).
- Personas fuera de los límites, conectadas a los sistemas que usan.

## Checklist final (antes de exportar)

1. `validate_diagram` sin errores, sin hallazgos `grave` y sin avisos de nodos
   aislados.
2. `render_mermaid`: ¿el flujo se lee de inicio a fin contando la historia del
   documento? ¿Las decisiones tienen todas sus ramas etiquetadas?
3. Nombres = Lenguaje Ubicuo del documento (mismo idioma, mismos términos),
   **de máx ~21 caracteres**, y etiquetas de arista **de máx ~30** (verbo +
   `[tecnología]`); el detalle y las condiciones «si X → Y» van en `description`,
   no en el `name` (se recorta) ni en una etiqueta kilométrica (tapa el lienzo).
4. Cada elemento con su `source`; lo dudoso, registrado con `record_ambiguity` o
   marcado «pendiente en documento fuente» en la descripción.
5. ≤ ~40 nodos; si te pasas, `suggest_views` y divide.
6. `review_diagram` con veredicto ✅ y **aprobado por el usuario**. Recién ahí
   `export_to_app` / `export_as_view`, según lo que diga `get_app_state`.

## Antipatrones (no hacer)

- Inventar tipos (`type: "Proceso"` no existe) — usa SOLO `describe_notation`.
- Un solo diagrama mezclando notaciones o TODO el documento en un BPMN gigante.
- Compuertas encadenadas sin tareas entre medias para «ahorrar nodos».
- Ids genéricos (`nodo-1`, `tarea-2`): impiden conectar bien y depurar.
- Modelar conocimiento del rubro que el documento no dice (el diagrama debe
  ser defendible línea a línea contra el documento fuente).
- Exportar sin `get_app_state`: crea proyectos duplicados o reemplaza el que el
  usuario tenía abierto.
- Exportar sin mostrar `review_diagram`: la revisión se termina haciendo en el
  lienzo, que es donde más cuesta y donde ya no hay trazabilidad a la fuente.
