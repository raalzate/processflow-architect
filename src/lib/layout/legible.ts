/**
 * @fileOverview Disposición LEGIBLE de un diagrama: ordenar, rutear y medir (PURO).
 *
 * Es el único sitio donde se encadenan las tres piezas, y por eso es lo que
 * llaman por igual el layout del agente y el botón «Organizar» del lienzo: si la
 * mejora entrara por un solo lado, lo generado y lo reorganizado dejarían de
 * coincidir y el humano volvería a corregir a mano (FR-009).
 *
 * La geometría que escribe queda marcada como AUTOMÁTICA. La que no lo está es
 * del humano y no se toca: un quiebre que alguien arrastró no puede perderse en
 * la siguiente reorganización (FR-010 · FR-015). La geometría anterior a esta
 * capacidad se considera manual, que es la opción conservadora (FR-017 · C4).
 */

import { isLifelineContainer } from "../notations";
import type { BuilderEdge, DiagramModel } from "../mcp/diagram-builder";
import { medirLegibilidad, type Legibilidad, type Punto } from "./metrics";
import { cajasDelModelo, idDeRelacion, relacionesDelModelo, aplicarCajas } from "./modelo";
import { ordenarCapas } from "./order";
import { rutarRelaciones } from "./routing";

export interface MedidaComparada {
  antes: Legibilidad;
  despues: Legibilidad;
  /**
   * Las dos medidas se toman con el mismo criterio de recorrido; esto declara
   * si el diagrama traía recorridos hechos a mano, para que la comparación no se
   * lea como mérito ni como culpa de la reorganización (FR-017 · C5).
   */
  conRecorridosManuales: boolean;
}

export interface DisposicionLegible {
  model: DiagramModel;
  legibilidad: MedidaComparada;
  /** Quiebres calculados por relación (id = índice de la arista). */
  rutas: Map<string, Punto[]>;
  /** El presupuesto de tiempo se agotó y esto es lo mejor hallado (FR-016). */
  parcial: boolean;
}

export interface LegibleOpts {
  /** Techo de tiempo para todo el proceso. */
  presupuestoMs?: number;
  /** Reloj inyectable: las pruebas no dependen del reloj real. */
  ahora?: () => number;
}

/**
 * Presupuesto de tiempo declarado en C3: 200 ms para un diagrama de hasta 50
 * elementos (SC-003) y un techo duro de 2 s para cualquiera. Agotado, se entrega
 * la mejor disposición hallada, marcada como parcial (FR-012 · FR-016).
 */
export const PRESUPUESTO_MS = 200;
export const PRESUPUESTO_TECHO_MS = 2000;
export const NODOS_DEL_PRESUPUESTO_CORTO = 50;

/** El presupuesto que le toca a este diagrama por su tamaño. */
export function presupuestoDe(model: DiagramModel): number {
  return model.nodes.length <= NODOS_DEL_PRESUPUESTO_CORTO ? PRESUPUESTO_MS : PRESUPUESTO_TECHO_MS;
}

/** ¿La geometría de esta relación la puso una persona? Entonces es intocable. */
export const esGeometriaManual = (e: BuilderEdge): boolean =>
  Boolean((e.midpoints?.length ?? 0) > 0 && !e.geometriaAuto);

/**
 * Los diagramas de SECUENCIA quedan fuera: en ellos manda el tiempo, y permutar
 * o desviar un mensaje cambiaría lo que el diagrama dice (spec · fuera de alcance).
 */
const esSecuencia = (model: DiagramModel): boolean =>
  model.nodes.some((n) => isLifelineContainer(n.tipo_elemento));

/**
 * Una línea con la medida antes y después, para la respuesta de la herramienta
 * del agente (FR-007). Declara con qué recorridos se tomó cada medida, o la
 * comparación se leería como mérito —o culpa— de la reorganización (C5).
 */
export function resumenDeLegibilidad(medida: MedidaComparada, parcial = false): string {
  const { antes, despues, conRecorridosManuales } = medida;
  const partes = [
    `Legibilidad: cruces ${antes.cruces} → ${despues.cruces} · ` +
      `relaciones sobre caja ajena ${antes.sobreCaja} → ${despues.sobreCaja} ` +
      `(sobre ${despues.relaciones} relaciones).`,
  ];
  if (conRecorridosManuales)
    partes.push("Las dos medidas incluyen los recorridos que ajustó una persona, que no se tocaron.");
  if (parcial)
    partes.push("Disposición PARCIAL: se agotó el presupuesto de tiempo y se entrega la mejor hallada.");
  return partes.join("\n");
}

/**
 * Mide un diagrama tal como está, sin mover ni rutear nada.
 *
 * Usa TODOS los quiebres guardados, los haya puesto una persona o la propia
 * disposición: lo que se mide es el trazo que se dibuja (D6). La marca
 * `geometriaAuto` decide qué se puede REEMPLAZAR, no qué se mide — confundir
 * las dos cosas hacía que la revisión denunciara cuatro relaciones sobre caja
 * en un diagrama que el ruteo acababa de dejar en cero (#390).
 */
export function medirDisposicion(model: DiagramModel): DisposicionLegible {
  const rutas = rutasGuardadas(model);
  const medida = medirLegibilidad(cajasDelModelo(model), relacionesDelModelo(model, rutas));
  return {
    model,
    legibilidad: {
      antes: medida,
      despues: medida,
      conRecorridosManuales: rutasManuales(model).size > 0,
    },
    rutas,
    parcial: false,
  };
}

/** Recorridos que tiene el diagrama hoy, sin importar quién los puso. */
function rutasGuardadas(model: DiagramModel): Map<string, Punto[]> {
  const rutas = new Map<string, Punto[]>();
  model.edges.forEach((e, i) => {
    if (e.midpoints?.length) rutas.set(idDeRelacion(i), e.midpoints);
  });
  return rutas;
}

/** Recorridos que puso una persona, por id de relación. */
function rutasManuales(model: DiagramModel): Map<string, Punto[]> {
  const manuales = new Map<string, Punto[]>();
  model.edges.forEach((e, i) => {
    if (esGeometriaManual(e)) manuales.set(idDeRelacion(i), e.midpoints!);
  });
  return manuales;
}

export function disponerLegible(model: DiagramModel, opts: LegibleOpts = {}): DisposicionLegible {
  const presupuesto = opts.presupuestoMs ?? presupuestoDe(model);
  const ahora = opts.ahora ?? (() => Date.now());
  const t0 = ahora();

  const manuales = rutasManuales(model);
  const conRecorridosManuales = manuales.size > 0;

  const medirCon = (m: DiagramModel, rutas: Map<string, Punto[]>) =>
    medirLegibilidad(cajasDelModelo(m), relacionesDelModelo(m, rutas));

  const antes = medirCon(model, manuales);
  if (esSecuencia(model) || !model.edges.length) {
    return {
      model,
      legibilidad: { antes, despues: antes, conRecorridosManuales },
      rutas: new Map(),
      parcial: false,
    };
  }

  const restante = () => Math.max(0, presupuesto - (ahora() - t0));
  const ordenado = aplicarCajas(
    model,
    ordenarCapas(cajasDelModelo(model), relacionesDelModelo(model, manuales), {
      presupuestoMs: restante() / 2,
      ahora,
    })
  );

  const rutas = rutarRelaciones(cajasDelModelo(ordenado), relacionesDelModelo(ordenado, manuales), {
    presupuestoMs: restante(),
    ahora,
    fijas: new Set(manuales.keys()),
  });
  for (const [id, puntos] of manuales) rutas.set(id, puntos);

  const edges = ordenado.edges.map((e, i) => {
    const id = idDeRelacion(i);
    if (manuales.has(id)) return e;
    const quiebres = rutas.get(id);
    if (!quiebres?.length) {
      if (!e.geometriaAuto) return e;
      // La geometría AUTOMÁTICA de una disposición anterior sí se reemplaza: si
      // no, el layout no podría corregirse a sí mismo nunca (D3 · TS-013). Al
      // quedarse sin quiebres, la relación vuelve al enrutado de su notación.
      const { midpoints, geometriaAuto, routing, ...resto } = e;
      void midpoints;
      void geometriaAuto;
      void routing;
      return resto;
    }
    // D2: sólo se vuelve escalonada la relación que en recta pisaría una caja;
    // las demás conservan el enrutado que declara su notación (FR-014 · P6).
    return { ...e, midpoints: quiebres, routing: "orthogonal" as const, geometriaAuto: true };
  });

  const dispuesto = { ...ordenado, edges };
  return {
    model: dispuesto,
    legibilidad: { antes, despues: medirCon(dispuesto, rutas), conRecorridosManuales },
    rutas,
    parcial: ahora() - t0 > presupuesto,
  };
}
