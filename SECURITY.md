# Política de seguridad

## Reportar una vulnerabilidad

**No abras un issue público.** Usá el reporte privado de GitHub:
[Security → Report a vulnerability](https://github.com/raalzate/processflow-architect/security/advisories/new).

Incluí, si podés: versión de la app y sistema operativo, pasos para reproducir, qué se
puede lograr con el fallo y una prueba de concepto mínima.

| Qué esperar | Plazo |
|---|---|
| Acuse de recibo | 5 días hábiles |
| Evaluación inicial (se confirma o no, y su severidad) | 10 días hábiles |
| Corrección de una severidad alta o crítica | en la siguiente versión publicada |

Se publica un aviso de seguridad (GitHub Security Advisory) con el arreglo, y se da
crédito a quien lo reportó si así lo quiere.

## Versiones con soporte

Sólo la **última versión publicada** recibe correcciones de seguridad. La app se
actualiza sola desde Ajustes → Actualizaciones.

## Qué protege la app hoy

Es una app de escritorio sin backend propio: los proyectos viven en el equipo del
usuario. Los controles que existen, y lo que los hace cumplir:

| Control | Mecanismo |
|---|---|
| Las llaves de IA se guardan cifradas con el llavero del sistema y nunca llegan al renderer | `main/services/ai-remote.ts` · `CONSTITUTION.md` P4 |
| El renderer corre aislado (`contextIsolation`, sin Node) y con política de mismo origen (`webSecurity`) | `main/window.ts` |
| Sólo se concede el permiso de portapapeles, y sólo a la propia app | `main/services/security.ts` + su test |
| Content-Security-Policy: sin `eval`, sin scripts ni conexiones a orígenes ajenos (salvo el CDN de las librerías de IA) | `src/lib/csp.ts` + su test |
| El servidor MCP escucha sólo en `127.0.0.1` y rechaza `Host` ajenos (DNS rebinding) | `main/services/mcp-http.ts` |
| Enlaces externos: sólo `http(s)` y `mailto`, y se abren en el navegador del sistema | `main/window.ts` |
| Dependencias vulnerables: alertas y PRs de Dependabot, y audit informativo en cada CI | `.github/dependabot.yml` · `.github/workflows/ci.yml` |

## Límites conocidos

- Los instaladores **todavía no están firmados** (plan en
  [ADR 0004](docs/decisions/0004-firma-de-codigo.md)): el sistema operativo avisa al
  instalar.
- La CSP permite scripts en línea, porque el export estático de Next hidrata con ellos
  y sin servidor no hay nonces.
- LiteRT-LM, pdf.js y tesseract.js se cargan desde `cdn.jsdelivr.net` con versión fija.
