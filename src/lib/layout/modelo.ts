/**
 * @fileOverview Puente entre el modelo de diagrama y la medida de legibilidad (PURO).
 *
 * `metrics.ts` sólo sabe de cajas y recorridos: así se prueba con geometría de
 * juguete y no arrastra el modelo entero. Este archivo es el único que traduce
 * un `DiagramModel` ya dispuesto a esa forma, para que la métrica, el orden y el
 * ruteo hablen todos del mismo diagrama.
 */

import { isContainerType } from "../mcp/catalog";
import type { BuilderEdge, BuilderNode, DiagramModel } from "../mcp/diagram-builder";
import {
  medirLegibilidad,
  recortarABorde,
  type Caja,
  type Legibilidad,
  type Punto,
  type Relacion,
} from "./metrics";

/** Tamaño de reserva cuando un nodo llega sin geometría (no debería pasar tras `layout()`). */
const CAJA_MINIMA = { w: 160, h: 90 };

/** Id estable de una relación: el índice en el modelo. Dos aristas entre el mismo
 * par son relaciones distintas y tienen que poder rutearse por separado. */
export const idDeRelacion = (i: number): string => `e${i}`;

/**
 * Clave con la que el LIENZO reconoce una relación. El índice del modelo no
 * sirve fuera de él: el lienzo identifica sus enlaces con un id aleatorio y el
 * viaje por `GraphData` reparte las aristas en tres listas, así que el orden
 * cambia. Lo que sobrevive es el par de extremos y, entre repetidas, su turno.
 */
export const claveDeRelacion = (fuente: string, destino: string, turno: number): string =>
  `${fuente}|${destino}|${turno}`;

/** Claves de lienzo del modelo, en el orden de sus aristas. */
export function clavesDeRelacion(model: DiagramModel): string[] {
  const turnos = new Map<string, number>();
  return model.edges.map((e) => {
    const par = `${e.fuente}|${e.destino}`;
    const turno = turnos.get(par) ?? 0;
    turnos.set(par, turno + 1);
    return claveDeRelacion(e.fuente, e.destino, turno);
  });
}

export function cajasDelModelo(model: DiagramModel): Caja[] {
  const nombresContenedor = new Map<string, string>();
  for (const n of model.nodes) if (isContainerType(n.tipo_elemento)) nombresContenedor.set(n.nombre, n.id);

  return model.nodes
    .filter((n) => typeof n.x === "number" && typeof n.y === "number")
    .map((n) => ({
      id: n.id,
      x: n.x!,
      y: n.y!,
      width: n.width ?? CAJA_MINIMA.w,
      height: n.height ?? CAJA_MINIMA.h,
      container: n.container ? nombresContenedor.get(n.container) : undefined,
      esContenedor: isContainerType(n.tipo_elemento),
    }));
}

/**
 * Relaciones del modelo con su recorrido. `rutas` trae los QUIEBRES que calculó
 * el ruteo (sin extremos, que es como los guarda el lienzo): aquí se completan
 * con las puntas recortadas al borde de cada caja, que es el trazo que se
 * dibuja. Sin quiebres, la relación se mide como la recta entre bordes.
 */
export function relacionesDelModelo(
  model: DiagramModel,
  rutas?: Map<string, Punto[]>
): Relacion[] {
  const cajas = new Map(cajasDelModelo(model).map((c) => [c.id, c]));
  return model.edges.map((e: BuilderEdge, i) => {
    const id = idDeRelacion(i);
    const quiebres = rutas?.get(id);
    const fuente = cajas.get(e.fuente);
    const destino = cajas.get(e.destino);
    const puntos =
      quiebres?.length && fuente && destino
        ? [
            recortarABorde(fuente, quiebres[0]),
            ...quiebres,
            recortarABorde(destino, quiebres[quiebres.length - 1]),
          ]
        : undefined;
    return { id, fuente: e.fuente, destino: e.destino, puntos };
  });
}

/** Medida de legibilidad de un modelo ya dispuesto. */
export function medirModelo(model: DiagramModel, rutas?: Map<string, Punto[]>): Legibilidad {
  return medirLegibilidad(cajasDelModelo(model), relacionesDelModelo(model, rutas));
}

/** Aplica al modelo las cajas permutadas por el ordenador de capas. */
export function aplicarCajas(model: DiagramModel, cajas: Caja[]): DiagramModel {
  const porId = new Map(cajas.map((c) => [c.id, c]));
  const nodes = model.nodes.map((n: BuilderNode) => {
    const c = porId.get(n.id);
    return c ? { ...n, x: c.x, y: c.y } : n;
  });
  return { ...model, nodes };
}
