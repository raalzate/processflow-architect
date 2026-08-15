---
description: Prueba de vida del arnés — para cada regla, ¿qué comando falla si alguien la viola?
allowed-tools: Bash, Read, Grep, Glob
---

Auditá el arnés contra `docs/harness/buenas-practicas.md` §6 y §8. El falso positivo que
buscás es **"instalado y muerto"**: archivos presentes cuyo eslabón activador nunca corre.

## Evidencia que hay que recolectar (comandos, no impresiones)

1. `node scripts/harness-selftest.mjs` — ¿los hooks bloquean lo que dicen bloquear?
2. `git config core.hooksPath` — ¿el pre-commit está instalado de verdad (`.githooks`) o
   `.git/hooks/` sólo tiene `.sample`?
3. `node scripts/docs-linkcheck.mjs` — ¿alguna instrucción del arnés apunta a la nada?
4. `.github/workflows/ci.yml` — ¿CI corre **el mismo** gate que el humano?
5. `ls specs/` y `.specify/active-feature` — ¿hay artefactos de fase reales o sólo plantilla?
6. `tessl.json` vs `package.json` — ¿las dependencias centrales tienen tile, o el agente
   escribe APIs de memoria?
7. `.mcp.json` — ¿las herramientas del agente están nombradas y son las que se usan?

## Salida

Una tabla `Regla | Mecanismo | Comando que falla si se viola | ¿Vivo?` y, al final, el nivel
de madurez (L0–L4) con la evidencia que lo sostiene. Toda regla cuya respuesta sea
"ninguno, confiamos" va listada como **muerta** y con la propuesta del mecanismo más fuerte
disponible para revivirla.

No arregles nada en este comando: auditar y proponer. Los arreglos van por `/lesson`.
