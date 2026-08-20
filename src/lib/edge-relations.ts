/**
 * @fileOverview Tipo de relación de una arista y su simbología (PURO).
 *
 * En UML la punta de la línea ES el significado: el triángulo hueco dice
 * "hereda", el rombo relleno dice "está compuesto por", la línea punteada con
 * triángulo dice "realiza la interfaz". El lienzo sólo sabía dibujar la flecha
 * de siempre, así que un diagrama de clases quedaba con seis relaciones
 * distintas pintadas todas igual y el modelo no se podía leer.
 *
 * Acá vive la tabla: qué marca va en cada punta y si el trazo es punteado. Es
 * DATOS PUROS —los marcadores SVG los declara el lienzo— y sirve para cualquier
 * notación: la asociación simple es la caída y no impone nada.
 */

/** Marca dibujada en una punta de la línea. */
export type EdgeMarker = "none" | "arrow" | "triangle" | "diamond" | "diamond-open";

/** Relación que representa la arista. `asociacion` es la de siempre (flecha). */
export type EdgeRelationKind =
  | "asociacion"
  | "herencia"
  | "realizacion"
  | "composicion"
  | "agregacion"
  | "dependencia";

export interface EdgeRelationStyle {
  /** Etiqueta para el SELECT de la ficha del enlace. */
  label: string;
  /** Marca en la punta del DESTINO. */
  end: EdgeMarker;
  /**
   * Marca en la punta del ORIGEN. En composición y agregación el rombo va del
   * lado del TODO (el que contiene), que es el origen de la relación.
   */
  start: EdgeMarker;
  /** true → trazo discontinuo (realización y dependencia, en UML). */
  dashed: boolean;
  /** Qué dice la relación, para el tooltip de la ficha. */
  hint: string;
}

export const EDGE_RELATIONS: Record<EdgeRelationKind, EdgeRelationStyle> = {
  asociacion: {
    label: "Asociación (flecha)",
    end: "arrow",
    start: "none",
    dashed: false,
    hint: "Relación simple entre dos elementos; es la de por defecto",
  },
  herencia: {
    label: "Herencia / generalización (△)",
    end: "triangle",
    start: "none",
    dashed: false,
    hint: "El origen ES UN caso del destino; triángulo hueco apuntando al padre",
  },
  realizacion: {
    label: "Realización / implementa (⇢△)",
    end: "triangle",
    start: "none",
    dashed: true,
    hint: "El origen implementa la interfaz del destino; línea punteada con triángulo hueco",
  },
  composicion: {
    label: "Composición (◆ rombo relleno)",
    end: "none",
    start: "diamond",
    dashed: false,
    hint: "El origen es el TODO y las partes no viven sin él; rombo relleno del lado del todo",
  },
  agregacion: {
    label: "Agregación (◇ rombo hueco)",
    end: "none",
    start: "diamond-open",
    dashed: false,
    hint: "El origen agrupa partes que existen por su cuenta; rombo hueco del lado del todo",
  },
  dependencia: {
    label: "Dependencia (⇢)",
    end: "arrow",
    start: "none",
    dashed: true,
    hint: "El origen usa al destino y le afecta si cambia; línea punteada con flecha abierta",
  },
};

/** Orden estable para los SELECT (la asociación primero: es la caída). */
export const EDGE_RELATION_LIST: EdgeRelationKind[] = [
  "asociacion",
  "herencia",
  "realizacion",
  "composicion",
  "agregacion",
  "dependencia",
];

/** Estilo de una relación; una desconocida (o ausente) cae a `asociacion`. */
export function relationStyle(kind: string | undefined): EdgeRelationStyle {
  return EDGE_RELATIONS[kind as EdgeRelationKind] ?? EDGE_RELATIONS.asociacion;
}

/**
 * Trazo final de una arista. La relación manda sobre el trazo, pero `dashed`
 * puesto a mano en la arista sigue ganando: en secuencia el retorno es punteado
 * y no hay relación UML que lo declare.
 */
export function edgeIsDashed(
  arista: { relation?: string; dashed?: boolean },
): boolean {
  return arista.dashed || relationStyle(arista.relation).dashed;
}
