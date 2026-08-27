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
      return estado.instalable
        ? `Actualizar a ${estado.version}`
        : `Actualizar a ${estado.version} (descarga manual)`;
    case "descargando":
      return `Descargando… ${Math.round(estado.porcentaje)}%`;
    case "lista":
      return `Reiniciar para instalar ${estado.version}`;
    case "fallo":
      return "Reintentar la actualización";
  }
}
