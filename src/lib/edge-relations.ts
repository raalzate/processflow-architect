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

/**
 * Marca dibujada en una punta de la línea.
 *
 * Además de las de UML están las de CARDINALIDAD del modelo entidad-relación
 * (pata de gallo): en un MER la punta dice cuántas instancias participan, y sin
 * ellas un 1:N y un N:M se dibujaban idénticos.
 *  - one:       raya perpendicular   → exactamente uno
 *  - many:      pata de gallo        → muchos (1..N)
 *  - zero-one:  círculo + raya       → cero o uno (opcional)
 *  - zero-many: círculo + pata       → cero o muchos
 *  - one-many:  raya + pata          → uno o muchos (al menos uno)
 */
export type EdgeMarker =
  | "none"
  | "arrow"
  | "triangle"
  | "diamond"
  | "diamond-open"
  | "one"
  | "many"
  | "zero-one"
  | "zero-many"
  | "one-many";

/** Relación que representa la arista. `asociacion` es la de siempre (flecha). */
export type EdgeRelationKind =
  | "asociacion"
  | "herencia"
  | "realizacion"
  | "composicion"
  | "agregacion"
  | "dependencia"
  | "cardinalidad_1_1"
  | "cardinalidad_1_n"
  | "cardinalidad_0_1"
  | "cardinalidad_0_n"
  | "cardinalidad_n_m";

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
  // --- Cardinalidad del MER (pata de gallo). La marca va en CADA punta: dice
  // cuántas instancias del elemento de ESE lado participan de la relación.
  cardinalidad_1_1: {
    label: "Cardinalidad 1:1 (uno a uno)",
    end: "one",
    start: "one",
    dashed: false,
    hint: "Una instancia de cada lado: cada origen se relaciona con un único destino y al revés",
  },
  cardinalidad_1_n: {
    label: "Cardinalidad 1:N (uno a muchos)",
    end: "many",
    start: "one",
    dashed: false,
    hint: "Un origen se relaciona con muchos destinos; cada destino, con un único origen",
  },
  cardinalidad_0_1: {
    label: "Cardinalidad 0:1 (cero o uno, opcional)",
    end: "zero-one",
    start: "one",
    dashed: false,
    hint: "El destino es opcional: el origen puede no tener ninguno, y como máximo uno",
  },
  cardinalidad_0_n: {
    label: "Cardinalidad 0:N (cero o muchos)",
    end: "zero-many",
    start: "one",
    dashed: false,
    hint: "Participación parcial: el origen puede tener ninguno o muchos destinos",
  },
  cardinalidad_n_m: {
    label: "Cardinalidad N:M (muchos a muchos)",
    end: "many",
    start: "many",
    dashed: false,
    hint: "Muchos de cada lado; si la relación tiene atributos propios, modelala como Entidad Asociativa",
  },
};

/**
 * Geometría de una marca de punta, para que el lienzo la dibuje sin cablearla.
 *
 * Vive acá —y no en el componente— porque es simbología: la punta ES el
 * significado de la relación, igual que la tabla de arriba. El lienzo sólo
 * traduce esto a `<marker>` de SVG y por eso una marca nueva no le pide cambios.
 *
 * Convención del sistema de coordenadas: la figura se dibuja de x=0 (lado de la
 * línea) a x=`refX` (punto que TOCA el nodo), así la misma definición sirve para
 * la punta de destino (`orient="auto"`) y la de origen (`auto-start-reverse`).
 */
export interface EdgeMarkerShape {
  /** viewBox del `<marker>`. */
  viewBox: string;
  /** Punto de anclaje en x: el que se pega al borde del nodo. */
  refX: number;
  /** Anclaje en x cuando la marca va en la punta de ORIGEN (marker-start). */
  refXStart: number;
  /** markerWidth/markerHeight (la marca escala con el grosor de la línea). */
  size: number;
  /** Trazos que componen la figura (atributo `d` de cada `<path>`). */
  paths: string[];
  /** Círculo del "cero" (opcionalidad), si la marca lo lleva. */
  circle?: { cx: number; r: number };
  /**
   * Relleno de la figura:
   *  - "solid": relleno del color de la línea (rombo de composición).
   *  - "hollow": relleno del color del LIENZO (triángulo de herencia, rombo de
   *    agregación): hueco de verdad, y la línea no se ve por dentro.
   *  - "none": sin relleno, sólo trazo (pata de gallo, rayas de cardinalidad).
   */
  fill: "solid" | "hollow" | "none";
  /** Grosor del trazo de la figura. */
  strokeWidth: number;
}

export const EDGE_MARKER_SHAPES: Record<
  Exclude<EdgeMarker, "none" | "arrow">,
  EdgeMarkerShape
> = {
  triangle: {
    viewBox: "0 -6 12 12",
    refX: 12,
    refXStart: 12,
    size: 7,
    paths: ["M0,-6L12,0L0,6z"],
    fill: "hollow",
    strokeWidth: 1.5,
  },
  diamond: {
    viewBox: "0 -5 16 10",
    refX: 16,
    refXStart: 0,
    size: 8,
    paths: ["M0,0L8,-5L16,0L8,5z"],
    fill: "solid",
    strokeWidth: 1,
  },
  "diamond-open": {
    viewBox: "0 -5 16 10",
    refX: 16,
    refXStart: 0,
    size: 8,
    paths: ["M0,0L8,-5L16,0L8,5z"],
    fill: "hollow",
    strokeWidth: 1.5,
  },
  one: {
    viewBox: "0 -5 12 10",
    refX: 12,
    refXStart: 12,
    size: 9,
    paths: ["M7,-5L7,5"],
    fill: "none",
    strokeWidth: 1.5,
  },
  many: {
    viewBox: "0 -5 12 10",
    refX: 12,
    refXStart: 12,
    size: 9,
    paths: ["M0,0L12,-5", "M0,0L12,0", "M0,0L12,5"],
    fill: "none",
    strokeWidth: 1.5,
  },
  "zero-one": {
    viewBox: "0 -5 16 10",
    refX: 16,
    refXStart: 16,
    size: 10,
    paths: ["M13,-5L13,5"],
    circle: { cx: 6, r: 3.2 },
    fill: "hollow",
    strokeWidth: 1.5,
  },
  "zero-many": {
    viewBox: "0 -5 18 10",
    refX: 18,
    refXStart: 18,
    size: 11,
    paths: ["M7,0L18,-5", "M7,0L18,0", "M7,0L18,5"],
    circle: { cx: 3.5, r: 3.2 },
    fill: "hollow",
    strokeWidth: 1.5,
  },
  "one-many": {
    viewBox: "0 -5 16 10",
    refX: 16,
    refXStart: 16,
    size: 10,
    paths: ["M4,0L16,-5", "M4,0L16,0", "M4,0L16,5", "M2,-5L2,5"],
    fill: "none",
    strokeWidth: 1.5,
  },
};

/** Geometría de una marca (undefined en `none` y en la flecha de siempre). */
export function markerShape(m: EdgeMarker): EdgeMarkerShape | undefined {
  return EDGE_MARKER_SHAPES[m as Exclude<EdgeMarker, "none" | "arrow">];
}

/** Orden estable para los SELECT (la asociación primero: es la caída). */
export const EDGE_RELATION_LIST: EdgeRelationKind[] = [
  "asociacion",
  "herencia",
  "realizacion",
  "composicion",
  "agregacion",
  "dependencia",
  "cardinalidad_1_1",
  "cardinalidad_1_n",
  "cardinalidad_0_1",
  "cardinalidad_0_n",
  "cardinalidad_n_m",
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
