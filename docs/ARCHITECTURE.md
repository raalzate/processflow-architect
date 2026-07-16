# Arquitectura — Processflow Architect

Documento técnico del funcionamiento interno. Para una visión general del producto,
ver el [README](../README.md).

## Modelo de procesos (Electron)

La app tiene dos procesos, como toda app Electron:

```
┌─────────────────────────────┐         IPC          ┌──────────────────────────────┐
│  Proceso MAIN (Node)         │ ◀──── invoke/send ──▶ │  Renderer (Next.js + React)   │
│  main.ts, main/*             │                       │  src/*                        │
│                              │                       │                               │
│  · ventana y ciclo de vida   │                       │  · UI completa                │
│  · handlers IPC              │                       │  · estado (contexts)          │
│  · servicios: PDF, mermaid,  │                       │  · IA LOCAL (LiteRT/WebGPU)   │
│    modelos .litertlm         │                       │                               │
│  · schemes app:// y          │                       │                               │
│    litert-model://           │                       │                               │
└─────────────────────────────┘                       └──────────────────────────────┘
                         ▲                                       │
                         └──────────  preload.ts  ───────────────┘
                              expone window.electronAPI (contextBridge)
```

**Decisión clave:** la inferencia de IA corre en el **renderer**, no en el main.
LiteRT-LM necesita WebGPU, que solo existe en un contexto seguro de navegador. Por eso:

- `main.ts` habilita WebGPU explícitamente (`enable-unsafe-webgpu`, feature `WebGPU`)
  y **no** desactiva la aceleración por hardware.
- El scheme `app://` con el que electron-serve sirve el renderer en producción se
  registra como `secure`; sin eso, WebGPU no se expone en el binario empaquetado.
- Los modelos `.litertlm` se sirven desde `userData/models/litert/` vía el scheme
  privilegiado `litert-model://` (con soporte de Range para streaming del archivo).

## Superficie IPC

Definida en `preload.ts` (renderer) y `main/ipc.ts` (main). Todo lo que el renderer
puede pedirle al main:

| `window.electronAPI` | Canal IPC | Hace |
|----------------------|-----------|------|
| `generatePdf(md)` | `convert-md-to-pdf` | Markdown → PDF (md-to-pdf + Puppeteer). |
| `copyToClipboard(text)` | `copy-to-clipboard` | Copia al portapapeles del SO. |
| `litertModelsList()` | `litert-models-list` | Lista modelos `.litertlm` + RAM disponible. |
| `litertModelDownload(id)` | `litert-model-download` | Descarga un modelo (emite progreso). |
| `litertModelDelete(id)` | `litert-model-delete` | Borra un modelo local. |
| `litertModelReveal(id)` | `litert-model-reveal` | Lo muestra en el explorador de archivos. |
| `onLitertModelProgress(cb)` | `litert-model-progress` | Suscripción al progreso de descarga. |
| `navigate(cb)` / `onDesignerAction(cb)` | `navigate` / `designer-action` | Eventos main→renderer. |

## Capa de IA (`src/lib/ai/`)

El diseño está pensado para **escalar sin tocar los componentes**: la UI llama a una
tarea por su id, y el router decide el motor.

```
componente / hook (useAi)
        │  route(task, input)
        ▼
   router.ts  ── elige proveedor según política ──┐
        │                                          │
        ▼                                          ▼
   providers.ts ── runLocal() ──▶ litert-engine.ts (LiteRT-LM / WebGPU)
                └─ runRemoteFlow() ─▶ flujos Genkit (orquestación estructurada, también local)
```

- **`tasks.ts`** — catálogo de `AiTask`. Cada tarea declara su `tier`
  (`light`/`heavy`), si necesita salida `structured`, el tope `maxLocalChars`,
  cómo construir el prompt local y/o el flujo remoto.
- **`router.ts`** — política de enrutado:
  1. `heavy` o `structured` → motor capaz (no degrada a un modelo que no puede).
  2. `light` → local (corto, frecuente, gratis, offline)… salvo que la entrada
     exceda `maxLocalChars`.
  3. Fallback **asimétrico**: `light` puede degradar; `heavy` no.
- **`providers.ts`** — abstracción uniforme de motores. `ProviderId = "local" | "remote"`
  por compatibilidad histórica, pero **ambos corren localmente**: `remote` es la
  orquestación Genkit estructurada en el proceso main, no la nube.
- **`litert-engine.ts` / `litert-agent.ts`** — motor de inferencia (one-shot) y agente
  ReAct sobre el modelo local.
- **`graph-toon.ts`** — comprime el grafo antes de inyectarlo como contexto: poda la
  geometría/colores del lienzo y codifica en TOON (tablas CSV en vez de JSON repetido).
  Ejemplo con salida real y métricas en [compresion-toon.md](compresion-toon.md).

> **Para añadir una función de IA:** declara una nueva `AiTask` en `tasks.ts`. No se
> tocan ni el router ni los proveedores ni los componentes. Ese desacople es el patrón.

## Procesamiento del grafo (`src/lib/graph-processor.ts`)

Transforma el JSON del dominio (`agregados`, `nodos`, `aristas`,
`politicas_inter_agregados`) en lo que renderiza el lienzo: `nodes`, `links`,
`aggregates` y un `nodeTree` agrupado por agregado y tipo.

**Garantía: el lienzo nunca queda en blanco.** Dos redes de seguridad:

1. Si los agregados vienen vacíos pero hay `big_picture` con nodos, se expone como un
   agregado "Visión General".
2. El filtro normal descarta nodos sin aristas; pero si ese filtro dejaría el lienzo
   vacío, se incluyen **todos** los nodos.

Las entradas inválidas (`null`/`undefined`) lanzan error; un `agregados` ausente o
no-array se degrada a `[]` (no lanza).

## Estado del renderer (`src/context/`)

- **`GraphContext` / `GraphDataProvider`** — modelo de dominio cargado y derivados.
- **`AgentContext`** — estado del agente de IA y los artefactos del canvas.
- **`ViewsContext`** — vistas DDD (por agregado + estratégicas), notación por vista.

## Pruebas

- **Vitest**, entorno `node`. Las pruebas viven en `__tests__/` junto a su módulo.
- La cobertura exigida se concentra en `src/lib/**` (lógica pura): es lo que da
  estabilidad y lo más barato de testear sin montar React ni Electron.
- Config en `vitest.config.ts`; resuelve el alias `@/` con `vite-tsconfig-paths`.

## Empaquetado

- `electron-builder` (config en `package.json`). Genera `.dmg` (mac), `.exe` (win),
  `.AppImage` (linux).
- `asarUnpack` deja fuera del asar a Mermaid CLI y Puppeteer (necesitan binarios en disco).
- Publicación de releases vía el workflow `release-build.yml` en tags `v*`.
