/**
 * @fileOverview Probar la llave del proveedor de nube ANTES de necesitarla (PURO)
 *
 * `getAiKeyStatus` sólo dice si hay bytes guardados en el main: nunca toca al
 * proveedor. Con eso, una llave revocada o un modelo mal escrito se descubrían
 * recién cuando una sugerencia real fallaba, en medio del trabajo (#374).
 *
 * La prueba es una generación mínima por el canal que ya existe
 * (`ai-remote-generate`): no hace falta IPC nueva, la llave sigue sin salir del
 * proceso principal y el router (P5) no se toca. Acá vive lo único con decisión:
 * traducir lo que devolvió el proveedor a un veredicto que el usuario entienda.
 */

import { providerInfo, type RemoteProvider } from "@/lib/ai/remote-settings";

/** Prompt de la prueba: lo más barato que igual ejercita llave + modelo. */
export const PROMPT_DE_PRUEBA = "ping";

export interface VeredictoLlave {
  ok: boolean;
  titulo: string;
  detalle: string;
}

/** El estado HTTP que el proveedor metió en el mensaje de error, si lo hay. */
function estadoHttp(mensaje: string): number | undefined {
  const m = /\b(\d{3})\b/.exec(mensaje);
  const n = m ? Number(m[1]) : NaN;
  return n >= 400 && n <= 599 ? n : undefined;
}

/**
 * Qué decirle al usuario cuando la prueba falla.
 *
 * El cuerpo crudo del proveedor NO se muestra entero: es ruido, puede ser enorme
 * y es el único lugar donde algo sensible podría viajar de vuelta. Se recorta.
 */
export function diagnosticarFalloDeLlave(
  provider: RemoteProvider,
  error: unknown,
  modelo: string
): VeredictoLlave {
  const mensaje = error instanceof Error ? error.message : String(error ?? "");
  const label = providerInfo(provider).label;
  const estado = estadoHttp(mensaje);
  const recorte = mensaje.slice(0, 200);

  if (estado === 401 || estado === 403) {
    return {
      ok: false,
      titulo: "La llave no sirve",
      detalle: `${label} rechazó la llave (${estado}). Revisá que esté completa y que siga activa en la consola del proveedor.`,
    };
  }
  if (estado === 404) {
    return {
      ok: false,
      titulo: "El modelo no existe",
      detalle: `La llave llegó a ${label}, pero no reconoce el modelo «${modelo}». Revisá el nombre o dejá el sugerido.`,
    };
  }
  if (estado === 429) {
    return {
      ok: false,
      titulo: "Sin cupo por ahora",
      detalle: `${label} respondió 429: la llave es válida pero llegaste al límite de uso. Probá más tarde.`,
    };
  }
  if (estado && estado >= 500) {
    return {
      ok: false,
      titulo: "El proveedor falló",
      detalle: `${label} respondió ${estado}. No es tu llave: es del lado de ellos. Probá de nuevo en un rato.`,
    };
  }
  // Sin estado HTTP: no hubo respuesta (red caída, proxy, sin llave guardada).
  return {
    ok: false,
    titulo: "No se pudo probar",
    detalle: `No hubo respuesta de ${label}. Revisá tu conexión. Detalle: ${recorte}`,
  };
}

/** Qué decir cuando la prueba anduvo. */
export function veredictoLlaveOk(provider: RemoteProvider, modelo: string): VeredictoLlave {
  return {
    ok: true,
    titulo: "Llave verificada",
    detalle: `${providerInfo(provider).label} respondió con el modelo «${modelo}».`,
  };
}
