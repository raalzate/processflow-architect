/**
 * @fileOverview CONSULTAS deterministas sobre el grafo de una vista (PURO).
 * Feature 015, T6 (#342).
 *
 * En modo editor el agente no explora: no lee el diagrama entero para razonar
 * sobre él —con el motor local eso son turnos que no sobran (#332)—. Pregunta
 * lo que necesita para armar UNA llamada: «cuál es el elemento que se llama
 * Controlador», «qué relación hay entre A y B». Y si la pregunta no tiene una
 * sola respuesta, el resultado lo dice (`varios`) para que el agente le
 * pregunte al humano con opciones concretas en vez de elegir por él (FR-010).
 *
 * Las comparaciones son por NOMBRE normalizado (sin acentos, sin mayúsculas):
 * el humano escribe «controlador» y la caja se llama «Controlador».
 */

import type { GraphData, GraphLink, GraphNode } from "../types";
import { plano } from "./tipo-notacion";

/** Respuesta de una consulta: una, varias o ninguna. Nunca «la primera». */
export type Resultado<T> =
  | { kind: "uno"; valor: T }
  | { kind: "varios"; opciones: T[] }
  | { kind: "ninguno" };

/** Un elemento del grafo, con el contenedor donde vive (vacío = suelto). */
export interface ElementoRef {
  id: string;
  nombre: string;
  tipo_elemento: string;
  /** Nombre del contenedor (`nombre_agregado`), o "" si está en el big picture. */
  container: string;
}

/** Una relación del grafo, y si se encontró en el sentido contrario al preguntado. */
export interface RelacionRef {
  fuente: string;
  destino: string;
  descripcion?: string;
  /** true → la relación existe, pero de destino a fuente respecto de lo preguntado. */
  invertida: boolean;
}

const resultado = <T>(hallados: T[]): Resultado<T> =>
  hallados.length === 1
    ? { kind: "uno", valor: hallados[0] }
    : hallados.length > 1
      ? { kind: "varios", opciones: hallados }
      : { kind: "ninguno" };

/** Todos los elementos del grafo: los sueltos y los de cada contenedor. */
export function elementos(graph: GraphData): ElementoRef[] {
  const out: ElementoRef[] = [];
  for (const n of graph.big_picture?.nodos ?? []) {
    out.push({ id: n.id, nombre: n.nombre, tipo_elemento: n.tipo_elemento, container: "" });
  }
  for (const a of graph.agregados ?? []) {
    for (const n of a.nodos ?? []) {
      out.push({
        id: n.id,
        nombre: n.nombre,
        tipo_elemento: n.tipo_elemento,
        container: a.nombre_agregado,
      });
    }
  }
  return out;
}

/** Los CONTENEDORES del grafo, como elementos (su id es su nombre: así los indexa el formato). */
export function contenedores(graph: GraphData): ElementoRef[] {
  return (graph.agregados ?? []).map((a) => ({
    id: a.nombre_agregado,
    nombre: a.nombre_agregado,
    tipo_elemento: a.tipo_contenedor ?? "",
    container: "",
  }));
}

/** Todas las aristas del grafo (del big picture, de cada contenedor y las que cruzan). */
export function relaciones(graph: GraphData): Omit<GraphLink, "tipo" | "source" | "target">[] {
  return [
    ...(graph.big_picture?.aristas ?? []),
    ...(graph.agregados ?? []).flatMap((a) => a.aristas ?? []),
    ...(graph.politicas_inter_agregados ?? []),
  ];
}

/**
 * El elemento que se llama así. Busca también entre los contenedores: para el
 * humano que pide «borrá Pedidos» un agregado es un elemento más.
 */
export function elementoPorNombre(graph: GraphData, nombre: string): Resultado<ElementoRef> {
  const buscado = plano(nombre ?? "");
  if (!buscado) return { kind: "ninguno" };
  const todos = [...elementos(graph), ...contenedores(graph)];
  const porNombre = todos.filter((e) => plano(e.nombre) === buscado);
  if (porNombre.length) return resultado(porNombre);
  // El agente también copia ids de una lectura previa: que un id exacto resuelva
  // evita un «no existe» absurdo sobre algo que acaba de leer.
  return resultado(todos.filter((e) => e.id === nombre.trim()));
}

/** Los elementos de un tipo (el tipo se compara igual que el nombre: sin acentos ni mayúsculas). */
export function elementosPorTipo(graph: GraphData, tipo: string): Resultado<ElementoRef> {
  const buscado = plano(tipo ?? "");
  if (!buscado) return { kind: "ninguno" };
  const todos = [...elementos(graph), ...contenedores(graph)];
  return resultado(todos.filter((e) => plano(e.tipo_elemento) === buscado));
}

/**
 * La relación entre dos elementos nombrados. Encuentra también la que está al
 * revés de como la nombró el humano —«invertí la flecha entre A y B» no sabe en
 * qué sentido está dibujada— y lo declara en `invertida`.
 */
export function relacionEntre(graph: GraphData, a: string, b: string): Resultado<RelacionRef> {
  const ea = elementoPorNombre(graph, a);
  const eb = elementoPorNombre(graph, b);
  if (ea.kind !== "uno" || eb.kind !== "uno") return { kind: "ninguno" };
  const idA = ea.valor.id;
  const idB = eb.valor.id;
  const hallados = relaciones(graph)
    .filter((e) => (e.fuente === idA && e.destino === idB) || (e.fuente === idB && e.destino === idA))
    .map((e) => ({
      fuente: e.fuente,
      destino: e.destino,
      descripcion: e.descripcion,
      invertida: e.fuente === idB && idA !== idB,
    }));
  return resultado(hallados);
}

/** Nombre de un elemento por id (para hablarle al humano de cajas, no de ids). */
export function nombreDe(graph: GraphData, id: string): string {
  return [...elementos(graph), ...contenedores(graph)].find((e) => e.id === id)?.nombre ?? id;
}

/** Los nodos del grafo tal cual (sin la vista `ElementoRef`), por id. */
export function nodosPorId(graph: GraphData): Map<string, Omit<GraphNode, "agregado">> {
  const out = new Map<string, Omit<GraphNode, "agregado">>();
  for (const n of graph.big_picture?.nodos ?? []) out.set(n.id, n);
  for (const a of graph.agregados ?? []) for (const n of a.nodos ?? []) out.set(n.id, n);
  return out;
}
