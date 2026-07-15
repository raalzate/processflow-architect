// =============================================================================
// Procedencia de la IA — describe, para la UI, QUÉ motor atenderá una petición.
//
// El arquitecto debe poder confiar en el origen antes de firmar una decisión:
// ¿salió del modelo LOCAL (offline, en su equipo) o de la NUBE (su proveedor)?
// Este módulo es lógica PURA (sin React): traduce los ajustes + estado de llaves
// a una etiqueta honesta, incluida la degradación a local cuando falta la llave.
// =============================================================================

import {
  type AiRemoteSettings,
  type KeyStatus,
  providerInfo,
} from "./remote-settings";

export interface EngineDescription {
  /** true si la petición se resolverá (al menos en parte) en el equipo local. */
  isLocal: boolean;
  /** Etiqueta corta para un badge. */
  label: string;
  /** Detalle para el tooltip (motor/proveedor o motivo del respaldo). */
  detail: string;
}

const LOCAL: EngineDescription = {
  isLocal: true,
  label: "IA local",
  detail: "LiteRT-LM · se ejecuta en tu equipo, sin conexión",
};

/**
 * Describe el motor efectivo según el modo elegido y, si se conoce, el estado
 * de las llaves. Sin llave para el proveedor, los modos remoto/híbrido caen a
 * local (igual que el router): la etiqueta lo dice en vez de mentir "nube".
 *
 * @param settings Ajustes de IA remota (modo/proveedor).
 * @param keys     Estado de llaves por proveedor (opcional; viene del main).
 *                 Si se omite, se asume configurado (mejor esfuerzo).
 */
export function describeEngine(
  settings: AiRemoteSettings,
  keys?: KeyStatus
): EngineDescription {
  if (settings.mode === "local") return LOCAL;

  const info = providerInfo(settings.provider);
  // Sólo se puede afirmar "nube" si sabemos que hay llave (o no nos dieron el
  // estado y confiamos en la configuración).
  const hasKey = keys ? !!keys[settings.provider] : true;

  if (!hasKey) {
    return {
      isLocal: true,
      label: "IA local (respaldo)",
      detail: `Sin llave para ${info.label}: se usa la IA local`,
    };
  }

  if (settings.mode === "hybrid") {
    return {
      isLocal: true, // lo ligero sigue corriendo local
      label: "IA híbrida",
      detail: `Ligero en local · complejo en ${info.label}`,
    };
  }

  // mode === "remote"
  return {
    isLocal: false,
    label: "IA en la nube",
    detail: info.label,
  };
}
