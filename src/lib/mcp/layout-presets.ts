/**
 * @fileOverview Presets de layout: densidad y estrategia (PURO).
 *
 * La geometría dejó de ser una constante escondida en el algoritmo. Aquí viven
 * los números —cuánto separar, cuántos elementos por fila, cuánto aire deja una
 * banda— y las estrategias con las que se puede dibujar un mismo modelo.
 *
 * Lo consumen los dos lados por igual: el botón «Organizar» del lienzo y la
 * herramienta MCP `relayout_diagram`, para que lo que ve el humano y lo que
 * genera el agente sean exactamente la misma disposición.
 */

import { typesWithRole, type NotationId } from "../notations";

/** Cuánto aire tiene el diagrama. */
export type LayoutDensity = "compacto" | "comodo" | "expandido";

/**
 * Cómo se ordenan los elementos:
 *  - `flujo`: bandas horizontales y avance de izquierda a derecha por el orden
 *    de las relaciones (procesos: BPMN, actividad UML).
 *  - `capas`: filas por rol semántico —quién usa el sistema, qué contiene, de
 *    qué depende— sin suponer que hay un flujo (arquitectura: C4, DDD).
 */
export type LayoutStrategy = "flujo" | "capas";

export interface LayoutPreset {
  id: LayoutDensity;
  label: string;
  /** Para el menú: qué gana el usuario al elegirlo. */
  hint: string;
  /** Separación horizontal entre columnas. */
  hGap: number;
  /** Separación vertical entre elementos apilados. */
  vGap: number;
  /** Elementos por fila antes de saltar (estrategia por capas). */
  colsPerRow: number;
  /** Hueco superior de la banda (donde va su título). */
  lanePadTop: number;
  /** Márgenes laterales e inferior de la banda. */
  lanePadX: number;
  lanePadBottom: number;
  /** Separación entre bandas apiladas. */
  laneGap: number;
}

/**
 * Los tres presets. `comodo` es el DEFAULT de generación: el layout original
 * usaba la densidad mínima y los diagramas se leían apretados aunque sobrara
 * espacio alrededor.
 */
export const LAYOUT_PRESETS: Record<LayoutDensity, LayoutPreset> = {
  compacto: {
    id: "compacto",
    label: "Compacto",
    hint: "Todo a la vista, para diagramas grandes.",
    hGap: 60,
    vGap: 30,
    colsPerRow: 6,
    lanePadTop: 46,
    lanePadX: 40,
    lanePadBottom: 22,
    laneGap: 28,
  },
  comodo: {
    id: "comodo",
    label: "Cómodo",
    hint: "Equilibrio entre aire y pantalla. Recomendado.",
    hGap: 110,
    vGap: 55,
    colsPerRow: 8,
    lanePadTop: 56,
    lanePadX: 52,
    lanePadBottom: 30,
    laneGap: 44,
  },
  expandido: {
    id: "expandido",
    label: "Expandido",
    hint: "Máximo aire, para presentar o proyectar.",
    // El salto respecto de `compacto` tiene que NOTARSE (spec 002, SC-001: ≥1,6×
    // de ancho); con un hueco menor, cambiar de preset parecía no hacer nada.
    hGap: 260,
    vGap: 90,
    colsPerRow: 10,
    lanePadTop: 68,
    lanePadX: 80,
    lanePadBottom: 40,
    laneGap: 68,
  },
};

/** Orden de menor a mayor aire (el orden del menú). */
export const DENSITY_ORDER: LayoutDensity[] = ["compacto", "comodo", "expandido"];

/** Densidad por defecto al generar y al reorganizar sin argumentos. */
export const DEFAULT_DENSITY: LayoutDensity = "comodo";

export const LAYOUT_STRATEGIES: Record<LayoutStrategy, { id: LayoutStrategy; label: string; hint: string }> = {
  flujo: {
    id: "flujo",
    label: "Por flujo (swimlane)",
    hint: "Bandas por participante y avance de izquierda a derecha.",
    // (label/hint alimentan el menú del diseñador)
  },
  capas: {
    id: "capas",
    label: "Por capas (roles)",
    hint: "Actores arriba, sistemas propios en medio, externos abajo.",
  },
};

/** Preset por id, con caída al default si llega algo desconocido. */
export function getPreset(id: LayoutDensity | string | undefined): LayoutPreset {
  return LAYOUT_PRESETS[(id as LayoutDensity)] ?? LAYOUT_PRESETS[DEFAULT_DENSITY];
}

/**
 * Estrategia natural de una notación: si declara inicio y fin, su historia es un
 * flujo; si no, se lee por capas. Se decide con el registro de roles, no con el
 * id de la notación (P6): una notación nueva hereda la decisión al declararlos.
 */
export function defaultStrategyFor(notation: NotationId | string | undefined): LayoutStrategy {
  const tieneFlujo =
    typesWithRole(notation, "start").length > 0 && typesWithRole(notation, "end").length > 0;
  return tieneFlujo ? "flujo" : "capas";
}

/** Estrategia por id, con caída a la natural de la notación. */
export function resolveStrategy(
  strategy: LayoutStrategy | string | undefined,
  notation: NotationId | string | undefined
): LayoutStrategy {
  return strategy === "flujo" || strategy === "capas" ? strategy : defaultStrategyFor(notation);
}
