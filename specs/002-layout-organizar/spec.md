# spec · 002 — Organizar el layout desde el lienzo

**Estado:** en curso · **Creada:** 2026-08-15 · **Depende de:** [001-layout-legible](../001-layout-legible/spec.md)

## Problema

La 001 hizo que el layout generado fuera legible, pero deja dos cosas sin resolver:

1. **La densidad es fija y quedó estrecha.** El DDD y el C4 apilan hasta 6 elementos por fila
   con la separación mínima, así que se leen apretados aunque haya espacio de sobra alrededor.
   Hoy no hay forma de pedir más aire.
2. **El layout se decide una sola vez, al generar.** Si el resultado no convence, el humano
   sólo puede mover nodos a mano —y `relayout_diagram` vive en el MCP, no en el lienzo, así que
   ni siquiera está a mano desde la app.

Quien revisa un diagrama necesita poder probar disposiciones en segundos y quedarse con la que
mejor cuenta la historia. Eso hoy no existe.

## Usuarios y valor

- **El humano que revisa y presenta**: reorganiza con un clic según lo que necesite (leer en
  pantalla, proyectar, exportar a un documento) sin tocar cada elemento.
- **El agente externo**: hereda los mismos presets por MCP, así que lo que se ve en la app y lo
  que genera el agente son la misma cosa.

## Historias

### US-1 · Cambiar la densidad con un clic

**Given** un diagrama que se ve apretado
**When** el usuario abre «Organizar» y elige *Expandido*
**Then** los elementos se reacomodan con más separación y más elementos por fila, sin cambiar
qué elementos hay ni cómo se conectan, y puede volver atrás con *Deshacer*.

### US-2 · Cambiar de estrategia

**Given** un C4 dispuesto por capas
**When** el usuario elige *Por flujo (swimlane)*
**Then** el diagrama se redibuja con la otra estrategia, aunque su notación no la use por
defecto, para poder comparar cuál se lee mejor.

### US-3 · Saber en qué disposición está

**Given** un diagrama ya organizado
**When** el usuario abre el menú
**Then** el preset actual aparece marcado, y el menú no ofrece como novedad lo que ya está puesto.

### US-4 · Que la IA ordene, no que dibuje

**Given** un big picture con 7 contextos en orden arbitrario
**When** el usuario elige *Sugerir con IA*
**Then** el motor local propone **el orden de las bandas y qué elementos van juntos**, la
geometría la calcula el código determinista, y el usuario ve qué cambió antes de aceptarlo.
La IA nunca devuelve coordenadas: no puede producir solapamientos ni elementos fuera de banda.

### US-5 · El agente externo usa lo mismo

**Given** un agente que acaba de construir un diagrama por MCP
**When** llama `relayout_diagram` con un preset
**Then** obtiene exactamente la misma disposición que el botón del lienzo.

## Requisitos funcionales

| Id | Requisito |
|---|---|
| **FR-001** | Existe un registro de **presets de densidad** (`compacto`, `comodo`, `expandido`) con sus parámetros de geometría (paso de columna, separación vertical, columnas por fila, aire de banda). Es la única fuente de esos números. |
| **FR-002** | Existe un registro de **estrategias** (`flujo`, `capas`) y cualquiera puede aplicarse a cualquier notación, con la que declaran sus roles como default. |
| **FR-003** | `layout()` acepta preset y estrategia; sin argumentos usa el default de la notación con densidad `comodo`. |
| **FR-004** | El default de generación pasa de la densidad mínima a `comodo`: más separación y más elementos por fila que hoy. |
| **FR-005** | El modelo recuerda con qué preset y estrategia se dibujó, para marcar el actual en el menú y para que el agente lo consulte. |
| **FR-006** | El diseñador tiene un botón **«Organizar»** con el menú: densidades, estrategias y *Sugerir con IA*, con el actual marcado. |
| **FR-007** | Reorganizar entra en el historial de deshacer del lienzo: un `Ctrl+Z` vuelve a la disposición anterior. |
| **FR-008** | *Sugerir con IA* se declara como `AiTask` en `src/lib/ai/tasks.ts` (local por defecto) y devuelve **orden de bandas y agrupación**, nunca coordenadas. Lo que devuelve se valida contra el modelo: un nombre que no existe se descarta. |
| **FR-009** | `relayout_diagram` acepta `preset` y `strategy`, con los mismos valores que el menú. |
| **FR-010** | Reorganizar no altera la semántica: mismos elementos, relaciones, contenedores y notación. |

## Criterios de éxito

| Id | Medida | Objetivo |
|---|---|---|
| **SC-001** | Ancho del C4 de Geiser en `expandido` frente a `compacto` | ≥ 1,6× (la densidad se nota) |
| **SC-002** | Elementos por fila en `comodo` (default nuevo) | 8 (hoy 6) |
| **SC-003** | Semántica tras cambiar preset o estrategia en los 5 modelos reales | idéntica (FR-010) |
| **SC-004** | Salida de la IA con nombres inventados | descartada, sin romper el layout |
| **SC-005** | `npm run gate` | verde |

## Fuera de alcance

- Layout orgánico / dirigido por fuerzas: otra familia de algoritmos, con su propia validación.
- Mover el ruteo de aristas: sigue siendo ortogonal entre bandas (001, FR-009).
- Recordar el preset por proyecto en disco: se guarda en el modelo, no en preferencias de usuario.
