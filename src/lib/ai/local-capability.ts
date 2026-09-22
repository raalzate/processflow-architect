/**
 * @fileOverview ¿Se puede usar la IA local en ESTE equipo? (PURO)
 *
 * El motor local es LiteRT-LM sobre **WebGPU**. Sin WebGPU no arranca, y eso pasa
 * de verdad: un Windows con driver viejo, sin soporte D3D12, o una sesión de
 * escritorio remoto. Antes la app se quedaba colgada en la pantalla de carga con
 * un spinner eterno (#202): perdía el diseñador, el merger, el MCP y la IA de
 * nube —que no necesitan GPU— por una capacidad opcional.
 *
 * La regla es: **la ausencia de la IA local degrada, no bloquea**. Acá se decide
 * qué estado tiene el motor, qué se puede usar con él y qué se le dice al usuario;
 * la UI sólo pinta y el router sólo consulta.
 *
 * `desconocido` es un estado de verdad, no un placeholder: hasta que alguien
 * pregunte por el adaptador WebGPU, nadie puede afirmar que la IA local sirve.
 */

import type { AiMode } from "@/lib/ai/remote-settings";

export type EstadoIaLocal = "desconocido" | "disponible" | "sin-webgpu" | "sin-electron";

/** Lo que se sabe del entorno cuando se razona el estado. */
export interface EntornoLocal {
  /** ¿Corre dentro de Electron (hay puente `electronAPI`)? */
  enElectron: boolean;
  /** ¿Hay adaptador WebGPU? `null` = todavía no se preguntó. */
  webgpu: boolean | null;
}

/** El estado del motor local según el entorno. */
export function razonarEstadoLocal({ enElectron, webgpu }: EntornoLocal): EstadoIaLocal {
  // El orden importa: en el navegador (docs, dev sin Electron) no hay motor local
  // aunque la GPU sea excelente, y culpar a la GPU sería mentir.
  if (!enElectron) return "sin-electron";
  if (webgpu === null) return "desconocido";
  return webgpu ? "disponible" : "sin-webgpu";
}

/** ¿Se puede pedir una generación al motor local? */
export const puedeUsarIaLocal = (estado: EstadoIaLocal): boolean => estado === "disponible";

/** Aviso para el usuario: qué pasa y qué puede hacer. */
export interface AvisoIaLocal {
  titulo: string;
  detalle: string;
  /**
   * ¿El aviso se queda hasta que lo cierren? Sólo cuando el equipo se queda
   * SIN ninguna IA: ahí es una limitación, no un evento. Si la nube cubre el
   * hueco, el aviso es informativo y se va solo.
   */
  persistente: boolean;
}

/** Lo que la nube aporta en este equipo, para saber si el hueco local importa. */
export interface CoberturaNube {
  modo: AiMode;
  /** ¿Hay llave guardada para el proveedor elegido? */
  conLlave: boolean;
}

/**
 * Qué avisar. Devuelve `undefined` cuando no hay nada que decir.
 *
 * El silencio importa tanto como el aviso: en modo `remote` con llave, el motor
 * local no se iba a usar igual, así que avisar de su ausencia es ruido sobre una
 * capacidad que el usuario ya decidió no usar (#374). En `hybrid` sí se avisa
 * —las tareas ligeras cambian de destino— pero sin quedarse pegado.
 */
export function mensajeIaLocal(
  estado: EstadoIaLocal,
  { modo, conLlave }: CoberturaNube
): AvisoIaLocal | undefined {
  if (estado === "disponible" || estado === "desconocido") return undefined;
  // La nube atiende TODO: no hay hueco que avisar.
  if (modo === "remote" && conLlave) return undefined;

  const nubeLista = modo !== "local" && conLlave;
  const salida = nubeLista
    ? "Estás en modo híbrido: las sugerencias ligeras también irán a tu proveedor de nube."
    : modo !== "local"
      ? "Elegiste un proveedor de nube pero todavía no hay llave: agregala en Ajustes."
      : "Si querés sugerencias, activá un proveedor de IA en la nube en Ajustes (con tu propia llave).";
  const persistente = !nubeLista;

  if (estado === "sin-webgpu") {
    return {
      titulo: "IA local no disponible",
      detalle: `Este equipo no expone WebGPU, que es lo que necesita el motor local (LiteRT-LM). Podés seguir usando todo lo demás: dibujar y editar diagramas en el lienzo, importar, exportar y el servidor MCP. ${salida}`,
      persistente,
    };
  }
  return {
    titulo: "IA local no disponible",
    detalle: `El motor local sólo corre dentro de la aplicación de escritorio. ${salida}`,
    persistente,
  };
}

// --- Estado publicado -------------------------------------------------------
//
// Lo escribe UNA vez el renderer al arrancar (después de preguntar por el
// adaptador) y lo leen el router y la UI. Es un módulo y no un contexto de React
// a propósito: `providers.ts` no es un componente y no puede usar hooks.

let estado: EstadoIaLocal = "desconocido";

/** El estado conocido del motor local. */
export const estadoIaLocal = (): EstadoIaLocal => estado;

/** Publica el estado (lo hace el renderer al arrancar). */
export function publicarEstadoIaLocal(nuevo: EstadoIaLocal): void {
  estado = nuevo;
}

/** Vuelve a `desconocido`. Para las pruebas y para reintentar la detección. */
export function resetEstadoIaLocal(): void {
  estado = "desconocido";
}
