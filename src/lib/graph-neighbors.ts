/**
 * @fileOverview Vecindario de lo seleccionado: con quién habla una caja.
 *
 * Seleccionar resaltaba SÓLO la caja elegida, así que para ver con qué se
 * relaciona había que seguir las líneas a ojo —y en un diagrama grande eso no
 * se puede (#256). Acá se calcula qué queda «emparentado» con la selección;
 * el componente sólo lo pinta.
 *
 * Alcance deliberado: **un salto** y **sin dirección**. Toda la cadena
 * alcanzable termina siendo el diagrama entero, que no resalta nada, y
 * distinguir entrante de saliente pide un tercer color que todavía no hace
 * falta. La contención (`container`) NO cuenta: emparentado es hablarse por
 * una arista, no estar dentro de la misma banda.
 */

/** Lo mínimo que se necesita de una arista para saber a quién une. */
export interface NeighborEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

/** Lo que queda resaltado además de la selección. */
export interface Neighborhood {
  /** Nodos al otro extremo de una arista de la selección. */
  nodes: ReadonlySet<string>;
  /** Aristas con al menos una punta en la selección. */
  edges: ReadonlySet<string>;
}

const VACIO: Neighborhood = { nodes: new Set(), edges: new Set() };

/**
 * El vecindario a un salto de `selected`.
 *
 * Vale seleccionar una ARISTA: sus emparentados son las dos puntas que une.
 *
 * Un id de la propia selección **no** vuelve como vecino: ya tiene su resalte
 * de seleccionado, y pintarlo dos veces haría que el resalte de vecino
 * pareciera selección. Por eso un ciclo entre dos cajas seleccionadas devuelve
 * la arista (une la selección) pero ningún nodo.
 */
export function neighborhoodOf(
  selected: ReadonlySet<string>,
  edges: Iterable<NeighborEdge>
): Neighborhood {
  if (selected.size === 0) return VACIO;
  const nodes = new Set<string>();
  const ids = new Set<string>();
  for (const e of edges) {
    const desdeSel = selected.has(e.sourceId);
    const haciaSel = selected.has(e.targetId);
    // La arista misma puede ser lo seleccionado: entonces los emparentados son
    // sus dos puntas (es la pregunta «¿qué une esta flecha?»).
    if (selected.has(e.id)) {
      if (!desdeSel) nodes.add(e.sourceId);
      if (!haciaSel) nodes.add(e.targetId);
      continue; // no se resalta a sí misma: ya está seleccionada
    }
    if (!desdeSel && !haciaSel) continue;
    ids.add(e.id);
    // Un auto-enlace (misma punta) no agrega vecino: no hay otro extremo.
    if (desdeSel && !haciaSel) nodes.add(e.targetId);
    if (haciaSel && !desdeSel) nodes.add(e.sourceId);
  }
  return { nodes, edges: ids };
}
