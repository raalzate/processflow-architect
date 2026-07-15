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
  description: "Confirma pagos con la pasarela; cancela pedidos sin pago a las 24 h." }
add_node { id: "cmd-pagar-pedido", name: "Pagar Pedido", type: "Comando", container: "Pagos" }
add_node { id: "evt-pago-confirmado", name: "Pago Confirmado", type: "Evento", container: "Pagos" }
add_node { id: "pol-cancelacion-24", name: "Sin pago en 24 h → Cancelar Pedido", type: "Política", container: "Pagos" }
add_edge { from: "cmd-pagar-pedido", to: "evt-pago-confirmado", label: "pasarela de pagos [API]" }
add_edge { from: "cmd-pagar-pedido", to: "pol-cancelacion-24", label: "si no se confirma" }
```

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

1. `validate_diagram` sin errores Y sin avisos de nodos aislados.
2. `render_mermaid`: ¿el flujo se lee de inicio a fin contando la historia del
   documento? ¿Las decisiones tienen todas sus ramas?
3. Nombres = Lenguaje Ubicuo del documento (mismo idioma, mismos términos).
4. Cada afirmación importante del documento tiene su elemento; lo dudoso lleva
   «pendiente en documento fuente» en la descripción.
5. ≤ ~40 nodos; si te pasas, divide en otra vista.

## Antipatrones (no hacer)

- Inventar tipos (`type: "Proceso"` no existe) — usa SOLO `describe_notation`.
- Un solo diagrama mezclando notaciones o TODO el documento en un BPMN gigante.
- Compuertas encadenadas sin tareas entre medias para «ahorrar nodos».
- Ids genéricos (`nodo-1`, `tarea-2`): impiden conectar bien y depurar.
- Modelar conocimiento del rubro que el documento no dice (el diagrama debe
  ser defendible línea a línea contra el documento fuente).
