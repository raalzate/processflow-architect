/**
 * @fileOverview Conjunto de diagramas de REFERENCIA de la legibilidad (feature 017).
 *
 * Son la topología —anonimizada— de los seis diagramas reales del proyecto
 * (`.processflow/diagrams/`): mismos nodos, mismos tipos, mismas bandas y
 * mismas relaciones, con los nombres del cliente y de sus sistemas sustituidos
 * (D4 · el repositorio es público). La medida sólo depende de la topología y de
 * los tipos, así que anonimizar no cambia un solo número.
 *
 * `hoy` es la LÍNEA BASE medida con `metrics.ts` sobre la disposición actual del
 * producto, ejecutando el mismo camino que corre en producción. No es la del
 * prototipo del spec (16 cruces / 22 sobre caja): aquél contaba también el
 * solape colineal como cruce y medía desde el centro de la caja, no desde el
 * borde. `limiteSpec` conserva los topes por diagrama que fijó el spec (TS-003).
 */

import type { DiagramModel } from "../../../mcp/diagram-builder";

import cobranza from "./cobranza-y-aplicacion-de-pagos.json";
import bigPicture from "./geiser-big-picture-del-dominio.json";
import enrollment from "./geiser-enrollment-y-emision-en-amigos.json";
import paisaje from "./geiser-paisaje-de-sistemas.json";
import tooltip from "./prueba-tooltip.json";
import venta from "./venta-y-underwriting-en-eva.json";

export interface Medida {
  cruces: number;
  sobreCaja: number;
}

export interface FixtureTopologia {
  id: string;
  /** Modelo sin geometría: cada prueba lo dispone como necesite. */
  modelo: () => DiagramModel;
  /** Línea base: lo que mide la disposición de hoy. */
  hoy: Medida;
  /** Tope por diagrama declarado en el spec (TS-003). */
  limiteSpec: Medida;
}

const crudos = [
  { fx: cobranza, hoy: { cruces: 0, sobreCaja: 4 }, limiteSpec: { cruces: 1, sobreCaja: 4 } },
  { fx: bigPicture, hoy: { cruces: 3, sobreCaja: 6 }, limiteSpec: { cruces: 8, sobreCaja: 10 } },
  { fx: enrollment, hoy: { cruces: 3, sobreCaja: 4 }, limiteSpec: { cruces: 4, sobreCaja: 5 } },
  { fx: paisaje, hoy: { cruces: 3, sobreCaja: 2 }, limiteSpec: { cruces: 3, sobreCaja: 2 } },
  { fx: tooltip, hoy: { cruces: 0, sobreCaja: 0 }, limiteSpec: { cruces: 0, sobreCaja: 0 } },
  { fx: venta, hoy: { cruces: 0, sobreCaja: 1 }, limiteSpec: { cruces: 0, sobreCaja: 1 } },
];

export const FIXTURES: FixtureTopologia[] = crudos.map(({ fx, hoy, limiteSpec }) => ({
  id: fx.id,
  modelo: () =>
    ({
      meta: { ...fx.meta },
      nodes: fx.nodes.map((n) => ({ ...n })),
      edges: fx.edges.map((e) => ({ ...e })),
    }) as DiagramModel,
  hoy,
  limiteSpec,
}));

/** Relaciones del conjunto: el 108 de la línea base del spec. */
export const RELACIONES_DE_REFERENCIA = FIXTURES.reduce((t, f) => t + f.modelo().edges.length, 0);

/** Suma de la línea base de hoy. */
export const LINEA_BASE: Medida = FIXTURES.reduce(
  (t, f) => ({ cruces: t.cruces + f.hoy.cruces, sobreCaja: t.sobreCaja + f.hoy.sobreCaja }),
  { cruces: 0, sobreCaja: 0 }
);

/** Objetivo de SC-001 para el conjunto entero. */
export const OBJETIVO: Medida = { cruces: 6, sobreCaja: 2 };
