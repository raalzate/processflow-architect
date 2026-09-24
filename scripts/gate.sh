#!/usr/bin/env bash
# Envoltorio. La implementación del gate es `scripts/gate.mjs`, en Node, y sus señales se declaran
# en `.claude/harness.config.json` → `gate.signals` (antes estaban cableadas acá).
#
# Por qué: el gate tiene que correr también en Windows, donde bash no está garantizado — y un gate
# que no corre es un gate que no existe. Además, el gate declarativo escribe el registro por señal
# (`.git/harness-gate.json`) y regenera el panel del arnés (docs/panel.md) en cada corrida. Este
# archivo queda para no romper a quien ya escribió `bash scripts/gate.sh` en su CI o en su memoria
# muscular. Hay UNA implementación: si algo se cambia, se cambia allá.
exec node "$(dirname "$0")/gate.mjs" "$@"
