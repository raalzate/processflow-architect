/**
 * @fileOverview ¿Este release se puede instalar por el botón «Actualizar»? (PURO)
 *
 * `electron-updater` no mira los assets del release: lee `latest*.yml`, pide el
 * archivo que ahí dice y verifica su tamaño y su hash. Si el nombre del yml no
 * es el nombre del asset, el usuario ve una descarga que no arranca y un 404 que
 * nadie loguea. Es lo que pasó en Windows durante cinco releases (#235): el
 * default de NSIS trae **espacios** en el nombre, GitHub los sube como puntos y
 * electron-builder los escribe en el yml como guiones — tres nombres distintos.
 *
 * Acá vive lo que DECIDE si un release está sano. Quien va a la red es
 * `scripts/release-updater-check.mjs`; el lint usa `nombreConEspacios` para que
 * la causa raíz no vuelva a entrar al repo.
 */

/** Lo que el updater necesita de un `latest*.yml`. */
export interface MetadatosUpdater {
  version: string;
  /** Archivo que el updater va a pedir. */
  path: string;
  files: { url: string; size?: number }[];
}

/** Quita comillas simples o dobles alrededor de un valor de yml. */
const limpiar = (v: string): string => v.trim().replace(/^['"]|['"]$/g, "");

/**
 * Lee los cuatro campos que importan de un `latest*.yml`.
 *
 * Es un parser mínimo a propósito: meter un yaml completo para leer `version`,
 * `path` y `files[].url` sería una dependencia nueva para tres claves de forma
 * conocida (las escribe electron-builder, no un humano).
 */
export function parsearMetadatosUpdater(yml: string): MetadatosUpdater | undefined {
  const texto = yml ?? "";
  const version = texto.match(/^version:\s*(.+)$/m)?.[1];
  const path = texto.match(/^path:\s*(.+)$/m)?.[1];
  if (!version || !path) return undefined;

  const files: { url: string; size?: number }[] = [];
  const bloque = texto.split(/^files:\s*$/m)[1] ?? "";
  for (const entrada of bloque.split(/^\s*-\s+/m).slice(1)) {
    const url = entrada.match(/url:\s*(.+)/)?.[1];
    if (!url) continue;
    const size = entrada.match(/size:\s*(\d+)/)?.[1];
    files.push({ url: limpiar(url), ...(size ? { size: Number(size) } : {}) });
  }

  return { version: limpiar(version), path: limpiar(path), files };
}

/**
 * Todo lo que impediría que este release se instale solo. Lista vacía = sano.
 *
 * El tamaño se compara porque el updater lo verifica: un asset resubido a mano,
 * o un yml de otra compilación, aborta la instalación después de bajar los 200 MB
 * — y ahí el usuario ya no vuelve a intentar.
 */
export function problemasDeMetadatos(
  meta: MetadatosUpdater,
  assets: readonly { name: string; size?: number }[],
  versionDelRelease: string
): string[] {
  const problemas: string[] = [];

  if (meta.version !== versionDelRelease) {
    problemas.push(
      `el yml declara la versión ${meta.version} y el release es ${versionDelRelease}: el updater ofrecería otra cosa`
    );
  }

  const nombres = new Set(assets.map((a) => a.name));
  for (const archivo of [meta.path, ...meta.files.map((f) => f.url)]) {
    if (!nombres.has(archivo)) {
      problemas.push(`«${archivo}» no está entre los assets del release: el updater se comería un 404`);
    }
  }

  for (const f of meta.files) {
    const asset = assets.find((a) => a.name === f.url);
    if (!asset || f.size === undefined || asset.size === undefined) continue;
    if (asset.size !== f.size) {
      problemas.push(
        `«${f.url}»: el yml dice ${f.size} bytes de tamaño y el asset tiene ${asset.size}; el updater aborta al verificar`
      );
    }
  }

  // Duplicados: un mismo problema declarado por `path` y por `files` se dice una vez.
  return [...new Set(problemas)];
}

/**
 * ¿El patrón de nombre de artefacto lleva espacios? Un nombre con espacios es la
 * raíz de #235: GitHub los convierte en puntos al recibir el asset y
 * electron-builder los escribe como guiones en el yml. Sin declarar nada, NSIS
 * usa `${productName} Setup ${version}.${ext}`, que ya trae el espacio: por eso
 * la ausencia cuenta como peligrosa.
 */
export const nombreConEspacios = (patron?: string): boolean => !patron?.trim() || /\s/.test(patron);
