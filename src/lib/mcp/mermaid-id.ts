/**
 * @fileOverview Identificador de un elemento en la sintaxis de Mermaid. PURO.
 *
 * Mermaid no admite guiones en un id, así que la vista previa los reemplaza por
 * guiones bajos. El problema es que ESA vista previa es de donde el agente saca
 * los ids: leía `a1b2c3d4_e5f6`, lo mandaba a `update_element` y el id real era
 * `a1b2c3d4-e5f6` (con ids tipo UUID no coincidía ninguno).
 *
 * Vive en su propio módulo para que la vista previa y la resolución de ids usen
 * LA MISMA función: dos reglas para lo mismo es como nació el defecto.
 */

/** Id seguro para Mermaid (alfanumérico + guion bajo). */
export function mermaidSafeId(id: string): string {
  const s = id.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[a-zA-Z_]/.test(s) ? s : `n_${s}`;
}

/** true si el id se dibuja distinto de como se llama (y por eso hay que decirlo). */
export const idCambiaEnMermaid = (id: string): boolean => mermaidSafeId(id) !== id;
