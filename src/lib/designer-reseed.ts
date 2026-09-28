/**
 * @fileOverview ¿El lienzo debe RE-SEMBRAR su escena desde la fuente?
 *
 * El diseñador siembra sus nodos/aristas desde el grafo de la vista UNA vez por
 * fuente y luego vive de su estado interno; el autoguardado devuelve ese estado a
 * la vista. El problema (bug del constructor): cuando un escritor EXTERNO pisa la
 * vista abierta —`set_view_graph`/`handleDesignUpdate` del agente— el grafo de la
 * vista cambia pero el lienzo, ya cargado para esa misma fuente, no re-sembraba y
 * se quedaba con la escena vieja. El humano veía "no generó nada" aunque el grafo
 * SÍ había entrado (la verificación lo confirmaba).
 *
 * La clave para distinguir lo propio de lo externo es la IDENTIDAD por referencia:
 * el round-trip del autoguardado vuelve como el MISMO objeto que el lienzo emitió;
 * un reemplazo externo llega como un objeto nuevo que el lienzo nunca produjo.
 *
 * Puro a propósito (§P3): la decisión se prueba sin React; el componente sólo la
 * aplica.
 */

export interface ReseedInput {
  /** Fuente que el lienzo tiene cargada hoy (null si ninguna). */
  loadedKey: string | null;
  /** Fuente a mostrar ahora (null/"" ⇒ no hay nada que sembrar). */
  sourceKey: string | null;
  /** Grafo entrante a mostrar. La IDENTIDAD importa, no el contenido. */
  incoming: unknown;
  /** Último grafo que el propio lienzo emitió por autoguardado. */
  lastEmitted: unknown;
  /** Último grafo que el lienzo sembró. */
  lastSeeded: unknown;
}

/**
 * Re-sembrar cuando cambió la fuente O cuando el grafo entrante es uno que este
 * lienzo NO produjo (reemplazo externo). Sin fuente no se siembra nada.
 */
export function debeResembrar(input: ReseedInput): boolean {
  const { loadedKey, sourceKey, incoming, lastEmitted, lastSeeded } = input;
  if (!sourceKey) return false;

  const mismaFuente = loadedKey === sourceKey;
  // El autoguardado devuelve por referencia el mismo objeto: eso es "propio".
  const propio = incoming === lastEmitted || incoming === lastSeeded;
  return !(mismaFuente && propio);
}
