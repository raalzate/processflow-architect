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
  isSwimlaneContainer,
  NOTATION_LIST,
  DEFAULT_NOTATION_ID,
  type Notation,
  type NotationId,
  type ShapeKind,
} from "@/lib/notations";
import { isContainerType, type DesignerNode, type DesignerLink } from "./serialize";

// --- Constantes de layout (compartidas con serialize.ts) ---
export const NODE_WIDTH = 160;
export const NODE_HEIGHT = 60;

/**
 * Etiqueta de arista: se dibuja suelta sobre la línea, así que su largo es lo que
 * decide si el diagrama se lee o se convierte en una mancha de texto sobre los
 * nodos. Se acota aquí (el texto completo va al tooltip) y `src/lib/mcp/quality`
 * avisa al agente que la escribió para que la acorte en el modelo.
 */
export const EDGE_LABEL_MAX_CHARS = 34;
/** Ancho aproximado de un carácter a `text-[10px] font-semibold`, para el halo. */
export const EDGE_LABEL_CHAR_PX = 5.4;

export function truncateEdgeLabel(label: string): string {
  const limpio = label.trim();
  return limpio.length > EDGE_LABEL_MAX_CHARS
    ? `${limpio.slice(0, EDGE_LABEL_MAX_CHARS - 1)}…`
    : limpio;
}
export const AGGREGATE_DEFAULT_WIDTH = 500;
export const AGGREGATE_DEFAULT_HEIGHT = 400;

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
};

export const iconForType = (type: string): React.ElementType =>
  ICON_MAP[ALL_ELEMENTS[type]?.icon ?? ""] || FilePlus;

const defaultColor = {
  bg: "fill-gray-100",
  border: "border-gray-300",
  text: "text-gray-800",
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
): { bg: string; border: string; text: string; paletteText?: string } => {
  const e = ALL_ELEMENTS[type];
  return e ? { bg: e.bg, border: e.border, text: e.text, paletteText: e.paletteText } : defaultColor;
};

const shapeForType = (type: string): ShapeKind => ALL_ELEMENTS[type]?.shape ?? "rounded";

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
        // para dar un fondo pastel SÓLIDO. Así el chip es legible en claro y oscuro
        // (si fuera transparente heredaría el panel oscuro y el texto se perdería).
        color.bg.replace("fill-", "bg-"),
        color.border,
        // Texto oscuro de la notación sobre el pastel claro (los tipos C4 con texto
        // blanco usan su color alterno `paletteText` para seguir legibles aquí).
        color.paletteText ?? color.text,
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

  const handleDragStart = (e: React.DragEvent, item: any) => {
    e.dataTransfer.setData("application/json", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
  };

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <div className="flex-shrink-0 w-60 bg-background p-3 space-y-4 overflow-y-auto shadow-lg z-10 border-r">
      <div>
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
                  <span className="ml-auto text-[10px] font-medium text-muted-foreground/70">
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
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
  onDoubleClick: () => void;
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
      className="fill-white stroke-gray-400 transition-colors hover:fill-blue-50 hover:stroke-blue-500"
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

export const DesignerNodeComponent: React.FC<NodeComponentProps> = ({
  node,
  isSelected,
  onMouseDown,
  onResizeMouseDown,
  onClick,
  onDoubleClick,
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
    const strokeDash = swimlane ? undefined : isContext ? "10 10" : "5 5";
    const radius = swimlane ? 0 : 12;
    const BAND = 28; // ancho de la banda del nombre, en coords del lienzo
    return (
      <g
        transform={`translate(${node.x},${node.y})`}
        onMouseDown={onMouseDown}
        onMouseUp={handleMouseUp}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
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
        <rect
          width={width}
          height={height}
          rx={radius}
          className={cn(
            "stroke-2 transition-all",
            meta?.transparent ? "fill-transparent" : color.bg,
            isSelected ? "stroke-blue-600" : meta?.stroke ?? color.border
          )}
          strokeWidth={isSelected ? 3 : 2}
          strokeDasharray={strokeDash}
          // Colores personalizados del contenedor: fondo siempre; borde sólo sin selección.
          style={{
            ...(node.color ? { fill: node.color } : {}),
            ...(!isSelected && node.borderColor ? { stroke: node.borderColor } : {}),
          }}
        />
        {swimlane ? (
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
              className={cn(
                "text-sm font-semibold pointer-events-none select-none",
                color.text,
                isDeleted && "line-through"
              )}
            >
              {node.nombre}
            </text>
          </>
        ) : (
          <text
            x="12"
            y="24"
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
            className={cn(isSelected ? "stroke-blue-600" : meta?.stroke ?? "stroke-gray-400")}
            strokeWidth="2"
          />
          <path
            d={`M${width - 6},${height} L${width},${height - 6}`}
            className={cn(isSelected ? "stroke-blue-600" : meta?.stroke ?? "stroke-gray-400")}
            strokeWidth="2"
          />
        </g>
        {/* Resalte al pasar por encima mientras se conecta (posible destino). */}
        {connecting && (
          <rect
            width={width}
            height={height}
            rx={radius}
            className="fill-transparent stroke-blue-400 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
            strokeWidth={3}
            strokeDasharray={strokeDash}
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
  const sideInset = compact ? (NODE_WIDTH - NODE_HEIGHT) / 2 : 0;

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onMouseDown={onMouseDown}
      onMouseUp={handleMouseUp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
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
        w={NODE_WIDTH}
        h={NODE_HEIGHT}
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
      <foreignObject width={NODE_WIDTH} height={NODE_HEIGHT} className="pointer-events-none">
        <div
          className={cn(
            "w-full h-full flex flex-col items-center justify-center p-2 text-center",
            color.text,
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
            <p className="text-[10px] italic leading-tight opacity-80 truncate max-w-full select-none">
              [{node.tags_tecnologia.join(", ")}]
            </p>
          )}
        </div>
      </foreignObject>
      {labelOutside && (
        <foreignObject
          y={NODE_HEIGHT + 4}
          width={NODE_WIDTH}
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
      {hasSubView && <SubProcessMarker cx={NODE_WIDTH / 2} y={NODE_HEIGHT - 7} onOpen={onOpenSubView!} />}
      <ChangeStateBadge
        estado={node.estado_comparativo}
        // Esquina superior derecha de la FORMA dibujada (no de la caja lógica).
        x={compact ? NODE_WIDTH / 2 + NODE_HEIGHT / 2 : NODE_WIDTH - 2}
      />
      <ConnectPorts
        w={NODE_WIDTH}
        h={NODE_HEIGHT}
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
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  /** Doble clic sobre la LÍNEA (no la etiqueta): añade un punto de quiebre ahí. */
  onLineDoubleClick?: (e: React.MouseEvent) => void;
}

// Recorta un extremo al CONTORNO de la forma (en la dirección que sale del centro),
// así la línea nace/termina en el borde y nunca cruza el interior (clave con relleno
// transparente). Soporta elipse, rombo y rectángulo (contenedores → rectángulo).
const clipToShape = (
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  shape: ShapeKind,
  dirX: number,
  dirY: number
) => {
  if (dirX === 0 && dirY === 0) return { x: cx, y: cy };
  let scale: number;
  if (shape === "ellipse") {
    scale = 1 / Math.sqrt((dirX / hw) ** 2 + (dirY / hh) ** 2);
  } else if (shape === "diamond") {
    scale = 1 / (Math.abs(dirX) / hw + Math.abs(dirY) / hh);
  } else {
    scale = 1 / Math.max(Math.abs(dirX) / hw, Math.abs(dirY) / hh);
  }
  return { x: cx + dirX * scale, y: cy + dirY * scale };
};

/**
 * Calcula los puntos de inicio/fin de un enlace: si hay ancla del usuario la
 * punta va exacta ahí; si no, se recorta al borde de la forma apuntando al otro
 * extremo. Compartido por el trazo y por las manijas de reanclado.
 */
export function linkEndpoints(
  link: DesignerLink,
  nodes: Map<string, DesignerNode>
): { start: { x: number; y: number }; end: { x: number; y: number } } | null {
  const sourceNode = nodes.get(link.sourceId);
  const targetNode = nodes.get(link.targetId);
  if (!sourceNode || !targetNode) return null;
  const isContainer = (t: string) => isContainerType(t);

  const sw = (isContainer(sourceNode.tipo_elemento) ? sourceNode.width || AGGREGATE_DEFAULT_WIDTH : NODE_WIDTH) / 2;
  const sh = (isContainer(sourceNode.tipo_elemento) ? sourceNode.height || AGGREGATE_DEFAULT_HEIGHT : NODE_HEIGHT) / 2;
  const tw = (isContainer(targetNode.tipo_elemento) ? targetNode.width || AGGREGATE_DEFAULT_WIDTH : NODE_WIDTH) / 2;
  const th = (isContainer(targetNode.tipo_elemento) ? targetNode.height || AGGREGATE_DEFAULT_HEIGHT : NODE_HEIGHT) / 2;
  const scx = sourceNode.x + sw;
  const scy = sourceNode.y + sh;
  const tcx = targetNode.x + tw;
  const tcy = targetNode.y + th;
  if (scx === tcx && scy === tcy && !link.sourceAnchor && !link.targetAnchor) return null;

  const sAnchorPt = link.sourceAnchor
    ? { x: sourceNode.x + link.sourceAnchor.x * (2 * sw), y: sourceNode.y + link.sourceAnchor.y * (2 * sh) }
    : null;
  const tAnchorPt = link.targetAnchor
    ? { x: targetNode.x + link.targetAnchor.x * (2 * tw), y: targetNode.y + link.targetAnchor.y * (2 * th) }
    : null;
  const sRef = sAnchorPt ?? { x: scx, y: scy };
  const tRef = tAnchorPt ?? { x: tcx, y: tcy };

  const sShape: ShapeKind = isContainer(sourceNode.tipo_elemento) ? "rect" : shapeForType(sourceNode.tipo_elemento);
  const tShape: ShapeKind = isContainer(targetNode.tipo_elemento) ? "rect" : shapeForType(targetNode.tipo_elemento);
  // Símbolos compactos (círculo/rombo pequeño): el contorno REAL es r = altura/2,
  // no el ancho de la caja — sin esto la línea quedaría flotando antes del borde.
  const sHw = ALL_ELEMENTS[sourceNode.tipo_elemento]?.compact ? Math.min(sw, sh) : sw;
  const tHw = ALL_ELEMENTS[targetNode.tipo_elemento]?.compact ? Math.min(tw, th) : tw;
  const start = sAnchorPt ?? clipToShape(scx, scy, sHw, sh, sShape, tRef.x - scx, tRef.y - scy);
  const end = tAnchorPt ?? clipToShape(tcx, tcy, tHw, th, tShape, sRef.x - tcx, sRef.y - tcy);
  return { start, end };
}

// Quita vértices casi coincidentes y colineales: así el ÚLTIMO segmento es el
// real (la flecha orient=auto apunta bien) y el trazo queda sin dobleces redundantes.
function simplifyPath(pts: Array<[number, number]>): Array<[number, number]> {
  const clean: Array<[number, number]> = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(prev[0] - p[0]) < 1 && Math.abs(prev[1] - p[1]) < 1) continue;
    clean.push(p);
  }
  for (let i = clean.length - 2; i >= 1; i--) {
    const [ax, ay] = clean[i - 1];
    const [bx, by] = clean[i];
    const [cx, cy] = clean[i + 1];
    if ((ax === bx && bx === cx) || (ay === by && by === cy)) clean.splice(i, 1);
  }
  return clean;
}

/**
 * Geometría completa del enlace: extremos + trazo SVG + posición de la etiqueta.
 * En enrutado escalonado expone el doblez automático (`bend`, cuando no hay
 * puntos de quiebre) y los puntos de quiebre del usuario (`waypoints`), todos
 * arrastrables. Compartida por el componente del enlace y la capa de manijas.
 */
export function linkGeometry(link: DesignerLink, nodes: Map<string, DesignerNode>) {
  const ep = linkEndpoints(link, nodes);
  if (!ep) return null;
  const { start, end } = ep;
  const routing = link.routing ?? "straight";
  let path: string;
  let labelX = (start.x + end.x) / 2;
  let labelY = (start.y + end.y) / 2;
  let bend: { x: number; y: number } | null = null;
  let waypoints: { x: number; y: number }[] = [];

  if (routing === "curved") {
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const px = -(end.y - start.y) / len;
    const py = (end.x - start.x) / len;
    const bow = Math.min(80, len * 0.25);
    const cx = labelX + px * bow;
    const cy = labelY + py * bow;
    path = `M${start.x},${start.y} Q${cx},${cy} ${end.x},${end.y}`;
    // Vértice de la Bézier cuadrática en t=0.5 (para la etiqueta).
    labelX = 0.25 * start.x + 0.5 * cx + 0.25 * end.x;
    labelY = 0.25 * start.y + 0.5 * cy + 0.25 * end.y;
  } else if (routing === "orthogonal") {
    // Compat: grafos viejos usaban un único `midpoint`.
    const ways =
      link.midpoints && link.midpoints.length
        ? link.midpoints
        : link.midpoint
        ? [link.midpoint]
        : [];
    let pts: Array<[number, number]>;
    if (ways.length === 0) {
      // Auto: un corredor según el eje dominante (esquina única sugerida).
      if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
        const cx = (start.x + end.x) / 2;
        pts = [[start.x, start.y], [cx, start.y], [cx, end.y], [end.x, end.y]];
        bend = { x: cx, y: (start.y + end.y) / 2 };
      } else {
        const cy = (start.y + end.y) / 2;
        pts = [[start.x, start.y], [start.x, cy], [end.x, cy], [end.x, end.y]];
        bend = { x: (start.x + end.x) / 2, y: cy };
      }
    } else {
      // Poli-línea que pasa por cada punto de quiebre del usuario, en orden.
      pts = [
        [start.x, start.y],
        ...ways.map((w) => [w.x, w.y] as [number, number]),
        [end.x, end.y],
      ];
      waypoints = ways;
    }
    path = "M" + simplifyPath(pts).map((p) => `${p[0]},${p[1]}`).join(" L");
  } else {
    path = `M${start.x},${start.y} L${end.x},${end.y}`;
  }

  return { start, end, path, labelX, labelY, bend, waypoints };
}

export const DesignerLinkComponent: React.FC<LinkComponentProps> = ({
  link,
  nodes,
  isSelected,
  onClick,
  onDoubleClick,
  onLineDoubleClick,
}) => {
  const geo = linkGeometry(link, nodes);
  if (!geo) return null;
  const { path, labelX, labelY } = geo;

  // Etiqueta: se acota al ancho legible y el halo se ajusta al texto resultante.
  const labelText = truncateEdgeLabel(link.descripcion ?? "");
  const labelWidth = labelText.length * EDGE_LABEL_CHAR_PX + 10;

  // Dirección de la(s) flecha(s).
  const arrow = link.arrow ?? "end";
  const sel = isSelected ? "-selected" : "";
  const markerEnd = arrow === "none" ? undefined : `url(#arrow-end${sel})`;
  const markerStart = arrow === "both" ? `url(#arrow-start${sel})` : undefined;

  return (
    <g onClick={onClick} className="cursor-pointer">
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
          isSelected ? "stroke-blue-600" : link.color ? "" : "stroke-gray-400 opacity-60"
        )}
        strokeWidth={isSelected ? 2.5 : 1.5}
        markerEnd={markerEnd}
        markerStart={markerStart}
        fill="none"
        // Línea discontinua opcional (relación punteada).
        strokeDasharray={link.dashed ? "8 5" : undefined}
        // Color de línea personalizado (prevalece sobre el gris por defecto).
        style={!isSelected && link.color ? { stroke: link.color } : undefined}
      />
      <g onDoubleClick={onDoubleClick} className="cursor-text">
        {/* El halo se dimensiona con el texto. Antes era un rect fijo de 80×20 y
            una etiqueta larga («cotiza y diligencia su solicitud [navegador web]»,
            ~240 px) se desbordaba sin fondo, cruzando líneas, nodos y títulos de
            contenedor. Se acota a EDGE_LABEL_MAX_CHARS y el texto completo queda
            en el tooltip: una relación bien documentada no debe tapar el diagrama. */}
        {!!labelText && (
          <>
            <title>{link.descripcion}</title>
            <rect
              x={labelX - labelWidth / 2}
              y={labelY - 10}
              width={labelWidth}
              height="20"
              className="fill-white/90"
              rx="4"
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] font-semibold text-gray-800 select-none pointer-events-none"
            >
              {labelText}
            </text>
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
  onEndpointMouseDown: (e: React.MouseEvent, which: "source" | "target" | "bend") => void;
  onWaypointMouseDown: (e: React.MouseEvent, index: number) => void;
  onWaypointDoubleClick: (index: number) => void;
}> = ({ link, nodes, onEndpointMouseDown, onWaypointMouseDown, onWaypointDoubleClick }) => {
  const geo = linkGeometry(link, nodes);
  if (!geo) return null;
  const { start, end, bend, waypoints } = geo;
  return (
    <g>
      {/* Doblez automático (sin puntos de quiebre aún): arrástralo para crear el primero. */}
      {bend && (
        <rect
          x={bend.x - 6}
          y={bend.y - 6}
          width={12}
          height={12}
          rx={2}
          className="fill-white stroke-blue-400 cursor-move hover:fill-blue-100"
          strokeWidth={2}
          strokeDasharray="3 2"
          onMouseDown={(e) => onEndpointMouseDown(e, "bend")}
        >
          <title>Arrastra para crear un punto de quiebre</title>
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
