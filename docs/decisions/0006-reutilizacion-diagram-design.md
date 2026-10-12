# ADR 0006 — Qué se reutiliza de `diagram-design` y qué no

Issues: #537 · #538 · #539 · #540

- **Fecha:** 2026-10-12
- **Estado:** aceptado. Tier A entregado (#541–#544). Tier B: B2 skin editorial = feature 022
  (#545, entregada); B1 export HTML = feature 024 (#556); B3 perfiles de marca = feature 023
  (#557). Tier C sigue descartado.
- **Contexto previo:** [ADR 0002](0002-anidamiento-de-contenedores.md) ·
  [ADR 0003](0003-legibilidad-de-la-disposicion.md) · [arquitectura MCP](../architecture/mcp.md)

## Estado y mecanismo

Lo que hace cumplir cada decisión adoptada:

- **Presupuesto de complejidad por notación** (#537): `Notation.budget` en `src/lib/notations.ts`,
  regla `PRESUPUESTO` en `src/lib/mcp/quality.ts`, `describe_notation` lo expone antes de construir.
  `src/lib/__tests__/notations-registry.test.ts` exige que toda notación semántica lo declare.
- **Reglas de conector como métricas** (#538): `src/lib/layout/metrics.ts` + `linea-base.test.ts`.
- **Taste gate en las skills** (#539): `src/lib/mcp-skill.ts` + `mcp-skill.test.ts`.
- **Import Mermaid para el usuario** (#540): tool `import_mermaid` con su ledger de fidelidad en
  `src/lib/mcp/` (pendiente: se cita por nombre cuando exista).

## Contexto

[diagram-design](https://github.com/cathrynlavery/diagram-design) (MIT, v2.6, 51 k★ al 2026-10-12)
es un *agent skill*: el agente escribe un `.html` autocontenido con SVG inline bajo un sistema de
diseño editorial, con 44 tipos de diagrama, onboarding de marca desde una URL, importadores de
Mermaid / draw.io / Excalidraw, export SVG/PNG y un arnés de verificación geométrica en CI.
Resuelve un problema vecino al nuestro (diagramas que un agente produce y una persona revisa) con
un enfoque distinto (sin lienzo, sin modelo editable, sin IA local). Se auditó el repo entero para
decidir qué ideas valen la pena traer.

## Decisión

### Se adopta (Tier A, cambios acotados sin SDD)

| Idea de diagram-design | Cómo entra en Processflow |
|---|---|
| Presupuesto de complejidad por tipo (9 nodos / 12 aristas, 5 lifelines, 5 carriles, 8 entidades) y la salida «overview + detalle» | `Notation.budget` por notación (P6: lo declara el registro, no la regla) + hallazgo `PRESUPUESTO` que remite a `suggest_views` (ADR 0002: profundidad por vistas) |
| Reglas de conector: un punto de anclaje por relación en un mismo borde; etiqueta nunca tapada por una caja ajena | Dos métricas más en `medirLegibilidad` (ADR 0003: la legibilidad es un número) y el reparto de anclajes en `routing.ts` |
| «Taste gate»: declarar tipo, tamaño y cortes **antes** de dibujar; «remove test» antes de entregar | Sección en las skills `disenar-diagrama` y `documento-a-processflow` |
| Import = **redibujar, no convertir**, con *fidelity ledger* de lo fusionado / omitido | `import_mermaid` reutiliza `fromMermaid` + `relayoutConMedida` y devuelve el ledger |

### Se deja en backlog (Tier B, superficie nueva → ruta SDD cuando se priorice)

- **Export HTML autocontenido** → **hecho como feature 024** (#556): `src/lib/export/html-page.ts`
  arma la página (sin scripts ni recursos externos) con el contrato SVG accesible y tres presets
  por destino (página de lectura, lámina 16:9, impresión A4), y `verificarPagina` es el
  `self_check` de diagram-design, corriendo en el gate sobre una página de referencia. La rampa
  tipográfica por preset quedó fuera: el texto vive dentro del SVG.
- **Tokens por rol semántico y skin editorial** → **hecho como feature 022** (#545): tokens
  `--ed-*` en `globals.css`, tratamientos por rol en `src/lib/skin.ts` (declarados o deducidos
  del rol en el registro), skin por proyecto (`GraphData.skin`, canónica por defecto), acento
  sólo en los hotspots (regla `ACENTO` cuando pasan de dos) y contraste verificado en el gate
  (`skin-contrast.test.ts`). El color canónico de cada tipo se conserva: es notación.
- **Perfiles de marca por organización** (feature 008) con onboarding desde URL como `AiTask`
  (`heavy`, `structured`); la petición HTTP sale del main (P4).

### Se descarta (Tier C)

- Lint de render con Chromium (diff de capturas con `overflow` liberado): potente, pero Puppeteer ya
  pesa y no es señal del gate. Si se retoma, como check opcional de `scripts/screenshots.ts`.
- Import draw.io / Excalidraw: parsers nuevos; SDD aparte si hay demanda de clientes.
- Animación `reveal/step`, empaquetado multi-host (`.claude-plugin/`, `npx skills add`), iconos
  Tabler (ya usamos lucide) y los 44 tipos (radar, sankey, wardley…) fuera de DDD/BPMN/C4/UML/MER.

## Reglas al traer algo de ahí

- **Ideas y texto sí, código Python no.** No hay Python en el repo: toda regla llega como lógica
  pura en `src/lib/` con su test (P3).
- **Atribución**: cada adopción cita este ADR y la fuente; la licencia MIT lo permite.
- **P6 manda**: nada que venga de diagram-design cablea tipos. Lo que es notación (presupuestos,
  tratamientos) se declara en `src/lib/notations.ts`.

## Consecuencias

- `validate_diagram` y `review_diagram` avisan antes de que un diagrama deje de leerse, no sólo
  cuando deja de caber (`TAMANO`).
- El agente conoce el presupuesto desde `describe_notation`, así que parte en vistas al diseñar en
  vez de descubrirlo al validar.
- Tier B queda escrito con su ruta; abrirlo es una decisión de producto, no una omisión.
