# Claude Code Instructions

@AGENTS.md
@CONSTITUTION.md

---

## El arnés (leer antes de tocar nada)

- **Una pregunta se contesta; una acción se pide.** Si el pedido es informativo, el hook
  `ask-first` marca el turno y `action-guard` bloquea toda edición del repo hasta que el humano
  pida el cambio. Contestá y, si hace falta un cambio, proponelo: no lo hagas por tu cuenta.
- **El trabajo entra a `main` por pull request.** La rama está protegida en GitHub (PR obligatorio
  + el check del gate en verde, también para admins) y `.githooks/pre-push` avisa antes de la red.
  Nunca empujes directo a `main`: creá la rama, abrí el PR.
- **Nada se entrega sin `npm run gate` verde.** Es la única definición de entregable:
  self-test del arnés · link-check de docs · lint de convenciones · typecheck · tests
  con cobertura · build de producción. `npm run gate:fast` omite el build: es señal de
  desarrollo, **no** entregable.
- Cómo está montado (hooks, subagentes, comandos, rutas protegidas): `docs/harness/harness.md`.
- Antes de escribir código: `docs/architecture/reuse-patterns.md` (¿ya existe la abstracción?)
  y el índice de símbolos de Serena antes de abrir archivos.
- **Consultar antes de leer.** Hay índice de graphify (`graphify-out/`, gitignorado):
  `graphify query "<pregunta>"` devuelve un subgrafo en vez del árbol; `graphify update`
  lo reindexa (el post-commit lo hace solo). Detalle en `docs/harness/harness.md`.
- Trabajo de tamaño feature → ruta SDD (`docs/harness/sdd.md`). Saltarla se **declara** en una
  línea; no se omite en silencio.
- Un incidente que costó tiempo termina en `/lesson`: mecanismo más fuerte disponible
  (test > lint/hook > comando > markdown), validado con el gate.

## Sobre el proyecto

**Processflow Architect** es una app de escritorio (Electron + Next.js) para Event
Storming Big Picture con asistencia de IA **local por defecto** (LiteRT-LM sobre
WebGPU). No hay backend propio: la IA local corre en la máquina del usuario.
Opcionalmente el usuario puede activar un proveedor de **IA remota** (nube) — ver
la regla de IA abajo — pero está **apagado por defecto** y requiere que el usuario
configure su propia llave.

## Arquitectura en una frase

`main.ts` (proceso Electron) levanta la ventana y los handlers IPC; el renderer es
una app Next.js (App Router) en `src/`; la IA corre en el renderer vía WebGPU.

```
main.ts ──▶ main/        proceso principal de Electron (IPC, ventana, logger, servicios)
            preload.ts   puente seguro renderer↔main (expone window.electronAPI)
src/app/                 rutas Next.js (home · merger · settings)
src/components/          UI React (graph · ai-panel · canvas · views · ui[shadcn])
src/context/             estado global (Graph · Agent · Views)
src/hooks/               lógica de UI y handlers
src/lib/                 lógica pura testeable (grafo, IA, artefactos, notaciones)
```

## Reglas de desarrollo

- **La IA es local por defecto; la nube es opt-in.** El motor local es LiteRT-LM en
  el renderer (siempre disponible, offline). El usuario puede activar en Ajustes un
  proveedor **remoto** (Gemini/OpenAI/Anthropic) y su llave. `ProviderId = "local" |
  "remote"`: `local` = LiteRT-LM; `remote` = generación por API de nube desde el
  proceso main (`main/services/ai-remote.ts`). El conmutador vive en
  `src/lib/ai/remote-settings.ts` con tres modos: `local` (todo local), `hybrid`
  (ligero local, complejo/entrada grande a la nube) y `remote` (todo a la nube).
  - **Seguridad de llaves:** se guardan **cifradas con `safeStorage`** en el proceso
    main (`userData/ai-keys.json`). NUNCA llegan al renderer ni se loguean; las
    peticiones HTTP a los proveedores se hacen SOLO en el main.
  - **No** añadir SDKs de nube como dependencia: las llamadas usan `fetch` nativo.
  - El modo por defecto es `local`: no cambies ese default sin pedirlo el usuario.
- **Añadir una función de IA = declarar una `AiTask`** en `src/lib/ai/tasks.ts`.
  Evita tocar el router (`src/lib/ai/router.ts`) y los proveedores (`providers.ts`)
  salvo para añadir un motor nuevo. Política: modo `local`→local; `remote`→nube;
  `hybrid`→`heavy`/`structured` o entrada grande a la nube, `light` a local. Ver
  comentarios del router.
- **Lógica pura va en `src/lib/`** (sin React, sin Electron). Es lo único con cobertura
  exigida y lo que da estabilidad. Los componentes orquestan; `lib/` decide.
- **El lienzo nunca queda en blanco.** `graph-processor.ts` tiene redes de seguridad
  (fallback a Big Picture, inclusión de nodos sueltos si el filtro vacía todo). Si
  cambias ese filtrado, mantené esa garantía y actualizá `__tests__/graph-processor.test.ts`.
- **WebGPU es obligatorio.** No reactivar `app.disableHardwareAcceleration()` ni quitar
  los switches `enable-unsafe-webgpu` / `WebGPU` de `main.ts`: LiteRT-LM no arranca sin GPU.
- **Schemes privilegiados** (`app://`, `litert-model://`) se registran una sola vez en
  `main.ts`; deben ser `secure` o WebGPU no se expone en el binario empaquetado.

## Antes de dar algo por terminado

```bash
npm run gate           # EL entregable: arnés · docs · lint · typecheck · tests · build
npm run gate:fast      # lo mismo sin build (señal de desarrollo, no entregable)
```

Señales sueltas, para iterar rápido mientras se programa:

```bash
npm run lint           # convenciones del repo (pureza de lib/, notación, WebGPU)
npm run typecheck      # tsc renderer + electron, sin emitir
npm test               # vitest (todas las pruebas deben pasar)
```

- CI (`.github/workflows/ci.yml`) corre **el mismo `npm run gate`** en cada push/PR a
  `main`. No mergear en rojo.
- Pre-commit real: `npm run hooks:install` (`core.hooksPath=.githooks`). Prohibido
  `--no-verify`: si el gate estorba, se arregla el gate.
- **TDD para `src/lib/`:** toda función nueva o cambio de comportamiento lleva prueba.
  Los tests viven en `__tests__/` junto al módulo. Si un test rojo refleja un cambio
  de comportamiento *intencional*, se actualiza el test (no se debilita el código).
- `release-build.yml` empaqueta con electron-builder en tags `v*`; **no se ejecuta en CI normal**.

## Estilo

- Código y comentarios siguen el estilo del archivo vecino. Comentarios en español,
  explican el **porqué** (no el qué), igual que el resto del repo.
- No agregar dependencias sin necesidad clara. El bundle ya es pesado (Electron + Puppeteer + Mermaid).
