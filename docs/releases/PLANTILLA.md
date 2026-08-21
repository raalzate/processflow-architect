# Plantilla de notas de release

Copiá este archivo a `docs/releases/<versión>.md` (el número exacto de
`package.json`) y reemplazá lo que está entre `<…>`. La regla RELEASE de
`scripts/repo-lint.mjs` exige las tres secciones `###` y que el texto nombre la
versión: sin eso el gate sale rojo antes de que el tag exista.

Esta plantilla NO se valida a sí misma (no es la versión de nadie); el freno mira
sólo el archivo de la versión que está en `package.json`.

---

```markdown
## Processflow Architect <versión> · beta

<Una o dos frases: qué es este release para alguien que lo va a instalar. Si no
hay cambios funcionales, decilo acá y aclará que actualizar es opcional.>

### Cambios

- **<Título del cambio, en negrita.>** <Qué cambia para quien usa la app, no cómo
  está implementado. Si arregla algo, decí qué se veía roto antes.>

### Descargas

| Sistema | Archivo |
|---|---|
| macOS (Apple Silicon) | `Processflow-Architect-<versión>-arm64.dmg` |
| Windows | `Processflow-Architect.Setup.<versión>.exe` |
| Linux | `Processflow-Architect-<versión>.AppImage` |

Los binarios **no están firmados con certificado de confianza**, así que la primera
apertura muestra un aviso:

- **macOS:** clic derecho sobre la app → **Abrir**. Si el navegador dejó cuarentena:
  `xattr -cr /Applications/Processflow-Architect.app`
- **Windows:** SmartScreen → **Más información** → **Ejecutar de todas formas**.
- **Linux:** `chmod +x Processflow-Architect-<versión>.AppImage` y ejecutalo.

### Requisitos

GPU con **WebGPU**: la IA corre local y offline (LiteRT-LM sobre WebGPU) y sin GPU no
arranca. El proveedor de nube es opcional, apagado por defecto y con tu propia llave,
que se guarda cifrada y nunca sale del proceso principal.
```
