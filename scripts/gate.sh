#!/usr/bin/env bash
# El gate: única definición de "entregable" en este repo.
#
# Lo corren tres actores con el MISMO comando: el humano (`npm run gate`), el agente
# (subagente `gate-runner`) y CI (job `gate` de .github/workflows/ci.yml).
#
#   scripts/gate.sh          señales completas, incluye el build de producción
#   scripts/gate.sh fast     igual sin build → señal de desarrollo, NO entregable
#
# Al terminar en verde borra `.git/gate-dirty`, que es lo que mira el hook Stop.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

MODE="${1:-full}"
FAILED=()

run() {
  local name="$1"; shift
  echo ""
  echo "──▶ $name"
  if "$@"; then
    echo "    ✓ $name"
  else
    echo "    ✗ $name"
    FAILED+=("$name")
  fi
}

echo "Gate de Processflow Architect (modo: $MODE)"

# 1. El arnés antes que el código: un hook roto invalida todas las demás señales.
run "self-test del arnés"   node scripts/harness-selftest.mjs
# 2. Punteros de documentación: mover un doc rompe referencias que nadie más mira.
run "link-check de docs"    node scripts/docs-linkcheck.mjs
# 3. Convenciones del repo que el compilador no ve (pureza de lib/, notación, WebGPU).
run "lint de convenciones"  node scripts/repo-lint.mjs
# 3b. El skill que se entrega al agente externo debe ser el del repo, no una copia vieja.
run "skills sincronizados"  node scripts/sync-skills.mjs --check
# 3c. El índice de graphify no contesta con el repo de antes del último commit.
#     Se omite (verde) donde no hay índice: en CI el directorio no existe.
run "índice del repo"       node scripts/graph-check.mjs
# 4. vitest transpila por archivo y NO type-checkea: esta señal es irremplazable.
run "typecheck"             npm run typecheck --silent
# 5. Comportamiento, con la misma cobertura que exige CI.
run "tests con cobertura"   npm run test:coverage --silent

if [ "$MODE" != "fast" ]; then
  # 6. Dev y prod difieren (tree-shaking, resolución de módulos, empaquetado Electron).
  run "build de producción" npm run build --silent
fi

echo ""
if [ ${#FAILED[@]} -ne 0 ]; then
  echo "GATE ROJO — señales fallidas: ${FAILED[*]}"
  echo "Leé el error real (archivo, línea, mensaje) antes de reintentar. Presupuesto: 2 intentos sobre el mismo error."
  exit 1
fi

if [ "$MODE" = "fast" ]; then
  echo "GATE FAST VERDE — señal de desarrollo. NO es entregable: falta el build."
  exit 0
fi

rm -f .git/gate-dirty
echo "GATE VERDE — entregable."
