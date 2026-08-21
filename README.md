<div align="center">

```
A  R  C  H  I  T  E  C  T
```

### El estudio de Event Storming con IA que corre **en tu máquina**

**Modela dominios complejos y diseña arquitectura con un agente de IA — 100 % local, offline, sin enviar tus datos a la nube.**
Event Storming · DDD · BPMN · C4 · UML · agente ReAct local · exporta a Mermaid / Markdown / PDF · offline-first

<br/>

![Electron](https://img.shields.io/badge/Electron-39-47848F?logo=electron&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![WebGPU](https://img.shields.io/badge/IA-LiteRT--LM%20·%20WebGPU-FF6F00)
![Tests](https://img.shields.io/badge/tests-Vitest%20%2B%20cobertura-6E9F18?logo=vitest&logoColor=white)
![Local first](https://img.shields.io/badge/offline-first-2ea44f)
![License](https://img.shields.io/badge/licencia-Apache%202.0-blue)

</div>

<div align="center">

![Big Picture de Event Storming en el lienzo de ProcessFlow Architect](docs/screenshots/02-canvas.png)

<sub>captura real · Big Picture de Event Storming — agregados en bandas, paleta de la notación activa a la izquierda y pestañas de vistas abajo</sub>

</div>

---

> **Versión beta.** El modelo, las vistas y el agente local siguen en evolución: el formato de
> los proyectos puede cambiar entre versiones. La app lo dice en su cabecera y en «Acerca de».

## Qué hace

- **Event Storming Big Picture** — lienzo con eventos, comandos, agregados, políticas, read models y sistemas externos.
- **Agente de IA local (ReAct)** — chatéale a tu dominio; genera artefactos versionados y editables en el lienzo: drivers, riesgos, propuesta técnica, roadmap, ADRs y diagramas. El menú **«+»** del chat elige el artefacto sin depender de cómo esté escrita la frase, y con el panel colapsado la barra lateral los lista con el icono de su tipo.
- **Cuatro notaciones** — DDD / BPMN / C4 / UML por vista; la IA respeta la notación de cada vista.
- **Vistas DDD** — vistas por agregado (deterministas) + Big Picture estratégica, CQRS Data Flow y Read Model Graph. Hasta 50 vistas, inyectables al chat del agente.
- **Puente MCP** — Claude Code / Codex diseñan diagramas desde tus documentos y los exportan directo al lienzo.
- **Fusión de sesiones** — combina varios workshops y depura duplicados (`/merger`).
- **Exportación** — Mermaid, Markdown estructurado y PDF.
- **Offline-first** — toda la inferencia corre local con **LiteRT-LM sobre WebGPU**. Cero llamadas a la nube por defecto.

---

## Cómo funciona (30 segundos)

![Cómo funciona](./docs/diag.png)

La IA se ejecuta en el **renderer** porque LiteRT-LM necesita WebGPU (contexto seguro).
El proceso **main** solo gestiona los modelos `.litertlm`, la exportación a PDF, el
portapapeles y las llamadas a la nube **si** el usuario activa un proveedor remoto.

---

## Empieza en 60 segundos

```bash
git clone https://github.com/ralzate-sofka/-processflow_architect
cd -processflow_architect
npm install            # postinstall reconstruye módulos nativos de Electron
npm run electron-dev   # Next.js + Electron + tsc watch
```

1. Abre **Ajustes** y descarga un modelo Gemma (`.litertlm`) — una vez; luego funciona sin conexión.
2. Crea un proyecto o **arrastra un `.json`** exportado por Claude Code vía MCP al lienzo.
3. Pídele al **Agente de Arquitectura** que diseñe o analice: los artefactos aparecen en el lienzo.

> **Requisitos:** Node.js 20+ · GPU con soporte **WebGPU** (obligatorio para la IA local) · macOS · Windows · Linux.

---

## Capturas

| Bienvenida | Ajustes · IA local |
|---|---|
| ![Pantalla de bienvenida](docs/screenshots/01-home.png) | ![Ajustes: modelo, motor y servidor MCP](docs/screenshots/03-settings.png) |
| **Guía MCP** | **Documentación in-app** |
| ![Guía MCP para diseñar con Claude Code](docs/screenshots/04-mcp.png) | ![Documentación del diseñador](docs/screenshots/05-docs.png) |

<div align="center">

![Agrupador de nodos / fusión de sesiones](docs/screenshots/06-merger.png)

<sub>Agrupador de nodos — depura duplicados del proyecto activo («Prima cobrada» ← «Cobro confirmado»)</sub>

</div>

---

## Notaciones

Cada vista declara su notación desde un registro (`src/lib/notations.ts`) y el agente la respeta.

| Notación | Para qué | Elementos típicos |
|----------|----------|-------------------|
| **DDD / Event Storming** | Big Picture y diseño táctico | Evento · Comando · Agregado · Política · Read Model · Sistema Externo |
| **BPMN** | Procesos de negocio | Pool · Tarea · Gateway · Subproceso (call activity vía `viewRef`) |
| **C4** | Paisaje de sistemas | Persona · Sistema · Contenedor · Componente |
| **UML (Secuencia)** | Interacción entre componentes | Línea de vida (contenedor) · Mensaje (arista, punteada = retorno) |

---

## Cuándo usarlo · cuándo no

**Úsalo cuando:**
- Facilitas Event Storming Big Picture y quieres pasar del post-it al modelo vivo.
- Necesitas asistencia de IA **sin sacar los datos del dominio de tu máquina**.
- Quieres que Claude Code diseñe diagramas desde tus documentos y los traiga al lienzo (MCP).

**Quizá no lo necesites si:**
- Solo buscas un editor de diagramas genérico sin modelo de dominio detrás.
- No tienes GPU con WebGPU y no piensas activar un proveedor de IA remoto.

---

## Motor de IA · local por defecto, nube opt-in

`ProviderId = "local" | "remote"`. El conmutador (`src/lib/ai/remote-settings.ts`) tiene tres modos:

| Modo | Comportamiento |
|------|----------------|
| **`local`** (por defecto) | Todo corre local con LiteRT-LM · Gemma sobre WebGPU. |
| **`hybrid`** | Tareas ligeras en local; las pesadas / estructuradas o de entrada grande van a la nube. |
| **`remote`** | Todo a la nube (Gemini · OpenAI · Anthropic). |

> **Seguridad de llaves:** se guardan **cifradas con `safeStorage`** en el proceso main
> (`userData/ai-keys.json`). NUNCA llegan al renderer ni se loguean; las peticiones HTTP a los
> proveedores se hacen SOLO en el main. No se añaden SDKs de nube: se usa `fetch` nativo.

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Runtime de escritorio | Electron 39 |
| Frontend | Next.js 15 (App Router) · React 18 · TypeScript 5 |
| UI | shadcn/ui · Radix UI · Tailwind CSS · Lucide |
| Grafos | D3 · dagre · reactflow |
| IA local | **LiteRT-LM (`@litert-lm/core`) sobre WebGPU**, en el renderer |
| Exportación | md-to-pdf · Puppeteer · Mermaid CLI |
| Pruebas | Vitest + cobertura v8 |
| Empaquetado | electron-builder 26 |

---

## Estructura del proyecto

```
processflow-architect/
├── main.ts                 ← entrada del proceso principal de Electron
├── preload.ts              ← puente seguro renderer↔main (window.electronAPI)
├── main/                   ← proceso main: ipc, ventana, logger, servicios
│   └── services/           ← pdf, mermaid, gestión de modelos litert
├── src/app/                ← rutas Next.js (home · settings · mcp · docs · merger)
├── src/components/         ← UI (graph · ai-panel · canvas · views · ui)
├── src/context/            ← estado global (Graph · Agent · Views · Reference)
├── src/hooks/              ← hooks y handlers de UI
└── src/lib/                ← lógica pura testeable (grafo · ia · artefactos · notaciones)
    └── ai/                 ← router · proveedores · tasks · motor LiteRT · graph-toon
```

---

## Desarrollo y build

```bash
npm run electron-dev         # entorno completo (Next.js + Electron + tsc watch)
npm run dev                  # solo el frontend Next.js

npm run typecheck            # tsc renderer + electron, sin emitir
npm test                     # pruebas unitarias (Vitest)
npm run test:coverage        # pruebas + cobertura (mismo gate que CI)

npm run build                # Next.js + tsc electron → build/
npm run electron-build:mac   # genera .dmg
npm run electron-build:win   # genera instalador .exe
```

---

## Documentación

**Empieza aquí**
- → [Arquitectura interna y flujo de datos](docs/ARCHITECTURE.md)
- → Documentación del diseñador · **in-app** (menú Ayuda → Documentación)

**Profundiza**
- → [Guía de releases y firma de código](docs/RELEASE.md)
- → Guía MCP · **in-app** (menú Ayuda → Guía MCP)

---

## Integración continua

- **`.github/workflows/ci.yml`** — typecheck + pruebas unitarias con cobertura en cada push/PR a `main`. No se mergea en rojo.
- **`.github/workflows/release-build.yml`** — empaqueta instaladores mac/win/linux con electron-builder al crear un tag `v*` (o disparo manual).

---

## Licencia

Apache 2.0 — see [LICENSE](LICENSE).

---

## Créditos

Desarrollado por **Raúl Andrés Alzate Gómez** ·
[alzategomez.raul@gmail.com](mailto:alzategomez.raul@gmail.com)
