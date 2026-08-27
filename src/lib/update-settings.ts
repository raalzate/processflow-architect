/**
 * @fileOverview Preferencias de actualización: si se busca, y cuándo se buscó (PURO).
 *
 * La app es local por defecto, así que salir a la red tiene que ser algo que el
 * usuario pueda apagar. Acá viven la preferencia y la última comprobación, con la
 * misma tolerancia a basura que el resto de las preferencias (`mcp-settings.ts`):
 * lo que hay en `localStorage` lo puede haber escrito cualquiera, o puede haber
 * quedado de una versión anterior.
 *
 * El default es **buscar**: enterarse de que salió un arreglo es lo que el usuario
 * espera; lo que no espera es que se descargue o se instale sin pedirlo, y eso lo
 * decide el updater, no esta preferencia.
 */

/** localStorage: "0" si el usuario apagó la búsqueda automática. */
export const UPDATE_AUTO_KEY = "update_auto_check";
/** localStorage: JSON con la última comprobación (cuándo y con qué resultado). */
export const UPDATE_LAST_CHECK_KEY = "update_last_check";

/** Qué pasó la última vez que se buscó. */
export interface UltimaComprobacion {
  /** ISO de cuándo se comprobó. */
  cuando: string;
  /** Resultado legible: `al-dia`, `disponible 0.8.2`, el motivo de un fallo… */
  resultado: string;
}

export interface UpdatePrefs {
  auto: boolean;
  ultima?: UltimaComprobacion;
}

type Lectura = Pick<Storage, "getItem">;
type Escritura = Pick<Storage, "setItem">;

/** Lee la última comprobación; lo que no tenga la forma esperada se descarta. */
function leerUltima(raw: string | null): UltimaComprobacion | undefined {
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
    const { cuando, resultado } = v as Record<string, unknown>;
    if (typeof cuando !== "string" || typeof resultado !== "string") return undefined;
    return { cuando, resultado };
  } catch {
    return undefined;
  }
}

/**
 * Preferencias persistidas. Sólo el `"0"` explícito apaga la búsqueda: un valor
 * raro (o de otra versión) no debe dejar al usuario sin enterarse de un arreglo.
 */
export function readUpdatePrefs(storage: Lectura): UpdatePrefs {
  try {
    const auto = storage.getItem(UPDATE_AUTO_KEY) !== "0";
    const ultima = leerUltima(storage.getItem(UPDATE_LAST_CHECK_KEY));
    return ultima ? { auto, ultima } : { auto };
  } catch {
    return { auto: true };
  }
}

/** Guarda las preferencias. Un storage que falla no puede romper la app. */
export function writeUpdatePrefs(storage: Escritura, prefs: UpdatePrefs): void {
  try {
    storage.setItem(UPDATE_AUTO_KEY, prefs.auto ? "1" : "0");
    if (prefs.ultima) storage.setItem(UPDATE_LAST_CHECK_KEY, JSON.stringify(prefs.ultima));
  } catch {
    /* sin storage: la preferencia vale para esta sesión */
  }
}

/**
 * Una línea para Ajustes. Una fecha que no se puede interpretar se muestra tal
 * como está guardada: «Invalid Date» en pantalla es peor que el texto crudo.
 */
export function describirUltimaComprobacion(ultima: UltimaComprobacion | undefined): string {
  if (!ultima) return "Nunca se ha buscado una actualización.";
  const fecha = new Date(ultima.cuando);
  const cuando = Number.isNaN(fecha.getTime()) ? ultima.cuando : fecha.toLocaleString();
  return `Última comprobación: ${cuando} — ${ultima.resultado}`;
}
