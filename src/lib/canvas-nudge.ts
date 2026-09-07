/**
 * @fileOverview Mover lo seleccionado con el teclado: cuánto y hacia dónde.
 *
 * El lienzo se movía sólo con el mouse, y el ajuste fino —alinear dos cajas a
 * la misma altura, separar una caja de su vecina por unos píxeles— salía en
 * varios intentos (#257). Con las flechas hay dos pasos: uno grueso, alineado
 * a la cuadrícula, y uno fino de 1 px con `Shift`. Es el mismo trato que ya da
 * el tirador de ancho de la paleta, así que no hay una convención nueva que
 * aprender.
 *
 * Vive acá —lógica pura, con pruebas— porque la decisión es «cuánto se mueve
 * una flecha», no «cómo se pinta»: el componente sólo aplica el delta.
 */

/** Paso fino, en unidades del lienzo. Es el ajuste que el mouse no da. */
export const NUDGE_FINE = 1;

/** Desplazamiento a aplicar, en unidades del lienzo (las del `viewBox`). */
export interface Nudge {
  dx: number;
  dy: number;
}

/** Modificadores del evento que importan para el paso. */
export interface NudgeModifiers {
  /** `Shift` → paso fino. */
  shiftKey?: boolean;
}

/**
 * Las cuatro flechas y su dirección unitaria.
 *
 * Es un `Map` y no un objeto literal a propósito: con un objeto, `in` y el
 * acceso por clave ven la cadena de prototipos, así que `"toString"` pasaba
 * por tecla de movimiento y devolvía basura en vez de `null`.
 */
const DIRECCIONES: ReadonlyMap<string, Nudge> = new Map<string, Nudge>([
  ["ArrowLeft", { dx: -1, dy: 0 }],
  ["ArrowRight", { dx: 1, dy: 0 }],
  ["ArrowUp", { dx: 0, dy: -1 }],
  ["ArrowDown", { dx: 0, dy: 1 }],
]);

/** ¿Esta tecla mueve algo? Lo pregunta el handler antes de `preventDefault`. */
export function isNudgeKey(key: string): boolean {
  return DIRECCIONES.has(key);
}

/**
 * El desplazamiento de una tecla, o `null` si esa tecla no mueve nada.
 *
 * `grid` es el paso grueso (la cuadrícula del lienzo). Un `grid` que no sirve
 * —0, negativo, no finito— cae al paso fino en vez de dejar la flecha muerta:
 * que el paso salga chico se ve y se corrige; que la tecla no haga nada, no.
 */
export function nudgeForKey(
  key: string,
  mods: NudgeModifiers,
  grid: number
): Nudge | null {
  const dir = DIRECCIONES.get(key);
  if (!dir) return null;
  const paso = mods.shiftKey ? NUDGE_FINE : pasoGrueso(grid);
  return { dx: dir.dx * paso, dy: dir.dy * paso };
}

/** El paso grueso utilizable a partir de la cuadrícula declarada. */
function pasoGrueso(grid: number): number {
  if (!Number.isFinite(grid) || grid <= 0) return NUDGE_FINE;
  return Math.round(grid);
}
