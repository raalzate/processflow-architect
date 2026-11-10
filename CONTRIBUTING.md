# Contribuir a Processflow Architect

Gracias por querer aportar. Esta guía resume cómo entra un cambio al repositorio y bajo qué
condiciones legales.

## Cómo entra un cambio

1. **Abre o elige una issue** en este repositorio que describa el problema o la mejora. Los
   commits que tocan código deben citarla (`#123`) o llevar una línea `sin-issue: <motivo>`: el
   hook `commit-msg` lo exige.
2. **Trabaja en una rama** y abre un pull request contra `main`. `main` está protegida: nada entra
   sin PR.
3. **Deja el gate en verde** antes de pedir revisión:

   ```bash
   npm run hooks:install   # una vez: activa los hooks del repo
   npm run gate            # arnés · docs · lint · typecheck · tests · build
   ```

   El CI corre el mismo gate en cada PR. No se mergea en rojo, y no se usa `--no-verify`.
4. **Respeta los principios** de [`CONSTITUTION.md`](CONSTITUTION.md) y las convenciones de
   [`CLAUDE.md`](CLAUDE.md). En particular:
   - la IA es local por defecto;
   - la lógica pura va en `src/lib/` con pruebas (TDD);
   - una aserción no se ajusta para que una prueba pase.
5. **Un PR por tema.** Un cambio grande se parte en piezas revisables y, si crea superficie
   nueva, sigue la [ruta SDD](docs/harness/sdd.md). Configuración ajena al proyecto (otro destino
   de releases, otra identidad de la app, otro repositorio de issues) no se incluye en un PR.

## Condiciones legales

### Licencia de lo que aportas

El proyecto se distribuye bajo la [licencia Apache 2.0](LICENSE). Según su cláusula 5, todo
aporte que envíes queda bajo esa misma licencia, sin condiciones adicionales.

### Certificado de Origen del Desarrollador (DCO)

Cada commit debe llevar una línea `Signed-off-by` con tu nombre y tu correo reales:

```bash
git commit -s -m "fix: …"
# agrega:  Signed-off-by: Tu Nombre <tu@correo>
```

Con esa línea certificas el [Developer Certificate of Origin 1.1](https://developercertificate.org/):

> (a) el aporte fue creado, total o parcialmente, por ti, y tienes derecho a enviarlo bajo la
> licencia del proyecto; o (b) se basa en un trabajo previo que, hasta donde sabes, está cubierto
> por una licencia de código abierto adecuada que te permite enviarlo con modificaciones bajo la
> misma licencia; o (c) te lo entregó directamente otra persona que certificó (a) o (b), y no lo
> modificaste; y (d) entiendes y aceptas que el proyecto y el aporte son públicos, y que se
> conserva un registro del aporte (incluida tu firma) de forma indefinida.

Si aportas como parte de tu trabajo o de tus estudios, verifica antes que tu empleador o tu
institución no reclamen derechos sobre ese aporte.

### Qué no puede entrar

- Código, textos, imágenes o modelos que no puedas licenciar bajo Apache 2.0. Esto incluye
  material propietario de terceros y kits o plantillas privadas.
- Dependencias con licencia copyleft fuerte (GPL, AGPL, SSPL). El lint `LICENCIAS` las rechaza.
- Secretos: llaves, tokens o credenciales. Si se te escapa uno, avísalo de inmediato para
  rotarlo.
- Logos o marcas sin un uso puramente identificativo (ver
  [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md)).

Los cambios generados con ayuda de IA son bienvenidos, con las mismas reglas: tú respondes por el
aporte, por su licencia y por el gate.

## Seguridad y privacidad

- Las vulnerabilidades se reportan como indica [`SECURITY.md`](SECURITY.md), no en una issue
  pública.
- Si tu cambio agrega una conexión de red o un dato que sale del equipo, actualiza
  [`PRIVACY.md`](PRIVACY.md) en el mismo PR.
