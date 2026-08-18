"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Trash2,
  AlertTriangle,
  Edit,
  Settings2,
  Plus,
  X,
  Workflow,
  Undo2,
  Redo2,
  Trash,
  HelpCircle,
  Check,
  Loader2,
  Keyboard,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize,
  Layers,
  ExternalLink,
  ArrowLeft,
  ChevronRight,
  Library,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import * as DrawerPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { hasPlatformModifier, modifierLabel } from "@/lib/platform";
import { useToast } from "@/hooks/use-toast";
import { useAi } from "@/hooks/useAi";
import { orderLanesTask } from "@/lib/ai/tasks";
import { arrangeGraphData, laneNames, laneSummary } from "@/lib/mcp/arrange";
import {
  DEFAULT_DENSITY,
  defaultStrategyFor,
  type LayoutDensity,
  type LayoutStrategy,
} from "@/lib/mcp/layout-presets";
import { ArrangeMenu } from "./ArrangeMenu";
import { canvasWorldSize } from "./minimap-geom";
import {
  describeNodeTask,
  linkLabelTask,
  bigPictureDescTask,
  classifyTypeTask,
  suggestNameTask,
  suggestTagsTask,
  suggestNextTask,
} from "@/lib/ai/tasks";
import {
  getNotation,
  sizeOfType,
  DEFAULT_NOTATION_ID,
  type NotationId,
} from "@/lib/notations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGraphContext } from "@/context/GraphContext";
import { useViews } from "@/context/ViewsContext";
import { useReference } from "@/context/ReferenceContext";
import { buildEmbedMap, wouldCreateCycle } from "@/lib/view-embeds";
import { ReferenceContextDialog } from "./ReferenceContextDialog";
import { AiProvenanceBadge } from "@/components/ai-panel/AiProvenanceBadge";
import type { GraphData, ReadModel } from "@/lib/types";
import {
  Toolbox,
  DesignerNodeComponent,
  DesignerLinkComponent,
  LinkEndpointHandles,
  CHANGE_STATES,
} from "./DesignerCanvas";
import {
  linkEndpoints,
  nodeBox,
  AGGREGATE_DEFAULT_WIDTH,
  AGGREGATE_DEFAULT_HEIGHT,
} from "./link-geom";
import {
  type DesignerNode,
  type DesignerLink,
  canvasToGraphData,
  graphDataToCanvas,
  findIsolatedNodes,
  isContainerType,
  computeContentBounds,
} from "./serialize";
import { NotationLegend } from "./NotationLegend";
import { Minimap } from "./Minimap";
import { exportCanvasSvg, downloadDataUrl } from "./export-canvas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Metadatos del proyecto que no se expresan geométricamente en el lienzo.
interface DesignerMeta {
  nombre_proyecto: string;
  version: string;
  fecha_analisis: string;
  bigPictureDescripcion: string;
  hotspots: string[];
  read_models: ReadModel[];
  responsables: string[];
  notas: string;
  transcript: string;
}

function metaFromContent(content: GraphData): DesignerMeta {
  return {
    nombre_proyecto: content.nombre_proyecto || "Proyecto sin nombre",
    version: content.version || "1.0.0",
    fecha_analisis: content.fecha_analisis || "",
    bigPictureDescripcion: content.big_picture?.descripcion || "",
    hotspots: content.big_picture?.hotspots || [],
    read_models: content.read_models || [],
    responsables: content.responsables || [],
    notas: content.notas || "",
    transcript: content.transcript || "",
  };
}

function buildContent(
  nodes: Map<string, DesignerNode>,
  links: Map<string, DesignerLink>,
  meta: DesignerMeta,
  /** Notación activa del lienzo: se re-sella en el documento en cada guardado. */
  notation?: NotationId
): GraphData {
  return canvasToGraphData(nodes, links, {
    nombre_proyecto: meta.nombre_proyecto,
    version: meta.version,
    notation,
    fecha_analisis: meta.fecha_analisis,
    big_picture: {
      descripcion: meta.bigPictureDescripcion,
      hotspots: meta.hotspots,
      nodos: [],
      aristas: [],
    },
    read_models: meta.read_models,
    responsables: meta.responsables,
    notas: meta.notas,
    transcript: meta.transcript,
  });
}

// =============================================================================
// Diálogos de edición
// =============================================================================

// Paleta rápida + selector libre de color (fondo de nodos / línea de enlaces).
const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#1f2937",
];

const ColorField: React.FC<{
  label: string;
  value?: string;
  onChange: (c?: string) => void;
}> = ({ label, value, onChange }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{ backgroundColor: c }}
          title={c}
          className={cn(
            "h-6 w-6 rounded-full border border-black/10 transition hover:scale-110",
            value === c && "ring-2 ring-blue-500 ring-offset-1"
          )}
        />
      ))}
      {/* Selector libre */}
      <label
        className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-black/10"
        title="Color personalizado"
        style={value && !COLOR_PRESETS.includes(value) ? { backgroundColor: value } : undefined}
      >
        <input
          type="color"
          value={value || "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -left-1 -top-1 h-8 w-8 cursor-pointer p-0 opacity-0"
        />
        {!(value && !COLOR_PRESETS.includes(value)) && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xs text-gray-500">
            +
          </span>
        )}
      </label>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onChange(undefined)}
        >
          Restablecer
        </Button>
      )}
    </div>
  </div>
);

const EditNodeDialog: React.FC<{
  node: DesignerNode | null;
  /** Tipos de elemento de la notación activa (para el Select de tipo). */
  elementTypes: string[];
  /** Notación de la vista: dirige las sugerencias de IA (tipos, rol, nombres). */
  notation: NotationId;
  /** Vistas que se pueden embeber como subproceso (todas menos la actual). */
  subViews: { id: string; name: string }[];
  /** Abre (entra a) la vista embebida. */
  onOpenSubView: (viewId: string) => void;
  /** Crea una nueva vista para embeber y devuelve su id (sin activarla). */
  onCreateSubView: (name: string) => string | null;
  /** Contexto de referencia del proyecto (documentos subidos) para la IA. */
  referencia: string;
  onClose: () => void;
  onSave: (n: DesignerNode) => void;
  onCreateNext: (fromNode: DesignerNode, sug: { tipo: string; nombre: string; relacion: string }) => void;
}> = ({ node, elementTypes, notation, subViews, onOpenSubView, onCreateSubView, referencia, onClose, onSave, onCreateNext }) => {
  const [draft, setDraft] = useState<DesignerNode | null>(null);
  const { run, busy } = useAi();
  // Campo cuya sugerencia se está ejecutando: sólo ESE botón muestra el spinner.
  const [busyField, setBusyField] = useState<string | null>(null);
  useEffect(() => {
    setDraft(node ? { ...node } : null);
  }, [node]);
  if (!draft) return null;

  // El tipo del nodo puede venir de OTRA notación (p. ej. diagrama BPMN/C4
  // importado por MCP abierto en una vista DDD): inclúyelo en las opciones o
  // el Select quedaría vacío al no encontrar su valor en la lista.
  const typeOptions =
    draft.tipo_elemento && !elementTypes.includes(draft.tipo_elemento)
      ? [draft.tipo_elemento, ...elementTypes]
      : elementTypes;

  // Ejecuta una sugerencia marcando su campo como ocupado (spinner localizado).
  const withField = async <T,>(field: string, fn: () => Promise<T>): Promise<T> => {
    setBusyField(field);
    try {
      return await fn();
    } finally {
      setBusyField(null);
    }
  };

  const suggestDesc = () =>
    withField("desc", async () => {
      const text = await run(describeNodeTask, {
        tipo: draft.tipo_elemento,
        nombre: draft.nombre,
        descripcion: draft.descripcion,
        referencia,
        notation,
      });
      if (text) setDraft((d) => (d ? { ...d, descripcion: text } : d));
    });
  const suggestName = () =>
    withField("name", async () => {
      const text = await run(suggestNameTask, { tipo: draft.tipo_elemento, descripcion: draft.descripcion, referencia, notation });
      if (text) setDraft((d) => (d ? { ...d, nombre: text } : d));
    });
  const suggestType = () =>
    withField("type", async () => {
      const t = await run(classifyTypeTask, { nombre: draft.nombre, descripcion: draft.descripcion, referencia, notation });
      if (t) setDraft((d) => (d ? { ...d, tipo_elemento: t as DesignerNode["tipo_elemento"] } : d));
    });
  const suggestTags = () =>
    withField("tags", async () => {
      const tags = await run(suggestTagsTask, {
        tipo: draft.tipo_elemento,
        nombre: draft.nombre,
        descripcion: draft.descripcion,
        referencia,
      });
      if (tags && tags.length) setDraft((d) => (d ? { ...d, tags_tecnologia: tags } : d));
    });
  const suggestNext = () =>
    withField("next", async () => {
      const sug = await run(suggestNextTask, {
        tipo: draft.tipo_elemento,
        nombre: draft.nombre,
        descripcion: draft.descripcion,
        referencia,
        notation,
      });
      if (sug && sug.nombre) {
        onSave(draft); // persiste el nodo actual antes de encadenar el siguiente
        onCreateNext(draft, sug);
        onClose();
      }
    });

  // Botón "Sugerir" reutilizable (IA local). Sólo gira el del campo activo; los
  // demás quedan deshabilitados mientras corre una sugerencia.
  const SugBtn = ({ field, onClick, disabled }: { field: string; onClick: () => void; disabled?: boolean }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 text-purple-600 hover:text-purple-700"
      onClick={onClick}
      disabled={busy || disabled}
      title="Sugerir con IA (ver el motor en el badge del título)"
    >
      {busyField === field ? (
        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4 mr-1" />
      )}
      Sugerir
    </Button>
  );

  return (
    // Inspector LATERAL (no modal): sin overlay y con modal={false}, el lienzo
    // sigue visible e interactivo mientras se edita un elemento tras otro. No se
    // cierra al hacer clic fuera (onInteractOutside) para no perder el trabajo.
    <DrawerPrimitive.Root open={!!node} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          <div className="flex items-start justify-between border-b p-4">
            <div className="space-y-1">
              <DrawerPrimitive.Title className="flex items-center gap-2 text-lg font-semibold">
                <Edit className="w-5 h-5" /> Editar elemento
                {/* Procedencia: qué motor atenderá los botones "Sugerir". */}
                <AiProvenanceBadge className="ml-1" />
              </DrawerPrimitive.Title>
              <DrawerPrimitive.Description className="text-sm text-muted-foreground">
                Modifica el nombre y la descripción de este elemento.
              </DrawerPrimitive.Description>
            </div>
            <DrawerPrimitive.Close
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
              title="Cerrar (Esc)"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </DrawerPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
            {/* Columna izquierda: identidad */}
            <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="node-name">Nombre</Label>
              <SugBtn field="name" onClick={suggestName} disabled={!draft.descripcion?.trim()} />
            </div>
            <Input
              id="node-name"
              value={draft.nombre}
              onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="node-desc">Descripción</Label>
              <SugBtn field="desc" onClick={suggestDesc} disabled={!draft.nombre.trim()} />
            </div>
            <Textarea
              id="node-desc"
              value={draft.descripcion || ""}
              onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
              className="min-h-[180px]"
            />
          </div>
            </div>

            {/* Columna derecha: clasificación y estilo */}
            <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <Label>Tipo de elemento</Label>
              <SugBtn field="type" onClick={suggestType} disabled={!draft.nombre.trim()} />
            </div>
            <Select
              value={draft.tipo_elemento}
              onValueChange={(v) => setDraft({ ...draft, tipo_elemento: v as DesignerNode["tipo_elemento"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Estado del cambio</Label>
            <Select
              value={draft.estado_comparativo || "nuevo"}
              onValueChange={(v) =>
                setDraft({ ...draft, estado_comparativo: v as DesignerNode["estado_comparativo"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_STATES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Clasifica el elemento en «Elementos Principales»: qué es nuevo, qué se modifica y
              qué debe eliminarse.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="node-tags">Tecnologías / etiquetas</Label>
              <SugBtn field="tags" onClick={suggestTags} disabled={!draft.nombre.trim()} />
            </div>
            <Input
              id="node-tags"
              value={(draft.tags_tecnologia || []).join(", ")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  tags_tecnologia: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Angular, PostgreSQL, Kafka…"
            />
          </div>
          <ColorField
            label="Color de fondo"
            value={draft.color}
            onChange={(c) => setDraft((d) => (d ? { ...d, color: c } : d))}
          />
          <ColorField
            label="Color de borde"
            value={draft.borderColor}
            onChange={(c) => setDraft((d) => (d ? { ...d, borderColor: c } : d))}
          />
            </div>
          </div>

          {/* Vista embebida (subproceso): el nodo apunta a otra vista para dar
              profundidad, como un "call activity" de BPMN. Full-width bajo la grilla. */}
          <div className="mt-4 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" />
              <Label>Vista embebida (subproceso)</Label>
            </div>
            <p className="mt-1 mb-2 text-xs text-muted-foreground">
              Enlaza este elemento a otra vista para detallarlo. Aparecerá una marca ⊞
              en el nodo; ábrela para entrar y darle profundidad.
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={draft.viewRef ?? "__none__"}
                onValueChange={(v) =>
                  setDraft((d) => (d ? { ...d, viewRef: v === "__none__" ? undefined : v } : d))
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Ninguna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguna</SelectItem>
                  {subViews.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1"
                title="Crear una vista nueva y enlazarla a este elemento"
                onClick={() => {
                  const id = onCreateSubView(draft.nombre?.trim() || "Subproceso");
                  if (id) setDraft((d) => (d ? { ...d, viewRef: id } : d));
                }}
              >
                <Plus className="h-4 w-4" /> Crear
              </Button>
            </div>
            {draft.viewRef && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 gap-1.5 text-primary hover:text-primary"
                onClick={() => {
                  onSave(draft); // persiste el enlace antes de navegar
                  onOpenSubView(draft.viewRef!);
                  onClose();
                }}
              >
                <ExternalLink className="h-4 w-4" /> Abrir subproceso
              </Button>
            )}
          </div>
        </div>
          <div className="flex items-center justify-between gap-2 border-t p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={suggestNext}
              disabled={busy || !draft.nombre.trim()}
              title="Crea el siguiente elemento del flujo (Event Storming) conectado a este"
            >
              {busyField === "next" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
              Siguiente paso
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  onSave(draft);
                  onClose();
                }}
              >
                Guardar
              </Button>
            </div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
};

const EditLinkDialog: React.FC<{
  link: DesignerLink | null;
  nodes: Map<string, DesignerNode>;
  /** Contexto de referencia del proyecto para la IA. */
  referencia: string;
  /** Notación de la vista: dirige la etiqueta que sugiere la IA. */
  notation: NotationId;
  onClose: () => void;
  onSave: (l: DesignerLink) => void;
}> = ({ link, nodes, referencia, notation, onClose, onSave }) => {
  const [draft, setDraft] = useState<DesignerLink | null>(null);
  const { run, busy } = useAi();
  useEffect(() => {
    setDraft(link ? { ...link } : null);
  }, [link]);
  if (!draft) return null;

  const suggestLabel = async () => {
    const s = nodes.get(draft.sourceId);
    const t = nodes.get(draft.targetId);
    if (!s || !t) return;
    const text = await run(linkLabelTask, {
      sourceName: s.nombre,
      sourceType: s.tipo_elemento,
      targetName: t.nombre,
      targetType: t.tipo_elemento,
      referencia,
      notation,
    });
    if (text) setDraft((d) => (d ? { ...d, descripcion: text } : d));
  };

  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" /> Editar enlace
          </DialogTitle>
          <DialogDescription>
            Describe la relación entre los dos elementos.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="link-desc">Descripción</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-purple-600 hover:text-purple-700"
              onClick={suggestLabel}
              disabled={busy}
              title="Sugerir etiqueta con IA"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Sugerir
            </Button>
          </div>
          <Input
            id="link-desc"
            value={draft.descripcion}
            onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
            placeholder="Ej: invoca, publica, valida"
          />
          <div className="mt-4">
            <ColorField
              label="Color de línea"
              value={draft.color}
              onChange={(c) => setDraft((d) => (d ? { ...d, color: c } : d))}
            />
          </div>
          <div className="mt-4 space-y-1.5">
            <Label>Estilo de línea</Label>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => setDraft((d) => (d ? { ...d, dashed: false } : d))}
                className={cn(
                  "px-4 py-1.5 text-sm",
                  !draft.dashed ? "bg-primary text-primary-foreground font-medium" : "bg-muted text-muted-foreground"
                )}
              >
                Continua
              </button>
              <button
                type="button"
                onClick={() => setDraft((d) => (d ? { ...d, dashed: true } : d))}
                className={cn(
                  "px-4 py-1.5 text-sm",
                  draft.dashed ? "bg-primary text-primary-foreground font-medium" : "bg-muted text-muted-foreground"
                )}
              >
                Discontinua
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label>Enrutado</Label>
            <div className="flex flex-wrap gap-2">
              {([
                ["straight", "Recta"],
                ["curved", "Curva"],
                ["orthogonal", "Escalonada"],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDraft((d) => (d ? { ...d, routing: val } : d))}
                  className={cn(
                    "rounded-md border px-4 py-1.5 text-sm",
                    (draft.routing ?? "straight") === val
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-1.5">
            <Label>Flechas</Label>
            <div className="flex flex-wrap gap-2">
              {([
                ["end", "→ Destino"],
                ["both", "↔ Ambos"],
                ["none", "— Ninguna"],
              ] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDraft((d) => (d ? { ...d, arrow: val } : d))}
                  className={cn(
                    "rounded-md border px-4 py-1.5 text-sm",
                    (draft.arrow ?? "end") === val
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {(draft.sourceAnchor || draft.targetAnchor || draft.midpoint || draft.midpoints?.length) && (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          sourceAnchor: undefined,
                          targetAnchor: undefined,
                          midpoint: undefined,
                          midpoints: undefined,
                        }
                      : d
                  )
                }
                title="Vuelve al enrutado automático: puntas al borde y sin puntos de quiebre"
              >
                Restablecer trazado (auto)
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =============================================================================
// Panel de metadatos (GraphData completo)
// =============================================================================

const csv = (s: string) =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

const MetadataDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  meta: DesignerMeta;
  summary: string;
  /** Notación de la vista: dirige el resumen que sugiere la IA. */
  notation: NotationId;
  onSave: (m: DesignerMeta) => void;
}> = ({ open, onOpenChange, meta, summary, notation, onSave }) => {
  const [draft, setDraft] = useState<DesignerMeta>(meta);
  const { run, busy } = useAi();
  useEffect(() => {
    if (open) setDraft(meta);
  }, [open, meta]);

  const suggestBigPicture = async () => {
    const text = await run(bigPictureDescTask, { resumen: summary, notation });
    if (text) setDraft((d) => ({ ...d, bigPictureDescripcion: text }));
  };

  const updateRm = (i: number, patch: Partial<ReadModel>) =>
    setDraft((d) => ({
      ...d,
      read_models: d.read_models.map((rm, idx) =>
        idx === i ? { ...rm, ...patch } : rm
      ),
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5" /> Metadatos del proyecto
            <AiProvenanceBadge className="ml-1" />
          </DialogTitle>
          <DialogDescription>
            Información del modelo que no se dibuja en el lienzo: read models,
            responsables, notas y datos del Big Picture.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nombre del proyecto</Label>
              <Input
                value={draft.nombre_proyecto}
                onChange={(e) => setDraft({ ...draft, nombre_proyecto: e.target.value })}
              />
            </div>
            <div>
              <Label>Versión</Label>
              <Input
                value={draft.version}
                onChange={(e) => setDraft({ ...draft, version: e.target.value })}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Descripción del Big Picture</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-purple-600 hover:text-purple-700"
                onClick={suggestBigPicture}
                disabled={busy}
                title="Sugerir con IA a partir del diseño"
              >
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                Sugerir
              </Button>
            </div>
            <Textarea
              value={draft.bigPictureDescripcion}
              onChange={(e) => setDraft({ ...draft, bigPictureDescripcion: e.target.value })}
            />
          </div>

          <div>
            <Label>Hotspots (separados por comas)</Label>
            <Input
              value={draft.hotspots.join(", ")}
              onChange={(e) => setDraft({ ...draft, hotspots: csv(e.target.value) })}
            />
          </div>

          <div>
            <Label>Responsables (separados por comas)</Label>
            <Input
              value={draft.responsables.join(", ")}
              onChange={(e) => setDraft({ ...draft, responsables: csv(e.target.value) })}
            />
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea
              value={draft.notas}
              onChange={(e) => setDraft({ ...draft, notas: e.target.value })}
            />
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Read Models</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    read_models: [
                      ...d.read_models,
                      { nombre: "", descripcion: "", proyecta: [], ui_policies: [], tecnologias: [] },
                    ],
                  }))
                }
              >
                <Plus className="w-4 h-4 mr-1" /> Añadir
              </Button>
            </div>
            <div className="space-y-3">
              {draft.read_models.map((rm, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/50 relative">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        read_models: d.read_models.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                    title="Eliminar read model"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <Input
                    placeholder="Nombre"
                    value={rm.nombre}
                    onChange={(e) => updateRm(i, { nombre: e.target.value })}
                  />
                  <Input
                    placeholder="Descripción"
                    value={rm.descripcion}
                    onChange={(e) => updateRm(i, { descripcion: e.target.value })}
                  />
                  <Input
                    placeholder="Proyecta (ids de vistas, separados por comas)"
                    value={rm.proyecta.join(", ")}
                    onChange={(e) => updateRm(i, { proyecta: csv(e.target.value) })}
                  />
                  <Input
                    placeholder="UI policies (separadas por comas)"
                    value={rm.ui_policies.join(", ")}
                    onChange={(e) => updateRm(i, { ui_policies: csv(e.target.value) })}
                  />
                  <Input
                    placeholder="Tecnologías (separadas por comas)"
                    value={rm.tecnologias.join(", ")}
                    onChange={(e) => updateRm(i, { tecnologias: csv(e.target.value) })}
                  />
                </div>
              ))}
              {draft.read_models.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Sin read models.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Guardar metadatos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// =============================================================================
// Componente principal del diseñador
// =============================================================================

export const ComponentDesigner: React.FC<{
  /** Si se pasa, el diseñador edita ESTE grafo (una vista) en vez del proyecto activo. */
  value?: GraphData;
  /** Guardado para modo vista (en vez de handleDesignUpdate del proyecto). */
  onChange?: (g: GraphData) => void;
  /** Id estable de la fuente (vista) para recargar al cambiar. */
  sourceId?: string;
  /** Notación / grupo de componentes de la vista (DDD, BPMN, C4, UML). */
  notation?: NotationId;
  /** Cambia la notación de la vista (sólo modo vista; muestra el SELECT). */
  onNotationChange?: (n: NotationId) => void;
}> = ({ value, onChange, sourceId, notation, onNotationChange }) => {
  const { currentFileId, savedFiles, handleDesignUpdate, graphData } = useGraphContext();
  const { views, activeViewId, drillStack, enterView, goToDrill, createView } = useViews();
  const { referenceText } = useReference();
  const { toast } = useToast();
  // IA del lienzo: hoy sólo la usa «Organizar → Sugerir con IA», que pide ORDEN
  // de grupos (nunca coordenadas: la geometría es determinista).
  const { run: runAi } = useAi();

  // --- Vistas embebidas (subprocesos) ---
  // Id de la vista que edita este lienzo: en modo vista es sourceId; en el modelo
  // del proyecto es la vista built-in "design".
  const currentViewId = value !== undefined ? sourceId ?? "" : "design";
  // Grafo de embebidos entre TODAS las vistas (la "design" usa el grafo del
  // proyecto). Sirve para evitar ciclos al enlazar subprocesos.
  const embedMap = useMemo(
    () =>
      buildEmbedMap(
        views.map((v) => ({
          id: v.id,
          graph: v.id === "design" ? graphData : (v as { graph?: GraphData }).graph,
        }))
      ),
    [views, graphData]
  );
  // Vistas candidatas a embeber: todas menos la actual y las que crearían ciclo.
  const subViewOptions = useMemo(
    () =>
      views
        .filter((v) => !wouldCreateCycle(embedMap, currentViewId, v.id))
        .map((v) => ({ id: v.id, name: v.name })),
    [views, embedMap, currentViewId]
  );
  const openSubView = useCallback((viewId: string) => enterView(viewId), [enterView]);
  // El viewRef puede quedar colgando si la vista embebida se borró: sin esta
  // comprobación el nodo seguiría mostrando el badge de subproceso (roto).
  const subViewExists = useCallback(
    (viewId?: string) => !!viewId && views.some((v) => v.id === viewId),
    [views]
  );
  // Crea una sub-vista SIN activarla (para no desmontar el lienzo antes de guardar
  // el viewRef del nodo). Devuelve el id de la nueva vista.
  const createSubView = useCallback(
    (name: string) => createView({ name, notation: notation ?? DEFAULT_NOTATION_ID, activate: false }),
    [createView, notation]
  );
  // Breadcrumb de navegación en profundidad: ancestros + vista actual.
  const drillPath = useMemo(() => [...drillStack, activeViewId], [drillStack, activeViewId]);
  const viewName = useCallback(
    (id: string) => views.find((v) => v.id === id)?.name ?? "(vista)",
    [views]
  );

  const notationId: NotationId = notation ?? DEFAULT_NOTATION_ID;
  const activeNotation = getNotation(notationId);
  // Tipos de elemento de la notación activa (para el Select de "Editar elemento").
  const elementTypes = useMemo(
    () => activeNotation.elements.map((e) => e.type),
    [activeNotation]
  );
  // Tipo contenedor por defecto de la notación (para sembrar el lienzo vacío).
  const seedContainerType = useMemo(
    () => activeNotation.elements.find((e) => e.container)?.type,
    [activeNotation]
  );

  // Modo vista: editar el grafo de una vista custom; si no, el proyecto activo.
  const isViewMode = value !== undefined;
  const sourceKey = isViewMode ? `view:${sourceId ?? "?"}` : currentFileId;
  const sourceContent: GraphData | undefined = isViewMode
    ? value
    : savedFiles.find((f) => f.id === currentFileId)?.content;
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [nodes, setNodes] = useState<Map<string, DesignerNode>>(new Map());
  const [links, setLinks] = useState<Map<string, DesignerLink>>(new Map());
  const [meta, setMeta] = useState<DesignerMeta | null>(null);

  // Selección MÚLTIPLE de elementos (nodos y enlaces). Un Set permite alternar con
  // Shift/⌘ y seleccionar por marco de arrastre. Mantén también la selección única
  // (helpers) para no romper el flujo de un solo elemento.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);
  const selectOnly = useCallback((id: string) => setSelectedIds(new Set([id])), []);
  const toggleSelect = useCallback(
    (id: string) =>
      setSelectedIds((prev) => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      }),
    []
  );
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  // Marco de selección (rectángulo al arrastrar sobre el vacío).
  const [marquee, setMarquee] = useState<
    { x0: number; y0: number; x1: number; y1: number; additive: boolean } | null
  >(null);
  const [editingNode, setEditingNode] = useState<DesignerNode | null>(null);
  const [editingLink, setEditingLink] = useState<DesignerLink | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Confirmación de "Limpiar" controlada: así también la paleta (⌘K) puede
  // ABRIR la confirmación en vez de borrar sin preguntar (acción destructiva).
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  // Durante la captura a PNG se ocultan los overlays (minimapa, leyenda, zoom)
  // para que no salgan en la imagen.
  const [capturing, setCapturing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  // Conexión por arrastre: nodo origen + posición actual del cursor (línea guía).
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectCursor, setConnectCursor] = useState<{ x: number; y: number } | null>(null);
  // Arrastre en curso: mover (posiblemente varios nodos a la vez, guardando su
  // posición inicial) o redimensionar un contenedor concreto.
  const [draggingInfo, setDraggingInfo] = useState<
    | { type: "move"; startX: number; startY: number; origins: Map<string, { x: number; y: number }> }
    | { type: "resize"; id: string }
    | null
  >(null);

  // Ficha flotante al pasar el ratón por un componente: nombre, tipo y
  // descripción. Guardamos coordenadas de PANTALLA (clientX/Y) y la pintamos
  // con position:fixed → nos ahorramos convertir viewBox/zoom/scroll.
  const [hoverCard, setHoverCard] = useState<{ node: DesignerNode; x: number; y: number } | null>(
    null
  );
  const showHoverCard = useCallback(
    (e: React.MouseEvent, node: DesignerNode) => {
      // Durante un arrastre/conexión/selección la ficha estorba: la ocultamos.
      if (draggingInfo || connectFrom || marquee) {
        setHoverCard(null);
        return;
      }
      setHoverCard({ node, x: e.clientX, y: e.clientY });
    },
    [draggingInfo, connectFrom, marquee]
  );
  const hideHoverCard = useCallback(() => setHoverCard(null), []);

  // Zoom del lienzo: escalamos el TAMAÑO renderizado del SVG y el viewBox a la
  // par (misma escala en x e y), así getScreenCTM() sigue mapeando bien
  // (drag/drop intactos). CANVAS_SIZE es el MÍNIMO lógico: al alejar, el área
  // crece para llenar el viewport en vez de dejar una franja gris muerta donde
  // no se puede soltar nada.
  const CANVAS_SIZE = 2000;
  const GRID = 20; // paso de la cuadrícula del lienzo (en coordenadas del viewBox)
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.15;
  const [zoom, setZoom] = useState(1);
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  // Porción visible del lienzo (en px de scroll), para el rectángulo del minimapa.
  const [viewport, setViewport] = useState({ left: 0, top: 0, w: 0, h: 0 });
  // El mundo del lienzo CRECE con el contenido: con un lado fijo, lo que caía
  // más allá quedaba dibujado pero fuera del área scrolleable y no había forma
  // de llegar al final del diagrama (un BPMN cómodo pasa de 3000 px de ancho).
  const world = useMemo(
    () => canvasWorldSize(computeContentBounds(nodes, notationId), CANVAS_SIZE),
    [nodes, notationId]
  );
  // Lado del lienzo en px: nunca menor que el viewport (ver CANVAS_SIZE).
  const canvasPxW = Math.max(world.width * zoom, viewport.w);
  const canvasPxH = Math.max(world.height * zoom, viewport.h);
  const syncViewport = useCallback(() => {
    const w = canvasWrapperRef.current;
    if (!w) return;
    setViewport({ left: w.scrollLeft, top: w.scrollTop, w: w.clientWidth, h: w.clientHeight });
  }, []);

  // Centra el viewport en un punto del lienzo (coordenadas del viewBox). Lo usa el
  // minimapa: convierte el centro deseado a scroll (coord * zoom - mitad del alto).
  const navigateTo = useCallback(
    (cx: number, cy: number) => {
      const w = canvasWrapperRef.current;
      if (!w) return;
      w.scrollLeft = cx * zoom - w.clientWidth / 2;
      w.scrollTop = cy * zoom - w.clientHeight / 2;
    },
    [zoom]
  );

  // Ajusta el zoom y el scroll para encuadrar TODO el contenido con un margen.
  // Sin nodos, vuelve al 100%. Es la acción del botón "Ajustar a contenido".
  const fitToContent = useCallback((opts: { maxZoom?: number } = {}) => {
    const wrapper = canvasWrapperRef.current;
    const bounds = computeContentBounds(nodesRef.current, notationId);
    if (!wrapper || !bounds) {
      zoomReset();
      return;
    }
    const PAD = 80; // margen alrededor del contenido, en coordenadas del lienzo
    const z = clampZoom(
      Math.min(
        wrapper.clientWidth / (bounds.width + PAD * 2),
        wrapper.clientHeight / (bounds.height + PAD * 2),
        // Tope opcional: al ABRIR un modelo no queremos ampliar dos diagramas
        // pequeños hasta el 300%, solo asegurar que se vean enteros.
        opts.maxZoom ?? Infinity
      )
    );
    setZoom(z);
    // El tamaño del SVG cambia tras aplicar el zoom: reposiciona en el frame siguiente.
    requestAnimationFrame(() => {
      wrapper.scrollLeft = (bounds.minX - PAD) * z;
      wrapper.scrollTop = (bounds.minY - PAD) * z;
      syncViewport();
    });
  }, [zoomReset, syncViewport, notationId]);

  // `revision` se incrementa sólo en puntos de commit (no en cada frame de
  // arrastre), para disparar el autoguardado una vez por cambio efectivo.
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((r) => r + 1), []);

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const linksRef = useRef(links);
  const connectFromRef = useRef<string | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  const marqueeRef = useRef(marquee);
  // Sesión de arrastre de: punta (reanclado), doblez auto o punto de quiebre (índice).
  const endpointDragRef = useRef<
    { linkId: string; kind: "source" | "target" | "bend" | "wp"; index?: number } | null
  >(null);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);
  useEffect(() => {
    connectFromRef.current = connectFrom;
  }, [connectFrom]);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  useEffect(() => {
    marqueeRef.current = marquee;
  }, [marquee]);

  // Zoom con Ctrl/⌘ + rueda (mantiene el punto bajo el cursor). Se registra como
  // listener nativo NO pasivo para poder hacer preventDefault del scroll del navegador.
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // rueda normal = scroll/pan
      e.preventDefault();
      setZoom((prev) => {
        const next = clampZoom(prev * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        if (next === prev) return prev;
        // Mantén el punto del cursor anclado al hacer zoom.
        const rect = wrapper.getBoundingClientRect();
        const cx = e.clientX - rect.left + wrapper.scrollLeft;
        const cy = e.clientY - rect.top + wrapper.scrollTop;
        const ratio = next / prev;
        requestAnimationFrame(() => {
          wrapper.scrollLeft = cx * ratio - (e.clientX - rect.left);
          wrapper.scrollTop = cy * ratio - (e.clientY - rect.top);
        });
        return next;
      });
    };
    wrapper.addEventListener("wheel", onWheel, { passive: false });
    return () => wrapper.removeEventListener("wheel", onWheel);
  }, []);

  // El viewport del minimapa depende del zoom y del tamaño del contenido: lo
  // resincronizamos cuando cambia el zoom o hay un commit en el historial.
  useEffect(() => {
    syncViewport();
  }, [zoom, revision, syncViewport]);

  // El lado del lienzo depende del tamaño del wrapper: remedir al redimensionar
  // (sin esto, agrandar la ventana deja el lienzo corto hasta el próximo cambio).
  useEffect(() => {
    const wrapper = canvasWrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncViewport());
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [syncViewport]);

  // --- Historial (deshacer / rehacer) ---
  const historyRef = useRef<{
    snapshots: Array<{ nodes: [string, DesignerNode][]; links: [string, DesignerLink][] }>;
    index: number;
  }>({ snapshots: [], index: -1 });

  const pushSnapshot = useCallback(
    (n: Map<string, DesignerNode>, l: Map<string, DesignerLink>) => {
      const h = historyRef.current;
      h.snapshots = h.snapshots.slice(0, h.index + 1);
      h.snapshots.push({ nodes: Array.from(n.entries()), links: Array.from(l.entries()) });
      h.index = h.snapshots.length - 1;
      bump();
    },
    [bump]
  );

  const updateNodes = useCallback(
    (updater: (prev: Map<string, DesignerNode>) => Map<string, DesignerNode>) => {
      const next = updater(new Map(nodesRef.current));
      setNodes(next);
      pushSnapshot(next, linksRef.current);
    },
    [pushSnapshot]
  );
  const updateLinks = useCallback(
    (updater: (prev: Map<string, DesignerLink>) => Map<string, DesignerLink>) => {
      const next = updater(new Map(linksRef.current));
      setLinks(next);
      pushSnapshot(nodesRef.current, next);
    },
    [pushSnapshot]
  );
  const applySnapshot = useCallback((idx: number) => {
    const snap = historyRef.current.snapshots[idx];
    if (!snap) return;
    setNodes(new Map(snap.nodes));
    setLinks(new Map(snap.links));
    historyRef.current.index = idx;
    setRevision((r) => r + 1);
  }, []);

  const doUndo = useCallback(() => {
    const h = historyRef.current;
    if (h.index > 0) applySnapshot(h.index - 1);
  }, [applySnapshot]);
  const doRedo = useCallback(() => {
    const h = historyRef.current;
    if (h.index < h.snapshots.length - 1) applySnapshot(h.index + 1);
  }, [applySnapshot]);

  const deleteSelected = useCallback(() => {
    const ids = selectedIdsRef.current;
    if (ids.size === 0) return;
    const deletedNodes = new Set<string>();
    setNodes((prev) => {
      const n = new Map(prev);
      for (const id of ids) {
        if (n.delete(id)) deletedNodes.add(id);
      }
      nodesRef.current = n;
      return n;
    });
    setLinks((prev) => {
      const l = new Map(prev);
      for (const id of ids) l.delete(id); // enlaces seleccionados directamente
      // ...y cualquier enlace que toque un nodo borrado.
      for (const [lid, link] of l.entries()) {
        if (deletedNodes.has(link.sourceId) || deletedNodes.has(link.targetId)) l.delete(lid);
      }
      linksRef.current = l;
      return l;
    });
    pushSnapshot(nodesRef.current, linksRef.current);
    clearSelection();
  }, [pushSnapshot, clearSelection]);

  const cancelOrDeselect = useCallback(() => {
    setConnectFrom(null);
    setConnectCursor(null);
    setMarquee(null);
    clearSelection();
  }, [clearSelection]);

  // --- Carga de la fuente (proyecto activo o grafo de la vista) ---
  const loadedFileId = useRef<string | null>(null);
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (!sourceContent || !sourceKey) {
      if (!isViewMode) {
        setMeta(null);
        setNodes(new Map());
        setLinks(new Map());
        loadedFileId.current = null;
      }
      return;
    }
    if (loadedFileId.current === sourceKey) return;
    loadedFileId.current = sourceKey;
    skipFirstSave.current = true; // no guardar el contenido recién cargado

    const { nodes: n, links: l } = graphDataToCanvas(sourceContent);
    // Lienzo nuevo y vacío: sembrar un contenedor inicial de la notación activa.
    if (n.size === 0 && seedContainerType) {
      const seedName = `${seedContainerType} Principal`;
      const id = `agg-${seedName}`;
      n.set(id, {
        id,
        nombre: seedName,
        tipo_elemento: seedContainerType,
        agregado: seedName,
        descripcion: "",
        estado_comparativo: "nuevo",
        x: 60,
        y: 60,
        width: AGGREGATE_DEFAULT_WIDTH,
        height: AGGREGATE_DEFAULT_HEIGHT,
      });
    }
    setNodes(n);
    setLinks(l);
    setMeta(metaFromContent(sourceContent));
    historyRef.current = {
      snapshots: [{ nodes: Array.from(n.entries()), links: Array.from(l.entries()) }],
      index: 0,
    };
    clearSelection();
  }, [sourceKey, sourceContent, isViewMode]);

  // Encuadra el contenido al ABRIR el documento/vista: sin esto un modelo
  // importado o recién sembrado aparece diminuto en una esquina del lienzo.
  const fittedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!meta || fittedKeyRef.current === sourceKey) return;
    if (nodesRef.current.size === 0) return; // lienzo vacío: nada que encuadrar
    fittedKeyRef.current = sourceKey;
    // Tras el primer paint: el wrapper ya tiene alto/ancho medibles.
    requestAnimationFrame(() => fitToContent({ maxZoom: 1 }));
  }, [sourceKey, meta, fitToContent]);

  // --- Autoguardado: lienzo + metadatos -> proyecto o vista ---
  useEffect(() => {
    if (!meta) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    setSaveState("saving");
    const content = buildContent(nodesRef.current, linksRef.current, meta, notationId);
    if (onChangeRef.current) onChangeRef.current(content);
    else if (currentFileId) handleDesignUpdate(currentFileId, content);
    const t = setTimeout(() => setSaveState("saved"), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, meta, currentFileId, notationId]);

  // --- Acciones desde el menú nativo de Electron ---
  useEffect(() => {
    const api = (typeof window !== "undefined" ? window.electronAPI : undefined) as any;
    if (!api?.onDesignerAction) return;
    const off = api.onDesignerAction((action: string) => {
      switch (action) {
        case "undo": doUndo(); break;
        case "redo": doRedo(); break;
        case "delete": deleteSelected(); break;
        case "cancel": cancelOrDeselect(); break;
        case "context": setReferenceOpen(true); break;
        case "metadata": setMetaOpen(true); break;
        case "help": setHelpOpen(true); break;
      }
    });
    return off;
  }, [doUndo, doRedo, deleteSelected, cancelOrDeselect]);

  // --- Atajos de teclado ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.getAttribute("contenteditable") === "true");

      if (e.key === "Escape") {
        cancelOrDeselect();
        return;
      }
      if (typing) return;

      // "?" (Shift+/): abre la ayuda de atajos. Convención extendida en editores.
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      const mod = hasPlatformModifier(e);

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIdsRef.current.size === 0) return;
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doUndo, doRedo, deleteSelected, cancelOrDeselect]);

  // --- Drag & drop desde la paleta ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("application/json");
      if (!data || !svgRef.current) return;
      const dropped: { tipo_elemento: DesignerNode["tipo_elemento"]; nombre: string } =
        JSON.parse(data);
      const p = toSvgPoint(e.clientX, e.clientY);
      const isContainer = isContainerType(dropped.tipo_elemento);

      // Buscar el contenedor más pequeño que contiene el punto.
      let smallest: DesignerNode | null = null;
      if (!isContainer) {
        for (const c of nodesRef.current.values()) {
          if (!isContainerType(c.tipo_elemento)) continue;
          const w = c.width || AGGREGATE_DEFAULT_WIDTH;
          const h = c.height || AGGREGATE_DEFAULT_HEIGHT;
          if (p.x >= c.x && p.x <= c.x + w && p.y >= c.y && p.y <= c.y + h) {
            if (!smallest || w * h < (smallest.width || 0) * (smallest.height || 0)) {
              smallest = c;
            }
          }
        }
      }

      const uniqueName = (base: string) => {
        let name = base;
        let i = 2;
        const names = new Set(Array.from(nodesRef.current.values()).map((n) => n.nombre));
        while (names.has(name)) name = `${base} ${i++}`;
        return name;
      };

      const id = crypto.randomUUID();
      const nombre = isContainer ? uniqueName(dropped.tipo_elemento) : dropped.tipo_elemento;
      const node: DesignerNode = {
        id,
        nombre,
        tipo_elemento: dropped.tipo_elemento,
        agregado: isContainer ? nombre : smallest ? smallest.nombre : "",
        estado_comparativo: "nuevo",
        descripcion: "",
        x: isContainer ? p.x - AGGREGATE_DEFAULT_WIDTH / 2 : p.x - sizeOfType(dropped.tipo_elemento, notationId).w / 2,
        y: isContainer ? p.y - AGGREGATE_DEFAULT_HEIGHT / 2 : p.y - sizeOfType(dropped.tipo_elemento, notationId).h / 2,
        ...(isContainer
          ? { width: AGGREGATE_DEFAULT_WIDTH, height: AGGREGATE_DEFAULT_HEIGHT }
          : {}),
      };
      updateNodes((prev) => {
        const n = new Map(prev);
        n.set(id, node);
        return n;
      });
    },
    [updateNodes, notationId]
  );

  // --- Mover / redimensionar / seleccionar ---
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string, handle: "move" | "resize" = "move") => {
      if (e.button !== 0) return;
      const node = nodesRef.current.get(nodeId);
      if (!node || !svgRef.current) return;
      e.stopPropagation();

      if (handle === "resize") {
        selectOnly(nodeId);
        setDraggingInfo({ type: "resize", id: nodeId });
        return;
      }

      // Shift/⌘/Ctrl → alterna la pertenencia a la selección, sin arrastrar.
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        toggleSelect(nodeId);
        return;
      }

      // Sin modificador: si el nodo ya está en una selección múltiple, se mueve el
      // grupo entero; si no, pasa a ser la única selección.
      let sel = selectedIdsRef.current;
      if (!sel.has(nodeId)) {
        sel = new Set([nodeId]);
        setSelectedIds(sel);
      }
      const p = toSvgPoint(e.clientX, e.clientY);
      const origins = new Map<string, { x: number; y: number }>();
      for (const id of sel) {
        const n = nodesRef.current.get(id);
        if (n) origins.set(id, { x: n.x, y: n.y });
      }
      setDraggingInfo({ type: "move", startX: p.x, startY: p.y, origins });
    },
    [selectOnly, toggleSelect]
  );

  // Arranca un marco de selección al pulsar sobre el fondo vacío del lienzo.
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (e.target !== svgRef.current) return; // sólo el fondo, no un nodo/enlace
      if (connectFromRef.current) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!additive) clearSelection();
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, additive });
    },
    [clearSelection]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Conexión por arrastre en curso: actualiza la línea guía hacia el cursor.
      if (connectFromRef.current && svgRef.current) {
        const p = toSvgPoint(e.clientX, e.clientY);
        setConnectCursor({ x: p.x, y: p.y });
        return;
      }
      // Reanclado de una punta de enlace: guarda la posición normalizada sobre la caja.
      const ep = endpointDragRef.current;
      if (ep && svgRef.current) {
        const p = toSvgPoint(e.clientX, e.clientY);
        const link = linksRef.current.get(ep.linkId);
        if (!link) return;
        // Doblez auto → crea el primer punto de quiebre; wp → mueve el de su índice.
        if (ep.kind === "bend" || ep.kind === "wp") {
          setLinks((prev) => {
            const l = new Map(prev);
            const cur = l.get(ep.linkId);
            if (cur) {
              const ways = cur.midpoints && cur.midpoints.length
                ? [...cur.midpoints]
                : cur.midpoint
                ? [cur.midpoint]
                : [];
              if (ep.kind === "bend") {
                ways.splice(0, ways.length, { x: p.x, y: p.y });
              } else if (typeof ep.index === "number") {
                ways[ep.index] = { x: p.x, y: p.y };
              }
              l.set(ep.linkId, { ...cur, midpoint: undefined, midpoints: ways });
            }
            linksRef.current = l;
            return l;
          });
          return;
        }
        const nodeId = ep.kind === "source" ? link.sourceId : link.targetId;
        const node = nodesRef.current.get(nodeId);
        if (!node) return;
        const { w, h } = nodeBox(node, notationId);
        const ax = Math.min(1, Math.max(0, (p.x - node.x) / w));
        const ay = Math.min(1, Math.max(0, (p.y - node.y) / h));
        const key = ep.kind === "source" ? "sourceAnchor" : "targetAnchor";
        setLinks((prev) => {
          const l = new Map(prev);
          const cur = l.get(ep.linkId);
          if (cur) l.set(ep.linkId, { ...cur, [key]: { x: ax, y: ay } });
          linksRef.current = l;
          return l;
        });
        return;
      }
      // Marco de selección en curso.
      if (marqueeRef.current && svgRef.current) {
        const p = toSvgPoint(e.clientX, e.clientY);
        setMarquee((m) => (m ? { ...m, x1: p.x, y1: p.y } : m));
        return;
      }
      if (!draggingInfo || !svgRef.current) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      if (draggingInfo.type === "move") {
        const dx = p.x - draggingInfo.startX;
        const dy = p.y - draggingInfo.startY;
        setNodes((prev) => {
          const n = new Map(prev);
          for (const [id, o] of draggingInfo.origins) {
            const node = n.get(id);
            if (node) n.set(id, { ...node, x: o.x + dx, y: o.y + dy });
          }
          nodesRef.current = n;
          return n;
        });
      } else {
        setNodes((prev) => {
          const n = new Map(prev);
          const node = n.get(draggingInfo.id);
          if (node && isContainerType(node.tipo_elemento)) {
            n.set(draggingInfo.id, {
              ...node,
              width: Math.max(p.x - node.x, 200),
              height: Math.max(p.y - node.y, 150),
            });
          }
          nodesRef.current = n;
          return n;
        });
      }
    },
    [draggingInfo, notationId]
  );

  const handleCanvasMouseUp = useCallback(() => {
    // Soltar sobre lienzo vacío durante una conexión → cancelar (sin enlace).
    if (connectFromRef.current) {
      setConnectFrom(null);
      setConnectCursor(null);
      return;
    }
    // Fin del reanclado de una punta: consolida en el historial.
    if (endpointDragRef.current) {
      endpointDragRef.current = null;
      pushSnapshot(nodesRef.current, linksRef.current);
      return;
    }
    // Cierre del marco de selección.
    const mq = marqueeRef.current;
    if (mq) {
      const xMin = Math.min(mq.x0, mq.x1);
      const xMax = Math.max(mq.x0, mq.x1);
      const yMin = Math.min(mq.y0, mq.y1);
      const yMax = Math.max(mq.y0, mq.y1);
      const hit = new Set<string>(mq.additive ? selectedIdsRef.current : []);
      // Marco con tamaño real (no un clic): selecciona los nodos que intersecta.
      if (xMax - xMin > 3 || yMax - yMin > 3) {
        for (const node of nodesRef.current.values()) {
          const { w, h } = nodeBox(node, notationId);
          if (node.x < xMax && node.x + w > xMin && node.y < yMax && node.y + h > yMin) {
            hit.add(node.id);
          }
        }
      }
      setSelectedIds(hit);
      setMarquee(null);
      return;
    }
    if (!draggingInfo) return;
    if (draggingInfo.type === "move") {
      // Reasignar contenedor padre (por contención) a cada nodo NO contenedor movido.
      const n = new Map(nodesRef.current);
      let changed = false;
      for (const id of draggingInfo.origins.keys()) {
        const moved = n.get(id);
        if (!moved || isContainerType(moved.tipo_elemento)) continue;
        let parent: DesignerNode | null = null;
        for (const c of n.values()) {
          if (!isContainerType(c.tipo_elemento)) continue;
          const w = c.width || 0;
          const h = c.height || 0;
          if (moved.x > c.x && moved.x < c.x + w && moved.y > c.y && moved.y < c.y + h) {
            if (!parent || w * h < (parent.width || 0) * (parent.height || 0)) parent = c;
          }
        }
        const newAgg = parent ? parent.nombre : "";
        if (moved.agregado !== newAgg) {
          n.set(id, { ...moved, agregado: newAgg });
          changed = true;
        }
      }
      if (changed) {
        setNodes(n);
        nodesRef.current = n;
      }
    }
    pushSnapshot(nodesRef.current, linksRef.current);
    setDraggingInfo(null);
  }, [draggingInfo, pushSnapshot, notationId]);

  // --- Selección ---
  // La selección de nodos se resuelve en mousedown; el click no debe reajustarla
  // (colapsaría una selección de grupo tras arrastrar).
  const handleNodeClick = useCallback(() => {}, []);
  // Selección de enlaces (soporta alternar con Shift/⌘).
  const handleLinkClick = useCallback(
    (e: React.MouseEvent, linkId: string) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) toggleSelect(linkId);
      else selectOnly(linkId);
    },
    [toggleSelect, selectOnly]
  );

  // Arranca el arrastre de una punta (reanclar) o del doblez auto del enlace.
  const startEndpointDrag = useCallback(
    (e: React.MouseEvent, linkId: string, which: "source" | "target" | "bend") => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      endpointDragRef.current = { linkId, kind: which };
      selectOnly(linkId);
    },
    [selectOnly]
  );

  // Arranca el arrastre de un punto de quiebre existente (por índice).
  const startWaypointDrag = useCallback(
    (e: React.MouseEvent, linkId: string, index: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      endpointDragRef.current = { linkId, kind: "wp", index };
      selectOnly(linkId);
    },
    [selectOnly]
  );

  // Añade un punto de quiebre donde se hace doble clic en la línea (enrutado
  // escalonado), insertándolo en el segmento más cercano.
  const addWaypoint = useCallback(
    (e: React.MouseEvent, linkId: string) => {
      e.stopPropagation();
      const link = linksRef.current.get(linkId);
      if (!link || (link.routing ?? "straight") !== "orthogonal" || !svgRef.current) return;
      const ep = linkEndpoints(link, nodesRef.current);
      if (!ep) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      const ways = link.midpoints && link.midpoints.length
        ? link.midpoints
        : link.midpoint
        ? [link.midpoint]
        : [];
      const seq = [ep.start, ...ways, ep.end];
      // Distancia punto→segmento para elegir dónde insertar.
      const distToSeg = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const vx = b.x - a.x, vy = b.y - a.y;
        const len2 = vx * vx + vy * vy || 1;
        let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const dx = a.x + t * vx - p.x, dy = a.y + t * vy - p.y;
        return dx * dx + dy * dy;
      };
      let best = 0, bestD = Infinity;
      for (let i = 0; i < seq.length - 1; i++) {
        const d = distToSeg(seq[i], seq[i + 1]);
        if (d < bestD) { bestD = d; best = i; }
      }
      const next = [...ways];
      next.splice(best, 0, { x: p.x, y: p.y }); // insertar en el segmento `best`
      updateLinks((prev) => {
        const l = new Map(prev);
        const cur = l.get(linkId);
        if (cur) l.set(linkId, { ...cur, midpoint: undefined, midpoints: next });
        return l;
      });
    },
    [updateLinks]
  );

  // Quita un punto de quiebre por índice (doble clic en su manija).
  const removeWaypoint = useCallback(
    (linkId: string, index: number) => {
      updateLinks((prev) => {
        const l = new Map(prev);
        const cur = l.get(linkId);
        if (!cur) return prev;
        const ways = cur.midpoints && cur.midpoints.length
          ? cur.midpoints
          : cur.midpoint
          ? [cur.midpoint]
          : [];
        const next = ways.filter((_, i) => i !== index);
        l.set(linkId, { ...cur, midpoint: undefined, midpoints: next.length ? next : undefined });
        return l;
      });
    },
    [updateLinks]
  );

  // --- Conexión por arrastre (puerto → nodo destino) ---
  const startConnect = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      e.preventDefault();
      const node = nodesRef.current.get(nodeId);
      if (!node || !svgRef.current) return;
      const p = toSvgPoint(e.clientX, e.clientY);
      clearSelection();
      setConnectFrom(nodeId);
      setConnectCursor({ x: p.x, y: p.y });
    },
    [clearSelection]
  );

  const finishConnect = useCallback(
    (targetId: string) => {
      const from = connectFromRef.current;
      setConnectFrom(null);
      setConnectCursor(null);
      if (!from || from === targetId) return;
      const id = `link-${from}-${targetId}-${crypto.randomUUID()}`;
      updateLinks((prev) => {
        const n = new Map(prev);
        n.set(id, { id, sourceId: from, targetId, descripcion: "interactúa", routing: "orthogonal" });
        return n;
      });
    },
    [updateLinks]
  );

  // Event Storming: crea el siguiente elemento sugerido, conectado al actual.
  const createNextElement = useCallback(
    (fromNode: DesignerNode, sug: { tipo: string; nombre: string; relacion: string }) => {
      const id = crypto.randomUUID();
      const newNode: DesignerNode = {
        id,
        nombre: sug.nombre || sug.tipo,
        tipo_elemento: sug.tipo as DesignerNode["tipo_elemento"],
        agregado: fromNode.agregado,
        estado_comparativo: "nuevo",
        descripcion: "",
        x: (fromNode.x ?? 60) + sizeOfType(fromNode.tipo_elemento, notationId).w + 60,
        y: fromNode.y ?? 60,
      };
      updateNodes((prev) => new Map(prev).set(id, newNode));
      const lid = `link-${fromNode.id}-${id}-${crypto.randomUUID()}`;
      updateLinks((prev) =>
        new Map(prev).set(lid, {
          id: lid,
          sourceId: fromNode.id,
          targetId: id,
          descripcion: sug.relacion || "produce",
          routing: "orthogonal",
        })
      );
      selectOnly(id);
    },
    [updateNodes, updateLinks, selectOnly, notationId]
  );

  const handleClear = () => {
    const seedName = seedContainerType ? `${seedContainerType} Principal` : "";
    const n = new Map<string, DesignerNode>(
      seedContainerType
        ? [
            [
              `agg-${seedName}`,
              {
                id: `agg-${seedName}`,
                nombre: seedName,
                tipo_elemento: seedContainerType,
                agregado: seedName,
                descripcion: "",
                estado_comparativo: "nuevo" as const,
                x: 60,
                y: 60,
                width: AGGREGATE_DEFAULT_WIDTH,
                height: AGGREGATE_DEFAULT_HEIGHT,
              },
            ],
          ]
        : []
    );
    setNodes(n);
    setLinks(new Map());
    nodesRef.current = n;
    linksRef.current = new Map();
    pushSnapshot(n, new Map());
    clearSelection();
    toast({ title: "Lienzo reiniciado" });
  };

  // --- Organizar: reordena el lienzo con el MISMO layout que genera el MCP ---
  // Sólo mueve cajas: aplica las posiciones que devuelve `arrangeGraphData` sobre
  // los elementos que ya existen, así el lienzo conserva ids, selección e
  // historial (un Ctrl+Z deshace la reorganización).
  const [arrangement, setArrangement] = useState<{ density: LayoutDensity; strategy: LayoutStrategy }>(
    () => ({ density: DEFAULT_DENSITY, strategy: defaultStrategyFor(notationId) })
  );
  const [arrangeBusy, setArrangeBusy] = useState(false);

  const applyArrangement = useCallback(
    (opts: { density?: LayoutDensity; strategy?: LayoutStrategy; laneOrder?: string[] }) => {
      const next = {
        density: opts.density ?? arrangement.density,
        strategy: opts.strategy ?? arrangement.strategy,
      };
      if (!meta) return;
      const content = buildContent(nodesRef.current, linksRef.current, meta, notationId);
      const posiciones = arrangeGraphData(content, notationId, { ...next, laneOrder: opts.laneOrder });
      updateNodes((prev) => {
        const out = new Map(prev);
        for (const [id, n] of prev) {
          const box = isContainerType(n.tipo_elemento)
            ? posiciones.containers[n.nombre]
            : posiciones.nodes[n.id];
          if (box) out.set(id, { ...n, x: box.x, y: box.y, width: box.width, height: box.height });
        }
        return out;
      });
      setArrangement(next);
    },
    [arrangement, meta, notationId, updateNodes]
  );

  const suggestArrangementWithAi = useCallback(async () => {
    if (!meta) return;
    const content = buildContent(nodesRef.current, linksRef.current, meta, notationId);
    const bandas = laneNames(content);
    if (bandas.length < 2) {
      toast({ title: "Nada que ordenar", description: "El diagrama no tiene grupos que reordenar." });
      return;
    }
    setArrangeBusy(true);
    try {
      // La IA sólo devuelve NOMBRES en orden; la geometría la calcula el layout.
      const orden = await runAi(orderLanesTask, {
        bandas,
        resumen: laneSummary(content),
        notation: notationId,
      });
      if (!orden?.length) return;
      applyArrangement({ laneOrder: orden });
      const cambio = orden.some((n, i) => n !== bandas[i]);
      toast({
        title: cambio ? "Grupos reordenados" : "Sin cambios",
        description: cambio
          ? `Orden sugerido: ${orden.join(" → ")}. Deshacé si no convence.`
          : "La IA considera que el orden actual ya es el natural.",
      });
    } finally {
      setArrangeBusy(false);
    }
  }, [applyArrangement, meta, notationId, runAi, toast]);

  // Exporta el lienzo actual como SVG vectorial recortado al contenido, para
  // llevar el diagrama a una presentación o documento.
  const handleExportSvg = useCallback(() => {
    if (!svgRef.current) return;
    const bounds = computeContentBounds(nodesRef.current, notationId);
    const base = (meta?.nombre_proyecto || "diagrama").replace(/[^\w.-]+/g, "_");
    exportCanvasSvg(svgRef.current, bounds, `${base}.svg`);
    toast({ title: "Diagrama exportado", description: "Se descargó un SVG del lienzo." });
  }, [meta, toast, notationId]);

  // Exporta un PNG rasterizando la página en el proceso main (capturePage): así
  // sí sale el foreignObject de los nodos. Encuadra todo y oculta overlays antes.
  const handleExportPng = useCallback(async () => {
    const api = typeof window !== "undefined" ? window.electronAPI : undefined;
    const wrapper = canvasWrapperRef.current;
    if (!api?.captureCanvas || !wrapper) {
      toast({ variant: "destructive", title: "PNG no disponible", description: "Sólo en la app de escritorio." });
      return;
    }
    setCapturing(true);
    fitToContent();
    // Deja que el zoom/scroll se asienten y los overlays desaparezcan (2 frames).
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    try {
      const rect = wrapper.getBoundingClientRect();
      const dataUrl = await api.captureCanvas({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      const base = (meta?.nombre_proyecto || "diagrama").replace(/[^\w.-]+/g, "_");
      downloadDataUrl(dataUrl, `${base}.png`);
      toast({ title: "Diagrama exportado", description: "Se descargó un PNG del lienzo." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "No se pudo exportar el PNG", description: e?.message });
    } finally {
      setCapturing(false);
    }
  }, [fitToContent, meta, toast]);

  // --- Acciones desde la paleta de comandos (⌘K) ---
  // La paleta despacha un CustomEvent en vez de acoplarse al estado interno del
  // diseñador. Cubre las mismas acciones del menú + las propias del lienzo.
  // (Va aquí, tras definir handleClear/handleExportSvg, para no caer en su TDZ.)
  useEffect(() => {
    const onAction = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      switch (action) {
        case "undo": doUndo(); break;
        case "redo": doRedo(); break;
        case "delete": deleteSelected(); break;
        case "cancel": cancelOrDeselect(); break;
        case "context": setReferenceOpen(true); break;
        case "metadata": setMetaOpen(true); break;
        case "help": setHelpOpen(true); break;
        case "fit": fitToContent(); break;
        case "export": handleExportSvg(); break;
        // No borra directo: abre la confirmación (igual que el botón "Limpiar").
        case "clear": setClearConfirmOpen(true); break;
      }
    };
    window.addEventListener("designer-action", onAction);
    return () => window.removeEventListener("designer-action", onAction);
  }, [doUndo, doRedo, deleteSelected, cancelOrDeselect, fitToContent, handleExportSvg]);

  const isolated = useMemo(() => findIsolatedNodes(nodes, links), [nodes, links]);

  // Contenedores de CUALQUIER notación (DDD: Subdominio/Contexto/Agregado; BPMN: Pool/Carril;
  // C4: Límites; UML: Paquete). Se dibujan de mayor a menor área para que los anidados
  // queden encima del que los contiene (visión de jerarquía independiente de la notación).
  const containerNodes = Array.from(nodes.values())
    .filter((n) => isContainerType(n.tipo_elemento))
    .sort(
      (a, b) =>
        (b.width || AGGREGATE_DEFAULT_WIDTH) * (b.height || AGGREGATE_DEFAULT_HEIGHT) -
        (a.width || AGGREGATE_DEFAULT_WIDTH) * (a.height || AGGREGATE_DEFAULT_HEIGHT)
    );
  const plainNodes = Array.from(nodes.values()).filter((n) => !isContainerType(n.tipo_elemento));

  // Resumen textual del diseño (para la sugerencia del Big Picture con IA local).
  const designSummary = useMemo(() => {
    const all = Array.from(nodes.values());
    const conts = all.filter((n) => isContainerType(n.tipo_elemento));
    const items = all.filter((n) => !isContainerType(n.tipo_elemento));
    const lines = conts.map((c) => {
      const hijos = items
        .filter((n) => n.agregado === c.nombre)
        .map((n) => `${n.nombre} (${n.tipo_elemento})`);
      return `${c.tipo_elemento} "${c.nombre}": ${hijos.join(", ") || "sin elementos"}`;
    });
    const bp = items.filter((n) => !n.agregado).map((n) => `${n.nombre} (${n.tipo_elemento})`);
    if (bp.length) lines.push(`Big Picture: ${bp.join(", ")}`);
    return lines.join("\n") || "Diseño vacío";
  }, [nodes]);

  // `revision` fuerza el re-render en cada cambio de historial, así que estos
  // valores leídos del ref siempre están frescos al pintar los botones.
  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.snapshots.length - 1;
  const modKey = modifierLabel();

  if (!meta || (!isViewMode && !currentFileId)) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30 text-center p-8">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold text-foreground">Sin proyecto activo</h2>
          <p className="mt-2 text-muted-foreground">
            Crea un nuevo proyecto desde la barra superior y elige su notación
            (DDD, BPMN, C4 o UML) para empezar a diseñar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col font-sans bg-muted/30">
      <header className="flex-shrink-0 bg-card border-b shadow-sm p-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          {/* Deshacer / Rehacer (visibles) */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={doUndo}
              disabled={!canUndo}
              title={`Deshacer (${modKey}+Z)`}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={doRedo}
              disabled={!canRedo}
              title={`Rehacer (${modKey}+Shift+Z)`}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Reorganiza el lienzo con el mismo layout que genera el MCP. */}
          <ArrangeMenu
            density={arrangement.density}
            strategy={arrangement.strategy}
            busy={arrangeBusy}
            hasLanes={Array.from(nodes.values()).some((n) => isContainerType(n.tipo_elemento))}
            onArrange={applyArrangement}
            onSuggestWithAi={suggestArrangementWithAi}
          />

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant="outline"
            size="icon"
            onClick={deleteSelected}
            disabled={selectedIds.size === 0}
            title={
              selectedIds.size > 1
                ? `Eliminar ${selectedIds.size} seleccionados (Supr)`
                : "Eliminar seleccionado (Supr)"
            }
          >
            <Trash className="h-4 w-4" />
          </Button>
          {selectedIds.size > 1 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {selectedIds.size} seleccionados
            </span>
          )}

          <div className="w-px h-6 bg-border mx-1" />

          <Button variant="outline" size="sm" onClick={() => setReferenceOpen(true)}>
            <Library className="mr-2 h-4 w-4" /> Contexto
          </Button>

          <Button variant="outline" size="sm" onClick={() => setMetaOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" /> Metadatos
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={nodes.size === 0}
                title="Exportar el lienzo (para presentaciones)"
              >
                <Download className="mr-2 h-4 w-4" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={handleExportSvg}>
                SVG · vectorial (calidad infinita)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPng}>
                PNG · imagen (para pegar en documentos)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setHelpOpen(true)}
            title="Ayuda y atajos"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>

          <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={nodes.size === 0}>
                <Trash2 className="mr-2 h-4 w-4" /> Limpiar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle /> ¿Reiniciar el lienzo?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Se borrarán todos los elementos del diseño actual.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleClear}>Sí, reiniciar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex items-center gap-3">
          {isolated.length > 0 && (
            // Aviso PASIVO: informa, no interrumpe. Antes era un recuadro con
            // fondo y borde propios —el elemento más llamativo de una barra donde
            // todo lo demás es texto— por un detalle que ni siquiera bloquea.
            // El detalle (qué nodos) va al tooltip; acá queda el número.
            <span
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              title={`Sin enlaces, no aparecerán en las vistas: ${isolated.join(", ")}`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              {isolated.length} sin enlaces
            </span>
          )}
          {/* Estado de autoguardado: los tres estados se distinguen a simple vista
              (girando / verde recién guardado / gris en reposo). */}
          <div className="flex items-center gap-1.5 text-xs min-w-[120px] justify-end">
            {saveState === "saving" ? (
              <span className="flex items-center gap-1.5 text-warning">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…
              </span>
            ) : saveState === "saved" ? (
              <span className="flex items-center gap-1.5 text-success">
                <Check className="w-3.5 h-3.5" /> Guardado
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Check className="w-3.5 h-3.5" /> Cambios guardados
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Breadcrumb de subprocesos: aparece al entrar en profundidad. Permite
          volver a cualquier vista ancestro. */}
      {drillStack.length > 0 && (
        <div className="flex flex-shrink-0 items-center gap-1 border-b bg-muted/40 px-3 py-1.5 text-xs">
          <button
            onClick={() => goToDrill(drillPath.length - 2)}
            title="Volver a la vista anterior"
            className="mr-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </button>
          {drillPath.map((id, i) => {
            const isLast = i === drillPath.length - 1;
            return (
              <React.Fragment key={`${id}-${i}`}>
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                {isLast ? (
                  <span className="max-w-[160px] truncate font-semibold text-foreground">
                    {viewName(id)}
                  </span>
                ) : (
                  <button
                    onClick={() => goToDrill(i)}
                    className="max-w-[160px] truncate text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {viewName(id)}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div className="flex-grow flex h-0">
        <Toolbox notation={notationId} onNotationChange={onNotationChange} />

        <div className="flex-grow h-full relative overflow-hidden">
        <div
          ref={canvasWrapperRef}
          className="absolute inset-0 overflow-auto bg-background"
          onScroll={syncViewport}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
        >
          {nodes.size === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="rounded-lg border border-dashed bg-card/85 px-5 py-4 text-center text-sm text-muted-foreground shadow-sm backdrop-blur">
                <p className="mb-2 font-medium text-foreground">Empieza a diseñar</p>
                <ul className="space-y-1 text-left">
                  <li>
                    <span className="text-foreground">Arrastra</span> un elemento desde la paleta de la izquierda.
                  </li>
                  <li>
                    <kbd className="rounded-md border bg-muted px-1 text-xs">{modKey}</kbd>
                    <kbd className="ml-0.5 rounded-md border bg-muted px-1 text-xs">K</kbd> abre la paleta de acciones.
                  </li>
                  <li>
                    <kbd className="rounded-md border bg-muted px-1 text-xs">@</kbd> en el chat inyecta una vista como contexto.
                  </li>
                </ul>
              </div>
            </div>
          )}
          <svg
            ref={svgRef}
            width={canvasPxW}
            height={canvasPxH}
            viewBox={`0 0 ${canvasPxW / zoom} ${canvasPxH / zoom}`}
            // Un punto por debajo del fondo de la app: el lienzo es la superficie
            // de trabajo y se distingue del resto sin cambiar de familia de color.
            // Ya no necesita forzar `dark`: la app entera lo es (spec 003).
            className="bg-canvas"
          >
            <defs>
              {/* Cuadrícula estilo lienzo de diseño (Figma/Miro): puntos finos por
                  celda y líneas mayores tenues cada 5 celdas. Va dentro del viewBox
                  para escalar y alinear con los nodos al hacer zoom. */}
              <pattern id="grid-minor" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <circle cx={0.5} cy={0.5} r={0.75} className="fill-slate-300 dark:fill-slate-700" />
              </pattern>
              <pattern id="grid-major" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
                <rect width={GRID * 5} height={GRID * 5} fill="url(#grid-minor)" />
                <path
                  d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
                  fill="none"
                  className="stroke-slate-200/80 dark:stroke-slate-800/80"
                  strokeWidth={1}
                />
              </pattern>
              <marker id="arrow-end" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" className="fill-gray-400 opacity-60" />
              </marker>
              <marker id="arrow-end-selected" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,-5L10,0L0,5" className="fill-blue-600" />
              </marker>
              {/* Flechas de inicio (para enlaces bidireccionales). auto-start-reverse
                  orienta la punta hacia afuera del origen. */}
              <marker id="arrow-start" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,-5L10,0L0,5" className="fill-gray-400 opacity-60" />
              </marker>
              <marker id="arrow-start-selected" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,-5L10,0L0,5" className="fill-blue-600" />
              </marker>
            </defs>

            {/* Fondo con cuadrícula. pointerEvents none → los clics en vacío llegan
                al <svg> y siguen deseleccionando. */}
            <rect
              width={canvasPxW / zoom}
              height={canvasPxH / zoom}
              fill="url(#grid-major)"
              pointerEvents="none"
            />

            {/* Capa 0-2: Contenedores (cualquier notación), de mayor a menor área */}
            <g>
              {containerNodes.map((node) => (
                <DesignerNodeComponent
                  key={node.id}
                  node={node}
                  notation={notationId}
                  isSelected={isSelected(node.id)}
                  connecting={connectFrom !== null}
                  onStartConnect={(e) => startConnect(e, node.id)}
                  onFinishConnect={() => finishConnect(node.id)}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onResizeMouseDown={(e) => handleNodeMouseDown(e, node.id, "resize")}
                  onClick={handleNodeClick}
                  onDoubleClick={() => setEditingNode(node)}
                  onOpenSubView={subViewExists(node.viewRef) ? () => openSubView(node.viewRef!) : undefined}
                  onHover={(e) => showHoverCard(e, node)}
                  onHoverEnd={hideHoverCard}
                />
              ))}
            </g>
            {/* Capa 3: Enlaces */}
            <g>
              {Array.from(links.values()).map((link) => (
                <DesignerLinkComponent
                  key={link.id}
                  link={link}
                  nodes={nodes}
                  notation={notationId}
                  isSelected={isSelected(link.id)}
                  onClick={(e) => handleLinkClick(e, link.id)}
                  onDoubleClick={() => setEditingLink(link)}
                  onLineDoubleClick={(e) => addWaypoint(e, link.id)}
                />
              ))}
            </g>
            {/* Línea guía de conexión (mientras se arrastra desde un puerto) */}
            {connectFrom &&
              connectCursor &&
              (() => {
                const s = nodes.get(connectFrom);
                if (!s) return null;
                const { w: sw, h: sh } = nodeBox(s, notationId);
                const sx = s.x + sw / 2;
                const sy = s.y + sh / 2;
                return (
                  <path
                    d={`M${sx},${sy} L${connectCursor.x},${connectCursor.y}`}
                    className="stroke-blue-500"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    markerEnd="url(#arrow-end-selected)"
                    fill="none"
                    pointerEvents="none"
                  />
                );
              })()}
            {/* Capa 4: Nodos */}
            <g>
              {plainNodes.map((node) => (
                <DesignerNodeComponent
                  key={node.id}
                  node={node}
                  notation={notationId}
                  isSelected={isSelected(node.id)}
                  connecting={connectFrom !== null}
                  onStartConnect={(e) => startConnect(e, node.id)}
                  onFinishConnect={() => finishConnect(node.id)}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onResizeMouseDown={(e) => handleNodeMouseDown(e, node.id, "resize")}
                  onClick={handleNodeClick}
                  onDoubleClick={() => setEditingNode(node)}
                  onOpenSubView={subViewExists(node.viewRef) ? () => openSubView(node.viewRef!) : undefined}
                  onHover={(e) => showHoverCard(e, node)}
                  onHoverEnd={hideHoverCard}
                />
              ))}
            </g>

            {/* Capa superior: manijas de reanclado de los enlaces seleccionados
                (encima de los nodos para que no queden tapadas). */}
            <g>
              {Array.from(links.values())
                .filter((l) => selectedIds.has(l.id))
                .map((link) => (
                  <LinkEndpointHandles
                    key={`ep-${link.id}`}
                    link={link}
                    nodes={nodes}
                    notation={notationId}
                    onEndpointMouseDown={(e, which) => startEndpointDrag(e, link.id, which)}
                    onWaypointMouseDown={(e, i) => startWaypointDrag(e, link.id, i)}
                    onWaypointDoubleClick={(i) => removeWaypoint(link.id, i)}
                  />
                ))}
            </g>

            {/* Marco de selección (rectángulo al arrastrar sobre el vacío) */}
            {marquee && (
              <rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                className="fill-blue-500/10 stroke-blue-500"
                strokeWidth={1}
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            )}
          </svg>
          </div>

          {/* Ficha al pasar el ratón por un componente. position:fixed sobre las
              coordenadas del cursor y sin eventos → no interfiere con arrastrar,
              conectar ni con el hover del propio nodo. Se voltea contra el borde
              de la ventana para no salirse de pantalla. */}
          {hoverCard && !capturing && (
            <div
              className="pointer-events-none fixed z-50 max-w-xs rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"
              style={{
                left: Math.min(hoverCard.x + 16, (typeof window !== "undefined" ? window.innerWidth : 1200) - 336),
                top: Math.min(hoverCard.y + 18, (typeof window !== "undefined" ? window.innerHeight : 800) - 140),
              }}
            >
              <p className="text-sm font-semibold leading-tight">{hoverCard.node.nombre}</p>
              <p className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
                {hoverCard.node.tipo_elemento}
              </p>
              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                {hoverCard.node.descripcion?.trim() || "Sin descripción — doble clic para editarla."}
              </p>
              {!!hoverCard.node.tags_tecnologia?.length && (
                <p className="mt-1 text-2xs italic text-muted-foreground">
                  [{hoverCard.node.tags_tecnologia.join(", ")}]
                </p>
              )}
            </div>
          )}

          {/* Controles de zoom — FUERA del wrapper scrolleable para fijarlos al
              fondo visible del viewport (dentro del scroll anclaban al fondo del
              contenido, ~1700px, y quedaban a media pantalla). */}
          <div className={cn(
            "absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg border bg-card/95 p-1 shadow-md backdrop-blur",
            capturing && "hidden"
          )}>
            <button
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              title="Alejar (Ctrl/⌘ + rueda)"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={zoomReset}
              title="Restablecer zoom (100%)"
              className="min-w-[3rem] rounded-md px-1 py-1.5 text-center text-xs font-medium tabular-nums text-foreground hover:bg-muted"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              title="Acercar (Ctrl/⌘ + rueda)"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => fitToContent()}
              title="Ajustar a contenido"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>

          {/* Panorámica y leyenda del lienzo (independientes del scroll interno).
              Se ocultan durante la captura a PNG para no salir en la imagen. */}
          {!capturing && (
            <>
              <Minimap
                nodes={nodes}
                notation={notationId}
                zoom={zoom}
                canvasSize={Math.max(CANVAS_SIZE, canvasPxW / zoom, canvasPxH / zoom)}
                viewport={viewport}
                onNavigate={navigateTo}
              />
              <NotationLegend notation={notationId} />
            </>
          )}
        </div>
      </div>

      <EditNodeDialog
        node={editingNode}
        elementTypes={elementTypes}
        notation={notationId}
        subViews={subViewOptions}
        onOpenSubView={openSubView}
        onCreateSubView={createSubView}
        referencia={referenceText}
        onClose={() => setEditingNode(null)}
        onSave={(n) =>
          updateNodes((prev) => {
            const map = new Map(prev);
            map.set(n.id, n);
            return map;
          })
        }
        onCreateNext={createNextElement}
      />
      <EditLinkDialog
        link={editingLink}
        nodes={nodes}
        referencia={referenceText}
        notation={notationId}
        onClose={() => setEditingLink(null)}
        onSave={(l) =>
          updateLinks((prev) => {
            const map = new Map(prev);
            map.set(l.id, l);
            return map;
          })
        }
      />
      <MetadataDialog
        open={metaOpen}
        onOpenChange={setMetaOpen}
        notation={notationId}
        meta={meta}
        summary={designSummary}
        onSave={(m) => {
          setMeta(m);
          bump();
        }}
      />

      {/* Contexto de referencia: documentos que alimentan las sugerencias de IA */}
      <ReferenceContextDialog open={referenceOpen} onOpenChange={setReferenceOpen} />

      {/* Ayuda: interacciones y atajos de teclado */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" /> Ayuda y atajos
            </DialogTitle>
            <DialogDescription>Cómo interactuar con el lienzo.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto py-2 text-sm space-y-2">
            {[
              ["Arrastrar desde la paleta", "Crear un elemento en el lienzo"],
              ["Arrastrar un nodo", "Moverlo (entra al contenedor donde lo sueltes)"],
              ["Arrastrar la esquina ◢", "Redimensionar un contenedor"],
              ["Doble clic", "Editar nombre / descripción"],
              ["Pasar el ratón → arrastrar un punto azul", "Conectar dos elementos"],
              ["Seleccionar enlace → arrastrar sus puntas", "Reanclar dónde conecta la flecha"],
              ["Enlace escalonado → arrastrar el cuadrado", "Mover el punto de quiebre"],
              ["Enlace escalonado → doble clic en la línea", "Añadir un punto de quiebre"],
              ["Doble clic en un punto de quiebre", "Quitarlo"],
              ["Arrastrar sobre el vacío", "Seleccionar varios (marco)"],
              [`${modKey}/Shift + clic`, "Añadir o quitar de la selección"],
              ["Arrastrar un seleccionado", "Mover todo el grupo a la vez"],
              [`${modKey}+Z`, "Deshacer"],
              [`${modKey}+Shift+Z  /  ${modKey}+Y`, "Rehacer"],
              ["Supr / Retroceso", "Eliminar lo seleccionado (uno o varios)"],
              ["Esc", "Cancelar conexión / deseleccionar"],
              [`${modKey}+K`, "Abrir la paleta de acciones"],
              ["?", "Abrir esta ayuda"],
            ].map(([k, d]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b last:border-0 py-1.5">
                <kbd className="px-2 py-0.5 rounded-md bg-muted border text-xs font-mono whitespace-nowrap">{k}</kbd>
                <span className="text-muted-foreground text-right">{d}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
