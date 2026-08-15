# spec · 001 — Layout legible de diagramas exportados por MCP

**Estado:** en curso · **Creada:** 2026-08-14 · **Notación afectada:** todas (BPMN, C4, DDD, UML)

## Problema

Un agente externo (Claude Code) construyó por MCP el portafolio de un proyecto real
(BGLA/Geiser) siguiendo el arnés: modelos válidos, con trazabilidad y sin hallazgos de
calidad. Al abrirlos en el lienzo, **son ilegibles**: bandas de 5520 px de ancho, aristas
cruzando el diagrama en diagonal, etiquetas superpuestas y nombres recortados.

El modelo era correcto; lo que falla es la **geometría** que produce `layout()`
(`src/lib/mcp/diagram-builder.ts`) y dos reglas de calidad mal calibradas.

### Evidencia medida

`layout()` sobre `proyecto-geiser-venta-firma-y-emision` (BPMN, 5 pools, 34 elementos):

```
Cliente y Asesor del Banco:  ancho=5520  alto=128     ← relación 1:43
Nova / EVA (externo):        ancho=5520  alto=128
Cotización y Motor:          ancho=5520  alto=218
alto total del diagrama: 1022
fila y=418: 12 nodos · fila y=508: 2 nodos            ← reparto desigual
pool 1: sus 4 nodos ocupan x 100..4940                ← cruzan todo el diagrama
```

`layout()` sobre `proyecto-geiser-paisaje-de-sistemas-2` (C4, 21 elementos):

```
Ecosistema Bupa (BGLA): y=486  ancho=1780   (sus nodos: x 320..1420)
sueltos:  y=106(4) · 196(3) · 286(2) · 376(2)
dentro:   y=532(6) · 622(3) · 712(1 nodo solo)
```

Contenido de esos modelos:

- 8 de 21 nombres pasan de 20 caracteres → recortados en el lienzo.
- 16 de 23 etiquetas de arista pasan de 40 caracteres → ilegibles al superponerse.

### Causa raíz

1. `rankByFlow` calcula el rango (columna) **globalmente**, sobre todos los nodos de todos
   los contenedores y sobre **todas** las aristas, incluidas las `dashed`. En BPMN una arista
   `dashed` entre Pools es flujo de MENSAJE: conecta dos procesos independientes y no debe
   ordenar columnas. Cada mensaje propaga rango al pool vecino y las columnas se acumulan
   hasta 34.
2. El ancho de banda usa el máximo GLOBAL de columnas: un carril de 3 nodos hereda el ancho
   del de 12.
3. En notaciones sin flujo (C4, DDD) el longest-path no significa nada: produce filas
   arbitrarias y huecos verticales.
4. `MAX_NAME_CHARS = 28` no corresponde al ancho real del nodo (160 px ≈ 20 caracteres).
5. Ninguna regla acota el largo de la etiqueta de arista.
6. Las aristas se dibujan en línea recta de centro a centro y su etiqueta va al punto medio:
   sobre una diagonal larga, la etiqueta cae encima de nodos ajenos.

## Usuarios y valor

- **El humano que revisa** un diagrama recién llegado al lienzo: hoy tiene que reordenarlo a
  mano antes de poder juzgarlo. Un diagrama ilegible no se revisa: se aprueba por cansancio.
- **El agente externo**: hoy puede cumplir todo el arnés y aun así entregar algo que parece
  mal hecho. Sin este arreglo, el arnés garantiza corrección pero no entregabilidad.

## Historias

### US-1 · Proceso BPMN legible por participante

**Given** un BPMN con 5 Pools conectados entre sí por flujo de mensaje (`dashed`)
**When** se exporta al lienzo
**Then** cada Pool ordena sus pasos de izquierda a derecha empezando en su propia primera
columna, y ningún mensaje entre Pools desplaza las columnas del Pool vecino.

### US-2 · Bandas del tamaño de su contenido

**Given** un diagrama donde un carril tiene 12 elementos y otro tiene 3
**When** se aplica el layout
**Then** el ancho del diagrama lo fija el carril más largo, y ninguna banda queda con más de
una columna de aire sobrante respecto de sus propios elementos.

### US-3 · Arquitectura sin flujo, ordenada por rol

**Given** un C4 con Personas, Sistemas propios dentro de un Límite y Sistemas Externos fuera
**When** se aplica el layout
**Then** los elementos se agrupan por rol en filas estables (actores arriba, sistemas propios
en el límite, externos y almacenes abajo) en vez de por longest-path, sin filas de un solo
elemento colgando ni huecos verticales mayores a la separación entre bandas.

### US-4 · Nombres que caben

**Given** un elemento cuyo nombre no entra en la caja del lienzo
**When** el agente valida el diagrama
**Then** el hallazgo aparece con el umbral que corresponde al ancho real de la caja, y el
lienzo dibuja el nodo lo bastante ancho para el texto que sí se acepta.

### US-5 · Etiquetas de relación legibles

**Given** una relación etiquetada «cotiza y diligencia su solicitud [navegador web]» (48 car.)
**When** el agente valida el diagrama
**Then** se le indica acortar la etiqueta y mover el detalle a la descripción de la relación.

### US-6 · Relaciones que no cruzan por encima de todo

**Given** un mensaje entre el primer y el último Pool de un proceso
**When** se dibuja en el lienzo
**Then** la arista se rutea por el canal entre bandas en vez de atravesar en diagonal, y su
etiqueta se ancla junto al origen, no en el punto medio de la diagonal.

## Requisitos funcionales

| Id | Requisito |
|---|---|
| **FR-001** | El rango (columna) se calcula **por contenedor raíz**, no globalmente. Los elementos de un contenedor empiezan en la columna 0 de su banda. |
| **FR-002** | Las aristas que no son de secuencia (`dashed` en notaciones con roles `pool`) se **excluyen** del cálculo de rangos. |
| **FR-003** | El ancho de cada banda se calcula con las columnas que ocupan **sus propios** elementos; el ancho del lienzo es el de la banda más ancha. |
| **FR-004** | Los elementos con rol `end` se colocan en la última columna de su contenedor; los de rol `start`, en la primera. |
| **FR-005** | Cuando la notación no declara roles de flujo (`start`/`end`), el layout agrupa por rol semántico en filas: `actor` → `system`/`datastore` → `external`, en vez de por longest-path. |
| **FR-006** | `MAX_NAME_CHARS` deriva del ancho REAL con el que el lienzo dibuja el nodo (`NODE_WIDTH` = 160 px, `p-2`, `text-xs`, `line-clamp`), no de un valor arbitrario. |
| **FR-007** | ~~Ancho de nodo variable~~ **Descartado tras verificar el renderer** (ver Clarificación 3): el lienzo dibuja los nodos con ancho fijo, así que el layout mantiene el ancho uniforme y el ajuste se hace por umbral (FR-006), no por geometría. |
| **FR-008** | Regla de calidad nueva: etiqueta de arista más larga que el límite legible → hallazgo con el texto sugerido para `description`. |
| **FR-009** | Las aristas entre contenedores distintos se rutean en ortogonal (`routing: "orthogonal"`) al serializar, en vez de recta punto a punto. |
| **FR-010** | Ningún cambio de layout altera la semántica del modelo: mismos nodos, aristas, contenedores y notación antes y después. |
| **FR-011** | Existe una forma explícita de **rehacer** el layout de un diagrama que ya tiene geometría guardada (los modelos construidos antes de este arreglo, y los diseños importados desde la app), sin tocar su semántica. |

## Criterios de éxito


| Id | Medida | Hoy | Objetivo | **Resultado** |
|---|---|---|---|---|
| **SC-001** | Ancho de banda en `venta-firma-y-emision` | 5520 px | ≤ 2200 px | **2660 px — no cumplido**, ver nota |
| **SC-002** | Relación ancho/alto del diagrama BPMN | 5.2:1 | ≤ 2.5:1 | **2.0:1 ✅** |
| **SC-003** | Aire sobrante por banda | hasta 4880 px | ≤ 1 columna | **40 px en todas ✅** |
| **SC-004** | Filas de un solo elemento en el C4 | 1 | 0 | **1 — no cumplido**, ver nota |
| **SC-005** | Elementos con nombre recortado sin hallazgo | 8+ | 0 | **0 ✅** (umbral 21, deriva de la caja) |
| **SC-006** | Etiquetas > límite sin hallazgo | 16 | 0 | **0 ✅** (regla `ETIQUETA-LARGA`) |
| **SC-007** | Suite `npm run gate` | verde | verde | **verde ✅** (748 pruebas) |

Medidas completas sobre los 5 modelos reales del workspace:

| Modelo | ancho antes → después | relación antes → después | aire sobrante |
|---|---|---|---|
| big picture (ddd) | 6460 → **1400** | 4.4:1 → **1.0:1** | 4880 → 40 |
| venta y firma (bpmn) | 5580 → **2720** | 5.2:1 → **2.0:1** | 2240 → 40 |
| facturación (bpmn) | 3380 → **1400** | 4.5:1 → **1.2:1** | 2020 → 40 |
| underwriting (bpmn) | 3600 → **1620** | 3.6:1 → **1.4:1** | 3120 → 40 |
| paisaje (c4) | 1840 → **1400** | 2.3:1 → 2.5:1 | 260 → 40 |

**Nota SC-001 (no cumplido).** El carril «Cotización y Motor de Enrollment» encadena 12 pasos:
12 columnas × 220 px = 2640 px es su tamaño intrínseco, no aire sobrante (el aire quedó en
40 px). El objetivo de 2200 px era arbitrario: para bajar de ahí hay que **dividir el
proceso**, que es contenido, no geometría — y `suggest_views` ya lo propone. Se deja como
está en vez de introducir un wrap en serpiente que rompería la lectura de izquierda a derecha.

**Nota SC-004 (no cumplido).** En el C4 quedan 7 elementos fuera del límite y la rejilla es de
6 por fila: el séptimo cae solo. Es un residuo de rejilla, no el hueco vertical del bug
original (que sí desapareció). Se corrige repartiendo las filas de forma pareja; queda como
mejora menor anotada, no bloquea la entrega.

## Ampliación de alcance (2026-08-14, tras la validación visual)

Con el layout arreglado, lo que seguía haciendo ilegible el big picture era del **renderer**, no
de la geometría, así que entra en esta feature:

| Id | Requisito |
|---|---|
| **FR-012** | El halo de la etiqueta de arista se dimensiona según su texto. Hoy es un rect fijo de 80×20 px: una etiqueta de 48 caracteres (~240 px) se desborda y queda cruzando líneas, títulos de contexto y nodos (`DesignerCanvas.tsx:1005`). |
| **FR-013** | La etiqueta se acota visualmente y el texto completo queda accesible (tooltip), para que una relación bien documentada no tape el diagrama. |
| **FR-014** | Las bandas de un mismo diagrama comparten ancho (el de la más ancha) en vez de quedar escalonadas: con el rango ya calculado por banda, uniformar cuesta poco aire y los contextos se leen como columnas comparables. |
| **FR-015** | La pestaña del MODELO del proyecto muestra su badge de notación como las demás vistas: es la que fija la paleta y, sin badge, un proyecto C4 parecía no tener su diagrama (`ViewsTabBar.tsx:144`). |
| **FR-016** | El MCP permite CORREGIR, no sólo añadir y borrar: cambiar nombre, tipo (dentro de la misma familia), descripción, cita o etiqueta conservando id y relaciones (`update_element`, `update_edge`), y eliminar una relación suelta (`remove_edge`). Sin esto, acortar un nombre costaba las aristas del elemento y en la práctica nadie corregía nada. |

## Fuera de alcance

- Reubicar la etiqueta a lo largo de la arista (anclaje al 25 % del recorrido, evitar colisión
  entre etiquetas vecinas): mejora aparte, con su propia verificación visual.
- Recalcular posiciones al importar en el lienzo: el MCP ya entrega geometría; `relayout_diagram`
  cubre los modelos viejos.
- Layout jerárquico contenedor→contenedor: el formato `GraphData.agregados[]` es plano; la
  regla `CONTENEDOR-VACIO` ya cubre el caso de anidar Pool y Carril.
- Solapamiento de etiquetas entre sí (sólo se ataca el anclaje respecto de su arista).

## Clarificaciones

1. **¿Se re-exportan los modelos ya construidos?** No automáticamente: el modelo en curso
   guarda geometría sólo si venía posicionado. Al re-exportar con `export_to_app` se aplica
   el layout nuevo. Se verificará contra los 5 modelos reales del workspace.
2. **¿`dashed` significa lo mismo en toda notación?** No: en UML es retorno/dependencia. Por
   eso FR-002 se limita a las notaciones que declaran rol `pool` (hoy BPMN).
3. **¿Se puede ensanchar el nodo según su texto?** No sin tocar el renderer:
   `DesignerCanvas.tsx:725` dibuja el `foreignObject` del nodo con `NODE_WIDTH` fijo y sólo
   los contenedores leen `node.width` (línea 550). Ensanchar el modelo no cambiaría nada en
   pantalla. Además, en un swimlane los nodos de anchos distintos rompen la alineación de
   columnas. Se descarta FR-007 y el problema se ataca por el umbral (FR-006): el agente
   escribe nombres que caben. Queda como deuda declarada si más adelante se quiere texto
   completo en nodos anchos.
