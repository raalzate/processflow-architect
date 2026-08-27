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
import { puedeUsarIaLocal, type EstadoIaLocal } from "./local-capability";

export interface EngineDescription {
  /**
   * ¿Hay ALGÚN motor que pueda atender la petición? `false` cuando el equipo no
   * puede con la IA local (sin WebGPU) y tampoco hay nube configurada: la UI
   * deshabilita lo que dependa de IA en vez de dejar que falle al pulsarlo (#202).
   */
  available: boolean;
  /** true si la petición se resolverá (al menos en parte) en el equipo local. */
  isLocal: boolean;
  /** Etiqueta corta para un badge. */
  label: string;
  /** Detalle para el tooltip (motor/proveedor o motivo del respaldo). */
  detail: string;
}

const LOCAL: EngineDescription = {
  available: true,
  isLocal: true,
  label: "IA local",
  detail: "LiteRT-LM · se ejecuta en tu equipo, sin conexión",
};

/** Lo que se sabe del motor local (ver `local-capability.ts`). */
export interface ContextoLocal {
  estadoLocal: EstadoIaLocal;
}

/** No hay motor: ni local (el equipo no puede) ni nube (no hay llave). */
const sinIa = (motivo: string): EngineDescription => ({
  available: false,
  isLocal: false,
  label: "Sin IA",
  detail: motivo,
});

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
  keys?: KeyStatus,
  /**
   * Estado del motor local. Omitido = se asume que sirve (es lo que valía antes
   * de que existiera la detección, y lo que quieren las pruebas viejas).
   */
  ctx?: ContextoLocal
): EngineDescription {
  // Un equipo sin WebGPU no tiene motor local: decir "IA local" ahí sería
  // prometer algo que va a fallar al pulsarlo.
  const hayLocal = ctx ? puedeUsarIaLocal(ctx.estadoLocal) : true;
  const motivoSinLocal =
    ctx?.estadoLocal === "sin-webgpu"
      ? "Este equipo no expone WebGPU, que es lo que necesita el motor local (LiteRT-LM)."
      : "El motor local sólo corre dentro de la aplicación de escritorio.";

  if (settings.mode === "local") {
    return hayLocal ? LOCAL : sinIa(`${motivoSinLocal} Activá un proveedor de nube en Ajustes si querés sugerencias.`);
  }

  const info = providerInfo(settings.provider);
  // Sólo se puede afirmar "nube" si sabemos que hay llave (o no nos dieron el
  // estado y confiamos en la configuración).
  const hasKey = keys ? !!keys[settings.provider] : true;

  if (!hasKey) {
    // Sin llave el router cae a local… salvo que este equipo tampoco pueda: ahí
    // no hay respaldo que ofrecer, y decirlo es más útil que inventarlo.
    if (!hayLocal) return sinIa(`Sin llave para ${info.label} y sin motor local. ${motivoSinLocal}`);
    return {
      available: true,
      isLocal: true,
      label: "IA local (respaldo)",
      detail: `Sin llave para ${info.label}: se usa la IA local`,
    };
  }

  if (settings.mode === "hybrid") {
    // Sin motor local el híbrido es remoto entero: lo ligero también sube.
    if (!hayLocal) {
      return {
        available: true,
        isLocal: false,
        label: "IA en la nube",
        detail: `Todo en ${info.label}: este equipo no tiene motor local`,
      };
    }
    return {
      available: true,
      isLocal: true, // lo ligero sigue corriendo local
      label: "IA híbrida",
      detail: `Ligero en local · complejo en ${info.label}`,
    };
  }

  // mode === "remote"
  return {
    available: true,
    isLocal: false,
    label: "IA en la nube",
    detail: info.label,
  };
}
