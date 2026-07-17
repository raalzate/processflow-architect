# Empaquetado y publicación de releases

Cómo se construyen los **artefactos de escritorio** (instaladores) de Processflow
Architect y cómo publicar una versión. Todo pasa por GitHub Actions; no hay
proceso manual de firmado ni subida a mano.

## Flujos de GitHub Actions

| Workflow | Archivo | Dispara | Qué hace |
|----------|---------|---------|----------|
| **CI** | `.github/workflows/ci.yml` | push / PR a `main` | Typecheck + pruebas con cobertura. Sube `coverage/` como artefacto (14 días). Gate obligatorio. |
| **Build and Publish Release** | `.github/workflows/release-build.yml` | tag `v*` · `workflow_dispatch` | Empaqueta instaladores mac/win/linux con electron-builder. |

`release-build.yml` **no corre en CI normal** — solo con tag o disparo manual.

## Artefactos que produce

electron-builder empaqueta según `build.*` de `package.json`:

| Plataforma | Runner | Target | Archivo en `dist/` |
|------------|--------|--------|--------------------|
| macOS | `macos-latest` | `dmg` | `Processflow-Architect-<versión>.dmg` (+ `.zip` para auto-update) |
| Windows | `windows-latest` | `nsis` | `Processflow-Architect Setup <versión>.exe` |
| Linux | `ubuntu-latest` | `AppImage` | `Processflow-Architect-<versión>.AppImage` |

La matriz corre las 3 plataformas en paralelo (`fail-fast: false`: si una falla,
las otras siguen).

## Publicar una versión (release por tag)

1. Subí la versión en `package.json` (`"version"`), commiteá y mergeá a `main`.
2. Creá y empujá el tag:

   ```bash
   git tag v0.2.0        # debe empezar con "v"
   git push origin v0.2.0
   ```

3. El workflow arranca solo. Cada job añade sus instaladores al **mismo** GitHub
   Release, creado en modo **draft** (borrador).
4. Andá a **Releases**, revisá los assets, escribí las notas y **publicá** el
   borrador manualmente.

> El release nace como borrador a propósito (coincide con `releaseType: draft` de
> `package.json`). Nada se hace público hasta que lo publiques a mano.

## Generar instaladores sin publicar (disparo manual)

Para probar el empaquetado sin crear un release:

1. GitHub → pestaña **Actions** → **Build and Publish Release** → **Run workflow**.
2. Al terminar, descargá los instaladores desde la sección **Artifacts** del run
   (`installers-mac`, `installers-win`, `installers-linux`). Se guardan 30 días.

No se crea ni toca ningún release en este modo.

## Firma de código

El paso de empaquetado se bifurca según **haya o no** certificado de macOS
configurado. La decisión vive en el env `SIGN_MAC` del job:

```yaml
env:
  SIGN_MAC: ${{ secrets.CSC_LINK != '' }}
```

- **`SIGN_MAC == 'true'`** (hay cert) → paso *«(signed)»*: pasa los secrets
  `CSC_*` / `APPLE_*` a electron-builder para firmar y notarizar de verdad.
- **`SIGN_MAC != 'true'`** (sin cert, por defecto) → paso *«(ad-hoc / unsigned)»*:
  **no** pasa `CSC_LINK` y fuerza firma **ad-hoc** en macOS
  (`-c.mac.identity=- -c.mac.hardenedRuntime=false`).

> **Por qué el split y la firma ad-hoc.** GitHub expande un secret ausente a `""`
> (cadena vacía, **no** `undefined`). electron-builder trata `CSC_LINK=""` como
> "firma con este cert" e intenta importar una ruta vacía (la raíz del repo) →
> falla con `⨯ … not a file`. Por eso **nunca** pasamos `CSC_LINK` vacío. Además,
> en Apple Silicon un binario **sin ninguna firma** sale como *«está dañado»*
> (arm64 exige al menos firma ad-hoc); firmarlo ad-hoc lo degrada al aviso normal
> de "desarrollador no identificado", que se abre con clic derecho → Abrir.

### Firmar de verdad (opcional)

Para firmas confiables (sin avisos), definí estos secrets del repo
(**Settings → Secrets and variables → Actions**):

| Secret | Para qué |
|--------|----------|
| `CSC_LINK` / `CSC_KEY_PASSWORD` | Certificado macOS (Developer ID) en base64 y su clave. Su presencia activa `SIGN_MAC`. |
| `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | Certificado de firma Windows y su clave. |
| `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` | Notarización de Apple (`@electron/notarize` ya está instalado). |

`GITHUB_TOKEN` lo inyecta GitHub automáticamente; no hay que crearlo.

> Windows: SmartScreen solo desaparece con un **cert EV** o con **reputación**
> acumulada; un OV normal sigue mostrando el aviso hasta que la app tenga
> descargas. Alternativa más barata que EV: **Azure Trusted Signing**.

## Instalar la app (usuarios finales)

Los builds por defecto **no están notarizados/firmados de confianza**, así que
cada SO muestra un aviso de seguridad la primera vez. Cómo abrirlos:

| SO | Aviso | Cómo abrir |
|----|-------|------------|
| **macOS** (Apple Silicon) | "aplicación no identificada" (ya **no** «está dañado» gracias a la firma ad-hoc) | Clic derecho sobre la app → **Abrir**. Si el navegador dejó cuarentena y sigue quejándose: `xattr -cr /Applications/Processflow-Architect.app` |
| **Windows** | SmartScreen: "Windows protegió su PC" | **Más información** → **Ejecutar de todas formas**. No requiere terminal. |
| **Linux** | — | `chmod +x Processflow-Architect-<versión>.AppImage` y ejecutá el archivo. |

## Detalles de implementación (por qué está así)

- **`--publish never`**: los assets se suben con `softprops/action-gh-release`,
  que apunta al **repositorio actual**. El bloque `build.publish` de
  `package.json` apunta a otro repo (`raulalzate/ia-processflow-architect`),
  así que dejar que electron-builder publique fallaría. Si algún día querés que
  electron-builder publique directo, alineá ese `owner`/`repo` con el remoto real
  y usá `--publish always`.
- **`shell: bash`** en el paso de empaquetado: unifica la sintaxis en las 3
  plataformas. En Windows lo aporta Git Bash (el default sería PowerShell).
- **`npm ci`** (no `npm install`): reproducible desde `package-lock.json`. A
  diferencia del CI, aquí **sí** corre el `postinstall` (rebuild de módulos
  nativos), porque el empaquetado necesita los binarios completos de Electron,
  Puppeteer y Mermaid CLI.

## Problemas frecuentes

| Síntoma | Causa probable |
|---------|----------------|
| El release no aparece tras el tag | El tag no empieza con `v` (el trigger es `v*`). |
| `⨯ … not a file` solo en macOS | `CSC_LINK` llegó vacío al paso de firma. Debe resolverse con el split `SIGN_MAC` (ver sección de firma); no pases `CSC_LINK: ""`. |
| macOS: *«"Processflow-Architect" está dañado»* | Binario arm64 sin firma. El paso *«(ad-hoc)»* debe firmar con `-c.mac.identity=-`. Ya descargado: `xattr -cr <app>` (o `codesign --force --deep --sign - <app>`). |
| Windows: SmartScreen "app no reconocida" | Normal en builds sin cert EV/reputación. Se abre con **Más información → Ejecutar de todas formas**. |
| `Resource not accessible by integration` | Falta `permissions: contents: write` (ya está en el workflow). |
| Build de Windows falla en el paso de empaquetado | Sintaxis de shell: el paso usa `shell: bash` a propósito, no lo cambies a PowerShell. |
| Faltan assets de una plataforma en el release | Ese job de la matriz falló; revisá su log (los demás igual publican). |
