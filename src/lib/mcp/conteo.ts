/**
 * @fileOverview Un solo conteo de un diagrama (PURO, #533).
 *
 * `get_diagram` contaba los contenedores (pools, carriles, agregados) como nodos;
 * `list_views` y `get_app_state` no. El mismo diagrama daba 27 en una herramienta y
 * 23 en otra, y el agente no podía saber cuál era la cifra. Ahora todas cuentan lo
 * mismo —lo que el lienzo dibuja— y el texto dice qué entra en cada número.
 */

import { countGraph, type AppState } from "./app-state";
import { toGraphData, type DiagramModel } from "./diagram-builder";

export type Conteo = AppState["counts"];

/** Conteo de un diagrama del workspace, idéntico al de la app. */
export const contarModelo = (model: DiagramModel): Conteo => countGraph(toGraphData(model));

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «3 elementos + 1 contenedor»: el contenedor no está dentro de los elementos. */
export function textoConteo(c: Conteo): string {
  const elementos = plural(c.nodes, "elemento", "elementos");
  return c.containers ? `${elementos} + ${plural(c.containers, "contenedor", "contenedores")}` : elementos;
}
