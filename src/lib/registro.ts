/**
 * @fileOverview Consultar un registro con una clave que viene de afuera (PURO).
 *
 * `in` y el acceso por clave sobre un objeto literal VEN LA CADENA DE
 * PROTOTIPOS. Un `Record<string, X>` usado como tabla de búsqueda contra
 * entrada externa —una tecla, un campo guardado, algo que mandó un agente—
 * acepta `toString`, `constructor`, `valueOf` y `hasOwnProperty` como si fueran
 * claves propias, y devuelve una función en vez de `undefined`.
 *
 * Pasó dos veces en la misma sesión, en módulos que no se conocen entre sí
 * (`canvas-nudge.ts` y `sequence/messages.ts`, issue #282). Los registros son el
 * patrón central del repo —`EDGE_RELATIONS`, `ALL_ELEMENTS`, `NOTATION_HELP`,
 * `SEQUENCE_MESSAGES`— y todos se consultan con datos de afuera, así que la
 * comprobación vive acá una sola vez y la regla REGISTRO del lint manda a este
 * módulo a quien vuelva a escribir `in`.
 */

/** Un registro: tabla de búsqueda por clave de texto. */
export type Registro<V> = Readonly<Record<string, V>>;

/**
 * `true` sólo si `clave` es una clave PROPIA de `registro`.
 *
 * Acepta `unknown` a propósito: lo que llega de una tecla, del disco o del MCP
 * no está tipado, y forzar el `typeof` en cada llamador es justamente el
 * descuido que abre el agujero.
 */
export function enRegistro<V>(registro: Registro<V>, clave: unknown): clave is string {
  return typeof clave === "string" && Object.prototype.hasOwnProperty.call(registro, clave);
}

/**
 * El valor de `clave`, o `undefined` si no es una clave propia.
 *
 * Es el acceso que se quería escribir como `REGISTRO[k]`: mismo resultado para
 * una clave real, y `undefined` —no `Object.prototype.toString`— para
 * `"toString"`.
 */
export function deRegistro<V>(registro: Registro<V>, clave: unknown): V | undefined {
  return enRegistro(registro, clave) ? registro[clave] : undefined;
}

/**
 * Las claves propias de un registro. Envoltorio de `Object.keys` que existe
 * para que el llamador no tenga que recordar la diferencia con `for…in`.
 */
export function clavesDe<V>(registro: Registro<V>): string[] {
  return Object.keys(registro);
}
