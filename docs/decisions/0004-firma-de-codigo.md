# ADR 0004 — Firma de código: lo mínimo que hace amigable la instalación

- **Fecha:** 2026-10-09
- **Estado:** propuesto (plan; ninguna fase ejecutada todavía)
- **Contexto previo:** [RELEASE.md § Firma de código](../RELEASE.md#firma-de-código) ·
  [`.github/workflows/release-build.yml`](../../.github/workflows/release-build.yml)

## Contexto

Hoy los instaladores salen así:

| SO | Estado | Lo que ve el usuario |
|---|---|---|
| macOS | firma **ad-hoc** (`mac.identity=-`, sin hardened runtime) | «aplicación no identificada» → clic derecho → Abrir |
| Windows | **sin firma** | SmartScreen «Windows protegió su PC» → Más información → Ejecutar |
| Linux | AppImage, no aplica | ninguno |

El workflow ya está cableado para firmar de verdad (`SIGN_MAC`, secrets `CSC_*`, `APPLE_*`,
`WIN_CSC_*`), pero no hay certificados y `package.json` no declara `mac.notarize`.

Restricciones que fijan la decisión:

- **Presupuesto mínimo.** Es un proyecto de maestría, no una empresa.
- **El repo es público y Apache-2.0**, con releases activos. Eso lo hace elegible para programas
  de firma gratuita para software libre.
- **El titular está en Colombia.** Azure Trusted Signing (hoy *Azure Artifact Signing*) sólo valida
  identidades de USA, Canadá, UE y UK: **no aplica**, aunque sea la opción barata que recomienda
  todo el mundo.
- **El updater (#208) verifica el instalador descargado**: `sha512` contra `latest*.yml` y, en
  Windows, el `publisherName` de la firma. Cualquier firma que ocurra *después* de empaquetar
  rompe esa verificación si no se regeneran los manifiestos.

## Opciones evaluadas

| SO | Opción | Costo/año | Fricción al instalar | Veredicto |
|---|---|---|---|---|
| macOS | Apple Developer Program + Developer ID + notarización | **US$99** | ninguna | **único camino**: Gatekeeper no tiene atajo |
| macOS | ad-hoc (actual) | 0 | clic derecho → Abrir | sólo sin presupuesto |
| Windows | **SignPath Foundation** (gratis para OSS) | **0** | SmartScreen leve al inicio; baja al acumular reputación bajo la misma identidad | **recomendado** |
| Windows | Certum *Open Source Code Signing* (SimplySign, nube) | ~US$58–108 | igual | plan B si SignPath rechaza |
| Windows | Azure Artifact Signing | US$10/mes | buena | **no aplica** por país |
| Windows | OV comercial (Sectigo/Comodo) | US$219+ | igual que OV | caro, descartado |
| Windows | EV | US$300+ | sin aviso desde el día 1 | fuera de presupuesto |
| Linux | nada | 0 | ya es amigable | sin cambios |

**Costo total objetivo: US$99/año.** Todo lo demás, gratis.

## Decisión

1. **macOS se firma y notariza con Developer ID** (US$99/año). Es obligatorio para que el `.dmg`
   abra sin avisos y no hay alternativa.
2. **Windows se firma vía SignPath Foundation**, en dos pasadas, con regeneración de manifiestos.
   Si rechazan la solicitud, Certum Open Source con SimplySign.
3. **Linux no se firma.**

## Plan por fases

### Fase 0 — Solicitar SignPath (hoy; la aprobación tarda semanas)

1. Activar 2FA en la cuenta GitHub `raalzate` (requisito de SignPath).
2. Publicar `CODE_SIGNING_POLICY.md` en la raíz del repo: qué artefactos se firman, roles del
   equipo (quién aprueba releases), declaración de privacidad. Es condición de la Foundation.
3. Aplicar en <https://signpath.org/apply> con: URL del repo, licencia, descripción, enlace a
   `release-build.yml`, contacto.
4. Nada de lo anterior bloquea la Fase 1.

### Fase 1 — macOS (1–2 días, US$99)

1. Pagar el Apple Developer Program (individual).
2. En developer.apple.com crear un certificado **Developer ID Application** → exportar `.p12` →
   `base64` → secret `CSC_LINK`; su contraseña en `CSC_KEY_PASSWORD`. Su sola presencia activa
   `SIGN_MAC` en el workflow.
3. En appleid.apple.com generar una *app-specific password* → secrets `APPLE_ID`,
   `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
4. `package.json → build.mac`: agregar `"notarize": true` y un `entitlements.mac.plist` con
   `com.apple.security.cs.allow-jit` y `com.apple.security.cs.allow-unsigned-executable-memory`
   (Electron bajo hardened runtime los necesita; WebGPU y Puppeteer también). Revisar que los
   binarios desempaquetados por `asarUnpack` (Puppeteer, mermaid-cli) queden firmados: la
   notarización rechaza cualquier Mach-O sin firma dentro del bundle.
5. Probar con `workflow_dispatch`, bajar el `.dmg` y verificar:

   ```bash
   spctl -a -vv /Applications/Processflow-Architect.app
   # esperado: accepted · source=Notarized Developer ID
   ```

6. Actualizar la tabla «Instalar la app» de `RELEASE.md`: macOS deja de necesitar clic derecho.

### Fase 2 — Windows vía SignPath (al aprobar la solicitud)

Dos gotchas que rompen el botón «Actualizar» si se ignoran:

- **El NSIS `.exe` es autoextraíble.** SignPath no puede entrar a firmar lo que lleva adentro
  (sólo desarma MSI/APPX/MSIX/ZIP). Hay que firmar en **dos pasadas**: empaquetar con `--dir`,
  firmar `Processflow-Architect.exe` desarmado, construir el NSIS a partir de ese directorio, firmar
  el instalador.
- **Firmar después cambia el hash.** `latest.yml` y `.blockmap` quedan inválidos y el updater muere
  con `sha512 checksum mismatch`. Hay que **regenerar `latest.yml`** (sha512 + size) después de
  firmar, con un script en `scripts/`, y subir ese y no el original.
- **`electron-updater` verifica el publisher** del `.exe` descargado: `win.publisherName` debe ser
  exactamente el subject del certificado de la Foundation (`"SignPath Foundation"`), o la
  verificación falla.

Pasos:

1. Secrets: `SIGNPATH_API_TOKEN`; slugs de organización, proyecto y *signing policy* como
   variables del workflow.
2. Job `sign-win` entre `build` y `release`: sube el `.exe` desarmado como artefacto, llama
   `signpath/github-action-submit-signing-request@v3`, espera, baja el firmado; repite con el
   instalador NSIS; regenera `latest.yml`.
3. El job `release` pasa a consumir los artefactos firmados.
4. Tests: `scripts/__tests__/` para el regenerador de `latest.yml` (sha512 y size coinciden con el
   archivo firmado). El updater ya tiene suite; agregar el caso «manifiesto regenerado».

### Fase 3 — Plan B Windows (sólo si SignPath rechaza)

Certum *Open Source Code Signing* (~US$58) con SimplySign (nube, sin token USB). Se firma **dentro**
del build de electron-builder con un hook `win.sign` o `signtoolOptions`, así que no hay dos
pasadas ni manifiestos que regenerar: el camino `WIN_CSC_*` que ya tiene el workflow.

## Orden y riesgos

| Orden | Fase | Por qué |
|---|---|---|
| 1 | Fase 0 | gratis y es el cuello de botella por tiempo |
| 2 | Fase 1 | mayor ganancia por dólar; independiente de SignPath |
| 3 | Fase 2 | cuando llegue la aprobación |
| 4 | Fase 3 | sólo ante rechazo |

Riesgo principal: la notarización con hardened runtime y módulos nativos desempaquetados
(Chromium de Puppeteer) suele fallar la primera vez por binarios sin firma o entitlements
insuficientes. Presupuestar una iteración.

## Consecuencias

- Costo recurrente de US$99/año a cargo del titular; si deja de pagarse, los builds vuelven al
  modo ad-hoc automáticamente (`SIGN_MAC` cae a `false` al borrar el secret).
- La identidad Windows es la de la Foundation, no la del autor: el aviso de SmartScreen dice
  «SignPath Foundation» como publisher. Aceptable: la reputación se acumula igual.
- Cada fase que toque `release-build.yml` o `package.json → build` es trabajo de tamaño feature y
  sigue la ruta SDD (`docs/harness/sdd.md`).

## Fuentes

- Azure Trusted Signing, países soportados: <https://learn.microsoft.com/en-us/answers/questions/2243504/trusted-signing-for-other-countries>
- SignPath Foundation, condiciones: <https://signpath.org/terms.html>
- SignPath, acción de GitHub: <https://github.com/marketplace/actions/submit-a-signing-request>
- Electron + SignPath en dos pasadas (ejemplo): <https://github.com/luanAfons0/FirstMate/issues/188>
- electron-builder, `sha512 mismatch` al firmar después (#2111): <https://github.com/electron-userland/electron-builder/issues/2111>
- electron-builder, notarización: <https://www.electron.build/docs/features/code-signing/notarization/>
- Certum Open Source Code Signing: <https://certum.store/open-source-code-signing-on-simplysign.html>
