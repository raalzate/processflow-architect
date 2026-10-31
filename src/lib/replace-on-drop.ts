/**
 * @fileOverview Sustituir una caja al soltar encima un elemento de la paleta (PURO). #670.
 *
 * Soltar un tipo de la paleta SOBRE una caja del lienzo ofrece cambiarle la forma
 * y el tipo sin rehacerla: el id no cambia, así que las relaciones, la spec, los
 * metadatos y los adjuntos siguen colgados de ella. Soltar sobre un contenedor
 * sigue siendo meter el elemento adentro: eso no es una sustitución.
 */

/** La caja dibujada de un nodo, en coordenadas del lienzo (x,y = esquina sup. izq.). */
export interface CajaEnLienzo {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  contenedor: boolean;
}

/**
 * La caja (no contenedora) bajo el punto, o null. Con superpuestas gana la más
 * chica: es la que el humano ve encima y la que apuntó.
 */
export function cajaBajoPunto(p: { x: number; y: number }, cajas: Iterable<CajaEnLienzo>): string | null {
  let mejor: CajaEnLienzo | null = null;
  for (const c of cajas) {
    if (c.contenedor) continue;
    if (p.x < c.x || p.x > c.x + c.w || p.y < c.y || p.y > c.y + c.h) continue;
    if (!mejor || c.w * c.h < mejor.w * mejor.h) mejor = c;
  }
  return mejor?.id ?? null;
}

/** Lo que la sustitución toca de un nodo; el resto viaja intacto. */
export interface NodoSustituible {
  tipo_elemento: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  borderColor?: string;
  icono?: string;
}

/**
 * El nodo con el tipo nuevo, centrado donde estaba. Suelta color, borde, icono y
 * tamaño a mano: eran del aspecto del tipo viejo, y conservarlos haría que la
 * forma nueva no se vea como la de la paleta, que es lo que el humano eligió.
 */
export function sustituirTipo<N extends NodoSustituible>(
  nodo: N,
  nuevoTipo: string,
  tamNuevo: { w: number; h: number },
  tamActual: { w: number; h: number }
): N {
  const { color: _c, borderColor: _b, icono: _i, width: _w, height: _h, ...resto } = nodo;
  const cx = nodo.x + tamActual.w / 2;
  const cy = nodo.y + tamActual.h / 2;
  return {
    ...resto,
    tipo_elemento: nuevoTipo,
    x: cx - tamNuevo.w / 2,
    y: cy - tamNuevo.h / 2,
  } as N;
}
