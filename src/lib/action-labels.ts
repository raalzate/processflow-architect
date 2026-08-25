/**
 * @fileOverview Vocabulario ÚNICO de las acciones de la interfaz.
 *
 * El mismo verbo aparecía con tres nombres («Agregar», «Añadir», «Crear») y el
 * mismo botón con o sin rótulo según la pantalla. Un vocabulario disperso no es
 * un detalle de estilo: obliga al usuario a aprender tres nombres para una sola
 * acción. Acá se decide el término y de acá lo toma la UI — incluido el nombre
 * accesible del botón sólo-icono, que sale del MISMO texto que el tooltip.
 *
 * PURO: sin React. Los componentes lo consumen vía `IconAction`.
 */

/** Un verbo por acción. Si falta uno, se agrega ACÁ, no en el componente. */
export const VERBO = {
  agregar: "Agregar",
  eliminar: "Eliminar",
  limpiar: "Limpiar",
  quitar: "Quitar",
  sugerir: "Sugerir con IA",
  copiar: "Copiar",
  editar: "Editar",
  abrir: "Abrir",
  cerrar: "Cerrar",
  descargar: "Descargar",
  ayuda: "Ayuda y atajos",
} as const;

export type Verbo = keyof typeof VERBO;

/**
 * Rótulo de una acción: el verbo del vocabulario y, si aplica, sobre qué actúa
 * («Agregar vista», «Eliminar metadato»). Es el texto del tooltip Y el nombre
 * accesible: un solo string para que no puedan desincronizarse.
 */
export function accion(verbo: Verbo, sustantivo?: string): string {
  const s = sustantivo?.trim();
  return s ? `${VERBO[verbo]} ${s}` : VERBO[verbo];
}
