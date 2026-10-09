// =============================================================================
// Política de permisos del renderer (sin dependencias de Electron: se prueba sola).
//
// La ventana concedía CUALQUIER permiso que pidiera la página: cámara, micrófono,
// ubicación, USB… La app sólo usa el portapapeles. Un contenido inyectado no
// debería poder encender el micrófono por el solo hecho de pedirlo.
// =============================================================================

/** Lo único que la app pide. Agregar uno es una decisión: va con su test. */
export const PERMISOS_PERMITIDOS: ReadonlySet<string> = new Set([
  'clipboard-sanitized-write', // navigator.clipboard.writeText (respaldo del IPC)
  'clipboard-read', // pegar en el visor de artefactos
]);

/**
 * ¿La URL es de la propia app? En producción, el renderer empaquetado (`app://`).
 * En desarrollo, además, el servidor local de Next en loopback.
 */
export function esOrigenPropio(url: string | undefined, isDev: boolean): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === 'app:') return true;
  return isDev && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/** ¿Se concede `permiso` a quien lo pide desde `url`? */
export function permisoPermitido(permiso: string, url: string | undefined, isDev: boolean): boolean {
  return esOrigenPropio(url, isDev) && PERMISOS_PERMITIDOS.has(permiso);
}
