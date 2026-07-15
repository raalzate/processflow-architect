/**
 * @fileOverview Catálogo de notaciones para el servidor MCP.
 *
 * Deriva del registro ÚNICO de notaciones de la app (`../notations`) la
 * información que un agente externo (Claude Code / Codex) necesita para
 * DISEÑAR diagramas válidos: qué tipos de componente existen por notación,
 * cuáles son contenedores y qué forma tienen. Sin esto el agente inventaría
 * `tipo_elemento` que el lienzo no sabe dibujar.
 *
 * Datos PUROS (sin React, sin Electron, sólo imports relativos) para que
 * corra tanto en vitest como en el proceso stdio del MCP vía tsx.
 */

import {
  NOTATION_LIST,
  getNotation,
  isNotationContainer,
  type Notation,
  type NotationId,
} from "../notations";

/** Descriptor de un tipo de componente tal como lo expone el MCP. */
export interface CatalogElement {
  /** Valor exacto que va en `tipo_elemento`. */
  type: string;
  /** true si agrupa otros nodos (Agregado, Pool, Límite de Sistema, …). */
  container: boolean;
  /** Forma SVG con la que se dibuja (rounded por defecto). */
  shape: string;
  /** Sección de la paleta a la que pertenece (ayuda semántica). */
  group: string;
}

/** Notación completa: metadatos + tipos válidos + guía para la IA. */
export interface CatalogNotation {
  id: NotationId;
  label: string;
  description: string;
  aiGuidance: string;
  elements: CatalogElement[];
}

/** Mapa tipo → sección de la paleta, para una notación dada. */
function groupByType(n: Notation): Record<string, string> {
  const map: Record<string, string> = {};
  for (const g of n.paletteGroups) {
    for (const t of g.types) map[t] = g.label;
  }
  return map;
}

/** Convierte una notación del registro a su descriptor de catálogo. */
export function toCatalogNotation(n: Notation): CatalogNotation {
  const groups = groupByType(n);
  return {
    id: n.id,
    label: n.label,
    description: n.description,
    aiGuidance: n.aiGuidance,
    elements: n.elements.map((e) => ({
      type: e.type,
      container: Boolean(e.container),
      shape: e.shape ?? "rounded",
      group: groups[e.type] ?? "Otros",
    })),
  };
}

/** Catálogo completo: todas las notaciones (DDD, BPMN, C4, UML). */
export function listNotations(): CatalogNotation[] {
  return NOTATION_LIST.map(toCatalogNotation);
}

/** Catálogo de UNA notación por id; cae a DDD si el id no existe. */
export function describeNotation(id: NotationId | string | undefined): CatalogNotation {
  return toCatalogNotation(getNotation(id));
}

/** Conjunto de tipos válidos de una notación (para validar `tipo_elemento`). */
export function validTypesFor(id: NotationId | string | undefined): Set<string> {
  return new Set(getNotation(id).elements.map((e) => e.type));
}

/** ¿`type` es un tipo contenedor en CUALQUIER notación? (registro global). */
export function isContainerType(type: string): boolean {
  return isNotationContainer(type);
}
