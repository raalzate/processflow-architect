# Processflow Architect

**App de escritorio para Event Storming Big Picture con IA 100 % local.**
Modela dominios complejos de forma visual, genera artefactos de arquitectura con un
agente de IA que corre **en tu máquina** (sin nube, sin enviar datos) y exporta a
Mermaid, Markdown y PDF.

- **Versión:** 0.1.0
- **Autor:** Raúl A. Alzate · Cali, Colombia
- **Repositorio:** https://github.com/raulalzate/ia-processflow-architect
- **Plataformas:** macOS · Windows · Linux

---

## Qué hace

| Capacidad | Descripción |
|-----------|-------------|
| **Big Picture Event Storming** | Lienzo con eventos, comandos, agregados, políticas, read models y sistemas externos. |
| **Vistas DDD** | Vistas por agregado (deterministas) + Big Picture estratégica, CQRS Data Flow y Read Model Graph. |
| **Agente de IA local** | Chat tipo ReAct que razona sobre tu dominio y produce artefactos versionados y editables en un canvas. |
| **Notaciones** | DDD / BPMN / C4 / UML por vista; la IA respeta la notación de cada vista. |
| **Fusión de sesiones** | Combina varios workshops resolviendo conflictos (`/merger`). |
| **Exportación** | Mermaid, Markdown estructurado y PDF (md-to-pdf + Puppeteer + Mermaid CLI). |
| **Offline-first** | Toda la inferencia corre local con **LiteRT-LM sobre WebGPU**. Cero llamadas a la nube. |

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Runtime de escritorio | Electron 39 |
| Frontend | Next.js 15 (App Router) + React 18 + TypeScript 5 |
| UI | shadcn/ui + Radix UI + Tailwind CSS + Lucide |
| Grafos | D3 · dagre · reactflow |
| IA local | **LiteRT-LM (`@litert-lm/core`) sobre WebGPU**, en el renderer |
| Exportación | md-to-pdf · Puppeteer · Mermaid CLI |
| Pruebas | Vitest + cobertura v8 |
| Empaquetado | electron-builder 26 |

> La inferencia se ejecuta en el renderer porque LiteRT-LM necesita WebGPU
> (contexto seguro). El proceso main solo gestiona los modelos `.litertlm`
> (descarga/estado/borrado), la exportación a PDF y el portapapeles.

---

## Requisitos

- **Node.js 20+**
- **GPU con soporte WebGPU** (obligatorio para la IA local)
- Modelo `.litertlm` descargado desde la pantalla de **Settings** de la app

---

## Desarrollo

```bash
npm install              # instala dependencias (postinstall reconstruye nativos)

npm run electron-dev     # Next.js + Electron + tsc watch (entorno completo)
npm run dev              # solo el frontend Next.js (sin Electron)

npm run typecheck        # tsc renderer + electron, sin emitir
npm test                 # pruebas unitarias (Vitest)
npm run test:coverage    # pruebas + reporte de cobertura
```

## Build y empaquetado

```bash
npm run build                # Next.js + tsc electron → build/
npm run electron-build:mac   # genera .dmg
npm run electron-build:win   # genera instalador .exe
```

---

## Estructura del proyecto

```
processflow-architect/
├── main.ts                 ← entrada del proceso principal de Electron
├── preload.ts              ← puente seguro renderer↔main (window.electronAPI)
├── main/                   ← proceso main: ipc, ventana, logger, servicios
│   └── services/           ← pdf, mermaid, gestión de modelos litert
├── src/app/                ← rutas Next.js
│   ├── home/               ← onboarding / carga de archivos
│   ├── merger/             ← fusionador de sesiones
│   └── settings/           ← configuración y descarga de modelos
├── src/components/         ← UI (graph · ai-panel · canvas · views · ui)
├── src/context/            ← estado global (Graph · Agent · Views)
├── src/hooks/              ← hooks y handlers de UI
└── src/lib/                ← lógica pura testeable (grafo, ia, artefactos, notaciones)
    └── ai/                 ← router, proveedores, tasks y motor LiteRT
```

Detalle de la arquitectura interna y el flujo de datos: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Integración continua

- **`.github/workflows/ci.yml`** — typecheck + pruebas unitarias con cobertura en
  cada push/PR a `main`.
- **`.github/workflows/release-build.yml`** — empaqueta y publica releases con
  electron-builder al crear un tag `v*`.

---

## Licencia

```
Copyright © 2025-2026 Raúl A. Alzate. Todos los derechos reservados.
```
