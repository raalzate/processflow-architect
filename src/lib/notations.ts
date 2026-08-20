/**
 * @fileOverview Registro de NOTACIONES (grupos de componentes) del diseñador.
 *
 * Una "notación" es un grupo de tipos de componentes con su propia paleta, iconos,
 * colores y guía para la IA. El diseñador empezó soportando sólo DDD/Event Storming;
 * este registro generaliza el modelo para soportar varios grupos (DDD, BPMN, C4, UML)
 * y que el usuario los elija con un SELECT por vista.
 *
 * IMPORTANTE: este archivo es DATOS PUROS (sin React ni lucide) para poder
 * importarse tanto en el cliente (lienzo) como en el flujo de servidor del agente
 * (`ai/flows/react-agent.ts`), donde sólo se usa la etiqueta y la guía de IA.
 * Los iconos se referencian por NOMBRE (string) y se resuelven en la capa de UI.
 */

export type NotationId = "ddd" | "bpmn" | "c4" | "uml";

/**
 * Disposición natural de una notación. Vive acá —y no en el layout— porque el
 * arnés es agnóstico de notación (P6): quien agrega una notación declara cómo
 * se lee su modelo, y el algoritmo obedece sin cablear ids.
 *  - flujo:  bandas y avance de izquierda a derecha (hay inicio y fin).
 *  - capas:  filas por rol semántico (actores arriba, dependencias abajo).
 *  - radial: un concepto central y anillos concéntricos de relaciones.
 */
export type LayoutHint = "flujo" | "capas" | "radial";

/**
 * Forma SVG con la que se dibuja un nodo NO contenedor en el lienzo.
 *  - rounded: rectángulo redondeado (por defecto; nota adhesiva / Event Storming).
 *  - rect:    rectángulo recto (clases UML, contenedores lógicos C4).
 *  - ellipse: óvalo (eventos BPMN, casos de uso UML, interfaces).
 *  - diamond: rombo (compuertas BPMN, decisiones de flujo).
 *  - cylinder: cilindro (bases de datos / almacenes).
 */
export type ShapeKind = "rounded" | "rect" | "ellipse" | "diamond" | "cylinder";

/** Metadatos visuales y semánticos de un tipo de componente dentro de una notación. */
export interface NotationElement {
  /** Etiqueta única del tipo (también es lo que se guarda en `tipo_elemento`). */
  type: string;
  /** Nombre del icono de lucide-react (se resuelve en la UI). */
  icon: string;
  /** true si es un contenedor (agrupa otros nodos en el lienzo). */
  container?: boolean;
  /** Forma SVG del nodo (no aplica a contenedores). Por defecto "rounded". */
  shape?: ShapeKind;
  /**
   * true → símbolo COMPACTO al estilo BPMN: la forma se dibuja pequeña y
   * centrada (círculo para elipses, rombo cuadrado) y el nombre va DEBAJO.
   * Para eventos, compuertas y pseudoestados; las figuras anchas con texto
   * dentro (tareas, casos de uso) no lo usan.
   */
  compact?: boolean;
  /**
   * true → NO se dibuja icono dentro de la forma. Para símbolos UML canónicos
   * cuya figura ES el significado: punto inicial sólido, rombo de decisión
   * vacío. Un icono encima sería ruido.
   */
  hideIcon?: boolean;
  /**
   * true → relleno transparente. Reservado para CONTENEDORES (límites, pools,
   * contextos): un fondo taparía a sus hijos. Los símbolos sueltos llevan
   * SIEMPRE relleno suave (tinte -50/-100) + contorno (`stroke`): una forma
   * hueca se ve inacabada y pierde presencia en el lienzo.
   * Requiere `stroke` para que el contorno sea visible (en SVG, `border-*` no pinta).
   */
  transparent?: boolean;
  /**
   * Simbología del CONTENEDOR (ignorado en nodos sueltos):
   *  - "boundary" (por defecto): marco punteado con el nombre en la esquina.
   *    Es lo correcto para fronteras lógicas — Contexto Delimitado, Subdominio,
   *    Límite de Sistema, Paquete: delimitan, no reparten trabajo.
   *  - "swimlane": rectángulo de LÍNEA CONTINUA, esquinas rectas y banda lateral
   *    con el nombre rotado 90°. Es la forma canónica del Pool/Carril de BPMN
   *    (participante y rol); dibujarlos punteados con etiqueta en la esquina no
   *    es notación BPMN.
   *  - "lifeline": caja con el nombre ARRIBA y una línea vertical punteada que
   *    baja por su centro. Es la línea de vida del diagrama de SECUENCIA de UML:
   *    el participante es la caja y el tiempo corre hacia abajo por la línea.
   *  - "blob": ELIPSE punteada con el nombre en el borde inferior. Es la forma
   *    con que se dibujan los agrupamientos de un mapa de conceptos de DDD
   *    (Comportamiento, Ciclo de Vida, Composición): agrupan por afinidad, no
   *    delimitan un territorio, y un rectángulo los hacía leer como sistema.
   */
  containerStyle?: "boundary" | "swimlane" | "blob" | "lifeline";
  /** Clase tailwind de trazo SVG (stroke-*) que dibuja el contorno del nodo. */
  stroke?: string;
  /** Clases tailwind: relleno SVG, borde y texto. */
  bg: string;
  border: string;
  text: string;
}

/** Sección colapsable dentro de la paleta de una notación. */
export interface NotationPaletteGroup {
  label: string;
  types: string[];
}

export interface Notation {
  id: NotationId;
  /** Etiqueta corta para el SELECT. */
  label: string;
  /** Descripción de una línea (tooltip / ayuda). */
  description: string;
  /** Secciones de la paleta. */
  paletteGroups: NotationPaletteGroup[];
  /** Todos los tipos de componente de la notación. */
  elements: NotationElement[];
  /** Guía para la IA: cómo producir propuestas/diagramas en esta notación. */
  aiGuidance: string;
  /**
   * Rol que asume la IA al sugerir en esta notación ("analista de procesos
   * BPMN", …). Los prompts del diseñador lo usan en lugar de asumir DDD: un
   * modelo pequeño clasifica y nombra según el rol que se le da.
   */
  analystRole: string;
  /**
   * Encadenamiento típico de la notación (para "sugerir el siguiente
   * elemento"): una línea por regla `Origen → Destino (relación)`.
   */
  flowRules: string;
  /**
   * Tipo al que se cae cuando la IA devuelve un tipo que no existe en la
   * notación. Debe ser el elemento más común de su flujo.
   */
  defaultType: string;
  /**
   * Cómo se nombran los elementos en esta notación (regla para "sugerir
   * nombre"). En DDD es Lenguaje Ubicuo; en BPMN verbo+objeto; etc.
   */
  namingRule: string;
  /**
   * Cómo se llama el modelo en la UI ("Modelo de Dominio" en DDD, "Modelo de
   * Procesos" en BPMN…). Evita que los paneles del visor hablen siempre de
   * dominio ante un diagrama que no lo es.
   */
  modelLabel: string;
  /**
   * Disposición con la que se dibuja por defecto. Si falta, se deduce de los
   * roles: con inicio y fin declarados es `flujo`, si no `capas`.
   */
  defaultLayout?: LayoutHint;
  /**
   * Tamaño de sus nodos sueltos. Si falta, `DEFAULT_NODE_SIZE`. C4 lo declara
   * más grande porque su caja lleva tres líneas (nombre, descripción y tipo) y
   * en 160×60 la descripción no entra.
   */
  nodeSize?: { w: number; h: number };
  /**
   * Cómo se rotula un nodo suelto:
   *  - "center" (por defecto): icono grande centrado y el nombre debajo.
   *  - "detail": icono chico arriba a la izquierda y bloque de texto centrado
   *    —nombre en negrita, descripción y `[Tipo]`—, la ficha canónica de C4.
   */
  labelLayout?: "center" | "detail";
  /**
   * Trazo de sus relaciones cuando la arista no pide uno. C4 usa curvas: en un
   * paisaje con muchas relaciones cruzadas, dos rectas superpuestas se leen como
   * una sola y la curva deja ver cuál va a dónde.
   */
  defaultRouting?: "straight" | "curved" | "orthogonal";
}

/**
 * Tamaño de un nodo suelto. Es la FICHA: nombre, descripción y `[Tipo]` no
 * entran en una caja de 160×60. Vale para todas las notaciones.
 */
export const DEFAULT_NODE_SIZE = { w: 220, h: 104 } as const;

/**
 * Tamaño de los símbolos COMPACTOS (eventos, compuertas, pseudoestados). Su
 * figura es el significado y se dibuja pequeña con el nombre debajo: agrandarla
 * al tamaño de la ficha convertiría un evento BPMN en un plato.
 */
export const COMPACT_NODE_SIZE = { w: 160, h: 60 } as const;

/**
 * Notación que se asume cuando un modelo NO declara la suya. Es compatibilidad
 * con los datos: la app nació siendo sólo DDD, así que un grafo guardado sin el
 * campo `notation` es un modelo de dominio y hay que seguir leyéndolo así.
 * No es «la notación principal» — para eso está `INITIAL_NOTATION_ID`.
 */
export const DEFAULT_NOTATION_ID: NotationId = "ddd";

/**
 * Notación con la que arranca lo NUEVO (un proyecto, una vista). C4 es por donde
 * se suele abrir un modelo —el paisaje de sistemas— y desde ahí se baja al
 * proceso (BPMN) o al dominio (DDD). Cambiar esto no toca ningún dato guardado.
 */
export const INITIAL_NOTATION_ID: NotationId = "c4";

// =============================================================================
// DDD / Event Storming (notación original)
// =============================================================================

const DDD: Notation = {
  id: "ddd",
  label: "DDD / Event Storming",
  description:
    "Diseño estratégico y táctico de Domain-Driven Design con Event Storming.",
  paletteGroups: [
    {
      label: "Event Storming",
      types: ["Actor", "Sistema Externo", "Comando", "Evento", "Política", "Vista", "Regla de Negocio"],
    },
    {
      label: "Diseño Táctico (DDD)",
      types: ["Raíz de Agregado", "Entidad", "Objeto de Valor", "Servicio de Dominio", "Repositorio", "Fábrica"],
    },
    {
      label: "Contenedores (DDD)",
      types: ["Agregado", "Contexto Delimitado", "Subdominio"],
    },
    {
      // Mapa de Contexto — relación de poder entre contextos (quién manda en el
      // modelo compartido). Upstream (U, aguas arriba) influye; Downstream (D,
      // aguas abajo) depende.
      label: "Relación de Poder (Aguas Arriba/Aguas Abajo)",
      types: ["Cliente/Proveedor", "Conformista", "Partnership"],
    },
    {
      // Mapa de Contexto — cómo se integran/traducen los contextos.
      label: "Integración y Servicios",
      types: [
        "Servicio de Host Abierto (OHS)",
        "Lenguaje Publicado (PL)",
        "Capa Anticorrupción (ACL)",
        "Núcleo Compartido",
      ],
    },
    {
      // Mapa de Contexto — sin integración: cada contexto sigue su camino.
      label: "Aislamiento Total",
      types: ["Caminos Separados"],
    },
  ],
  elements: [
    // DDD se dibuja como MAPA DE CONCEPTOS: todo elemento es un óvalo unido por
    // relaciones con nombre. No son notas adhesivas pegadas en una pared —eso es
    // el tablero de un taller, no el modelo— así que la silueta es la misma para
    // todos y lo que distingue es el color, el icono y la relación.
    { type: "Comando", icon: "TerminalSquare", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Evento", icon: "Zap", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Actor", icon: "User", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Vista", icon: "RectangleHorizontal", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Regla de Negocio", icon: "Gavel", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Sistema Externo", icon: "HardDrive", shape: "ellipse", stroke: "stroke-zinc-400", bg: "fill-zinc-500", border: "border-zinc-500", text: "text-white" },
    { type: "Política", icon: "Milestone", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Raíz de Agregado", icon: "Crown", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Entidad", icon: "Fingerprint", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Objeto de Valor", icon: "Gem", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Servicio de Dominio", icon: "Cog", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Repositorio", icon: "Archive", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Fábrica", icon: "Factory", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // Agrupamientos del mapa: elipse punteada alrededor de los conceptos que
    // van juntos, con el nombre en el borde de abajo (ver `containerStyle`).
    { type: "Agregado", icon: "Package", container: true, containerStyle: "blob", stroke: "stroke-stone-700", bg: "fill-stone-950/40", border: "border-stone-800", text: "text-stone-100" },
    { type: "Contexto Delimitado", icon: "Box", container: true, containerStyle: "blob", stroke: "stroke-teal-500", bg: "fill-teal-950/40", border: "border-teal-500", text: "text-teal-100" },
    { type: "Subdominio", icon: "Layers", container: true, containerStyle: "blob", stroke: "stroke-fuchsia-500", bg: "fill-fuchsia-950/40", border: "border-fuchsia-500", text: "text-fuchsia-100" },
    // --- Mapa de Contexto: Relación de Poder (Aguas Arriba/Aguas Abajo) ---
    { type: "Cliente/Proveedor", icon: "ArrowLeftRight", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Conformista", icon: "ArrowRightToLine", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Partnership", icon: "Handshake", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // --- Mapa de Contexto: Integración y Servicios ---
    { type: "Servicio de Host Abierto (OHS)", icon: "DoorOpen", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Lenguaje Publicado (PL)", icon: "Languages", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Capa Anticorrupción (ACL)", icon: "ShieldHalf", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Núcleo Compartido", icon: "Share2", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // --- Mapa de Contexto: Aislamiento Total ---
    { type: "Caminos Separados", icon: "Unlink", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
  ],
  aiGuidance:
    "Aplica DDD y Lenguaje Ubicuo. Estratégico: Subdominios (Core/Supporting/Generic), Bounded Contexts y Mapa de Contexto. " +
    "Patrones del Mapa de Contexto: relación de poder Aguas Arriba (Upstream, U) → Aguas Abajo (Downstream, D): Cliente/Proveedor (Customer/Supplier), Conformista (el downstream adopta el modelo del upstream sin traducir) y Partnership (éxito/fracaso conjunto). " +
    "Integración y servicios: Servicio de Host Abierto (OHS, protocolo público del upstream), Lenguaje Publicado (PL, contrato/esquema compartido), Capa Anticorrupción (ACL, traduce y aísla el modelo ajeno) y Núcleo Compartido (Shared Kernel, modelo común entre dos contextos). " +
    "Aislamiento Total: Caminos Separados (Separate Ways, sin integración). " +
    "Táctico: Entidades, Objetos de Valor, Agregados con su Raíz, Eventos de Dominio, Servicios de Dominio, Repositorios y Fábricas.",
  analystRole: "analista DDD/Event Storming",
  modelLabel: "Modelo de Dominio",
  // DDD no cuenta una historia con inicio y fin: cuenta cómo un concepto central
  // se relaciona con todo lo demás (el mapa de patrones de Evans se dibuja así).
  // Por capas quedaba una rejilla que escondía justamente eso: las relaciones.
  defaultLayout: "radial",
  flowRules:
    "- Actor → Comando (relación \"ejecuta\")\n" +
    "- Comando → Evento (relación \"produce\")\n" +
    "- Evento → Política o Vista (relación \"dispara\")\n" +
    "- Política → Comando (relación \"dispara\")",
  defaultType: "Evento",
  namingRule:
    "nombre en Lenguaje Ubicuo (de negocio): Comando en imperativo (\"Registrar Reembolso\"), Evento en pasado (\"Reembolso Aprobado\")",
};

// =============================================================================
// BPMN (modelado de procesos de negocio)
// =============================================================================

const BPMN: Notation = {
  id: "bpmn",
  label: "BPMN (Procesos)",
  description: "Business Process Model and Notation: flujos de proceso de negocio.",
  paletteGroups: [
    {
      label: "Eventos",
      types: ["Evento de Inicio", "Evento Intermedio", "Evento de Fin", "Evento de Mensaje", "Evento Temporizador", "Evento de Error"],
    },
    {
      label: "Actividades y datos",
      types: ["Tarea", "Subproceso", "Objeto de Datos", "Almacén de Datos", "Anotación"],
    },
    {
      // Compuertas = puntos de decisión y sincronización del flujo.
      label: "Compuertas (decisiones)",
      types: ["Compuerta Exclusiva", "Compuerta Paralela", "Compuerta Inclusiva", "Compuerta de Eventos", "Compuerta"],
    },
    {
      label: "Contenedores (Swimlanes)",
      types: ["Pool", "Carril"],
    },
  ],
  elements: [
    // --- Eventos ---
    // Símbolos compactos al estilo BPMN: círculo pequeño con tinte -100 + anillo
    // fuerte -600, nombre debajo (como en las herramientas BPMN clásicas).
    { type: "Evento de Inicio", icon: "Play", shape: "ellipse", compact: true, stroke: "stroke-green-600", bg: "fill-green-950", border: "border-green-500", text: "text-green-100" },
    { type: "Evento Intermedio", icon: "Circle", shape: "ellipse", compact: true, stroke: "stroke-yellow-600", bg: "fill-yellow-950", border: "border-yellow-500", text: "text-yellow-100" },
    { type: "Evento de Fin", icon: "StopCircle", shape: "ellipse", compact: true, stroke: "stroke-red-600", bg: "fill-red-950", border: "border-red-500", text: "text-red-100" },
    { type: "Evento de Mensaje", icon: "Mail", shape: "ellipse", compact: true, stroke: "stroke-sky-600", bg: "fill-sky-950", border: "border-sky-500", text: "text-sky-100" },
    { type: "Evento Temporizador", icon: "Timer", shape: "ellipse", compact: true, stroke: "stroke-amber-600", bg: "fill-amber-950", border: "border-amber-500", text: "text-amber-100" },
    { type: "Evento de Error", icon: "AlertTriangle", shape: "ellipse", compact: true, stroke: "stroke-rose-600", bg: "fill-rose-950", border: "border-rose-500", text: "text-rose-100" },
    // --- Actividades y datos ---
    { type: "Tarea", icon: "Square", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Subproceso", icon: "Boxes", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Objeto de Datos", icon: "FileText", shape: "rect", stroke: "stroke-zinc-400", bg: "fill-zinc-500", border: "border-zinc-500", text: "text-white" },
    { type: "Almacén de Datos", icon: "Database", shape: "cylinder", stroke: "stroke-zinc-400", bg: "fill-zinc-500", border: "border-zinc-500", text: "text-white" },
    { type: "Anotación", icon: "MessageSquare", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // --- Compuertas (decisiones / bifurcaciones): rombo compacto, nombre debajo ---
    // Compuerta genérica: se conserva por compatibilidad con diagramas existentes.
    { type: "Compuerta", icon: "Diamond", shape: "diamond", compact: true, stroke: "stroke-amber-600", bg: "fill-amber-950", border: "border-amber-500", text: "text-amber-100" },
    { type: "Compuerta Exclusiva", icon: "X", shape: "diamond", compact: true, stroke: "stroke-orange-600", bg: "fill-orange-950", border: "border-orange-500", text: "text-orange-100" },
    { type: "Compuerta Paralela", icon: "Plus", shape: "diamond", compact: true, stroke: "stroke-emerald-600", bg: "fill-emerald-950", border: "border-emerald-500", text: "text-emerald-100" },
    { type: "Compuerta Inclusiva", icon: "Circle", shape: "diamond", compact: true, stroke: "stroke-indigo-600", bg: "fill-indigo-950", border: "border-indigo-500", text: "text-indigo-100" },
    { type: "Compuerta de Eventos", icon: "CircleDot", shape: "diamond", compact: true, stroke: "stroke-purple-600", bg: "fill-purple-950", border: "border-purple-500", text: "text-purple-100" },
    // --- Contenedores (los ÚNICOS transparentes: un fondo taparía a sus hijos) ---
    { type: "Pool", icon: "Container", container: true, transparent: true, containerStyle: "swimlane", stroke: "stroke-sky-600", bg: "fill-sky-950/40", border: "border-sky-600", text: "text-sky-900 dark:text-sky-200" },
    { type: "Carril", icon: "Rows3", container: true, transparent: true, containerStyle: "swimlane", stroke: "stroke-cyan-600", bg: "fill-cyan-950/40", border: "border-cyan-600", text: "text-cyan-900 dark:text-cyan-200" },
  ],
  aiGuidance:
    "Modela procesos BPMN: Pools y Carriles (lanes) por responsable; Eventos de Inicio/Intermedio/Fin y sus variantes (Mensaje, Temporizador, Error); Tareas y Subprocesos; Objetos y Almacenes de Datos; Anotaciones. " +
    "Para las DECISIONES y bifurcaciones del flujo usa Compuertas: Exclusiva (XOR, un único camino según condición), Paralela (AND, todos los caminos en simultáneo), Inclusiva (OR, uno o más caminos) y Basada en Eventos (el camino lo decide qué evento ocurre primero). " +
    "El flujo de secuencia conecta actividades en orden temporal; de cada compuerta exclusiva/inclusiva salen aristas etiquetadas con la condición de cada rama.",
  analystRole: "analista de procesos de negocio (BPMN)",
  modelLabel: "Modelo de Procesos",
  flowRules:
    "- Evento de Inicio → Tarea (relación \"secuencia\")\n" +
    "- Tarea → Tarea o Compuerta Exclusiva (relación \"secuencia\")\n" +
    "- Compuerta Exclusiva → Tarea (relación = la CONDICIÓN de la rama, p. ej. \"pago aprobado\")\n" +
    "- Tarea → Evento de Fin (relación \"secuencia\")",
  defaultType: "Tarea",
  namingRule:
    "nombre de actividad en infinitivo verbo + objeto (\"Validar documento\"); los eventos describen el hecho (\"Pedido confirmado\")",
};

// =============================================================================
// C4 (arquitectura de software por niveles)
// =============================================================================

const C4: Notation = {
  id: "c4",
  label: "C4 (Arquitectura)",
  description: "Modelo C4: Contexto, Contenedores, Componentes.",
  paletteGroups: [
    {
      label: "Actores y sistemas",
      types: ["Persona", "Sistema", "Sistema Externo"],
    },
    {
      label: "Contenedores y componentes",
      types: ["Contenedor", "Componente", "Base de Datos"],
    },
    {
      label: "Límites",
      types: ["Límite de Sistema", "Límite de Contenedor"],
    },
  ],
  elements: [
    // Paleta NEUTRA (estilo IcePanel): la caja no codifica el nivel —para eso
    // está el `[Tipo]` de la ficha— así que todas son del mismo grafito y el
    // color queda libre para lo que sí distingue, el icono. La escala de azules
    // de Structurizr obligaba a memorizar cuatro tonos para leer lo que el texto
    // ya dice. Lo de TERCEROS sí se atenúa: es la única jerarquía que el ojo
    // necesita de un vistazo.
    { type: "Persona", icon: "User", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Sistema", icon: "Box", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Sistema Externo", icon: "HardDrive", shape: "rounded", stroke: "stroke-zinc-400", bg: "fill-zinc-500", border: "border-zinc-500", text: "text-white" },
    { type: "Contenedor", icon: "Container", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Componente", icon: "Component", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Base de Datos", icon: "Database", shape: "cylinder", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // Los límites son marcos: su nombre se lee sobre el lienzo, así que el color
    // del texto cambia con el tema (en oscuro, un -900 era invisible).
    { type: "Límite de Sistema", icon: "Frame", container: true, transparent: true, stroke: "stroke-zinc-400", bg: "fill-transparent", border: "border-zinc-400", text: "text-zinc-700 dark:text-zinc-200" },
    { type: "Límite de Contenedor", icon: "SquareDashedBottom", container: true, transparent: true, stroke: "stroke-zinc-400", bg: "fill-transparent", border: "border-zinc-400", text: "text-zinc-600 dark:text-zinc-300" },
  ],
  aiGuidance:
    "Aplica el modelo C4 (Simon Brown): nivel 1 Contexto (Personas y Sistemas y sus relaciones), nivel 2 Contenedores (apps/servicios/bases de datos dentro del Límite de Sistema), nivel 3 Componentes dentro de cada Contenedor. Etiqueta relaciones con tecnología/protocolo (ej. 'usa [HTTPS/JSON]').",
  analystRole: "arquitecto de software que modela en C4 (Simon Brown)",
  modelLabel: "Modelo de Arquitectura",
  flowRules:
    "- Persona → Sistema (relación \"usa\")\n" +
    "- Sistema → Contenedor (relación \"contiene\")\n" +
    "- Contenedor → Base de Datos (relación \"lee y escribe [JDBC]\")\n" +
    "- Contenedor → Sistema Externo (relación \"consume [HTTPS/JSON]\")\n" +
    "- Contenedor → Componente (relación \"contiene\")",
  defaultRouting: "curved",
  defaultType: "Contenedor",
  namingRule:
    "nombre técnico del elemento y su rol (\"API de Pedidos\", \"App Web de Clientes\"); sin verbos de acción",
};

// =============================================================================
// UML (diagramas de clases / componentes)
// =============================================================================

const UML: Notation = {
  id: "uml",
  label: "UML",
  description: "Unified Modeling Language: clases, componentes y casos de uso.",
  paletteGroups: [
    {
      label: "Estructura (Clases)",
      types: [
        "Clase",
        "Clase Abstracta",
        "Interfaz",
        "Enumeración",
        "Tipo de Dato",
        "Clase Plantilla",
        "Clase de Asociación",
        "Estereotipo",
      ],
    },
    {
      label: "Componentes y despliegue",
      types: [
        "Componente",
        "Puerto",
        "Interfaz Provista",
        "Interfaz Requerida",
        "Artefacto de Despliegue",
        "Nodo",
        "Dispositivo",
        "Entorno de Ejecución",
      ],
    },
    {
      // Diagrama de SECUENCIA: los participantes son líneas de vida y el tiempo
      // baja. Los mensajes son ARISTAS (punteada = retorno), no elementos.
      label: "Secuencia (interacción)",
      types: ["Línea de Vida", "Activación", "Fragmento", "Mensaje Perdido"],
    },
    {
      label: "Casos de uso y contenedores",
      types: ["Actor", "Caso de Uso", "Nota", "Paquete"],
    },
    {
      // Diagrama de máquina de estados: ciclo de vida de un objeto.
      label: "Máquina de Estados",
      types: ["Estado Inicial", "Estado", "Estado Compuesto", "Decisión", "Historial", "Estado Final"],
    },
    {
      // Diagrama de actividad: flujo de control con decisiones y paralelismo.
      label: "Actividad (flujos de decisión)",
      types: ["Inicio de Actividad", "Acción", "Nodo de Decisión", "Bifurcación/Unión", "Fin de Actividad"],
    },
  ],
  elements: [
    { type: "Clase", icon: "Box", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Clase Abstracta", icon: "BoxSelect", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Interfaz", icon: "Plug", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Enumeración", icon: "List", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // Tipos que NO son clases pero viven en el diagrama de clases: el tipo de
    // dato (valor sin identidad), la plantilla (genérico) y el estereotipo
    // («entity», «service»), que es la extensión estándar de UML.
    { type: "Tipo de Dato", icon: "Type", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Clase Plantilla", icon: "Braces", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Clase de Asociación", icon: "Link2", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Estereotipo", icon: "Tag", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Componente", icon: "Component", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Nodo", icon: "Server", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // Actor UML: figura humana (stick figure), como en las herramientas UML clásicas.
    { type: "Actor", icon: "PersonStanding", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Caso de Uso", icon: "Circle", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // Nota adhesiva UML (comentario anclable a cualquier elemento).
    { type: "Nota", icon: "StickyNote", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Paquete", icon: "Folder", container: true, transparent: true, stroke: "stroke-yellow-600", bg: "fill-yellow-950/40", border: "border-yellow-500", text: "text-yellow-900 dark:text-yellow-200" },
    // Diagrama de componentes: el puerto es el punto de conexión del componente
    // y las interfaces son el par lollipop (provista) / socket (requerida). Van
    // COMPACTOS: su figura es el símbolo, el nombre va debajo.
    { type: "Puerto", icon: "Square", shape: "rect", compact: true, stroke: "stroke-zinc-400", bg: "fill-zinc-600", border: "border-zinc-500", text: "text-zinc-100" },
    { type: "Interfaz Provista", icon: "Circle", shape: "ellipse", compact: true, stroke: "stroke-zinc-400", bg: "fill-zinc-600", border: "border-zinc-500", text: "text-zinc-100" },
    { type: "Interfaz Requerida", icon: "CircleDashed", shape: "ellipse", compact: true, stroke: "stroke-zinc-400", bg: "fill-zinc-600", border: "border-zinc-500", text: "text-zinc-100" },
    { type: "Artefacto de Despliegue", icon: "FileCode2", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    // Despliegue: el dispositivo es hardware; el entorno de ejecución ANIDA lo
    // que corre dentro (servidor de aplicaciones, contenedor, runtime).
    { type: "Dispositivo", icon: "Smartphone", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Entorno de Ejecución", icon: "Cpu", container: true, transparent: true, stroke: "stroke-teal-500", bg: "fill-teal-950/40", border: "border-teal-500", text: "text-teal-900 dark:text-teal-200" },
    // --- Secuencia (interacción) ---
    // La línea de vida es un CONTENEDOR: las activaciones y los mensajes se
    // colocan dentro, y el tiempo baja por su línea punteada.
    { type: "Línea de Vida", icon: "Rows3", container: true, containerStyle: "lifeline", transparent: true, stroke: "stroke-indigo-400", bg: "fill-indigo-950/40", border: "border-indigo-400", text: "text-indigo-900 dark:text-indigo-200" },
    { type: "Activación", icon: "Minus", shape: "rect", stroke: "stroke-indigo-400", bg: "fill-indigo-700", border: "border-indigo-500", text: "text-white" },
    // Fragmento combinado (alt / opt / loop / par): marco con la etiqueta del
    // operador; lo que encierra es la parte condicional de la interacción.
    { type: "Fragmento", icon: "Frame", container: true, transparent: true, stroke: "stroke-indigo-500", bg: "fill-indigo-950/40", border: "border-indigo-500", text: "text-indigo-900 dark:text-indigo-200" },
    // Mensaje perdido/encontrado: la punta que no tiene participante al otro lado.
    { type: "Mensaje Perdido", icon: "Circle", shape: "ellipse", compact: true, hideIcon: true, stroke: "stroke-indigo-300", bg: "fill-indigo-300", border: "border-indigo-500", text: "text-indigo-100" },
    // --- Máquina de estados ---
    // Pseudoestado inicial CANÓNICO: punto sólido oscuro, sin icono (la figura
    // rellena ES el símbolo UML).
    { type: "Estado Inicial", icon: "Disc", shape: "ellipse", compact: true, hideIcon: true, stroke: "stroke-slate-400", bg: "fill-slate-300", border: "border-slate-800", text: "text-slate-100" },
    { type: "Estado", icon: "ToggleLeft", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Estado Compuesto", icon: "Boxes", container: true, transparent: true, stroke: "stroke-sky-500", bg: "fill-sky-950/40", border: "border-sky-500", text: "text-sky-900 dark:text-sky-200" },
    // Rombo de decisión canónico: vacío por dentro (las guardas van en las aristas).
    { type: "Decisión", icon: "Diamond", shape: "diamond", compact: true, hideIcon: true, stroke: "stroke-amber-600", bg: "fill-amber-950", border: "border-amber-500", text: "text-amber-100" },
    { type: "Historial", icon: "History", shape: "ellipse", compact: true, stroke: "stroke-purple-500", bg: "fill-purple-950", border: "border-purple-400", text: "text-purple-100" },
    // Estado final: círculo con anillo (ojo de buey).
    { type: "Estado Final", icon: "Target", shape: "ellipse", compact: true, stroke: "stroke-slate-700", bg: "fill-slate-950", border: "border-slate-700", text: "text-slate-100" },
    // --- Diagrama de actividad ---
    // Nodo inicial canónico: punto sólido (verde oscuro para distinguirlo del de estados).
    { type: "Inicio de Actividad", icon: "Disc", shape: "ellipse", compact: true, hideIcon: true, stroke: "stroke-emerald-400", bg: "fill-emerald-300", border: "border-emerald-700", text: "text-emerald-100" },
    { type: "Acción", icon: "Activity", shape: "rounded", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Nodo de Decisión", icon: "GitBranch", shape: "diamond", compact: true, hideIcon: true, stroke: "stroke-orange-600", bg: "fill-orange-950", border: "border-orange-500", text: "text-orange-100" },
    // Barra de bifurcación/unión (fork/join): icono Minus evoca la barra; trazo
    // y texto oscuros para legibilidad en paleta y lienzo.
    { type: "Bifurcación/Unión", icon: "Minus", shape: "rect", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
    { type: "Fin de Actividad", icon: "Target", shape: "ellipse", stroke: "stroke-zinc-500", bg: "fill-zinc-700", border: "border-zinc-700", text: "text-white" },
  ],
  aiGuidance:
    "Aplica UML. Diagramas de clases (Clases, Clases Abstractas, Interfaces, Enumeraciones, Tipos de Dato, Clases Plantilla —genéricas—, Clases de Asociación y Estereotipos «como este», con relaciones de herencia, implementación, asociación, agregación, composición y dependencia), de componentes (Componentes con sus Puertos e Interfaces Provista/Requerida, y Artefactos de Despliegue), de despliegue (Nodos, Dispositivos y Entornos de Ejecución que ANIDAN lo que corre dentro) y de casos de uso (Actores y Casos de Uso agrupados en Paquetes). " +
    "Diagrama de SECUENCIA: una Línea de Vida por participante (es un contenedor y el tiempo baja por su línea punteada), Activaciones para el tramo en que el participante ejecuta, Fragmentos para lo condicional (etiquetá el operador: alt, opt, loop, par) y Mensaje Perdido cuando la punta no tiene participante al otro lado. Los mensajes son ARISTAS ordenadas de arriba hacia abajo: continua para la llamada y PUNTEADA para el retorno. " +
    "Máquina de estados (motor de estados): modela el ciclo de vida de un objeto con Estado Inicial (pseudoestado de arranque), Estados y Estados Compuestos (anidan subestados), Decisión (elige rama según guarda), Historial (recuerda el último subestado) y Estado Final; las transiciones se etiquetan 'evento [guarda] / acción'. " +
    "Diagrama de actividad (flujos de decisión): Inicio de Actividad, Acciones, Nodo de Decisión (bifurca según condición) y su unión, Bifurcación/Unión (fork/join para flujos paralelos) y Fin de Actividad. " +
    "Para un diagrama de secuencia en CÓDIGO (sin lienzo) existe además la vista Mermaid.",
  analystRole: "modelador UML",
  modelLabel: "Modelo UML",
  flowRules:
    "- Actor → Caso de Uso (relación \"asocia\")\n" +
    "- Clase → Clase (relación \"asocia\", \"hereda\" o \"depende\")\n" +
    "- Clase → Interfaz (relación \"implementa\")\n" +
    "- Componente → Interfaz Provista (relación \"expone\")\n" +
    "- Interfaz Requerida → Interfaz Provista (relación \"consume\")\n" +
    "- Línea de Vida → Línea de Vida (relación = el mensaje; punteada = retorno)\n" +
    "- Estado Inicial → Estado (relación = el evento de la transición)\n" +
    "- Acción → Nodo de Decisión → Acción (relación = la guarda de la rama)",
  defaultType: "Clase",
  namingRule:
    "Clases/Interfaces en sustantivo singular PascalCase (\"PedidoDeCompra\"); Casos de Uso y Acciones en verbo + objeto (\"Rastrear Envío\"); Estados en participio o adjetivo (\"En tránsito\")",
};

// =============================================================================
// Registro y utilidades
// =============================================================================

export const NOTATIONS: Record<NotationId, Notation> = {
  ddd: DDD,
  bpmn: BPMN,
  c4: C4,
  uml: UML,
};

/** Lista ordenada para los SELECT. */
export const NOTATION_LIST: Notation[] = [DDD, BPMN, C4, UML];

export function getNotation(id: NotationId | string | undefined): Notation {
  // La caída es la notación por defecto DECLARADA, no una cableada: si no,
  // cambiar el default deja media app hablando de la otra notación.
  return NOTATIONS[(id as NotationId)] ?? NOTATIONS[DEFAULT_NOTATION_ID];
}

/**
 * Clases Tailwind del badge de notación (pestañas/vistas), con color por FAMILIA.
 * Un color propio por notación deja escanear de un vistazo qué es cada vista sin
 * leer la etiqueta. Incluye variantes dark: para no romper el tema oscuro.
 * Desconocida → cae a DDD (coherente con getNotation).
 */
const NOTATION_BADGE: Record<NotationId, string> = {
  ddd: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  bpmn: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  c4: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  uml: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
};

export function notationBadgeClass(id: NotationId | string | undefined): string {
  return NOTATION_BADGE[(id as NotationId)] ?? NOTATION_BADGE.ddd;
}

/**
 * Clase de fondo para un SWATCH HTML (leyenda) a partir del relleno SVG del
 * elemento. En el lienzo el relleno es `fill-*` (SVG); un <div> necesita `bg-*`.
 * Traducir la misma clase mantiene el color del swatch idéntico al del nodo.
 */
export function swatchClass(el: NotationElement): string {
  return el.bg.replace(/^fill-/, "bg-");
}

/** Conjunto GLOBAL de tipos contenedor (de todas las notaciones). */
export const ALL_CONTAINER_TYPES: ReadonlySet<string> = new Set(
  NOTATION_LIST.flatMap((n) => n.elements.filter((e) => e.container).map((e) => e.type))
);

/** Mapa GLOBAL tipo → metadatos visuales (de todas las notaciones). */
export const ALL_ELEMENTS: Record<string, NotationElement> = Object.fromEntries(
  NOTATION_LIST.flatMap((n) => n.elements.map((e) => [e.type, e]))
);

/** Tipo contenedor según el registro de notaciones (independiente de la notación activa). */
export const isNotationContainer = (type: string): boolean => ALL_CONTAINER_TYPES.has(type);

/**
 * Tipos de una notación para ofrecer/validar en la UI y en los prompts.
 * `includeContainers: false` (por defecto) deja fuera Pool/Agregado/Paquete…:
 * en el lienzo los contenedores se crean arrastrando un marco, no como nodo,
 * y ofrecerlos como "tipo de nodo" confunde.
 */
export function notationTypes(
  id: NotationId | string | undefined,
  opts: { includeContainers?: boolean } = {}
): string[] {
  const els = getNotation(id).elements;
  return (opts.includeContainers ? els : els.filter((e) => !e.container)).map((e) => e.type);
}

/** true → el contenedor se dibuja como swimlane BPMN (banda lateral, línea continua). */
export const isSwimlaneContainer = (type: string): boolean =>
  ALL_ELEMENTS[type]?.containerStyle === "swimlane";

/** true → el contenedor es una LÍNEA DE VIDA (caja arriba + línea de tiempo). */
export const isLifelineContainer = (type: string): boolean =>
  ALL_ELEMENTS[type]?.containerStyle === "lifeline";

/** true si el contenedor se dibuja como ELIPSE punteada (mapa de conceptos). */
export const isBlobContainer = (type: string): boolean =>
  ALL_ELEMENTS[type]?.containerStyle === "blob";

/**
 * Notación dueña de cada tipo. Se calcula una vez: el lienzo sólo conoce el
 * `tipo_elemento` del nodo y necesita llegar a lo que declara su notación
 * (tamaño, rotulado) sin saber cuál está activa.
 */
const NOTATION_BY_TYPE: Record<string, Notation> = (() => {
  const dueños = new Map<string, Notation[]>();
  for (const n of NOTATION_LIST) {
    for (const e of n.elements) dueños.set(e.type, [...(dueños.get(e.type) ?? []), n]);
  }
  // Los tipos AMBIGUOS ("Sistema Externo" vive en DDD y en C4) quedan fuera: sin
  // saber la notación de la vista, elegir una sería dibujar el nodo con la
  // simbología de la otra. Sin dueño, valen los valores por defecto.
  return Object.fromEntries(
    [...dueños].filter(([, ns]) => ns.length === 1).map(([type, ns]) => [type, ns[0]])
  );
})();

/**
 * Tamaño del nodo suelto de un tipo: lo que MIDE al dibujarse. Quien necesite
 * medir un nodo (lienzo, minimapa, layout, export) pregunta acá en vez de
 * repetir la constante. El único 160 que sobrevive fuera es `NODE_W` de
 * `mcp/diagram-builder`, que acota nombres y no dibuja nada.
 */
export function sizeOfType(type: string, notation?: NotationId | string): { w: number; h: number } {
  if (ALL_ELEMENTS[type]?.compact) return COMPACT_NODE_SIZE;
  return notationOf(type, notation).nodeSize ?? DEFAULT_NODE_SIZE;
}

/** Tamaño de nodo de una notación (para el layout, que dispone por notación). */
export function nodeSizeForNotation(
  notation: NotationId | string | undefined
): { w: number; h: number } {
  return getNotation(notation).nodeSize ?? DEFAULT_NODE_SIZE;
}

/** Trazo por defecto de las relaciones de una notación (ver `defaultRouting`). */
export function defaultRoutingFor(
  notation: NotationId | string | undefined
): "straight" | "curved" | "orthogonal" {
  return getNotation(notation).defaultRouting ?? "straight";
}

/** Cómo se rotula un nodo suelto de ese tipo (ver `labelLayout`). */
export function labelLayoutOfType(
  type: string,
  notation?: NotationId | string
): "center" | "detail" {
  // `detail` es el rotulado de TODA la app: la ficha (icono chico arriba, nombre,
  // descripción y `[Tipo]`) dice lo mismo en cualquier notación. Una notación
  // puede pedir `center` explícitamente si su símbolo no admite texto dentro.
  return notationOf(type, notation).labelLayout ?? "detail";
}

/**
 * Notación desde la que hay que leer un tipo. Hay tipos con el MISMO nombre en
 * dos notaciones ("Sistema Externo" está en DDD y en C4) y difieren en tamaño y
 * rotulado: si la vista dice en qué notación está, esa manda. Sin ese dato se
 * cae al dueño del índice global, que es lo mejor que se puede saber.
 */
function notationOf(type: string, notation?: NotationId | string): Partial<Notation> {
  const activa = notation ? NOTATIONS[notation as NotationId] : undefined;
  if (activa?.elements.some((e) => e.type === type)) return activa;
  return NOTATION_BY_TYPE[type] ?? {};
}

/**
 * Etiqueta del contenedor típico de la notación (Agregado, Pool, Límite de
 * Sistema, Paquete). La UI la usa para rotular filtros y grupos sin cablear
 * "Agregado", que solo significa algo en DDD.
 */
export function notationContainerLabel(id: NotationId | string | undefined): string {
  return getNotation(id).elements.find((e) => e.container)?.type ?? "Grupo";
}

/** Tipos de TODAS las notaciones (para filtros globales del visor de modelos). */
export const ALL_NODE_TYPES: string[] = Object.keys(ALL_ELEMENTS);

// =============================================================================
// Roles semánticos (papel que juega un tipo en el flujo de su notación)
// =============================================================================

/**
 * Papel de un tipo dentro del flujo de su notación. Existe para que las reglas
 * de calidad (¿hay evento de inicio? ¿las ramas de la decisión están
 * etiquetadas? ¿la política cruza contextos?) se escriban sobre ROLES y no
 * sobre literales como "Compuerta Exclusiva": así una notación nueva hereda las
 * reglas declarando sus roles, y `notations.ts` sigue siendo la única fuente de
 * verdad de los tipos (P6 de la constitución).
 */
export type ElementRole =
  | "start" // arranca el flujo (Evento de Inicio, pseudoestado inicial)
  | "end" // lo cierra (Evento de Fin, Estado Final)
  | "gateway" // bifurca según condición (Compuertas, Decisión)
  | "task" // trabajo ejecutable (Tarea, Acción)
  | "command" // intención que dispara un cambio (Comando)
  | "event" // hecho consumado (Evento)
  | "policy" // reacción "cuando X entonces Y"
  | "rule" // restricción de negocio
  | "actor" // persona/rol externo al sistema
  | "external" // sistema de terceros
  | "system" // pieza de software propia (C4)
  | "datastore" // almacén de datos
  | "context" // frontera de dominio (Agregado, Contexto, Subdominio)
  | "pool" // participante de un proceso (proceso independiente)
  | "lane" // rol dentro de un participante
  | "boundary"; // marco lógico (Límite de Sistema, Paquete)

/**
 * Roles por notación. Sólo se declaran los tipos con papel en el FLUJO: lo que
 * no aparece aquí es decorativo para las reglas (Nota, Anotación, Objeto de
 * Valor…). El test `notations-agnostic` verifica que cada tipo listado exista
 * en su notación, para que la tabla no se desincronice del registro.
 */
const ELEMENT_ROLES: Record<NotationId, Partial<Record<ElementRole, string[]>>> = {
  ddd: {
    command: ["Comando"],
    event: ["Evento"],
    policy: ["Política"],
    rule: ["Regla de Negocio"],
    actor: ["Actor"],
    external: ["Sistema Externo"],
    context: ["Agregado", "Contexto Delimitado", "Subdominio"],
  },
  bpmn: {
    start: ["Evento de Inicio"],
    end: ["Evento de Fin"],
    event: ["Evento Intermedio", "Evento de Mensaje", "Evento Temporizador", "Evento de Error"],
    task: ["Tarea", "Subproceso"],
    gateway: [
      "Compuerta",
      "Compuerta Exclusiva",
      "Compuerta Paralela",
      "Compuerta Inclusiva",
      "Compuerta de Eventos",
    ],
    datastore: ["Almacén de Datos"],
    pool: ["Pool"],
    lane: ["Carril"],
  },
  c4: {
    actor: ["Persona"],
    system: ["Sistema", "Contenedor", "Componente"],
    external: ["Sistema Externo"],
    datastore: ["Base de Datos"],
    boundary: ["Límite de Sistema", "Límite de Contenedor"],
  },
  uml: {
    start: ["Estado Inicial", "Inicio de Actividad"],
    end: ["Estado Final", "Fin de Actividad"],
    gateway: ["Decisión", "Nodo de Decisión"],
    task: ["Acción", "Estado", "Caso de Uso", "Activación"],
    actor: ["Actor"],
    system: ["Componente", "Nodo", "Dispositivo", "Artefacto de Despliegue"],
    // La línea de vida es el PARTICIPANTE de la interacción: mismo papel que el
    // Pool de BPMN (una columna por quien participa).
    pool: ["Línea de Vida"],
    boundary: ["Paquete", "Estado Compuesto", "Fragmento", "Entorno de Ejecución"],
  },
};

/** Tipos de una notación que juegan un rol dado (vacío si la notación no lo tiene). */
export function typesWithRole(
  id: NotationId | string | undefined,
  role: ElementRole
): string[] {
  return ELEMENT_ROLES[getNotation(id).id][role] ?? [];
}

/** Rol de un tipo dentro de una notación (undefined si no juega ninguno). */
export function roleOfType(
  id: NotationId | string | undefined,
  type: string
): ElementRole | undefined {
  const table = ELEMENT_ROLES[getNotation(id).id];
  for (const [role, types] of Object.entries(table)) {
    if (types?.includes(type)) return role as ElementRole;
  }
  return undefined;
}

/** true si `type` juega alguno de los roles indicados en esa notación. */
export function hasRole(
  id: NotationId | string | undefined,
  type: string,
  ...roles: ElementRole[]
): boolean {
  const role = roleOfType(id, type);
  return role !== undefined && roles.includes(role);
}

/** Tabla completa de roles de una notación (para tests y para el catálogo MCP). */
export function notationRoles(
  id: NotationId | string | undefined
): Partial<Record<ElementRole, string[]>> {
  return ELEMENT_ROLES[getNotation(id).id];
}
