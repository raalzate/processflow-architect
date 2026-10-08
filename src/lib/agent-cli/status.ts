/**
 * @fileOverview Lectura del estado del CLI en la máquina (PURO). #462.
 *
 * Dos cosas que el main averigua lanzando procesos y que acá se interpretan:
 * - `claude auth status` (JSON): «instalado» no implica sesión iniciada, y sin
 *   sesión cada llamada fallaba con «Not logged in» como si fuera un error.
 * - `$SHELL -ilc 'command -v claude'`: una app abierta desde el Finder no ve el
 *   PATH de la shell, y con nvm/fnm/asdf el CLI vive en una ruta que ninguna
 *   lista fija conoce.
 */

/** `loggedIn` de `claude auth status`, o undefined si la salida no lo dice. */
export function parseAuthStatus(stdout: string): boolean | undefined {
  const i = stdout.indexOf("{");
  if (i === -1) return undefined;
  try {
    const j = JSON.parse(stdout.slice(i));
    return typeof j?.loggedIn === "boolean" ? j.loggedIn : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ruta absoluta que imprimió `command -v` en una shell de login. Una shell
 * interactiva puede imprimir ruido antes (banners, avisos de nvm): vale la
 * ÚLTIMA línea que sea una ruta absoluta terminada en el nombre del comando.
 */
export function rutaDesdeShell(stdout: string, comando: string): string | null {
  const lineas = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .reverse();
  const r = lineas.find((l) => l.startsWith("/") && (l === `/${comando}` || l.endsWith(`/${comando}`)) && !/\s/.test(l));
  return r ?? null;
}
