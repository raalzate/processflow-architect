# spec · 003 — Una sola piel: la app entera oscura y con sistema de diseño

**Estado:** en curso · **Creada:** 2026-08-18 · **Depende de:** simbología por notación (registro
de `src/lib/notations.ts`; ver STATUS.md → «Trabajo en curso»)

## Problema

El lienzo quedó resuelto: paleta homogénea, fichas por notación, fondo oscuro. El resto de la
app no acompañó, y el corte se ve.

La auditoría del repo encontró tres cosas, todas verificables hoy:

1. **La app no tiene un sistema de color; tiene 26 archivos improvisando.** Hay ~90 colores de
   Tailwind cableados fuera del registro de notaciones. No existe token semántico de estado, así
   que «esto salió bien» se reinventa en cada pantalla: `green-100`, `green-500`, `green-600` y
   `emerald-500` conviven para el mismo significado. Lo mismo con los bloques de código:
   `bg-zinc-900` triplicado, con radios distintos en cada copia.
2. **El modo oscuro está roto en superficies concretas.** El tema existe y es real
   (`darkMode: ['class']`, conmutador en Ajustes), pero la tarjeta «¿Cómo funciona la fusión?»
   del agrupador, el aviso de IA remota, el badge de servidor MCP, el error del playground y los
   badges de estado de nodo se pintan claros sobre fondo oscuro. Y a la inversa: los bloques de
   código son oscuros fijos y chocan en tema claro.
3. **Las escalas no son escalas.** 46 tamaños de letra arbitrarios (`text-[9px]`, `text-[10px]`,
   `text-[11px]`) conviviendo con la escala real; `rounded` pelado (0.25rem) contra el
   `--radius` del tema (0.5rem) en 26 sitios; cinco niveles de sombra sobre superficies de la
   misma elevación; y tres anchos de contenido distintos entre páginas hermanas.

Además hay un **bug latente**: `tailwind.config.ts` mapea `--sidebar-*` a variables CSS que
nadie define, así que `bg-sidebar` resuelve a un `hsl()` inválido.

El resultado es el que se ve: la app no parece una herramienta, parece varias.

## Usuarios y valor

- **Quien modela todo el día**: una sola superficie oscura, sin saltos de luminosidad al pasar
  del lienzo a un panel o a Ajustes. Menos fatiga y menos ruido alrededor del diagrama.
- **Quien presenta el modelo**: la app se ve de una pieza cuando se proyecta o se comparte.
- **Quien programa acá**: hay un lugar donde está el color y una regla que lo hace cumplir, en
  vez de copiar el `bg-green-100` del archivo de al lado.

## Historias

### US-1 · Una sola piel

**Given** la app abierta en cualquier pantalla — lienzo, agrupador, ajustes, guía MCP
**When** el usuario recorre la aplicación
**Then** todas las superficies comparten el mismo fondo oscuro, la misma jerarquía de paneles y
el mismo contraste de texto; no hay tarjetas claras ni bloques que canten.

### US-2 · El estado se dice igual en toda la app

**Given** cualquier señal de estado (correcto, aviso, error, información)
**When** aparece en el agrupador, en Ajustes, en un modal o en el playground
**Then** usa el mismo color, el mismo borde y el mismo peso tipográfico, porque sale de un token
del tema y no de una elección por archivo.

### US-3 · El código se ve igual en todos lados

**Given** un bloque de código o de salida JSON
**When** aparece en la guía MCP, en la configuración del servidor o en el playground
**Then** se dibuja con el mismo componente: misma superficie, mismo radio, misma tipografía.

### US-4 · La escala es una escala

**Given** dos superficies del mismo nivel (dos barras, dos tarjetas, dos paneles)
**When** se las compara
**Then** comparten padding, radio y sombra; los tamaños de letra salen de la escala del sistema
y no de valores arbitrarios en píxeles.

### US-5 · Nadie vuelve a cablear un color

**Given** alguien agrega una pantalla con `bg-green-100`
**When** corre `npm run gate`
**Then** el lint falla y le dice qué token usar. La deuda declarada sólo puede achicarse.

## Requisitos funcionales

| Id | Requisito |
|---|---|
| **FR-001** | La app se muestra **siempre en oscuro**: el tema deja de seguir al sistema operativo. El lienzo deja de forzar su propia clase `dark`, porque ya no hace falta. |
| **FR-002** | El conmutador de tema de Ajustes se retira (o queda declarado como sin efecto): ofrecer una opción que no cambia nada es peor que no ofrecerla. |
| **FR-003** | `globals.css` define tokens de **estado**: `success`, `warning`, `info` y `danger` (este último ya existe como `destructive`), cada uno con su color de superficie, borde y texto. |
| **FR-004** | `globals.css` define un token de **superficie de código** (`--code`), y existe **un** componente `CodeBlock` que lo usa. Los tres bloques `bg-zinc-900` actuales pasan a usarlo. |
| **FR-005** | Los tokens `--sidebar-*` que `tailwind.config.ts` referencia quedan **definidos**, o se elimina el mapeo. Hoy `bg-sidebar` produce un color inválido. |
| **FR-006** | Los tokens `--chart-*` se conservan sólo si algo los usa; si no, se borran junto con su mapeo. |
| **FR-007** | Ningún archivo de `src/` fuera del registro de notaciones cablea colores de Tailwind (`bg-*`, `text-*`, `border-*` con paleta). Lo existente entra en una **allowlist decreciente**, igual que la deuda de notación. |
| **FR-008** | La escala tipográfica no admite valores arbitrarios en píxeles: los `text-[9px]`/`[10px]`/`[11px]` pasan a la escala del sistema. |
| **FR-009** | Radios y sombras salen del tema: `rounded` pelado pasa a `rounded-md` (el `--radius` del sistema) y las superficies del mismo nivel comparten elevación. |
| **FR-010** | Las páginas hermanas (ajustes, guía MCP, documentación, agrupador) comparten ancho de contenido y ritmo vertical. |
| **FR-011** | El rediseño **no cambia dónde está cada cosa**: misma navegación, mismos paneles, mismas acciones. Cambia la piel, no el mapa. |

## Criterios de éxito

| Id | Medida | Objetivo |
|---|---|---|
| **SC-001** | Colores de Tailwind cableados fuera de `notations.ts` | de ~90 a 0 (o en allowlist declarada y decreciente) |
| **SC-002** | Superficies que se rompen en oscuro (auditoría §4) | 0 |
| **SC-003** | Variables CSS referenciadas por Tailwind y no definidas | 0 |
| **SC-004** | Tamaños de letra arbitrarios en píxeles | de 46 a 0 |
| **SC-005** | Implementaciones distintas de «bloque de código» | de 3 a 1 |
| **SC-006** | Una regla del lint falla ante un color cableado nuevo | sí, probada en el self-test del arnés |
| **SC-007** | `npm run gate` | verde |

## Fuera de alcance

- **Cambiar la disposición de la interfaz**: paneles, barras y navegación se quedan donde están
  (FR-011). Mover cosas de sitio es otra spec, con su propia validación.
- **Rediseñar los primitivos de shadcn** (`src/components/ui/*`): se ajustan sus tokens, no su
  API ni su estructura.
- **Tema claro**: se retira de la interfaz. Si alguna vez vuelve, vuelve como decisión propia y
  con su spec; el sistema de tokens que deja esta 003 lo hace posible sin rehacer nada.
- **La paleta del diagrama**: `src/lib/notations.ts` es el registro de la simbología y ya está
  resuelto. Esta spec no lo toca.
