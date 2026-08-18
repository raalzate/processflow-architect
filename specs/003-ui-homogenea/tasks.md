# tasks · 003 — Una sola piel

Orden por dependencia: primero el sistema (tokens), después el barrido, y el freno al final —
así la regla nace con la deuda ya en cero y no con una allowlist enorme.

Entrega con `npm run gate` verde (P1). Lo que toque `src/lib/` lleva prueba (P3).

| # | Tarea | Requisitos | Verificación |
|---|---|---|---|
| T1 | Tokens de estado (`success`, `warning`, `info`) y de código (`--code`) en `globals.css` + mapeo en `tailwind.config.ts` | FR-003, FR-004 | test: todo token mapeado en Tailwind existe en el CSS |
| T2 | Definir o eliminar `--sidebar-*` y `--chart-*` | FR-005, FR-006 | el mismo test de T1 (0 variables colgadas) |
| T3 | Tema oscuro fijo: la raíz lleva `dark`, el lienzo deja de forzarlo | FR-001 | el conmutador y su lógica se borran por quedar sin consumidor + verificación visual |
| T4 | Retirar el conmutador de tema de Ajustes | FR-002 | verificación visual |
| T5 | Componente `CodeBlock` y reemplazo de los tres `bg-zinc-900` | FR-004 | grep sin ocurrencias + visual |
| T6 | Barrido de color por token en las 5 superficies rotas en oscuro (agrupador, IA remota, MCP config, playground, NodeModal) | FR-007, SC-002 | lint TOKENS + visual |
| T7 | Barrido del resto de archivos con color cableado (sidebar, chat, badges, toast) | FR-007 | lint TOKENS |
| T8 | Escala tipográfica: quitar los `text-[Npx]` | FR-008 | lint TOKENS (regla de arbitrarios) |
| T9 | Radios y sombras del tema; ancho y ritmo de páginas hermanas | FR-009, FR-010 | verificación visual |
| T10 | Regla **TOKENS** en `scripts/repo-lint.mjs` con allowlist decreciente + caso en el self-test | FR-007, SC-006 | self-test del arnés (el freno muerde) |
| T11 | `npm run gate` + STATUS al día | SC-007 | gate verde |

## Estado

- [x] T1 · [x] T2 · [x] T3 · [x] T4 · [x] T5 · [x] T6 · [x] T7 · [x] T8 · [x] T9 · [x] T10 · [x] T11

Marcado con el comando corrido al lado, no de memoria:

| Tarea | Verificado con |
|---|---|
| T1 · T2 | `src/lib/__tests__/theme-tokens.test.ts` — 0 variables mapeadas sin definir, 0 definidas sin uso, paridad claro/oscuro |
| T3 · T4 | `src/app/layout.tsx` fija `dark`; `useTheme`, `lib/theme.ts` y su test se borran por quedar sin consumidor (typecheck verde) |
| T5 | `src/components/ui/code-block.tsx`; `grep bg-zinc-900 src/` → 0 |
| T6 · T7 | regla TOKENS del lint en verde sobre todo `src/` |
| T8 | `grep 'text-\[[0-9]*px\]' src/` → 0; la escala vive en `tailwind.config.ts` (`text-2xs`) |
| T9 | `grep '\brounded\b'` sin clases pelada; anchos de página unificados a `max-w-3xl`/`max-w-5xl` |
| T10 | `node scripts/harness-selftest.mjs` — «repo-lint: detecta color crudo y tamaño de letra arbitrario» |
| T11 | `npm run gate` verde |

**Pendiente de verificación humana:** el recorrido visual de las cuatro notaciones y de cada
pantalla. Lo que el gate demuestra es que no quedan colores crudos ni variables colgadas; que se
*vea* bien lo dice el ojo.
