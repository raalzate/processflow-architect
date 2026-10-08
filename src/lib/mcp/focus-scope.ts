/**
 * @fileOverview Alcance del chat de la ficha: sólo la caja abierta (PURO). #462.
 *
 * El chat lanza el CLI contra `…/mcp?focus=<id de la caja>`. Con ese alcance, el
 * servidor MCP sólo deja escribir la spec de ESA caja y no deja crear diagramas
 * en el workspace. Antes «sólo esta caja» lo sostenía el prompt: el agente podía
 * reemplazar —o borrar con una spec vacía— la spec de cualquier otra caja, y
 * `get_view` con `importAs` escribía en el workspace. Un agente externo que se
 * conecta sin `?focus=` no cambia: conserva todo lo que ya tenía.
 */

/** El id de la caja que fija la URL de la petición, o null si no hay alcance. */
export function alcanceDeUrl(url: URL): string | null {
  const v = url.searchParams.get("focus");
  return v && v.trim() ? v.trim() : null;
}

/** URL del MCP con el alcance de una caja (lo que arma el chat de la ficha). */
export function urlConAlcance(base: string, elementId: string): string {
  const u = new URL(base);
  u.searchParams.set("focus", elementId);
  return u.toString();
}

/**
 * ¿Se puede escribir la spec de `name` con este alcance? Devuelve el error o
 * null. El agente del chat escribe por id (el prompt se lo pide), así que se
 * compara contra el id; un nombre que coincida con OTRA caja no pasa.
 */
export function errorDeAlcance(alcance: string | null, name: string, view: string | undefined): string | null {
  if (!alcance) return null;
  if (name.trim() !== alcance) {
    return `Este chat sólo puede escribir la spec de la caja abierta (id "${alcance}"). Pedí "${name}" y no es esa caja: llamá set_view_element_spec con name "${alcance}".`;
  }
  if (view !== undefined && view.trim() !== "") {
    return "Este chat escribe en la vista abierta: no pases `view`.";
  }
  return null;
}

export const ERROR_IMPORT_CON_ALCANCE =
  "Este chat no puede crear diagramas en el workspace: usá get_view sin importAs para leer la vista.";
