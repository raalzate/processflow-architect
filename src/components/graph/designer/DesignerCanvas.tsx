"use client";

import React from "react";
import {
  TerminalSquare,
  Zap,
  User,
  RectangleHorizontal,
  Gavel,
  HardDrive,
  Package,
  Milestone,
  Box,
  FilePlus,
  Crown,
  Fingerprint,
  Gem,
  Cog,
  Archive,
  Factory,
  Layers,
  ChevronDown,
  ChevronRight,
  // Notaciones BPMN / C4 / UML
  Play,
  StopCircle,
  Circle,
  Square,
  Diamond,
  Boxes,
  FileText,
  Container,
  Rows3,
  Component,
  Database,
  Frame,
  SquareDashedBottom,
  BoxSelect,
  Plug,
  List,
  Server,
  Folder,
  // Mapa de Contexto (DDD estratégico)
  ArrowLeftRight,
  ArrowRightToLine,
  Handshake,
  DoorOpen,
  Languages,
  ShieldHalf,
  Share2,
  Unlink,
  HelpCircle,
  // BPMN (eventos y compuertas de decisión)
  Mail,
  Timer,
  AlertTriangle,
  Split,
  GitFork,
  Workflow,
  CircleDot,
  MessageSquare,
  // UML (máquina de estados y actividad)
  ToggleLeft,
  Disc,
  Target,
  History,
  Activity,
  GitBranch,
  Minus,
  X,
  Plus,
  PersonStanding,
  StickyNote,
  Braces,
  Tag,
  Link2,
  Type,
  Smartphone,
  Cpu,
  FileCode2,
  CircleDashed,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { NOTATION_HELP } from "@/lib/notation-help";
import { cn } from "@/lib/utils";
import { splitEdgeLabel } from "@/lib/edge-label";
import { edgeIsDashed, relationStyle, type EdgeMarker } from "@/lib/edge-relations";
import {
  clampPanelWidth,
  isAtLimit,
  readPanelWidth,
  TOOLBOX_LIMITS,
  TOOLBOX_WIDTH_KEY,
} from "@/lib/panel-size";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALL_ELEMENTS,
  getNotation,
  isBlobContainer,
  isLifelineContainer,
  isSwimlaneContainer,
  labelLayoutOfType,
  sizeOfType,
  NOTATION_LIST,
  DEFAULT_NOTATION_ID,
  type Notation,
  type NotationId,
  type ShapeKind,
} from "@/lib/notations";
import { isContainerType, type DesignerNode, type DesignerLink } from "./serialize";
import {
  clipToShape,
  linkEndpoints,
  linkGeometry,
  nodeBox,
  shapeForType,
  simplifyPath,
  AGGREGATE_DEFAULT_WIDTH,
  AGGREGATE_DEFAULT_HEIGHT,
} from "./link-geom";

// La geometría vive en `link-geom.ts` (puro y con pruebas); se reexporta para no
// cambiar los imports de quien ya la tomaba de este archivo.
export {
  clipToShape,
  linkEndpoints,
  linkGeometry,
  nodeBox,
  shapeForType,
  simplifyPath,
  AGGREGATE_DEFAULT_WIDTH,
  AGGREGATE_DEFAULT_HEIGHT,
};

/**
 * Etiqueta de arista: se dibuja suelta sobre la línea, así que su largo es lo que
 * decide si el diagrama se lee o se convierte en una mancha de texto sobre los
 * nodos. Se acota aquí (el texto completo va al tooltip) y `src/lib/mcp/quality`
 * avisa al agente que la escribió para que la acorte en el modelo.
 */
export const EDGE_LABEL_MAX_CHARS = 34;
/** Ancho aproximado de un carácter a `text-2xs font-semibold`, para el halo. */
export const EDGE_LABEL_CHAR_PX = 5.4;

export function truncateEdgeLabel(label: string): string {
  const limpio = label.trim();
  return limpio.length > EDGE_LABEL_MAX_CHARS
    ? `${limpio.slice(0, EDGE_LABEL_MAX_CHARS - 1)}…`
    : limpio;
}

// Resolución NOMBRE → componente de icono (notations.ts referencia iconos por string).
const ICON_MAP: Record<string, React.ElementType> = {
  TerminalSquare, Zap, User, RectangleHorizontal, Gavel, HardDrive, Package,
  Milestone, Box, Crown, Fingerprint, Gem, Cog, Archive, Factory, Layers,
  Play, StopCircle, Circle, Square, Diamond, Boxes, FileText, Container, Rows3,
  Component, Database, Frame, SquareDashedBottom, BoxSelect, Plug, List, Server, Folder,
  ArrowLeftRight, ArrowRightToLine, Handshake, DoorOpen, Languages, ShieldHalf, Share2, Unlink,
  Mail, Timer, AlertTriangle, Split, GitFork, Workflow, CircleDot, MessageSquare,
  ToggleLeft, Disc, Target, History, Activity, GitBranch, Minus, X, Plus,
  PersonStanding, StickyNote,
  // UML: clases (tipo de dato, genérico, asociación, estereotipo), componentes
  // y despliegue (puerto, interfaz requerida, artefacto, dispositivo, entorno).
  Braces, Tag, Link2, Type, Smartphone, Cpu, FileCode2, CircleDashed,
};

export const iconForType = (type: string): React.ElementType =>
  ICON_MAP[ALL_ELEMENTS[type]?.icon ?? ""] || FilePlus;

/**
 * Color de caída para un tipo que no está en el registro. Sigue la misma regla
 * que el resto de la simbología —relleno oscuro, letra clara— para que un tipo
 * desconocido se vea neutro pero legible, y no como un agujero blanco.
 */
const defaultColor = {
  bg: "fill-muted",
  border: "border-border",
  text: "text-muted-foreground",
};

/**
 * Estados del cambio (estado_comparativo) editables por el usuario: clasifican
 * el elemento en «Elementos Principales» (nuevo / modificado / eliminado…).
 * `dot` colorea la insignia en el lienzo y en el selector del editor.
 */
export const CHANGE_STATES: Array<{
  value: NonNullable<DesignerNode["estado_comparativo"]>;
  label: string;
  dot: string;
  /** Relleno SVG de la insignia en el lienzo ("" = sin insignia). */
  badgeFill: string;
}> = [
  { value: "nuevo", label: "Nuevo", dot: "bg-emerald-500", badgeFill: "fill-emerald-500" },
  { value: "modificado", label: "Modificado", dot: "bg-amber-500", badgeFill: "fill-amber-500" },
  { value: "sin_cambios", label: "Sin cambios", dot: "bg-zinc-300", badgeFill: "" },
  { value: "existente", label: "Existente", dot: "bg-zinc-400", badgeFill: "" },
  { value: "eliminado", label: "Eliminar", dot: "bg-red-500", badgeFill: "fill-red-500" },
];

/** Insignia de estado del nodo: punto de color en la esquina superior derecha. */
const ChangeStateBadge: React.FC<{ estado?: DesignerNode["estado_comparativo"]; x: number }> = ({
  estado,
  x,
}) => {
  const s = CHANGE_STATES.find((c) => c.value === estado);
  if (!s?.badgeFill) return null;
  return (
    <g className="pointer-events-none">
      <title>{s.label}</title>
      <circle cx={x} cy={0} r={5.5} className="fill-white" />
      <circle cx={x} cy={0} r={4} className={s.badgeFill} />
    </g>
  );
};

// Colores derivados del registro GLOBAL de notaciones (cualquier tipo de cualquier grupo).
const colorForType = (
  type: string
): { bg: string; border: string; text: string } => {
  const e = ALL_ELEMENTS[type];
  return e ? { bg: e.bg, border: e.border, text: e.text } : defaultColor;
};


/**
 * Dibuja la silueta SVG de un nodo NO contenedor según su forma. `fill` y `stroke`
 * son propiedades heredables en SVG: la className (clases fill y stroke de Tailwind)
 * se aplica al elemento (o al grupo en el cilindro) y los hijos heredan.
 */
export const NodeShape: React.FC<{
  shape: ShapeKind;
  w: number;
  h: number;
  className: string;
  strokeWidth: number;
  /** Símbolo compacto BPMN: círculo/rombo cuadrado centrado (r = h/2). */
  compact?: boolean;
  /**
   * Anillo canónico BPMN para eventos compactos (círculo): "thick" = trazo
   * grueso (Evento de Fin), "double" = doble anillo (Evento Intermedio). Sin
   * valor → anillo simple (Evento de Inicio y demás).
   */
  ring?: "thick" | "double";
  /** Estilo inline (p. ej. fill personalizado); prevalece sobre las clases. */
  style?: React.CSSProperties;
}> = ({ shape, w, h, className, strokeWidth, compact, ring, style }) => {
  // Radio del símbolo compacto: la altura del nodo manda (círculo perfecto).
  const r = Math.min(w, h) / 2;
  switch (shape) {
    case "ellipse":
      if (!compact)
        return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} className={className} strokeWidth={strokeWidth} style={style} />;
      // Evento de Fin: un solo anillo grueso (convención BPMN).
      if (ring === "thick")
        return <circle cx={w / 2} cy={h / 2} r={r} className={className} strokeWidth={strokeWidth + 2.5} style={style} />;
      // Evento Intermedio: doble anillo (el interior sólo traza, sin relleno).
      if (ring === "double")
        return (
          <g>
            <circle cx={w / 2} cy={h / 2} r={r} className={className} strokeWidth={strokeWidth} style={style} />
            <circle cx={w / 2} cy={h / 2} r={r - 4} className={className} strokeWidth={strokeWidth} style={{ ...style, fill: "none" }} />
          </g>
        );
      return <circle cx={w / 2} cy={h / 2} r={r} className={className} strokeWidth={strokeWidth} style={style} />;
    case "diamond": {
      // Compacto: rombo cuadrado centrado; si no, ocupa toda la caja del nodo.
      const hw = compact ? r : w / 2;
      return (
        <polygon
          points={`${w / 2},${h / 2 - (compact ? r : h / 2)} ${w / 2 + hw},${h / 2} ${w / 2},${h / 2 + (compact ? r : h / 2)} ${w / 2 - hw},${h / 2}`}
          className={className}
          strokeWidth={strokeWidth}
          style={style}
        />
      );
    }
    case "rect":
      return <rect width={w} height={h} rx={2} className={className} strokeWidth={strokeWidth} style={style} />;
    case "cylinder": {
      const e = Math.min(12, h / 4);
      return (
        <g className={className} strokeWidth={strokeWidth} style={style}>
          <ellipse cx={w / 2} cy={h - e} rx={w / 2} ry={e} />
          <rect x={0} y={e} width={w} height={h - 2 * e} />
          <ellipse cx={w / 2} cy={e} rx={w / 2} ry={e} />
        </g>
      );
    }
    default:
      return <rect width={w} height={h} rx={8} className={className} strokeWidth={strokeWidth} style={style} />;
  }
};

// =============================================================================
// Toolbox — paleta de elementos, agrupada en secciones colapsables
// =============================================================================

const PaletteItem: React.FC<{
  type: string;
  onDragStart: (e: React.DragEvent, item: any) => void;
  onHelp: (type: string) => void;
}> = ({ type, onDragStart, onHelp }) => {
  const isContainer = isContainerType(type);
  const Icon = iconForType(type);
  const color = colorForType(type);
  const item = { tipo_elemento: type, nombre: type };
  const hasHelp = !!NOTATION_HELP[type];
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      className={cn(
        "flex items-center space-x-2 p-2 border rounded-md shadow-sm cursor-grab active:cursor-grabbing transition-all",
        // `bg` es `fill-*` (SVG del lienzo); en el chip HTML lo traducimos a `bg-*`
        // para que el chip se vea como se verá el nodo: mismo relleno, mismo texto.
        color.bg.replace("fill-", "bg-"),
        color.border,
        // El chip lleva el MISMO texto que el nodo: con la app oscura, su fondo y
        // el del nodo son el mismo, y un tono pensado para fondo blanco quedaba
        // negro sobre negro.
        color.text,
        // El chip anticipa la simbología: frontera lógica = punteado; swimlane
        // BPMN = línea continua (como se dibujará en el lienzo).
        isContainer && "font-semibold",
        isContainer && !isSwimlaneContainer(type) && "border-dashed"
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {/* flex-1 min-w-0 → el nombre ocupa el espacio y trunca; title = tooltip
          con el nombre completo (los largos como "Servicio de Host Abierto (OHS)"
          se cortan visualmente). */}
      <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={type}>
        {type}
      </span>
      {hasHelp && (
        <button
          type="button"
          // No arrastrable: evita iniciar drag al pulsar el "?".
          draggable={false}
          onDragStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onHelp(type);
          }}
          title={`¿Qué es "${type}"?`}
          className="shrink-0 rounded-full p-0.5 opacity-50 hover:opacity-100 hover:bg-black/10"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

/** Paleta de la notación activa (DDD, BPMN, C4, UML). */
export const Toolbox: React.FC<{
  notation?: NotationId;
  /** Si se pasa, muestra el selector de grupo de componentes encima de la paleta. */
  onNotationChange?: (n: NotationId) => void;
}> = ({ notation, onNotationChange }) => {
  // Todas las secciones abiertas por defecto; se guarda el set de colapsadas.
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  // Elemento cuya ayuda (modal) está abierta.
  const [helpType, setHelpType] = React.useState<string | null>(null);
  const notationId = notation ?? DEFAULT_NOTATION_ID;
  const active: Notation = getNotation(notationId);
  const help = helpType ? NOTATION_HELP[helpType] : null;

  // Ancho flexible pero con topes (src/lib/panel-size.ts): la paleta se adapta a
  // nombres largos sin comerse el lienzo. Se recuerda entre sesiones.
  const [width, setWidth] = React.useState(TOOLBOX_LIMITS.default);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = React.useState(false);

  React.useEffect(() => {
    try {
      setWidth(readPanelWidth(localStorage.getItem(TOOLBOX_WIDTH_KEY), TOOLBOX_LIMITS));
    } catch {
      /* sin localStorage: se queda con el default */
    }
  }, []);

  const aplicarAncho = React.useCallback((px: number) => {
    const w = clampPanelWidth(px, TOOLBOX_LIMITS);
    setWidth(w);
    try {
      localStorage.setItem(TOOLBOX_WIDTH_KEY, String(w));
    } catch {
      /* ignore quota */
    }
  }, []);

  // El arrastre se escucha en `window`: si el puntero se sale del tirador (y con
  // los topes se sale seguro), el gesto tiene que seguir vivo.
  React.useEffect(() => {
    if (!resizing) return;
    const izquierda = panelRef.current?.getBoundingClientRect().left ?? 0;
    const mover = (e: MouseEvent) => aplicarAncho(e.clientX - izquierda);
    const soltar = () => setResizing(false);
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    return () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
    };
  }, [resizing, aplicarAncho]);

  const limite = isAtLimit(width, TOOLBOX_LIMITS);

  const handleDragStart = (e: React.DragEvent, item: any) => {
    e.dataTransfer.setData("application/json", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
  };

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    // El scroll vive en el hijo: así el tirador queda fijo al borde y no se va
    // con el contenido al bajar por la paleta.
    <div
      ref={panelRef}
      style={{ width }}
      className={cn(
        "relative flex-shrink-0 flex flex-col bg-background shadow-lg z-10 border-r",
        resizing && "select-none"
      )}
    >
      {/* Tirador de ancho. Doble clic vuelve al ancho por defecto; con foco,
          las flechas mueven de a 16 px (y de a 1 con Shift). */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho de la paleta"
        aria-valuenow={width}
        aria-valuemin={TOOLBOX_LIMITS.min}
        aria-valuemax={TOOLBOX_LIMITS.max}
        tabIndex={0}
        title={
          limite === "min"
            ? "Ancho mínimo alcanzado"
            : limite === "max"
              ? "Ancho máximo alcanzado"
              : "Arrastrar para cambiar el ancho · doble clic para restablecer"
        }
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
        onDoubleClick={() => aplicarAncho(TOOLBOX_LIMITS.default)}
        onKeyDown={(e) => {
          const paso = e.shiftKey ? 1 : 16;
          if (e.key === "ArrowLeft") aplicarAncho(width - paso);
          else if (e.key === "ArrowRight") aplicarAncho(width + paso);
          else if (e.key === "Home") aplicarAncho(TOOLBOX_LIMITS.min);
          else if (e.key === "End") aplicarAncho(TOOLBOX_LIMITS.max);
          else return;
          e.preventDefault();
        }}
        className={cn(
          "absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize transition-colors",
          "hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none",
          resizing && "bg-primary/60",
          // Pegado a un tope: el cursor lo dice antes de que el usuario insista.
          limite === "min" && "cursor-e-resize",
          limite === "max" && "cursor-w-resize"
        )}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2 px-1">
          Elementos
        </h3>

        {/* Selector de grupo de componentes / notación (DDD, BPMN, C4, UML) */}
        {onNotationChange && (
          <div className="mb-3 flex items-center gap-1.5 px-1">
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={notationId} onValueChange={(v) => onNotationChange(v as NotationId)}>
              <SelectTrigger className="h-8 flex-1 text-xs" title="Grupo de componentes de esta vista">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTATION_LIST.map((n) => (
                  <SelectItem key={n.id} value={n.id} className="text-xs">
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-3 px-1">
          {active.description} Arrastra al lienzo; los contenedores (borde
          discontinuo) agrupan los nodos que coloques dentro.
        </p>

        <div className="space-y-3">
          {active.paletteGroups.map((group) => {
            const isOpen = !collapsed[group.label];
            return (
              <div key={group.label}>
                <button
                  type="button"
                  onClick={() => toggle(group.label)}
                  className="flex w-full items-center gap-1 px-1 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{group.label}</span>
                  <span className="ml-auto text-2xs font-medium text-muted-foreground/70">
                    {group.types.length}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 mt-1.5">
                    {group.types.map((type) => (
                      <PaletteItem
                        key={type}
                        type={type}
                        onDragStart={handleDragStart}
                        onHelp={setHelpType}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de ayuda por elemento: explicación + ejemplo */}
      <Dialog open={!!helpType} onOpenChange={(o) => !o && setHelpType(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {helpType && React.createElement(iconForType(helpType), { className: "w-5 h-5 shrink-0" })}
              {helpType}
            </DialogTitle>
            {help && <DialogDescription className="pt-2 text-sm leading-relaxed">{help.description}</DialogDescription>}
          </DialogHeader>
          {help && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Ejemplo
              </p>
              <p className="text-sm leading-relaxed">{help.example}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// =============================================================================
// Nodo del lienzo (SVG)
// =============================================================================

interface NodeComponentProps {
  node: DesignerNode;
  /**
   * Notación de la vista. Hace falta porque hay tipos con el mismo nombre en dos
   * notaciones ("Sistema Externo" en DDD y en C4) que se dibujan distinto.
   */
  notation?: NotationId;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  /** Clic derecho sobre el elemento: abre el menú contextual del lienzo. */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Una conexión está en curso (origen ya elegido); todos los nodos actúan como posible destino. */
  connecting?: boolean;
  /** Arrancar una conexión arrastrando desde un puerto de este nodo. */
  onStartConnect?: (e: React.MouseEvent) => void;
  /** Soltar el arrastre sobre este nodo para completar la conexión. */
  onFinishConnect?: () => void;
  /** Si el nodo embebe una vista (subproceso), abrir esa vista. */
  onOpenSubView?: () => void;
  /** Al pasar el ratón: muestra la ficha flotante con nombre/tipo/descripción. */
  onHover?: (e: React.MouseEvent) => void;
  /** Al salir del nodo: oculta la ficha. */
  onHoverEnd?: () => void;
}

// Marca de subproceso (estilo BPMN "call activity"): cuadro con [+] centrado en
// el borde inferior. Al pulsarlo se entra a la vista embebida. Detiene la
// propagación para no arrastrar/seleccionar/editar el nodo al hacer clic.
const SubProcessMarker: React.FC<{ cx: number; y: number; onOpen: () => void }> = ({
  cx,
  y,
  onOpen,
}) => (
  <g
    className="cursor-pointer"
    onMouseDown={(e) => e.stopPropagation()}
    onDoubleClick={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onOpen();
    }}
  >
    <title>Abrir subproceso</title>
    <rect
      x={cx - 9}
      y={y}
      width={18}
      height={14}
      rx={2}
      className="fill-white dark:fill-zinc-800 stroke-gray-400 dark:stroke-zinc-500 transition-colors hover:fill-blue-50 dark:hover:fill-blue-950 hover:stroke-blue-500"
      strokeWidth={1.5}
    />
    <line x1={cx} y1={y + 3} x2={cx} y2={y + 11} className="stroke-gray-600" strokeWidth={1.5} />
    <line x1={cx - 4} y1={y + 7} x2={cx + 4} y2={y + 7} className="stroke-gray-600" strokeWidth={1.5} />
  </g>
);

// Puertos de conexión (4 lados). Aparecen al pasar el ratón sobre el nodo y
// permiten arrastrar para crear un enlace, al estilo de React Flow / Figma.
const ConnectPorts: React.FC<{
  w: number;
  h: number;
  connecting: boolean;
  onStartConnect?: (e: React.MouseEvent) => void;
  /** Para símbolos compactos: acerca los puertos laterales al borde del círculo/rombo. */
  sideInset?: number;
}> = ({ w, h, connecting, onStartConnect, sideInset = 0 }) => {
  const ports = [
    { x: w / 2, y: 0 },
    { x: w - sideInset, y: h / 2 },
    { x: w / 2, y: h },
    { x: sideInset, y: h / 2 },
  ];
  return (
    <g
      className={cn(
        "transition-opacity",
        // Mientras se conecta, ocultamos los puertos: el nodo entero es destino.
        connecting ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"
      )}
    >
      {ports.map((p, i) => (
        <g key={i} onMouseDown={onStartConnect} className="cursor-crosshair">
          {/* Área de impacto ampliada (invisible) para facilitar el agarre. */}
          <circle cx={p.x} cy={p.y} r={11} className="fill-transparent" />
          <circle
            cx={p.x}
            cy={p.y}
            r={6}
            className="fill-blue-500 stroke-white transition-all hover:fill-blue-600"
            strokeWidth={2}
          />
        </g>
      ))}
    </g>
  );
};

/**
 * Silueta de un CONTENEDOR: elipse en los blob (mapa de conceptos), rectángulo
 * en el resto. Vive a nivel de módulo a propósito: definida dentro del render,
 * cada pasada crearía un tipo de componente distinto y React desmontaría la
 * figura —perdiendo sus transiciones justo al arrastrar o seleccionar—.
 */
const ContainerShape: React.FC<{
  blob: boolean;
  width: number;
  height: number;
  radius: number;
  strokeDash?: string;
  className: string;
  strokeWidth: number;
  style?: React.CSSProperties;
}> = ({ blob, width, height, radius, strokeDash, className, strokeWidth, style }) =>
  blob ? (
    <ellipse
      cx={width / 2}
      cy={height / 2}
      rx={width / 2}
      ry={height / 2}
      className={className}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDash}
      style={style}
    />
  ) : (
    <rect
      width={width}
      height={height}
      rx={radius}
      className={className}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDash}
      style={style}
    />
  );

export const DesignerNodeComponent: React.FC<NodeComponentProps> = ({
  node,
  notation,
  isSelected,
  onMouseDown,
  onResizeMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  connecting = false,
  onStartConnect,
  onFinishConnect,
  onOpenSubView,
  onHover,
  onHoverEnd,
}) => {
  const color = colorForType(node.tipo_elemento);
  const hasSubView = !!node.viewRef && !!onOpenSubView;
  const Icon = iconForType(node.tipo_elemento);
  const meta = ALL_ELEMENTS[node.tipo_elemento];

  // Sólo completa la conexión en mouseup cuando hay un arrastre activo; en caso
  // contrario dejamos burbujear el evento (p. ej. para cerrar un arrastre de mover).
  const handleMouseUp = (e: React.MouseEvent) => {
    if (connecting && onFinishConnect) {
      e.stopPropagation();
      onFinishConnect();
    }
  };

  const isDeleted = node.estado_comparativo === "eliminado";

  if (isContainerType(node.tipo_elemento)) {
    const width = node.width || AGGREGATE_DEFAULT_WIDTH;
    const height = node.height || AGGREGATE_DEFAULT_HEIGHT;
    const isContext = node.tipo_elemento === "Contexto Delimitado";
    // Swimlane (Pool/Carril BPMN): línea CONTINUA, esquinas rectas y banda
    // lateral con el nombre rotado — la simbología canónica del participante.
    // El resto de contenedores son fronteras lógicas: marco punteado.
    const swimlane = isSwimlaneContainer(node.tipo_elemento);
    // Blob (mapa de conceptos DDD): elipse punteada, nombre en el borde inferior.
    const blob = isBlobContainer(node.tipo_elemento);
    // Línea de vida (secuencia UML): caja con el nombre ARRIBA y la línea del
    // tiempo bajando punteada por el centro. El marco se mantiene tenue porque
    // además es zona de SOLTAR (las activaciones y notas van dentro).
    const lifeline = isLifelineContainer(node.tipo_elemento);
    const strokeDash = swimlane ? undefined : isContext ? "10 10" : "5 5";
    const radius = swimlane || lifeline ? 0 : 12;
    const HEAD = 44; // alto de la caja del participante, en coords del lienzo
    /** Silueta del contenedor: elipse en los blobs, rectángulo en el resto. */
    const BAND = 28; // ancho de la banda del nombre, en coords del lienzo
    return (
      <g
        transform={`translate(${node.x},${node.y})`}
        onMouseDown={onMouseDown}
        onMouseUp={handleMouseUp}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onMouseEnter={onHover}
        onMouseMove={onHover}
        onMouseLeave={onHoverEnd}
        className={cn(
          "group [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.08))]",
          connecting ? "cursor-crosshair" : "cursor-move",
          // Marcado para eliminar: atenuado (la insignia roja da el motivo).
          isDeleted && "opacity-60"
        )}
      >
        <ContainerShape
          blob={blob}
          width={width}
          height={height}
          radius={radius}
          strokeDash={strokeDash}
          className={cn(
            "stroke-2 transition-all",
            meta?.transparent ? "fill-transparent" : color.bg,
            isSelected ? "stroke-blue-600" : meta?.stroke ?? color.border
          )}
          strokeWidth={isSelected ? 3 : 2}
          // Colores personalizados del contenedor: fondo siempre; borde sólo sin selección.
          style={{
            ...(node.color ? { fill: node.color } : {}),
            ...(!isSelected && node.borderColor ? { stroke: node.borderColor } : {}),
          }}
        />
        {lifeline ? (
          // Caja del participante + línea del tiempo. El nombre va DENTRO de la
          // caja: en secuencia se lee de arriba abajo, no por las esquinas.
          <>
            <rect
              x={0}
              y={0}
              width={width}
              height={HEAD}
              className={cn(
                "stroke-2",
                meta?.transparent ? "fill-canvas" : color.bg,
                isSelected ? "stroke-blue-600" : meta?.stroke ?? color.border
              )}
              style={!isSelected && node.borderColor ? { stroke: node.borderColor } : undefined}
            />
            <line
              x1={width / 2}
              y1={HEAD}
              x2={width / 2}
              y2={height}
              strokeDasharray="6 6"
              strokeWidth={2}
              className={cn(isSelected ? "stroke-blue-600" : meta?.stroke ?? color.border)}
              style={!isSelected && node.borderColor ? { stroke: node.borderColor } : undefined}
            />
            <text
              x={width / 2}
              y={HEAD / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              className={cn(
                "text-sm font-semibold pointer-events-none select-none",
                color.text,
                isDeleted && "line-through"
              )}
            >
              {node.nombre}
            </text>
          </>
        ) : swimlane ? (
          // Banda del participante: línea divisoria + nombre rotado 90° (BPMN).
          <>
            <line
              x1={BAND}
              y1={0}
              x2={BAND}
              y2={height}
              className={cn(isSelected ? "stroke-blue-600" : meta?.stroke ?? color.border)}
              strokeWidth={2}
              style={!isSelected && node.borderColor ? { stroke: node.borderColor } : undefined}
            />
            <text
              // Rotado sobre el centro de la banda; el nombre lee de abajo a arriba.
              transform={`translate(${BAND / 2},${height / 2}) rotate(-90)`}
              textAnchor="middle"
              dominantBaseline="central"
              // En SVG el color del texto es `fill`; sin esto cae a negro.
              fill="currentColor"
              className={cn(
                "text-sm font-semibold pointer-events-none select-none",
                color.text,
                isDeleted && "line-through"
              )}
            >
              {node.nombre}
            </text>
          </>
        ) : blob ? (
          // El nombre va DENTRO del borde de abajo: en una elipse las esquinas
          // no existen, y ahí el óvalo ya no tapa a ningún hijo.
          <text
            x={width / 2}
            y={height - 14}
            textAnchor="middle"
            fill="currentColor"
            className={cn(
              "text-base font-semibold pointer-events-none select-none",
              color.text,
              isDeleted && "line-through"
            )}
          >
            {node.nombre}
          </text>
        ) : (
          <text
            x="12"
            y="24"
            fill="currentColor"
            className={cn(
              "text-lg font-bold pointer-events-none select-none",
              color.text,
              isDeleted && "line-through"
            )}
          >
            {node.nombre}
          </text>
        )}
        <ChangeStateBadge estado={node.estado_comparativo} x={width - 2} />
        <g onMouseDown={onResizeMouseDown} className="cursor-nwse-resize">
          <rect
            x={width - 12}
            y={height - 12}
            width="12"
            height="12"
            className="fill-transparent"
          />
          <path
            d={`M${width - 10},${height} L${width},${height - 10}`}
            className={cn(isSelected ? "stroke-blue-600" : meta?.stroke ?? "stroke-gray-400 dark:stroke-zinc-500")}
            strokeWidth="2"
          />
          <path
            d={`M${width - 6},${height} L${width},${height - 6}`}
            className={cn(isSelected ? "stroke-blue-600" : meta?.stroke ?? "stroke-gray-400 dark:stroke-zinc-500")}
            strokeWidth="2"
          />
        </g>
        {/* Resalte al pasar por encima mientras se conecta (posible destino). */}
        {connecting && (
          <ContainerShape
            blob={blob}
            width={width}
            height={height}
            radius={radius}
            strokeDash={strokeDash}
            className="fill-transparent stroke-blue-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
            strokeWidth={3}
          />
        )}
        {hasSubView && <SubProcessMarker cx={width / 2} y={height - 18} onOpen={onOpenSubView!} />}
        <ConnectPorts w={width} h={height} connecting={connecting} onStartConnect={onStartConnect} />
      </g>
    );
  }

  // Símbolos compactos (eventos, compuertas, pseudoestados): forma pequeña
  // centrada e icono dentro; el nombre va DEBAJO (convención BPMN). El rombo
  // no compacto tampoco tiene ancho útil en sus vértices → etiqueta fuera.
  const shape = shapeForType(node.tipo_elemento);
  const compact = !!meta?.compact;
  // Anillo BPMN canónico: Fin = grueso, Intermedio = doble; el resto simple.
  const eventRing: "thick" | "double" | undefined =
    node.tipo_elemento === "Evento de Fin"
      ? "thick"
      : node.tipo_elemento === "Evento Intermedio"
        ? "double"
        : undefined;
  const labelOutside = compact || shape === "diamond";
  // Tamaño declarado por la notación del tipo (C4 es más grande: su ficha lleva
  // tres líneas). Los símbolos compactos se dibujan cuadrados dentro de la caja.
  const { w: nodeW, h: nodeH } = sizeOfType(node.tipo_elemento, notation);
  const sideInset = compact ? (nodeW - nodeH) / 2 : 0;
  // Ficha C4: icono chico arriba a la izquierda, y nombre · descripción · [Tipo].
  const detail = !labelOutside && labelLayoutOfType(node.tipo_elemento, notation) === "detail";

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onMouseDown={onMouseDown}
      onMouseUp={handleMouseUp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onHover}
      onMouseMove={onHover}
      onMouseLeave={onHoverEnd}
      className={cn(
        "group [filter:drop-shadow(0_1px_2px_rgb(0_0_0/0.12))]",
        connecting ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
        // Marcado para eliminar: atenuado (la insignia roja da el motivo).
        isDeleted && "opacity-60"
      )}
    >
      <NodeShape
        shape={shape}
        w={nodeW}
        h={nodeH}
        compact={compact}
        ring={eventRing}
        className={cn(
          "stroke-2 transition-all",
          // Sólo los contenedores son transparentes; los símbolos llevan su tinte.
          meta?.transparent ? "fill-transparent" : color.bg,
          // El trazo: azul si está seleccionado; si no, el contorno propio del tipo.
          isSelected ? "stroke-blue-600" : meta?.stroke ?? color.border,
          // Resalte como destino al pasar por encima mientras se conecta.
          connecting && "group-hover:stroke-blue-500 group-hover:stroke-[3px]"
        )}
        strokeWidth={isSelected ? 3 : 2}
        // Colores personalizados: fondo siempre; borde sólo si no está seleccionado
        // (al seleccionar manda el contorno azul de selección).
        style={{
          ...(node.color ? { fill: node.color } : {}),
          ...(!isSelected && node.borderColor ? { stroke: node.borderColor } : {}),
        }}
      />
      <foreignObject width={nodeW} height={nodeH} className="pointer-events-none">
        {detail ? (
          // La FICHA: el icono no compite con el texto —va chico, arriba a la
          // izquierda— y el bloque central se lee como una tarjeta: qué es, para
          // qué sirve y de qué tipo es. Es el rotulado de todas las notaciones.
          <div
            className={cn(
              "w-full h-full relative pt-5 pb-2",
              color.text,
              // En un óvalo el ancho útil se angosta al alejarse del eje: con el
              // padding del rectángulo, el nombre se sale por los costados.
              shape === "ellipse" ? "px-9" : "px-3",
            )}
          >
            {/* En el óvalo el icono se mete hacia adentro para no caer fuera de la curva. */}
            {!meta?.hideIcon && (
              <Icon
                className={cn(
                  "w-4 h-4 absolute top-2 opacity-90",
                  shape === "ellipse" ? "left-8" : "left-2",
                )}
              />
            )}
            <div className="h-full flex flex-col items-center justify-center text-center gap-0.5">
              <p
                className={cn(
                  "text-sm font-bold leading-tight select-none break-words max-w-full line-clamp-2",
                  isDeleted && "line-through"
                )}
              >
                {node.nombre}
              </p>
              {!!node.descripcion && (
                <p className="text-2xs leading-tight opacity-80 select-none break-words max-w-full line-clamp-2">
                  {node.descripcion}
                </p>
              )}
              <p className="text-2xs leading-tight opacity-70 select-none truncate max-w-full">
                [{node.tipo_elemento}
                {node.tags_tecnologia?.length ? `: ${node.tags_tecnologia.join(", ")}` : ""}]
              </p>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "w-full h-full flex flex-col items-center justify-center p-2 text-center",
              color.text,
              // En un óvalo el ancho útil se angosta al alejarse del eje: con el
              // padding del rectángulo, el nombre se salía por los costados.
              shape === "ellipse" && !compact && "px-5",
              // Deja aire para el badge de subproceso apoyado en el borde inferior.
              hasSubView && !labelOutside && "pb-3"
            )}
          >
            {/* Símbolos UML canónicos (punto inicial, rombo de decisión): sin icono. */}
            {!meta?.hideIcon && <Icon className={cn("w-6 h-6 shrink-0", !labelOutside && "mb-1")} />}
            {!labelOutside && (
              <p
                className={cn(
                  // Ajusta el texto y lo acota con elipsis DENTRO de la caja en vez
                  // de desbordarse: nombres cortos se ven completos; los largos se
                  // recortan con «…» sin invadir nodos vecinos.
                  "text-xs font-bold leading-tight select-none break-words max-w-full",
                  meta?.hideIcon ? "line-clamp-3" : "line-clamp-2",
                  isDeleted && "line-through"
                )}
              >
                {node.nombre}
              </p>
            )}
            {/* Línea de tecnología al estilo C4: [java, spring mvc]. */}
            {!labelOutside && !!node.tags_tecnologia?.length && (
              <p className="text-2xs italic leading-tight opacity-80 truncate max-w-full select-none">
                [{node.tags_tecnologia.join(", ")}]
              </p>
            )}
          </div>
        )}
      </foreignObject>
      {labelOutside && (
        <foreignObject
          y={nodeH + 4}
          width={nodeW}
          height={44}
          className="pointer-events-none overflow-visible"
        >
          <p
            className={cn(
              // Evento/compuerta: el nombre va debajo; se ajusta a 2 líneas con
              // elipsis para no solaparse con el nodo de al lado.
              "text-center text-xs font-bold leading-tight select-none break-words line-clamp-2",
              color.text,
              isDeleted && "line-through"
            )}
          >
            {node.nombre}
          </p>
        </foreignObject>
      )}
      {/* Badge de subproceso apoyado sobre el borde inferior (mitad fuera),
          como el marcador estándar BPMN: no invade el área del nombre. */}
      {hasSubView && <SubProcessMarker cx={nodeW / 2} y={nodeH - 7} onOpen={onOpenSubView!} />}
      <ChangeStateBadge
        estado={node.estado_comparativo}
        // Esquina superior derecha de la FORMA dibujada (no de la caja lógica).
        x={compact ? nodeW / 2 + nodeH / 2 : nodeW - 2}
      />
      <ConnectPorts
        w={nodeW}
        h={nodeH}
        sideInset={sideInset}
        connecting={connecting}
        onStartConnect={onStartConnect}
      />
    </g>
  );
};

// =============================================================================
// Enlace del lienzo (SVG)
// =============================================================================

interface LinkComponentProps {
  link: DesignerLink;
  nodes: Map<string, DesignerNode>;
  /** Notación de la vista: decide el trazo y el tamaño de los nodos que une. */
  notation?: NotationId;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  /** Clic derecho sobre el enlace: abre el menú contextual del lienzo. */
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Doble clic sobre la LÍNEA (no la etiqueta): añade un punto de quiebre ahí. */
  onLineDoubleClick?: (e: React.MouseEvent) => void;
  /** Arrastre de la ETIQUETA: la separa del trazo cuando tapa algo. */
  onLabelMouseDown?: (e: React.MouseEvent) => void;
}


export const DesignerLinkComponent: React.FC<LinkComponentProps> = ({
  link,
  nodes,
  notation,
  isSelected,
  onClick,
  onDoubleClick,
  onContextMenu,
  onLineDoubleClick,
  onLabelMouseDown,
}) => {
  const geo = linkGeometry(link, nodes, notation);
  if (!geo) return null;
  const { path, labelX, labelY } = geo;

  // Etiqueta: se acota al ancho legible y el halo se ajusta al texto resultante.
  // `consume [HTTPS/JSON]` se parte en dos renglones: la acción y, debajo y más
  // tenue, la tecnología — como en C4, donde esa segunda línea es la mitad del
  // valor de la relación y en un solo renglón se pierde.
  const { texto, nota } = splitEdgeLabel(link.descripcion);
  const labelText = truncateEdgeLabel(texto);
  const notaText = nota ? truncateEdgeLabel(nota) : "";
  const labelWidth =
    Math.max(labelText.length, notaText.length) * EDGE_LABEL_CHAR_PX + 10;
  const labelHeight = notaText && labelText ? 30 : 20;

  // Dirección de la(s) flecha(s) y RELACIÓN (UML): la relación manda sobre la
  // punta —un triángulo hueco dice "hereda" y una flecha no— pero `arrow:
  // "none"` sigue ganando: si el usuario pidió sin puntas, es sin puntas.
  const arrow = link.arrow ?? "end";
  const sel = isSelected ? "-selected" : "";
  const rel = relationStyle(link.relation);
  const marca = (m: EdgeMarker, punta: "end" | "start"): string | undefined => {
    if (m === "none") return undefined;
    if (m === "arrow") return `url(#arrow-${punta}${sel})`;
    return `url(#uml-${m}${sel})`;
  };
  const markerEnd = arrow === "none" ? undefined : marca(rel.end, "end");
  const markerStart =
    arrow === "none"
      ? undefined
      : rel.start !== "none"
        ? marca(rel.start, "start")
        : arrow === "both"
          ? `url(#arrow-start${sel})`
          : undefined;
  const dashed = edgeIsDashed(link);

  return (
    <g onClick={onClick} onContextMenu={onContextMenu} className="cursor-pointer">
      <path
        d={path}
        stroke="transparent"
        strokeWidth="15"
        fill="none"
        onDoubleClick={onLineDoubleClick}
      />
      <path
        d={path}
        className={cn(
          "transition-all",
          isSelected ? "stroke-blue-600" : link.color ? "" : "stroke-gray-400 dark:stroke-zinc-500 opacity-60 dark:opacity-90"
        )}
        strokeWidth={isSelected ? 2.5 : 1.5}
        markerEnd={markerEnd}
        markerStart={markerStart}
        fill="none"
        // Trazo discontinuo: puesto a mano, o exigido por la relación
        // (realización y dependencia son punteadas en UML).
        strokeDasharray={dashed ? "8 5" : undefined}
        // Color de línea personalizado (prevalece sobre el gris por defecto).
        style={!isSelected && link.color ? { stroke: link.color } : undefined}
      />
      <g
        onDoubleClick={onDoubleClick}
        onMouseDown={onLabelMouseDown}
        className={onLabelMouseDown ? "cursor-move" : "cursor-text"}
      >
        {/* El halo se dimensiona con el texto. Antes era un rect fijo de 80×20 y
            una etiqueta larga («cotiza y diligencia su solicitud [navegador web]»,
            ~240 px) se desbordaba sin fondo, cruzando líneas, nodos y títulos de
            contenedor. Se acota a EDGE_LABEL_MAX_CHARS y el texto completo queda
            en el tooltip: una relación bien documentada no debe tapar el diagrama. */}
        {!!(labelText || notaText) && (
          <>
            <title>{link.descripcion}</title>
            <rect
              x={labelX - labelWidth / 2}
              y={labelY - labelHeight / 2}
              width={labelWidth}
              height={labelHeight}
              className="fill-canvas/90"
              rx="4"
            />
            {!!labelText && (
              <text
                x={labelX}
                // Con dos renglones, la acción sube para dejar sitio a la nota.
                y={notaText ? labelY - 4 : labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="currentColor"
                className="text-2xs font-semibold text-foreground select-none pointer-events-none"
              >
                {labelText}
              </text>
            )}
            {!!notaText && (
              <text
                x={labelX}
                y={labelText ? labelY + 8 : labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="currentColor"
                className="text-2xs text-muted-foreground select-none pointer-events-none"
              >
                [{notaText}]
              </text>
            )}
          </>
        )}
      </g>
    </g>
  );
};

/**
 * Manijas de reanclado de un enlace seleccionado. Se renderizan en una CAPA
 * SUPERIOR (encima de los nodos) para que no queden tapadas por ellos.
 */
export const LinkEndpointHandles: React.FC<{
  link: DesignerLink;
  nodes: Map<string, DesignerNode>;
  /** Notación de la vista: sin ella las manijas no caen sobre el trazo en C4. */
  notation?: NotationId;
  onEndpointMouseDown: (e: React.MouseEvent, which: "source" | "target" | "bend") => void;
  onWaypointMouseDown: (e: React.MouseEvent, index: number) => void;
  onWaypointDoubleClick: (index: number) => void;
  /** Doble clic en la manija del arco: vuelve a la comba por defecto. */
  onBendDoubleClick?: () => void;
}> = ({
  link,
  nodes,
  notation,
  onEndpointMouseDown,
  onWaypointMouseDown,
  onWaypointDoubleClick,
  onBendDoubleClick,
}) => {
  const geo = linkGeometry(link, nodes, notation);
  if (!geo) return null;
  const { start, end, bend, bendKind, waypoints } = geo;
  const esArco = bendKind === "curve";
  return (
    <g>
      {/* Manija del doblez: en curva es el VÉRTICE del arco (arrástralo al otro
          lado para invertir la comba); en escalonada, la esquina sugerida. */}
      {bend && (
        <rect
          x={bend.x - 6}
          y={bend.y - 6}
          width={12}
          height={12}
          rx={esArco ? 6 : 2}
          className="fill-white stroke-blue-400 cursor-move hover:fill-blue-100"
          strokeWidth={2}
          strokeDasharray="3 2"
          onMouseDown={(e) => onEndpointMouseDown(e, "bend")}
          onDoubleClick={(e) => {
            if (!esArco || !onBendDoubleClick) return;
            e.stopPropagation();
            onBendDoubleClick();
          }}
        >
          <title>
            {esArco
              ? "Arrastra para curvar (al otro lado invierte la comba) · doble clic para restablecer"
              : "Arrastra para crear un punto de quiebre"}
          </title>
        </rect>
      )}
      {/* Puntos de quiebre del usuario: arrastrar para mover, doble clic para quitar. */}
      {waypoints.map((w, i) => (
        <rect
          key={i}
          x={w.x - 6}
          y={w.y - 6}
          width={12}
          height={12}
          rx={2}
          className="fill-white stroke-blue-600 cursor-move hover:fill-blue-100"
          strokeWidth={2}
          onMouseDown={(e) => onWaypointMouseDown(e, i)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onWaypointDoubleClick(i);
          }}
        >
          <title>Arrastra para mover · doble clic para quitar</title>
        </rect>
      ))}
      <circle
        cx={start.x}
        cy={start.y}
        r={6}
        className="fill-white stroke-blue-600 cursor-move hover:fill-blue-100"
        strokeWidth={2}
        onMouseDown={(e) => onEndpointMouseDown(e, "source")}
      >
        <title>Arrastra para mover la punta de origen</title>
      </circle>
      <circle
        cx={end.x}
        cy={end.y}
        r={6}
        className="fill-white stroke-blue-600 cursor-move hover:fill-blue-100"
        strokeWidth={2}
        onMouseDown={(e) => onEndpointMouseDown(e, "target")}
      >
        <title>Arrastra para mover la punta de destino</title>
      </circle>
    </g>
  );
};
