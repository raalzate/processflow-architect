/**
 * @fileOverview Conjunto de diagramas de REFERENCIA de la legibilidad (feature 017).
 *
 * Son la topología —anonimizada— de los seis diagramas reales del proyecto
 * (`.processflow/diagrams/`): mismos nodos, mismos tipos, mismas bandas y
 * mismas relaciones, con los nombres del cliente y de sus sistemas sustituidos
 * (D4 · el repositorio es público). La medida sólo depende de la topología y de
 * los tipos, así que anonimizar no cambia un solo número.
 *
 * `hoy` es la LÍNEA BASE medida con `metrics.ts` sobre la disposición que el
 * producto daba ANTES de esta feature (ver `estrategiaBase`). No es la del
 * prototipo del spec (16 cruces / 22 sobre caja): aquél contaba también el
 * solape colineal como cruce y medía desde el centro de la caja, no desde el
 * borde. `limiteSpec` conserva los topes por diagrama que fijó el spec (TS-003).
 */

import type { DiagramModel } from "../../../mcp/diagram-builder";
import type { LayoutStrategy } from "../../../mcp/layout-presets";

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
  /** Línea base: lo que medía la disposición ANTES de la feature 017. */
  hoy: Medida;
  /**
   * Estrategia con la que se tomó esa línea base, cuando no es la de hoy. DDD
   * nacía `radial` y pasó a `flujo` al medirlo con la feature entera (#387): la
   * línea base tiene que seguir siendo la de antes, o el "no empeorar" de SC-002
   * se compararía contra un punto de partida más flojo.
   */
  estrategiaBase?: LayoutStrategy;
  /** Tope por diagrama declarado en el spec (TS-003). */
  limiteSpec: Medida;
  /**
   * Lo que el producto logra HOY en este diagrama. Es un trinquete: el objetivo
   * del spec (≤6 y ≤2 en total) ya quedó muy atrás, y sin este número nada
   * impediría volver a él sin que el gate dijera nada.
   */
  logrado: Medida;
}

interface Crudo {
  fx: { id: string; meta: DiagramModel["meta"]; nodes: DiagramModel["nodes"]; edges: DiagramModel["edges"] };
  hoy: Medida;
  estrategiaBase?: LayoutStrategy;
  limiteSpec: Medida;
  logrado: Medida;
}

// El JSON del fixture llega sin tipar (`resolveJsonModule`): se valida al
// construir el modelo, que es donde el compilador puede decir algo útil.
const crudos: Crudo[] = ([

  { fx: cobranza, hoy: { cruces: 0, sobreCaja: 4 }, limiteSpec: { cruces: 1, sobreCaja: 4 }, logrado: { cruces: 0, sobreCaja: 0 } },
  {
    fx: bigPicture,
    hoy: { cruces: 3, sobreCaja: 6 },
    estrategiaBase: "radial" as LayoutStrategy,
    limiteSpec: { cruces: 8, sobreCaja: 10 },
    logrado: { cruces: 0, sobreCaja: 0 },
  },
  { fx: enrollment, hoy: { cruces: 3, sobreCaja: 4 }, limiteSpec: { cruces: 4, sobreCaja: 5 }, logrado: { cruces: 0, sobreCaja: 0 } },
  { fx: paisaje, hoy: { cruces: 3, sobreCaja: 2 }, limiteSpec: { cruces: 3, sobreCaja: 2 }, logrado: { cruces: 0, sobreCaja: 0 } },
  { fx: tooltip, hoy: { cruces: 0, sobreCaja: 0 }, limiteSpec: { cruces: 0, sobreCaja: 0 }, logrado: { cruces: 0, sobreCaja: 0 } },
  { fx: venta, hoy: { cruces: 0, sobreCaja: 1 }, limiteSpec: { cruces: 0, sobreCaja: 1 }, logrado: { cruces: 0, sobreCaja: 0 } },
] as unknown) as Crudo[];

export const FIXTURES: FixtureTopologia[] = crudos.map(({ fx, hoy, estrategiaBase, limiteSpec, logrado }) => ({
  id: fx.id,
  estrategiaBase,
  logrado,
  modelo: (): DiagramModel => ({
    meta: { ...fx.meta },
    nodes: fx.nodes.map((n) => ({ ...n })),
    edges: fx.edges.map((e) => ({ ...e })),
  }),
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
