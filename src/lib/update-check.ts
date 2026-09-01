/**
 * @fileOverview ¿Hay una versión nueva, y qué se le puede ofrecer al usuario? (PURO)
 *
 * Actualizar era un trabajo manual y silencioso: nadie se enteraba de que salió
 * una versión salvo que entrara a GitHub. Acá vive lo que DECIDE el sistema de
 * actualización —comparar versiones, si esta plataforma puede auto-instalar, qué
 * dice el botón—; el proceso main habla con `electron-updater` y el componente
 * pinta.
 *
 * Dos cosas que no son negociables y por eso están acá, con prueba:
 *
 *  - **Las versiones se comparan por número, no como texto.** `0.10.0` es más
 *    nueva que `0.9.0`, y ordenarlas alfabéticamente diría lo contrario.
 *  - **macOS no puede auto-instalar** sin firma y notarización de Apple
 *    (Squirrel.Mac las exige). Prometerlo en la interfaz sería mentir, así que la
 *    plataforma decide qué se ofrece.
 */

/** Estado del sistema de actualización, tal como lo ve la interfaz. */
export type EstadoUpdate =
  | { tipo: "al-dia" }
  | {
      tipo: "disponible";
      version: string;
      /** Página del release, para las plataformas que instalan a mano. */
      url: string;
      /** `true` → esta plataforma puede descargar e instalar sola. */
      instalable: boolean;
    }
  | { tipo: "descargando"; porcentaje: number }
  /**
   * El instalador está en el disco pero NO se puede aplicar solo (macOS): la app
   * lo bajó a Descargas y lo único que queda es abrirlo a mano.
   */
  | { tipo: "descargada"; version: string; ruta: string }
  | { tipo: "lista"; version: string }
  | { tipo: "fallo"; motivo: string };

/** Las tres primeras partes numéricas de una versión (`v0.8.1-beta.2` → [0,8,1]). */
function partes(version: string): [number, number, number] {
  const limpia = (version ?? "").trim().replace(/^v/i, "").split(/[-+]/)[0];
  const nums = limpia.split(".").map((p) => Number.parseInt(p, 10));
  // Una parte no numérica hace la versión inválida: se hunde al mínimo para que
  // nunca "gane" una comparación (mejor no ofrecer nada que ofrecer basura).
  if (!nums.length || Number.isNaN(nums[0])) return [-1, -1, -1];
  return [nums[0] || 0, nums[1] || 0, nums[2] || 0];
}

/** `-1` si `a` es más vieja, `0` si iguales, `1` si `a` es más nueva. */
export function compararVersiones(a: string, b: string): -1 | 0 | 1 {
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

/**
 * ¿La publicada es más nueva que la instalada? Sin dato de la publicada no hay
 * nada que ofrecer, y una instalada MÁS nueva (compilación local, prueba) no se
 * "actualiza" hacia atrás.
 */
export function hayActualizacion(instalada: string, publicada?: string): boolean {
  if (!publicada?.trim()) return false;
  return compararVersiones(publicada, instalada) === 1;
}

/**
 * ¿Esta plataforma puede descargar e instalar sin intervención? Windows (NSIS) y
 * Linux (AppImage) sí. macOS **no**: Squirrel.Mac exige que la app esté firmada y
 * notarizada, y estos binarios no lo están — ahí lo honesto es llevar al usuario
 * a la descarga.
 */
export const puedeAutoInstalar = (plataforma: string): boolean =>
  plataforma === "win32" || plataforma === "linux";

/**
 * Texto del botón. `undefined` cuando no debe haber botón: al día, la barra no
 * gana ruido. Cada estado dice qué va a pasar si se pulsa, y el fallo dice que se
 * puede reintentar (un botón muerto es peor que ninguno).
 */
export function etiquetaBoton(estado: EstadoUpdate): string | undefined {
  switch (estado.tipo) {
    case "al-dia":
      return undefined;
    case "disponible":
      // Donde no se puede auto-instalar, la app igual BAJA el archivo: decir
      // «actualizar» ahí prometería algo que no va a pasar sola.
      return estado.instalable
        ? `Actualizar a ${estado.version}`
        : `Descargar ${estado.version}`;
    case "descargando":
      return `Descargando… ${Math.round(estado.porcentaje)}%`;
    case "descargada":
      return `${estado.version} está en Descargas`;
    case "lista":
      return `Reiniciar para instalar ${estado.version}`;
    case "fallo":
      return "Reintentar la actualización";
  }
}

/**
 * Rótulo corto para el aviso del pie del sidebar, al lado de la versión. El botón
 * grande de la barra se fue (issue #231): el aviso vive donde ya está el dato de
 * versión, y ahí el espacio es poco — por eso hay una prueba que exige que ningún
 * estado pase de 28 caracteres.
 */
export function etiquetaBreve(estado: EstadoUpdate): string | undefined {
  switch (estado.tipo) {
    case "al-dia":
      return undefined;
    case "disponible":
      return estado.instalable ? `Actualizar a ${estado.version}` : `Descargar ${estado.version}`;
    case "descargando":
      return `Descargando ${Math.round(estado.porcentaje)}%`;
    case "descargada":
      return "Ver en Descargas";
    case "lista":
      return "Reiniciar para instalar";
    case "fallo":
      return "Reintentar";
  }
}

/**
 * El artefacto instalable de ESTA plataforma dentro de los que publica el release.
 *
 * Se elige por el nombre del archivo y no por un patrón armado a mano con la
 * versión: el release trae también blockmaps y los `latest*.yml` del updater, y
 * bajarse un `.blockmap` creyendo que es el instalador es el error obvio. Si la
 * arquitectura no tiene build publicada, no se inventa otra: un `.dmg` arm64 no
 * sirve en un Mac Intel.
 */
export function elegirAsset(
  nombres: readonly string[],
  plataforma: string,
  arquitectura: string
): string | undefined {
  const instalables = nombres.filter((n) => !/\.(blockmap|yml|yaml|sha512)$/i.test(n));
  switch (plataforma) {
    case "darwin": {
      const dmg = instalables.filter((n) => /\.dmg$/i.test(n));
      // electron-builder nombra el arm64 con el sufijo; el x64 va sin marca.
      return arquitectura === "arm64"
        ? dmg.find((n) => /arm64/i.test(n))
        : dmg.find((n) => !/arm64/i.test(n));
    }
    case "win32":
      return instalables.find((n) => /\.exe$/i.test(n));
    case "linux":
      return instalables.find((n) => /\.AppImage$/i.test(n));
    default:
      return undefined;
  }
}
