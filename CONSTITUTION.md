# Constitución — Processflow Architect

**Versión 1.1.0** · Principios que no se negocian. Lo demás (convenciones, dominio, cómo se
hacen las cosas) vive en `CLAUDE.md`; el arnés que los hace cumplir, en `docs/harness/harness.md`.

Cada principio dice su **fuerza**:

- **BLOCKING** — hay un comando que falla si se viola. No hay excepción por prisa.
- **REVIEW** — no es verificable por máquina todavía; lo evalúa el subagente `reviewer`.

Enmendar esta constitución es un commit propio, con el número de versión subido y el motivo
en el cuerpo. Un principio que nadie hace cumplir se borra o se convierte en mecanismo.

---

## P1 — Nada se entrega sin gate verde · BLOCKING

Test verde ≠ compila ≠ entregable. El entregable es `npm run gate`: self-test del arnés,
link-check de docs, lint de convenciones, typecheck, tests con cobertura y build de producción.

*Mecanismo:* `scripts/gate.sh`, el hook `Stop` (`.claude/hooks/gate-stop.mjs`) y el job `gate` de CI.

## P2 — Integridad de aserciones · BLOCKING

Jamás se ajusta una aserción para que un test pase. Si el test es correcto, se arregla producción.
Si el test es incorrecto, se corrige **en un commit aparte** con la justificación en el mensaje.

*Mecanismo:* el propio test + revisión del diff (`reviewer`). Falsear esto exige mentir en un commit.

## P3 — TDD en `src/lib/` · BLOCKING

`src/lib/` es lógica pura y es lo único con cobertura exigida. Toda función nueva o cambio de
comportamiento llega con su prueba en `__tests__/` junto al módulo. Los componentes orquestan;
`lib/` decide.

*Mecanismo:* `npm run test:coverage` en el gate + regla PUREZA de `scripts/repo-lint.mjs`
(`src/lib/` no importa React, Electron, Next ni UI).

## P4 — La IA es local por defecto; la nube es opt-in · BLOCKING

El motor local (LiteRT-LM sobre WebGPU) siempre está disponible y offline. El proveedor remoto
se activa en Ajustes, con la llave del usuario, y el modo por defecto es `local`. Las llaves se
guardan cifradas con `safeStorage` en el proceso main: **nunca** llegan al renderer ni a los logs,
y las peticiones HTTP a proveedores salen sólo del main. No se agregan SDKs de nube: `fetch` nativo.

*Mecanismo:* regla DEPS de `scripts/repo-lint.mjs` (SDKs prohibidos en `package.json`) +
`reuse-guard` (instanciar un cliente de nube en el código se bloquea) + `reviewer`.

## P5 — Añadir una función de IA es declarar una `AiTask` · BLOCKING

La superficie de extensión es `src/lib/ai/tasks.ts`. El router (`router.ts`) y los proveedores
(`providers.ts`) sólo se tocan para agregar un motor nuevo. Política de ruteo:
`local`→local, `remote`→nube, `hybrid`→`heavy`/`structured` o entrada grande a la nube.

*Mecanismo:* regla IATASK de `scripts/repo-lint.mjs` (un `task.id === "…"` en el router o en los
proveedores se bloquea) + `src/lib/ai/__tests__/tasks-registry.test.ts`, que barre las tareas con
`import *` —una tarea nueva entra sola— y exige que el router las rutee en los tres modos.

## P6 — El arnés es agnóstico de notación · BLOCKING

`src/lib/notations.ts` es la única fuente de verdad de los tipos de componente. Nada cablea
literales DDD/BPMN/C4/UML fuera de ese registro. Los archivos que hoy lo hacen son **deuda
declarada** (allowlist en `.claude/harness.config.json` → `notation.allow`); la lista sólo baja.

*Mecanismo:* regla NOTACION de `scripts/repo-lint.mjs`.

## P7 — WebGPU es obligatorio · BLOCKING

No se reactiva `app.disableHardwareAcceleration()` ni se quitan los switches
`enable-unsafe-webgpu` / `WebGPU` de `main.ts`: sin GPU, LiteRT-LM no arranca. Los schemes
privilegiados (`app://`, `litert-model://`) se registran una sola vez y como `secure`, o WebGPU
no se expone en el binario empaquetado.

*Mecanismo:* regla WEBGPU de `scripts/repo-lint.mjs`.

## P8 — El lienzo nunca queda en blanco · BLOCKING

`graph-processor.ts` tiene redes de seguridad (fallback a Big Picture, inclusión de nodos sueltos
si el filtro vacía el resultado). Quien cambie ese filtrado mantiene la garantía y actualiza
`src/lib/__tests__/graph-processor.test.ts`.

*Mecanismo:* la suite de `graph-processor` en el gate.

## P9 — Rutas protegidas · BLOCKING

`.env*`, `package-lock.json`, `.git/` y los artefactos derivados (`build/`, `dist/`, `.next/`,
`coverage/`) no los edita el agente. Excepción legítima: la pide el humano y el cambio lo hace él.

*Mecanismo:* `.claude/hooks/protected-paths.mjs` + `.githooks/pre-commit`.

## P10 — Acciones amplias: dry-run y reversibilidad · BLOCKING

Antes de borrar, mover o reescribir en lote: commit o backup previo, mostrar la lista, esperar
confirmación, después ejecutar. Nada de `--no-verify`, `reset --hard`, `git add .`, `sed -i`
masivo sobre fuente ni `find -delete`.

*Mecanismo:* `.claude/hooks/bash-guard.mjs`.

## P11 — Conducta ante el error · REVIEW

Leer la salida real (archivo, línea, mensaje) antes de reintentar; reintentar sólo con hipótesis
nueva; presupuesto de **2 intentos** sobre el mismo error, y al tercero se para y se escala con el
diagnóstico. Fallar rápido y con causa vale más que degradar en silencio.

## P12 — Cada incidente deja infraestructura · REVIEW

Un problema que costó tiempo termina en el mecanismo más fuerte disponible (test > hook/lint >
comando > markdown), y esa mejora pasa el gate antes de quedar. `/lesson <incidente>` es el ciclo.
Una regla que ya garantiza un test se borra del markdown: la prosa duplicada sólo gasta contexto.

---

### Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0.0 | 2026-08-14 | Primera versión, al montar el arnés (`docs/harness/harness.md`). |
| 1.1.0 | 2026-08-21 | P5 pasa de REVIEW a BLOCKING: la regla IATASK del lint y `tasks-registry.test.ts` lo hacen cumplir. |
