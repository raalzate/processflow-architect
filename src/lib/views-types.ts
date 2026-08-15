/**
 * @fileOverview Modelo del Diseñador de Vistas DDD.
 *
 * Una "vista" es un GRAFO que el usuario DISEÑA (lienzo DDD con nodos/aristas).
 * Hay vistas BUILT-IN derivadas del modelo de dominio (Design, Read Model, Data Flow)
 * y vistas CUSTOM que son grafos independientes diseñables (máx. 50).
 * Las vistas pueden inyectarse como contexto al chat del agente (máx. 10).
 *
 * Los ARTEFACTOS generados por la IA son un conjunto APARTE (no son vistas).
 */

// Imports RELATIVOS a propósito: este módulo lo consume también el proceso main
// (herramientas MCP), que compila con tsconfig.electron y no resuelve el alias `@/`.
import type { GraphData } from "./types";
import type { NotationId } from "./notations";

export type ViewKind = "design" | "graph" | "mermaid";

export interface DesignView {
  id: string;
  name: string;
  kind: ViewKind;
  /**
   * Grupo de componentes / notación de la vista (DDD, BPMN, C4, UML).
   * Determina la paleta, iconos y la guía que recibe la IA. Por defecto "ddd".
   */
  notation?: NotationId;
  /** true para las vistas del sistema (no se borran ni cuentan en el límite de 50). */
  builtin?: boolean;
  /** Grafo diseñable para vistas custom (kind === 'graph'). */
  graph?: GraphData;
  /** Código Mermaid de la vista (kind === 'mermaid'). */
  mermaidCode?: string;
  /** Descripción corta (se usa al inyectar como contexto). */
  description?: string;
  createdAt: string; // ISO
}

/** Máximo de vistas CUSTOM que el usuario puede crear. */
export const MAX_CUSTOM_VIEWS = 50;
/** Máximo de vistas que pueden inyectarse simultáneamente al contexto del agente. */
export const MAX_INJECTED_VIEWS = 10;

/**
 * Vista base: el modelo del proyecto (lienzo principal). Su `notation` es solo la
 * semilla: `ViewsContext` la sustituye por la del documento activo. El resto de
 * vistas las crea el usuario o la IA.
 */
export const BUILTIN_VIEWS: DesignView[] = [
  { id: "design", name: "Modelo", kind: "design", notation: "ddd", builtin: true, createdAt: "" },
];
