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
   */
  containerStyle?: "boundary" | "swimlane";
  /** Clase tailwind de trazo SVG (stroke-*) que dibuja el contorno del nodo. */
  stroke?: string;
  /** Clases tailwind: relleno SVG, borde y texto. */
  bg: string;
  border: string;
  text: string;
  /**
   * Color del texto en la PALETA (fondo blanco). Necesario cuando `text` es
   * blanco porque el nodo tiene relleno oscuro (C4 canónico): blanco sobre la
   * paleta sería invisible. Si falta, la paleta usa `text`.
   */
  paletteText?: string;
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
}

export const DEFAULT_NOTATION_ID: NotationId = "ddd";

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
    // Notas adhesivas del Event Storming: relleno -100 + contorno sutil del
    // mismo tono (antes no tenían trazo y los bordes se veían difusos).
    { type: "Comando", icon: "TerminalSquare", stroke: "stroke-blue-300", bg: "fill-blue-100", border: "border-blue-300", text: "text-blue-800" },
    { type: "Evento", icon: "Zap", stroke: "stroke-orange-300", bg: "fill-orange-100", border: "border-orange-300", text: "text-orange-800" },
    { type: "Actor", icon: "User", stroke: "stroke-emerald-300", bg: "fill-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
    { type: "Vista", icon: "RectangleHorizontal", stroke: "stroke-cyan-300", bg: "fill-cyan-100", border: "border-cyan-300", text: "text-cyan-800" },
    { type: "Regla de Negocio", icon: "Gavel", stroke: "stroke-yellow-300", bg: "fill-yellow-100", border: "border-yellow-300", text: "text-yellow-800" },
    { type: "Sistema Externo", icon: "HardDrive", stroke: "stroke-indigo-300", bg: "fill-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
    { type: "Política", icon: "Milestone", stroke: "stroke-purple-300", bg: "fill-purple-100", border: "border-purple-300", text: "text-purple-800" },
    { type: "Raíz de Agregado", icon: "Crown", stroke: "stroke-rose-400", bg: "fill-rose-100", border: "border-rose-400", text: "text-rose-900" },
    { type: "Entidad", icon: "Fingerprint", stroke: "stroke-pink-300", bg: "fill-pink-100", border: "border-pink-300", text: "text-pink-800" },
    { type: "Objeto de Valor", icon: "Gem", stroke: "stroke-violet-300", bg: "fill-violet-100", border: "border-violet-300", text: "text-violet-800" },
    { type: "Servicio de Dominio", icon: "Cog", stroke: "stroke-slate-300", bg: "fill-slate-100", border: "border-slate-300", text: "text-slate-800" },
    { type: "Repositorio", icon: "Archive", stroke: "stroke-amber-300", bg: "fill-amber-100", border: "border-amber-300", text: "text-amber-800" },
    { type: "Fábrica", icon: "Factory", stroke: "stroke-lime-300", bg: "fill-lime-100", border: "border-lime-300", text: "text-lime-800" },
    { type: "Agregado", icon: "Package", container: true, stroke: "stroke-stone-700", bg: "fill-stone-100", border: "border-stone-800", text: "text-pink-900" },
    { type: "Contexto Delimitado", icon: "Box", container: true, stroke: "stroke-teal-500", bg: "fill-teal-50", border: "border-teal-500", text: "text-teal-900" },
    { type: "Subdominio", icon: "Layers", container: true, stroke: "stroke-fuchsia-500", bg: "fill-fuchsia-50", border: "border-fuchsia-500", text: "text-fuchsia-900" },
    // --- Mapa de Contexto: Relación de Poder (Aguas Arriba/Aguas Abajo) ---
    { type: "Cliente/Proveedor", icon: "ArrowLeftRight", shape: "rect", stroke: "stroke-red-400", bg: "fill-red-100", border: "border-red-400", text: "text-red-900" },
    { type: "Conformista", icon: "ArrowRightToLine", shape: "rect", stroke: "stroke-orange-400", bg: "fill-orange-100", border: "border-orange-400", text: "text-orange-900" },
    { type: "Partnership", icon: "Handshake", shape: "rect", stroke: "stroke-amber-400", bg: "fill-amber-100", border: "border-amber-400", text: "text-amber-900" },
    // --- Mapa de Contexto: Integración y Servicios ---
    { type: "Servicio de Host Abierto (OHS)", icon: "DoorOpen", shape: "rect", stroke: "stroke-sky-400", bg: "fill-sky-100", border: "border-sky-400", text: "text-sky-900" },
    { type: "Lenguaje Publicado (PL)", icon: "Languages", shape: "rect", stroke: "stroke-blue-400", bg: "fill-blue-100", border: "border-blue-400", text: "text-blue-900" },
    { type: "Capa Anticorrupción (ACL)", icon: "ShieldHalf", shape: "rect", stroke: "stroke-indigo-400", bg: "fill-indigo-100", border: "border-indigo-400", text: "text-indigo-900" },
    { type: "Núcleo Compartido", icon: "Share2", shape: "rect", stroke: "stroke-cyan-400", bg: "fill-cyan-100", border: "border-cyan-400", text: "text-cyan-900" },
    // --- Mapa de Contexto: Aislamiento Total ---
    { type: "Caminos Separados", icon: "Unlink", shape: "rect", stroke: "stroke-zinc-400", bg: "fill-zinc-100", border: "border-zinc-400", text: "text-zinc-800" },
  ],
  aiGuidance:
    "Aplica DDD y Lenguaje Ubicuo. Estratégico: Subdominios (Core/Supporting/Generic), Bounded Contexts y Mapa de Contexto. " +
    "Patrones del Mapa de Contexto: relación de poder Aguas Arriba (Upstream, U) → Aguas Abajo (Downstream, D): Cliente/Proveedor (Customer/Supplier), Conformista (el downstream adopta el modelo del upstream sin traducir) y Partnership (éxito/fracaso conjunto). " +
    "Integración y servicios: Servicio de Host Abierto (OHS, protocolo público del upstream), Lenguaje Publicado (PL, contrato/esquema compartido), Capa Anticorrupción (ACL, traduce y aísla el modelo ajeno) y Núcleo Compartido (Shared Kernel, modelo común entre dos contextos). " +
    "Aislamiento Total: Caminos Separados (Separate Ways, sin integración). " +
    "Táctico: Entidades, Objetos de Valor, Agregados con su Raíz, Eventos de Dominio, Servicios de Dominio, Repositorios y Fábricas.",
  analystRole: "analista DDD/Event Storming",
  modelLabel: "Modelo de Dominio",
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
    { type: "Evento de Inicio", icon: "Play", shape: "ellipse", compact: true, stroke: "stroke-green-600", bg: "fill-green-100", border: "border-green-500", text: "text-green-800" },
    { type: "Evento Intermedio", icon: "Circle", shape: "ellipse", compact: true, stroke: "stroke-yellow-600", bg: "fill-yellow-100", border: "border-yellow-500", text: "text-yellow-800" },
    { type: "Evento de Fin", icon: "StopCircle", shape: "ellipse", compact: true, stroke: "stroke-red-600", bg: "fill-red-100", border: "border-red-500", text: "text-red-800" },
    { type: "Evento de Mensaje", icon: "Mail", shape: "ellipse", compact: true, stroke: "stroke-sky-600", bg: "fill-sky-100", border: "border-sky-500", text: "text-sky-800" },
    { type: "Evento Temporizador", icon: "Timer", shape: "ellipse", compact: true, stroke: "stroke-amber-600", bg: "fill-amber-100", border: "border-amber-500", text: "text-amber-800" },
    { type: "Evento de Error", icon: "AlertTriangle", shape: "ellipse", compact: true, stroke: "stroke-rose-600", bg: "fill-rose-100", border: "border-rose-500", text: "text-rose-800" },
    // --- Actividades y datos ---
    { type: "Tarea", icon: "Square", shape: "rounded", stroke: "stroke-blue-400", bg: "fill-blue-50", border: "border-blue-300", text: "text-blue-800" },
    { type: "Subproceso", icon: "Boxes", shape: "rounded", stroke: "stroke-indigo-400", bg: "fill-indigo-50", border: "border-indigo-300", text: "text-indigo-800" },
    { type: "Objeto de Datos", icon: "FileText", shape: "rect", stroke: "stroke-slate-300", bg: "fill-slate-100", border: "border-slate-300", text: "text-slate-800" },
    { type: "Almacén de Datos", icon: "Database", shape: "cylinder", stroke: "stroke-slate-400", bg: "fill-slate-100", border: "border-slate-400", text: "text-slate-800" },
    { type: "Anotación", icon: "MessageSquare", shape: "rect", stroke: "stroke-zinc-300", bg: "fill-zinc-50", border: "border-zinc-300", text: "text-zinc-700" },
    // --- Compuertas (decisiones / bifurcaciones): rombo compacto, nombre debajo ---
    // Compuerta genérica: se conserva por compatibilidad con diagramas existentes.
    { type: "Compuerta", icon: "Diamond", shape: "diamond", compact: true, stroke: "stroke-amber-600", bg: "fill-amber-100", border: "border-amber-500", text: "text-amber-900" },
    { type: "Compuerta Exclusiva", icon: "X", shape: "diamond", compact: true, stroke: "stroke-orange-600", bg: "fill-orange-100", border: "border-orange-500", text: "text-orange-900" },
    { type: "Compuerta Paralela", icon: "Plus", shape: "diamond", compact: true, stroke: "stroke-emerald-600", bg: "fill-emerald-100", border: "border-emerald-500", text: "text-emerald-900" },
    { type: "Compuerta Inclusiva", icon: "Circle", shape: "diamond", compact: true, stroke: "stroke-indigo-600", bg: "fill-indigo-100", border: "border-indigo-500", text: "text-indigo-900" },
    { type: "Compuerta de Eventos", icon: "CircleDot", shape: "diamond", compact: true, stroke: "stroke-purple-600", bg: "fill-purple-100", border: "border-purple-500", text: "text-purple-900" },
    // --- Contenedores (los ÚNICOS transparentes: un fondo taparía a sus hijos) ---
    { type: "Pool", icon: "Container", container: true, transparent: true, containerStyle: "swimlane", stroke: "stroke-sky-600", bg: "fill-sky-50", border: "border-sky-600", text: "text-sky-900" },
    { type: "Carril", icon: "Rows3", container: true, transparent: true, containerStyle: "swimlane", stroke: "stroke-cyan-600", bg: "fill-cyan-50", border: "border-cyan-600", text: "text-cyan-900" },
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
    // Paleta CANÓNICA C4 (Structurizr): escala de azules por nivel — persona
    // oscura, sistema propio azul, contenedor azul medio, componente azul
    // claro — y gris para lo externo. Texto blanco sobre los rellenos oscuros.
    { type: "Persona", icon: "User", shape: "rounded", stroke: "stroke-blue-950", bg: "fill-blue-900", border: "border-blue-900", text: "text-white", paletteText: "text-blue-900" },
    { type: "Sistema", icon: "Box", shape: "rounded", stroke: "stroke-blue-800", bg: "fill-blue-700", border: "border-blue-700", text: "text-white", paletteText: "text-blue-700" },
    { type: "Sistema Externo", icon: "HardDrive", shape: "rounded", stroke: "stroke-gray-600", bg: "fill-gray-500", border: "border-gray-500", text: "text-white", paletteText: "text-gray-600" },
    { type: "Contenedor", icon: "Container", shape: "rounded", stroke: "stroke-blue-600", bg: "fill-blue-500", border: "border-blue-500", text: "text-white", paletteText: "text-blue-600" },
    { type: "Componente", icon: "Component", shape: "rect", stroke: "stroke-blue-400", bg: "fill-blue-300", border: "border-blue-400", text: "text-blue-950", paletteText: "text-blue-700" },
    { type: "Base de Datos", icon: "Database", shape: "cylinder", stroke: "stroke-blue-700", bg: "fill-blue-600", border: "border-blue-600", text: "text-white", paletteText: "text-blue-700" },
    { type: "Límite de Sistema", icon: "Frame", container: true, transparent: true, stroke: "stroke-slate-500", bg: "fill-slate-50", border: "border-slate-500", text: "text-slate-900" },
    { type: "Límite de Contenedor", icon: "SquareDashedBottom", container: true, transparent: true, stroke: "stroke-zinc-400", bg: "fill-zinc-50", border: "border-zinc-400", text: "text-zinc-900" },
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
      types: ["Clase", "Clase Abstracta", "Interfaz", "Enumeración"],
    },
    {
      label: "Componentes y despliegue",
      types: ["Componente", "Nodo"],
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
    { type: "Clase", icon: "Box", shape: "rect", stroke: "stroke-blue-500", bg: "fill-blue-50", border: "border-blue-300", text: "text-blue-800" },
    { type: "Clase Abstracta", icon: "BoxSelect", shape: "rect", stroke: "stroke-indigo-500", bg: "fill-indigo-50", border: "border-indigo-300", text: "text-indigo-800" },
    { type: "Interfaz", icon: "Plug", shape: "ellipse", stroke: "stroke-violet-500", bg: "fill-violet-50", border: "border-violet-300", text: "text-violet-800" },
    { type: "Enumeración", icon: "List", shape: "rect", stroke: "stroke-amber-500", bg: "fill-amber-50", border: "border-amber-300", text: "text-amber-800" },
    { type: "Componente", icon: "Component", shape: "rect", stroke: "stroke-cyan-500", bg: "fill-cyan-50", border: "border-cyan-300", text: "text-cyan-800" },
    { type: "Nodo", icon: "Server", shape: "rect", stroke: "stroke-slate-500", bg: "fill-slate-50", border: "border-slate-300", text: "text-slate-800" },
    // Actor UML: figura humana (stick figure), como en las herramientas UML clásicas.
    { type: "Actor", icon: "PersonStanding", shape: "rounded", stroke: "stroke-emerald-300", bg: "fill-emerald-100", border: "border-emerald-300", text: "text-emerald-800" },
    { type: "Caso de Uso", icon: "Circle", shape: "ellipse", stroke: "stroke-teal-500", bg: "fill-teal-50", border: "border-teal-300", text: "text-teal-800" },
    // Nota adhesiva UML (comentario anclable a cualquier elemento).
    { type: "Nota", icon: "StickyNote", shape: "rect", stroke: "stroke-yellow-400", bg: "fill-yellow-100", border: "border-yellow-400", text: "text-yellow-900" },
    { type: "Paquete", icon: "Folder", container: true, transparent: true, stroke: "stroke-yellow-600", bg: "fill-yellow-50", border: "border-yellow-500", text: "text-yellow-900" },
    // --- Máquina de estados ---
    // Pseudoestado inicial CANÓNICO: punto sólido oscuro, sin icono (la figura
    // rellena ES el símbolo UML).
    { type: "Estado Inicial", icon: "Disc", shape: "ellipse", compact: true, hideIcon: true, stroke: "stroke-slate-800", bg: "fill-slate-800", border: "border-slate-800", text: "text-slate-900" },
    { type: "Estado", icon: "ToggleLeft", shape: "rounded", stroke: "stroke-sky-400", bg: "fill-sky-100", border: "border-sky-400", text: "text-sky-900" },
    { type: "Estado Compuesto", icon: "Boxes", container: true, transparent: true, stroke: "stroke-sky-500", bg: "fill-sky-50", border: "border-sky-500", text: "text-sky-900" },
    // Rombo de decisión canónico: vacío por dentro (las guardas van en las aristas).
    { type: "Decisión", icon: "Diamond", shape: "diamond", compact: true, hideIcon: true, stroke: "stroke-amber-600", bg: "fill-amber-50", border: "border-amber-500", text: "text-amber-900" },
    { type: "Historial", icon: "History", shape: "ellipse", compact: true, stroke: "stroke-purple-500", bg: "fill-purple-100", border: "border-purple-400", text: "text-purple-800" },
    // Estado final: círculo con anillo (ojo de buey).
    { type: "Estado Final", icon: "Target", shape: "ellipse", compact: true, stroke: "stroke-slate-700", bg: "fill-slate-100", border: "border-slate-700", text: "text-slate-900" },
    // --- Diagrama de actividad ---
    // Nodo inicial canónico: punto sólido (verde oscuro para distinguirlo del de estados).
    { type: "Inicio de Actividad", icon: "Disc", shape: "ellipse", compact: true, hideIcon: true, stroke: "stroke-emerald-800", bg: "fill-emerald-800", border: "border-emerald-700", text: "text-emerald-900" },
    { type: "Acción", icon: "Activity", shape: "rounded", stroke: "stroke-blue-400", bg: "fill-blue-100", border: "border-blue-400", text: "text-blue-900" },
    { type: "Nodo de Decisión", icon: "GitBranch", shape: "diamond", compact: true, hideIcon: true, stroke: "stroke-orange-600", bg: "fill-orange-50", border: "border-orange-500", text: "text-orange-900" },
    // Barra de bifurcación/unión (fork/join): icono Minus evoca la barra; trazo
    // y texto oscuros para legibilidad en paleta y lienzo.
    { type: "Bifurcación/Unión", icon: "Minus", shape: "rect", stroke: "stroke-slate-800", bg: "fill-slate-300", border: "border-slate-800", text: "text-slate-900" },
    { type: "Fin de Actividad", icon: "Target", shape: "ellipse", stroke: "stroke-rose-700", bg: "fill-rose-50", border: "border-rose-700", text: "text-rose-900" },
  ],
  aiGuidance:
    "Aplica UML. Diagramas de clases (Clases, Clases Abstractas, Interfaces, Enumeraciones con relaciones de herencia, implementación, asociación, agregación, composición y dependencia), de componentes y de casos de uso (Actores y Casos de Uso agrupados en Paquetes). " +
    "Máquina de estados (motor de estados): modela el ciclo de vida de un objeto con Estado Inicial (pseudoestado de arranque), Estados y Estados Compuestos (anidan subestados), Decisión (elige rama según guarda), Historial (recuerda el último subestado) y Estado Final; las transiciones se etiquetan 'evento [guarda] / acción'. " +
    "Diagrama de actividad (flujos de decisión): Inicio de Actividad, Acciones, Nodo de Decisión (bifurca según condición) y su unión, Bifurcación/Unión (fork/join para flujos paralelos) y Fin de Actividad. " +
    "Los diagramas de SECUENCIA no se modelan aquí: tienen su propio editor (vista 'Diagrama de secuencia').",
  analystRole: "modelador UML",
  modelLabel: "Modelo UML",
  flowRules:
    "- Actor → Caso de Uso (relación \"asocia\")\n" +
    "- Clase → Clase (relación \"asocia\", \"hereda\" o \"depende\")\n" +
    "- Clase → Interfaz (relación \"implementa\")\n" +
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
  return NOTATIONS[(id as NotationId)] ?? DDD;
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
    task: ["Acción", "Estado", "Caso de Uso"],
    actor: ["Actor"],
    boundary: ["Paquete", "Estado Compuesto"],
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
