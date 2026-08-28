/**
 * @fileOverview Actualizaciones de la app (proceso main).
 *
 * Envuelve `electron-updater` para que el renderer no lo vea nunca: la ventana
 * pide «buscá», «descargá», «reiniciá» por IPC y recibe el estado. Lo que DECIDE
 * (comparar versiones, si esta plataforma puede auto-instalar, qué dice el botón)
 * vive en `src/lib/update-check.ts`, que es puro y tiene pruebas.
 *
 * Tres reglas que no se negocian y por eso están cableadas acá:
 *
 *  - **Nada se descarga solo** (`autoDownload = false`): abrir la app no puede
 *    gastar la conexión del usuario.
 *  - **Nada se instala solo** (`autoInstallOnAppQuit = false`): reiniciar es una
 *    decisión de quien tiene trabajo abierto en el lienzo.
 *  - **En desarrollo no se busca**: `electron-updater` revienta sin
 *    `app-update.yml`, y actualizar un árbol de fuentes no tiene sentido.
 *
 * En macOS NO se descarga: Squirrel.Mac exige que la app esté firmada y
 * notarizada, y estos binarios no lo están. Ahí se consulta la última versión
 * publicada por la API pública de releases y se ofrece abrir su página.
 */

import { app, shell, type BrowserWindow } from "electron";
import { hayActualizacion, puedeAutoInstalar, type EstadoUpdate } from "../../src/lib/update-check";

/** Repo desde donde se publican los releases (el mismo de `build.publish`). */
const REPO = "raalzate/processflow-architect";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

/** Ventana a la que se le reporta el estado (la principal). */
let ventana: BrowserWindow | null = null;
/** Último estado conocido: la UI lo pide al montarse. */
let estado: EstadoUpdate = { tipo: "al-dia" };
/** Descarga en curso: pulsar dos veces no lanza dos descargas. */
let descargando = false;
/** Página del release disponible (para las plataformas que instalan a mano). */
let paginaRelease = RELEASES_PAGE;

const publicar = (nuevo: EstadoUpdate): void => {
  estado = nuevo;
  ventana?.webContents.send("update-status", nuevo);
};

/** El estado actual (lo pide el renderer al montar el botón). */
export const updateStatus = (): EstadoUpdate => estado;

/** `electron-updater` se carga perezoso: en desarrollo no se toca. */
async function autoUpdater() {
  const { autoUpdater: u } = await import("electron-updater");
  u.autoDownload = false;
  u.autoInstallOnAppQuit = false;
  u.allowPrerelease = false;
  return u;
}

/** Registra la ventana y engancha los eventos del updater una sola vez. */
let enganchado = false;
export async function initUpdater(win: BrowserWindow): Promise<void> {
  ventana = win;
  if (enganchado || !app.isPackaged || !puedeAutoInstalar(process.platform)) return;
  enganchado = true;
  try {
    const u = await autoUpdater();
    u.on("download-progress", (p: { percent: number }) =>
      publicar({ tipo: "descargando", porcentaje: p.percent ?? 0 })
    );
    u.on("update-downloaded", (info: { version: string }) => {
      descargando = false;
      publicar({ tipo: "lista", version: info.version });
    });
    u.on("error", (e: Error) => {
      descargando = false;
      publicar({ tipo: "fallo", motivo: e?.message || "No se pudo actualizar." });
    });
  } catch (e) {
    // Sin updater disponible la app sigue funcionando: es una capacidad, no un
    // requisito (FR-020).
    console.log("[updater] no disponible:", (e as Error)?.message);
  }
}

/** La última versión publicada según la API de releases (`undefined` si no se pudo). */
async function ultimaPublicada(): Promise<{ version: string; url: string } | undefined> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "processflow-architect" },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { tag_name?: string; html_url?: string; draft?: boolean };
    // Un borrador no cuenta: `releases/latest` ya los excluye, pero el dato viene
    // en la respuesta y confiar en el endpoint sin mirar sería una suposición.
    if (!json?.tag_name || json.draft) return undefined;
    return { version: json.tag_name.replace(/^v/i, ""), url: json.html_url || RELEASES_PAGE };
  } catch {
    return undefined;
  }
}

/**
 * Busca una versión nueva. Un fallo de red deja el estado en «al día» y sólo se
 * anota en el log: no enterarse de una actualización no es un error del usuario
 * (FR-005).
 */
export async function checkForUpdates(): Promise<EstadoUpdate> {
  if (!app.isPackaged) {
    publicar({ tipo: "al-dia" });
    return estado;
  }
  const publicada = await ultimaPublicada();
  if (!publicada) {
    console.log("[updater] no se pudo consultar la última versión publicada");
    publicar({ tipo: "al-dia" });
    return estado;
  }
  paginaRelease = publicada.url;
  if (!hayActualizacion(app.getVersion(), publicada.version)) {
    publicar({ tipo: "al-dia" });
    return estado;
  }
  publicar({
    tipo: "disponible",
    version: publicada.version,
    url: publicada.url,
    instalable: puedeAutoInstalar(process.platform),
  });
  return estado;
}

/**
 * Descarga la versión nueva (Windows/Linux). En macOS abre la página del release:
 * no hay auto-instalación posible sin firma, y prometerla sería mentir.
 */
export async function downloadUpdate(): Promise<EstadoUpdate> {
  if (!puedeAutoInstalar(process.platform)) {
    await openReleasePage();
    return estado;
  }
  if (descargando) return estado; // pulsar dos veces no duplica la descarga
  try {
    descargando = true;
    publicar({ tipo: "descargando", porcentaje: 0 });
    const u = await autoUpdater();
    await u.checkForUpdates(); // rellena la info que necesita la descarga
    await u.downloadUpdate();
  } catch (e) {
    descargando = false;
    publicar({ tipo: "fallo", motivo: (e as Error)?.message || "No se pudo descargar la actualización." });
  }
  return estado;
}

/** Aplica la actualización descargada reiniciando la app. */
export async function quitAndInstall(): Promise<void> {
  if (estado.tipo !== "lista") return;
  const u = await autoUpdater();
  u.quitAndInstall();
}

/** Abre la página del release en el navegador del sistema (sólo `https`). */
export async function openReleasePage(): Promise<void> {
  if (/^https:\/\//i.test(paginaRelease)) await shell.openExternal(paginaRelease);
}
