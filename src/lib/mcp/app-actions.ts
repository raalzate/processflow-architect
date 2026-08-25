/**
 * @fileOverview ACCIONES de la app pedidas por MCP (PURO).
 *
 * `app-state.ts` dice qué hay, `app-read.ts` dice qué contiene. Esto CAMBIA
 * algo: hasta ahora el agente podía crear pestañas (`export_as_view`) y no
 * recoger lo que ensuciaba —ni siquiera lo que acababa de crear él mismo—, así
 * que un duplicado sólo lo limpiaba el humano a mano (issue #150).
 *
 * Una baja es destructiva sobre el trabajo del humano, así que la regla es
 * estrecha a propósito: nombre exacto (con la misma resolución que usa
 * `export_as_view --replace`), nunca por coincidencia parcial, nunca «todas», y
 * jamás una vista del sistema. Si no hay a qué apuntar, no se borra nada y se
 * contesta con las opciones.
 *
 * La petición viaja main → renderer y la respuesta vuelve por el mismo canal:
 * el agente necesita saber si ocurrió, no suponerlo.
 */

import { resolveViewRef, vistaInexistente } from "./project-update";

export type AppActionRequest =
  | { kind: "delete-view"; name: string }
  | { kind: "rename-view"; name: string; newName: string };

export type AppActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Vista tal como la conoce el renderer para resolver una acción. */
export interface VistaConocida {
  id: string;
  name: string;
  builtin?: boolean;
}

/**
 * Decide qué vista toca una acción, sin ejecutarla. Devuelve el id a operar o el
 * motivo por el que no se hace nada. El renderer aplica; acá está la regla.
 */
export function planAppAction(
  request: AppActionRequest,
  vistas: VistaConocida[]
): { ok: true; id: string; name: string } | { ok: false; error: string } {
  const ref = resolveViewRef(request.name, vistas);
  if (!ref.existe) return { ok: false, error: vistaInexistente(request.name, vistas) };

  const vista = vistas.find((v) => !v.builtin && v.name === ref.name);
  if (!vista) return { ok: false, error: vistaInexistente(request.name, vistas) };

  if (request.kind === "rename-view") {
    const nuevo = request.newName?.trim();
    if (!nuevo) return { ok: false, error: "El nombre nuevo no puede estar vacío." };
    if (nuevo === vista.name) {
      return { ok: false, error: `La vista ya se llama "${nuevo}": no hay nada que cambiar.` };
    }
    // Dos pestañas con el mismo nombre es el problema que se está arreglando, no
    // una forma de crearlo desde otro lado.
    const chocado = vistas.find((v) => v.id !== vista.id && v.name.toLowerCase() === nuevo.toLowerCase());
    if (chocado) {
      return { ok: false, error: `Ya hay una vista llamada "${chocado.name}". Elegí otro nombre.` };
    }
  }

  return { ok: true, id: vista.id, name: vista.name };
}

/** Frase de cierre: qué se hizo y cuánto cupo queda (para no volver a preguntar). */
export function describeAccion(
  request: AppActionRequest,
  nombre: string,
  restantes: number,
  cupo: number
): string {
  const cola = `Vistas propias: ${restantes} de ${cupo}.`;
  return request.kind === "delete-view"
    ? `Vista "${nombre}" eliminada del proyecto activo. ${cola}`
    : `Vista "${nombre}" renombrada a "${(request as { newName: string }).newName.trim()}". ${cola}`;
}
