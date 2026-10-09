# ADR 0005 — Edición web empresarial: heredar la app de escritorio sin bifurcarla

- **Fecha:** 2026-10-09
- **Estado:** propuesto. El repo de escritorio ya quedó **preparado** (ver «Preparación hecha»);
  ninguna fase del plan está ejecutada.
- **Contexto previo:** [ADR 0001](0001-arnes-del-agente.md) · [arquitectura](../ARCHITECTURE.md) ·
  [ADR 0004 (firma)](0004-firma-de-codigo.md)

## Contexto

Se quiere una **edición web de pago**: la empresa compra, paga por miembro, los equipos editan en
tiempo real, la IA corre en la nube (OpenRouter) con modelos según el plan, con pasarela de
suscripción y una postura de seguridad alineada a **NIST CSF 2.0**. La app de escritorio sigue en
GitHub, Apache-2.0. La edición web es un **proyecto aparte y privado** que debe heredar features y
estilo de la de escritorio sin volverse un fork que diverge.

Lo que hay hoy (medido el 2026-10-09):

| Capa | Archivos | Acoplamiento a Electron |
|---|---|---|
| `src/lib` (lógica pura) | 135 (+150 tests) | 0 imports de Node/Electron. **4 archivos leen `window.electronAPI`** con guard (`ai/providers.ts`, `ai/builder-agent.ts`, `ai/local-capability.ts`, `markdown-utils.ts`) |
| `src/components` | 73 | **14 archivos** tocan `window.electronAPI` directo; `layout/AppContent.tsx` es el más acoplado (7 usos) |
| `src/hooks` · `src/context` | 11 · 5 | 4 + 2 archivos |
| `preload.ts` | 48 métodos | ventana, modelos LiteRT, agente CLI, MCP embebido, IA remota, updater |
| Persistencia | `useSavedFiles.ts`, `GraphDataProvider.tsx`, `ViewsContext.tsx` | **localStorage**, no IPC. Portable |
| IA | `ai/tasks.ts` (13 `AiTask`), `router.ts`, `providers.ts` | `tasks.ts` no sabe de Electron. `providers.ts` son funciones sueltas sobre `window.electronAPI`; **no hay interfaz de proveedor** |

Conclusión del mapa: **no existe un bridge central**. Veinticuatro archivos hablan con Electron a
mano. Ese es el único obstáculo serio para heredar el renderer; el resto ya es portable.

## Decisión

### D1 — Un monorepo abierto que publica paquetes; un repo privado que los consume

El repo público pasa a **npm workspaces**:

```
processflow-architect/            (público, Apache-2.0)
├── packages/core/                @processflow/core  ← hoy src/lib (puro)
├── packages/ui/                  @processflow/ui    ← hoy src/components + hooks + context + estilos
├── apps/desktop/                 Electron: main/, preload.ts, src/app (rutas Next)
└── mcp-server/                   sin cambios

processflow-cloud/                (privado, propietario)
├── apps/web/                     Next.js: mismas rutas, adaptadores web
├── apps/api/                     backend: auth, orgs, billing, IA, persistencia
├── apps/collab/                  servidor Yjs (Hocuspocus)
└── packages/adapters-web/        implementa los puertos de @processflow/core para la nube
```

Los paquetes se publican con versión (`changesets`); el repo privado los consume como dependencia
normal. **Alternativa rechazada: fork.** Un fork hereda una vez y después cada feature se hace dos
veces. Apache-2.0 permite que el consumidor sea propietario; lo que no puede pasar es que código
empresarial (billing, tenancy, SSO) entre a los paquetes públicos.

### D2 — Puertos y adaptadores: el renderer deja de saber en qué corre

Antes de dividir nada, se define en `core` la superficie que hoy es `window.electronAPI`:

| Puerto (en `@processflow/core`) | Hoy lo cumple | En la nube lo cumple |
|---|---|---|
| `PlatformApi` (clipboard, captura, PDF, navegación, info de sistema) | `preload.ts` vía IPC | APIs del navegador + `fetch` |
| `AiProvider` (`generate`, `stream`, `available`, `capabilities`) | `providers.ts` → IPC → `ai-remote.ts` / LiteRT | `fetch` a `/api/ai/*` → OpenRouter |
| `ProjectStore` (listar, abrir, guardar, vistas) | localStorage | REST + Postgres |
| `GraphStore` (estado del grafo observable) | `useState` en `GraphDataProvider` | documento Yjs (ver D3) |
| `UpdaterApi`, `ModelManagerApi`, `McpBridge` | IPC | **no aplican**: el adaptador web devuelve «no disponible» y la UI ya sabe ocultar (`local-capability.ts`) |

Se inyectan por un `PlatformProvider` React en la raíz. Los 24 archivos pasan a usar hooks
(`usePlatform()`, `useAiProvider()`), nunca `window.electronAPI`. **La regla PUREZA del lint se
extiende**: `window.electronAPI` sólo puede aparecer en `apps/desktop/`. Así el refactor no
retrocede.

`tasks.ts` no se toca: el router sigue decidiendo por `AiMode`, y `AiProvider` es la pieza que
cambia debajo. Se agrega `openrouter` a `RemoteProvider` en `remote-settings.ts`.

### D3 — Colaboración en tiempo real con Yjs (CRDT), servidor propio

**Yjs + Hocuspocus autoalojado**, no Liveblocks. Motivo: costo (Liveblocks salta a US$299/mes a
10k MAU; Hocuspocus es un VPS + Postgres) y control del dato (el documento vive en nuestra base,
requisito para la postura de seguridad).

- El grafo de un proyecto es un `Y.Doc`: `Y.Map` de nodos, `Y.Map` de aristas, `Y.Array` de vistas.
  `GraphStore` tiene dos implementaciones: local (escritorio, sin Yjs) y colaborativa (web).
- Presencia (cursores, selección, quién edita qué) con *awareness* de Yjs.
- Autenticación del WebSocket con el JWT de la sesión; autorización por rol dentro del proyecto.
- Persistencia: snapshot del `Y.Doc` en Postgres + historial de versiones (se reutiliza la idea de
  artefactos versionados del agente).
- El escritorio **no** incorpora Yjs: su `GraphStore` sigue siendo local. Es la pieza con más
  riesgo de implementación (hoy el estado vive en `useState` en `GraphDataProvider`): se aborda como
  feature SDD propia.

### D4 — IA en la nube por OpenRouter, del lado del servidor, con modelos según el plan

Mismo principio que P4 de la constitución: **la llave nunca llega al navegador**.

- `apps/api` tiene la cuenta OpenRouter de la empresa. Con la **Management API** crea una llave por
  organización cliente con `limit` mensual y `limit_reset: monthly`: el gasto de IA de cada
  cliente queda acotado por plan sin contabilidad propia.
- Un **catálogo de modelos por plan** (`plans.models_allowed`, `plans.ai_budget_usd`): por ejemplo
  Team → modelos económicos; Business → añade modelos frontera; Enterprise → BYOK (la empresa
  cliente pone su propia llave de proveedor, OpenRouter la soporta y `include_byok_in_limit` la
  contabiliza).
- El endpoint `/api/ai/generate` recibe `taskId` + entrada, consulta el plan de la org, elige modelo
  dentro de lo permitido, llama a OpenRouter con *streaming* (SSE) y registra uso (tokens, costo,
  usuario, proyecto) para auditoría y para el panel de consumo.
- **LiteRT en el navegador sigue siendo posible** (es WebGPU en el renderer, no Electron): queda
  como opción «local» del plan gratuito en Chrome/Edge. Para el resto, `AiMode = remote`.

### D5 — Modelo comercial: la organización compra, paga por asiento

Entidades: `organizations` · `members` (rol: owner/admin/editor/viewer) · `workspaces` ·
`projects` · `plans` · `subscriptions` (una por org, cantidad = asientos) · `entitlements`
(derivados: modelos, presupuesto IA, nº de proyectos, SSO sí/no) · `usage_events`.

Pasarela: **Paddle como *merchant of record***. Motivos: Stripe no abre cuentas a empresas
colombianas (haría falta una LLC en EE. UU.); Paddle factura, cobra impuestos (IVA/VAT por
país) y remite, cosa que una pasarela pura no hace, y soporta cantidad variable (asientos) con
prorrateo. Lemon Squeezy fue adquirida por Stripe y su roadmap es incierto. Si la mayoría de
clientes resulta colombiana y pide PSE/COP, se añade **Wompi o Rebill** como segunda pasarela
detrás de la misma tabla `subscriptions`.

Flujo: checkout de Paddle → webhook firmado → `subscriptions` + `entitlements` → la UI y la API
leen *entitlements*, nunca Paddle en caliente. Al invitar o quitar miembros, la API ajusta la
cantidad de la suscripción (prorrateo automático). Periodo de gracia ante impago; degradación a
sólo lectura, nunca borrado.

### D6 — Seguridad alineada a NIST CSF 2.0 desde el día uno

CSF 2.0 describe resultados, no controles. Esta es la línea base concreta por función, y lo que la
hace cumplir:

| Función | Controles mínimos | Mecanismo |
|---|---|---|
| **Govern** | política de seguridad, roles, registro de riesgos, proveedor crítico listado (OpenRouter, Paddle, Railway) | un `SECURITY.md` y un registro de riesgos en el repo privado, revisados por release |
| **Identify** | inventario de activos y datos, clasificación (datos de cliente = confidencial), SBOM | `npm audit` + Dependabot en el gate; SBOM CycloneDX en el build |
| **Protect** | SSO (OIDC/SAML) + MFA, RBAC por org/workspace, **aislamiento multi-tenant con RLS en Postgres**, cifrado en tránsito y en reposo, secretos en gestor (no en env planos), CSP estricta, *rate limiting*, registro de auditoría inmutable | tests de aislamiento de tenant en el gate (una org nunca lee otra) · WorkOS AuthKit o Auth.js+Keycloak · RLS por `org_id` |
| **Detect** | logs centralizados, alertas de errores y anomalías de uso de IA | Sentry + logs estructurados + umbrales de gasto OpenRouter |
| **Respond** | plan de respuesta a incidentes, contacto de seguridad público, divulgación responsable | `SECURITY.md` + runbook |
| **Recover** | backups PITR de Postgres, prueba de restauración trimestral, RTO/RPO declarados | job programado + evidencia en el runbook |

El objetivo a doce meses es poder responder un cuestionario SOC 2 Tipo I con lo anterior; CSF 2.0 se
mapea a SOC 2 CC1–CC9 sin rehacer nada.

### D7 — Infraestructura inicial

Railway (ya hay cuenta y tooling): `web` (Next), `api`, `collab` (Hocuspocus), Postgres, Redis.
Un solo proveedor al principio; la separación en servicios permite mover `collab` o la base
después. Costo estimado de arranque: US$50–150/mes antes de clientes.

## Plan por fases

| Fase | Alcance | Repo | Duración | Entregable |
|---|---|---|---|---|
| **F0 · Puertos** | `PlatformApi`, `AiProvider`, `ProjectStore`, `GraphStore`; `PlatformProvider`; migrar los 24 archivos; lint extendido; workspaces `core`/`ui`/`desktop`; publicar paquetes | público | 3–4 sem | el escritorio funciona igual, con `window.electronAPI` sólo en `apps/desktop/` |
| **F1 · Web monousuario** | repo privado; auth (WorkOS/Auth.js); orgs y miembros; `ProjectStore` sobre Postgres; importar/exportar `.board`; `AiProvider` → OpenRouter con un modelo fijo | privado | 3–4 sem | un usuario edita en el navegador lo mismo que en escritorio |
| **F2 · Colaboración** | Hocuspocus; `GraphStore` Yjs; presencia; historial de versiones; permisos por proyecto | privado (+ `GraphStore` en core) | 4–5 sem | dos personas editan el mismo tablero a la vez |
| **F3 · Comercial** | Paddle; planes; asientos; *entitlements*; catálogo de modelos por plan; llaves OpenRouter por org con límite; panel de consumo | privado | 3 sem | una empresa compra, invita y paga por miembro |
| **F4 · Seguridad** | línea base CSF (tabla D6); tests de aislamiento; backups; `SECURITY.md`; *pentest* externo | privado | 2–3 sem + continuo | checklist CSF cubierto y evidenciado |

Total: **~4 meses** con una persona a tiempo completo asistida por agentes. F0 es prerrequisito de
todo y es el único trabajo que toca este repo; cada fila es una o varias features SDD.

## Preparación hecha (2026-10-09)

Lo mínimo para que F0 sea mover archivos y no reescribirlos. Nada de esto cambia lo que ve el
usuario del escritorio.

| Pieza | Qué deja listo | Mecanismo |
|---|---|---|
| `src/lib/host-bridge.ts` | `hostBridge()` es el único acceso al host; `setHostBridge()` inyecta el adaptador web; `capacidadesHost()` dice qué puede hacer el host (servidor y playground MCP, chat y motor CLI, modelos locales, IA remota…). Cada capacidad exige todos los métodos que usa su pantalla | `src/lib/__tests__/host-bridge.test.ts` · `markdown-utils-host.test.ts` |
| Migración de los 24 archivos que leían `window.electronAPI` | componentes, hooks, contextos y `lib/` piden el puente; la pestaña «Agente», el botón de entrega y la IA local preguntan por **capacidad**, no por Electron. Única excepción: la barra de título pregunta por el host (`hostKind`), porque depende del marco de la ventana y no de algo que el host haga | regla **PUENTE** de `scripts/repo-lint.mjs` (`hostBridge` en `.claude/harness.config.json`): busca la propiedad con cualquier receptor y por corchetes; 6 casos del self-test |
| OpenRouter como proveedor remoto | el motor de IA de la web (D4) ya funciona en escritorio con la llave del usuario, cifrada en el main | `main/services/__tests__/ai-remote.test.ts` · `remote-settings.test.ts` |

Queda para F0 propiamente dicha: las interfaces `AiProvider`, `ProjectStore` y `GraphStore`, los
workspaces y la publicación de paquetes. El puerto ya existe: el adaptador web implementa
`Partial<HostBridge>` y se inyecta al arrancar.

## Consecuencias

- **Lo que gana el escritorio con F0:** un bridge único, lint que impide regresiones, y los paquetes
  publicados sirven también para que terceros embeban el lienzo.
- **Costo de mantener dos repos:** cada feature de producto nace en `core`/`ui` (público) y se
  consume en ambos; las features empresariales (billing, tenancy, SSO) viven sólo en el privado.
  Regla: si una feature necesita saber de org, plan o pago, no entra al repo público.
- **Riesgos principales**, en orden: (1) `GraphStore` sobre Yjs es una reescritura del corazón de
  `GraphDataProvider`; (2) cuota de localStorage en escritorio ya es un riesgo, no se hereda a web
  porque va a Postgres; (3) WebGPU sólo en Chrome/Edge → IA local en web es *best effort*;
  (4) aprobación de Paddle exige sitio, términos y política de reembolso publicados: empezar ese
  trámite en F1, no en F3.
- **Constitución:** P4 y P5 se mantienen tal cual en la nube (llave en el servidor; una función de
  IA sigue siendo una `AiTask`). Habrá que enmendar P3/PUREZA para describir los puertos
  (`window.electronAPI` sólo en `apps/desktop/`) cuando F0 llegue a `main`.

## Fuentes

- OpenRouter, Management API y límites por llave: <https://openrouter.ai/docs/guides/features/guardrails> ·
  <https://openrouter.zendesk.com/hc/en-us/articles/51680687417499>
- Stripe en Colombia (no disponible): <https://mazinooyolo.com/blog/stripe-account-in-colombia/>
- Paddle vs Lemon Squeezy (MoR): <https://fungies.io/paddle-vs-lemon-squeezy/>
- Pagos locales LATAM (Rebill, PSE/Nequi): <https://www.rebill.com/en/solutions/saas-subscription-payments-latin-america>
- Yjs / Hocuspocus vs Liveblocks: <https://www.pkgpulse.com/guides/liveblocks-vs-partykit-vs-hocuspocus-realtime-2026>
- NIST CSF 2.0 → SOC 2: <https://www.complyance.com/resources/mapping-nist-csf-2-0-to-soc-2>
