/**
 * @fileOverview Actualizar un PROYECTO de la app con un diseño del MCP. PURO.
 *
 * `export_to_app` siempre creaba un proyecto nuevo (`useFileHandlers.ts`: el id
 * lleva un timestamp), así que rediseñar lo mismo dos veces dejaba dos proyectos
 * y el humano tenía que adivinar cuál era el bueno. Actualizar en el sitio es
 * otra cosa que reemplazar: hay trabajo del humano que NO se puede pisar.
 *
 * Qué manda cada quién al actualizar:
 *  - la ESTRUCTURA (elementos, relaciones, contenedores) la trae el diseño nuevo;
 *  - la GEOMETRÍA de lo que ya existía la conserva el proyecto: si el humano
 *    movió una caja, el layout del MCP no tiene por qué devolverla a su sitio;
 *  - las notas, hotspots y responsables se FUSIONAN (misma regla que al recibir
 *    una vista, `project-meta.ts`): son del humano tanto como del agente.
 */

import type { GraphData, GraphNode, Agregado } from "../types";
import { mergeProjectMeta } from "./project-meta";

/** Geometría que el humano puede haber movido a mano. */
type Geometria = Pick<GraphNode, "x" | "y" | "width" | "height">;

function geometriaDe(n: Geometria | undefined): Geometria | undefined {
  if (!n) return undefined;
  if (n.x === undefined && n.y === undefined && n.width === undefined && n.height === undefined) {
    return undefined;
  }
  return { x: n.x, y: n.y, width: n.width, height: n.height };
}

/** Todos los nodos del grafo (los sueltos y los de cada contenedor), por id. */
function nodosPorId(g: GraphData): Map<string, GraphNode> {
  const out = new Map<string, GraphNode>();
  for (const n of g.big_picture?.nodos ?? []) out.set(n.id, n as GraphNode);
  for (const a of g.agregados ?? []) for (const n of a.nodos ?? []) out.set(n.id, n as GraphNode);
  return out;
}

/** Contenedores por NOMBRE: es su clave en el formato (`nombre_agregado`). */
function agregadosPorNombre(g: GraphData): Map<string, Agregado> {
  return new Map((g.agregados ?? []).map((a) => [a.nombre_agregado, a]));
}

/** Aplica la geometría vieja a un nodo del diseño nuevo, si ese nodo ya existía. */
function conGeometriaPrevia<T extends GraphNode>(nodo: T, previo: GraphNode | undefined): T {
  const geo = geometriaDe(previo);
  return geo ? { ...nodo, ...geo } : nodo;
}

export interface ResultadoActualizacion {
  graph: GraphData;
  /** Qué cambió, para decírselo al humano sin que tenga que comparar a ojo. */
  resumen: { agregados: number; quitados: number; conservados: number };
}

/**
 * Funde el diseño nuevo sobre el proyecto existente. El proyecto conserva su
 * nombre: se está actualizando ESE proyecto, no renombrándolo.
 */
export function mergeProjectGraph(actual: GraphData, entrante: GraphData): ResultadoActualizacion {
  const previos = nodosPorId(actual);
  const previosAgg = agregadosPorNombre(actual);
  const entrantes = nodosPorId(entrante);

  const agregados = (entrante.agregados ?? []).map((a) => {
    const prev = previosAgg.get(a.nombre_agregado);
    const geo = geometriaDe(prev as Geometria | undefined);
    return {
      ...a,
      ...(geo ?? {}),
      nodos: (a.nodos ?? []).map((n) => conGeometriaPrevia(n as GraphNode, previos.get(n.id))),
    } as Agregado;
  });

  const base: GraphData = {
    ...entrante,
    // El proyecto es el que estaba: actualizar no es renombrar.
    nombre_proyecto: actual.nombre_proyecto,
    big_picture: {
      ...entrante.big_picture,
      nodos: (entrante.big_picture?.nodos ?? []).map((n) =>
        conGeometriaPrevia(n as GraphNode, previos.get(n.id))
      ),
    },
    agregados,
  };

  // Notas, hotspots y responsables: la misma regla que al recibir una vista.
  const conMeta = mergeProjectMeta(actual, base);
  const graph: GraphData = {
    ...base,
    big_picture: { ...base.big_picture, hotspots: conMeta.graph.big_picture.hotspots },
    responsables: conMeta.graph.responsables,
    notas: conMeta.graph.notas,
  };

  let conservados = 0;
  for (const id of entrantes.keys()) if (previos.has(id)) conservados++;
  return {
    graph,
    resumen: {
      agregados: entrantes.size - conservados,
      quitados: [...previos.keys()].filter((id) => !entrantes.has(id)).length,
      conservados,
    },
  };
}

/**
 * A qué proyecto de la app apunta una entrega. `ref` puede ser el nombre exacto
 * o `"activo"`/`"active"` para el abierto. Devuelve el nombre resuelto o lanza
 * con las opciones: entregar al proyecto equivocado se descubre tarde y a mano.
 */
export function resolveProjectRef(
  ref: string | undefined,
  estado: { activo: string | null; proyectos: string[] }
): string {
  const { activo, proyectos } = estado;
  const pedido = ref?.trim();

  if (!pedido || /^(activo|active)$/i.test(pedido)) {
    if (activo) return activo;
    throw new Error(
      `No hay un proyecto abierto en la app. Abrí uno, o pasá \`project\` con su nombre: ${lista(proyectos)}.`
    );
  }
  const exacto = proyectos.find((p) => p === pedido) ?? (activo === pedido ? activo : undefined);
  if (exacto) return exacto;

  // Sin distinguir mayúsculas: el agente escribe el nombre de memoria.
  const flexibles = proyectos.filter((p) => p.toLowerCase() === pedido.toLowerCase());
  if (flexibles.length === 1) return flexibles[0];

  throw new Error(
    `No hay un proyecto llamado "${pedido}" en la app. Los que hay: ${lista(
      proyectos
    )}. Mirá get_app_state, o exportá como proyecto NUEVO con mode="new".`
  );
}

function lista(proyectos: string[]): string {
  return proyectos.length ? proyectos.map((p) => `"${p}"`).join(", ") : "(ninguno)";
}

/**
 * A qué VISTA del proyecto activo apunta una entrega que reemplaza (issue #147).
 * Misma idea que `resolveProjectRef`, con una diferencia que importa: acá el
 * nombre lo elige el agente al exportar, así que un nombre nuevo es lo normal —
 * quien decide si eso es un alta o un error es el llamador, mirando `existe`.
 *
 * Las vistas del sistema (`builtin`) no se reemplazan: son la vista del modelo,
 * no una pestaña que el agente haya creado.
 */
export function resolveViewRef(
  nombre: string,
  vistas: { name: string; builtin?: boolean }[]
): { name: string; existe: boolean } {
  const pedido = nombre.trim();
  const candidatas = vistas.filter((v) => !v.builtin);

  const exacta = candidatas.find((v) => v.name === pedido);
  if (exacta) return { name: exacta.name, existe: true };

  // Sin distinguir mayúsculas: el agente escribe el nombre de memoria.
  const flexibles = candidatas.filter((v) => v.name.toLowerCase() === pedido.toLowerCase());
  if (flexibles.length === 1) return { name: flexibles[0].name, existe: true };

  return { name: pedido, existe: false };
}

/** Mensaje de «esa vista no está» con las que sí hay. */
export function vistaInexistente(nombre: string, vistas: { name: string; builtin?: boolean }[]): string {
  const candidatas = vistas.filter((v) => !v.builtin).map((v) => v.name);
  return `No hay una vista llamada "${nombre}" en el proyecto activo. Las que hay: ${lista(
    candidatas
  )}. Mirá get_app_state, o entregá sin \`replace\` para crear una pestaña nueva.`;
}
