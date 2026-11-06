"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Maximize, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  AGGREGATE_DEFAULT_HEIGHT,
  AGGREGATE_DEFAULT_WIDTH,
  DesignerLinkComponent,
  DesignerNodeComponent,
  SkinContext,
  linkGeometry,
  nodeBox,
} from "@/components/graph/designer/DesignerCanvas";
import {
  computeContentBounds,
  graphDataToCanvas,
  isContainerType,
  type ContentBounds,
  type DesignerLink,
  type DesignerNode,
} from "@/components/graph/designer/serialize";
import { croppedViewBox } from "@/components/graph/designer/export-canvas";
import { CANVAS_CHROME } from "@/lib/canvas-chrome";
import type { DiffStatusKind, ElementDiffMark } from "@/lib/collaboration/graph-diff";
import { EDGE_MARKER_SHAPES } from "@/lib/edge-relations";
import { neighborhoodOf } from "@/lib/graph-neighbors";
import {
  DEFAULT_NOTATION_ID,
  isFragmentContainer,
  isLifelineContainer,
  type NotationId,
} from "@/lib/notations";
import { activacionesDe } from "@/lib/sequence/activations";
import { esMensajeDeSecuencia } from "@/lib/sequence/canvas";
import {
  rangoPorGeometria,
  repartirOperandos,
  type FragmentPart,
} from "@/lib/sequence/fragments";
import { alturaDeMensaje } from "@/lib/sequence/layout";
import { SKIN_DEFAULT, type SkinId } from "@/lib/skin";
import type { GraphData } from "@/lib/types";
import { cn } from "@/lib/utils";

const GRID = 20;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 1.2;
const FIT_PAD = 44;

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

const DIFF_VISUAL: Record<
  DiffStatusKind,
  {
    nodeBadge: string;
    linkBadge: string;
    haloStroke: string;
    pillBg: string;
    pillText: string;
    htmlChip: string;
    dash?: string;
  }
> = {
  added: {
    nodeBadge: "+ Nuevo",
    linkBadge: "+ Nueva",
    haloStroke: "stroke-success",
    pillBg: "fill-success-surface",
    pillText: "text-success-foreground",
    htmlChip: "border-success-border bg-success-surface text-success-foreground",
  },
  removed: {
    nodeBadge: "− Borrado",
    linkBadge: "− Borrada",
    haloStroke: "stroke-destructive",
    pillBg: "fill-destructive",
    pillText: "text-destructive-foreground",
    htmlChip: "border-destructive bg-destructive text-destructive-foreground",
    dash: "7 4",
  },
  modified: {
    nodeBadge: "~ Modificado",
    linkBadge: "~ Modificada",
    haloStroke: "stroke-warning",
    pillBg: "fill-warning-surface",
    pillText: "text-warning-foreground",
    htmlChip: "border-warning-border bg-warning-surface text-warning-foreground",
  },
  moved: {
    nodeBadge: "⇄ Movido",
    linkBadge: "⇄ Movida",
    haloStroke: "stroke-info",
    pillBg: "fill-info-surface",
    pillText: "text-info-foreground",
    htmlChip: "border-info-border bg-info-surface text-info-foreground",
    dash: "5 3",
  },
};

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function computeFittedCamera(
  vw: number,
  vh: number,
  bounds: ContentBounds | null,
  hasTopBadges: boolean,
): Camera {
  if (vw <= 0 || vh <= 0 || !bounds) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const minY = hasTopBadges ? bounds.minY - 26 : bounds.minY;
  const height = bounds.maxY - minY;
  const bw = Math.max(100, bounds.width);
  const bh = Math.max(80, height);
  const availW = Math.max(120, vw - FIT_PAD * 2);
  const availH = Math.max(100, vh - FIT_PAD * 2);
  const zoom = clampZoom(Math.min(availW / bw, availH / bh, 1.2));
  const viewW = vw / zoom;
  const viewH = vh / zoom;
  const cx = bounds.minX + bounds.width / 2;
  const cy = minY + height / 2;
  return {
    x: cx - viewW / 2,
    y: cy - viewH / 2,
    zoom,
  };
}

function SvgDiffPill({
  x,
  y,
  text,
  kind,
}: {
  x: number;
  y: number;
  text: string;
  kind: DiffStatusKind;
}) {
  const v = DIFF_VISUAL[kind];
  const width = Math.max(58, text.length * 6.4 + 14);
  return (
    <g pointerEvents="none" data-diff-badge={kind}>
      <rect
        x={x}
        y={y}
        width={width}
        height={18}
        rx={9}
        className={cn(v.pillBg, v.haloStroke)}
        strokeWidth={1.5}
      />
      <text
        x={x + width / 2}
        y={y + 9}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        className={cn("select-none text-2xs font-bold", v.pillText)}
      >
        {text}
      </text>
    </g>
  );
}

export interface ReadOnlyDiagramDashboardProps {
  graph: GraphData;
  label: string;
  sideLabel: string;
  exporting?: boolean;
  nodeDiffs?: Map<string, ElementDiffMark>;
  linkDiffs?: Map<string, ElementDiffMark>;
}

export function ReadOnlyDiagramDashboard({
  graph,
  label,
  sideLabel,
  exporting = false,
  nodeDiffs,
  linkDiffs,
}: ReadOnlyDiagramDashboardProps) {
  const uid = useId().replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverCard, setHoverCard] = useState<{ node: DesignerNode; x: number; y: number } | null>(
    null,
  );

  const notationId: NotationId = graph.notation ?? DEFAULT_NOTATION_ID;
  const skinActiva: SkinId = graph.skin ?? SKIN_DEFAULT;
  const skinCtx = useMemo(
    () => ({
      skin: skinActiva,
      focal: new Set(graph.big_picture?.hotspots ?? []),
    }),
    [skinActiva, graph.big_picture?.hotspots],
  );

  const { nodes, links } = useMemo(() => graphDataToCanvas(graph), [graph]);

  const { containerNodes, plainNodes } = useMemo(() => {
    const containers: DesignerNode[] = [];
    const plains: DesignerNode[] = [];
    for (const node of nodes.values()) {
      if (isContainerType(node.tipo_elemento)) containers.push(node);
      else plains.push(node);
    }
    containers.sort((a, b) => {
      const areaA = (a.width ?? AGGREGATE_DEFAULT_WIDTH) * (a.height ?? AGGREGATE_DEFAULT_HEIGHT);
      const areaB = (b.width ?? AGGREGATE_DEFAULT_WIDTH) * (b.height ?? AGGREGATE_DEFAULT_HEIGHT);
      return areaB - areaA;
    });
    return { containerNodes: containers, plainNodes: plains };
  }, [nodes]);

  const linksList = useMemo(() => Array.from(links.values()), [links]);

  const activaciones = useMemo(() => {
    const esLdV = (nodeId: string) => {
      const nodo = nodes.get(nodeId);
      return !!nodo && isLifelineContainer(nodo.tipo_elemento);
    };
    const mensajes = linksList
      .filter(l => esMensajeDeSecuencia(l, esLdV) && l.orden !== undefined)
      .map(l => ({
        id: l.id,
        orden: l.orden as number,
        fuente: l.sourceId,
        destino: l.targetId,
        messageKind: l.messageKind,
      }));
    if (!mensajes.length) return [];
    return activacionesDe(mensajes)
      .map(a => {
        const nodo = nodes.get(a.participante);
        if (!nodo) return null;
        return {
          key: `${a.participante}-${a.desde}`,
          x: nodo.x + (nodo.width || AGGREGATE_DEFAULT_WIDTH) / 2,
          y: nodo.y + alturaDeMensaje(a.desde),
          alto: Math.max(12, alturaDeMensaje(a.hasta) - alturaDeMensaje(a.desde)),
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [nodes, linksList]);

  const fragmentosConRango = useMemo(() => {
    const colocados = linksList
      .filter(l => l.orden !== undefined)
      .map(l => {
        const a0 = nodes.get(l.sourceId);
        const b0 = nodes.get(l.targetId);
        if (!a0 || !b0) return null;
        return {
          orden: l.orden as number,
          y: Math.max(a0.y, b0.y) + alturaDeMensaje(l.orden as number),
        };
      })
      .filter((m): m is { orden: number; y: number } => m !== null);
    const out = new Map<string, FragmentPart[]>();
    if (!colocados.length) return out;
    for (const n of nodes.values()) {
      if (!isFragmentContainer(n.tipo_elemento)) continue;
      const rango = rangoPorGeometria(
        { y: n.y, height: n.height || AGGREGATE_DEFAULT_HEIGHT },
        colocados,
      );
      if (!rango) continue;
      const guardas = (n.fragmentParts ?? []).map(p => p.guarda);
      const casos = Math.max(1, n.fragmentParts?.length ?? 1);
      out.set(n.id, repartirOperandos(rango, casos, guardas));
    }
    return out;
  }, [nodes, linksList]);

  const bounds = useMemo(() => computeContentBounds(nodes, notationId), [nodes, notationId]);
  const hasTopBadges = Boolean(nodeDiffs && nodeDiffs.size > 0);

  const [cam, setCam] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const fittedKeyRef = useRef<string>("");
  const graphSignature = useMemo(
    () =>
      `${nodes.size}:${links.size}:${bounds ? `${Math.round(bounds.minX)},${Math.round(bounds.minY)},${Math.round(bounds.width)},${Math.round(bounds.height)}` : "empty"}`,
    [nodes.size, links.size, bounds],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0) {
        setViewport(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitToContent = useCallback(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return;
    setCam(computeFittedCamera(viewport.w, viewport.h, bounds, hasTopBadges));
  }, [viewport.w, viewport.h, bounds, hasTopBadges]);

  useEffect(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return;
    const fitKey = `${graphSignature}`;
    if (fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey;
      setCam(computeFittedCamera(viewport.w, viewport.h, bounds, hasTopBadges));
      setSelectedId(null);
    }
  }, [viewport.w, viewport.h, graphSignature, bounds, hasTopBadges]);

  const zoomAround = useCallback(
    (nextZoomRaw: number, clientX?: number, clientY?: number) => {
      const el = containerRef.current;
      setCam(prev => {
        const nextZoom = clampZoom(nextZoomRaw);
        if (nextZoom === prev.zoom) return prev;
        const rect = el?.getBoundingClientRect();
        const px = rect && clientX !== undefined ? clientX - rect.left : viewport.w / 2;
        const py = rect && clientY !== undefined ? clientY - rect.top : viewport.h / 2;
        const worldX = prev.x + px / prev.zoom;
        const worldY = prev.y + py / prev.zoom;
        return {
          x: worldX - px / nextZoom,
          y: worldY - py / nextZoom,
          zoom: nextZoom,
        };
      });
    },
    [viewport.w, viewport.h],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setCam(prev => {
        const nextZoom = clampZoom(prev.zoom * factor);
        if (nextZoom === prev.zoom) return prev;
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const worldX = prev.x + px / prev.zoom;
        const worldY = prev.y + py / prev.zoom;
        return {
          x: worldX - px / nextZoom,
          y: worldY - py / nextZoom,
          zoom: nextZoom,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    camX: number;
    camY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.closest("[data-dashboard-overlay]")) return;
    suppressClickRef.current = false;
    panStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      camX: cam.x,
      camY: cam.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (!pan.moved && Math.hypot(dx, dy) > 4) {
      pan.moved = true;
      suppressClickRef.current = true;
      setIsPanning(true);
      setHoverCard(null);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignorar si el puntero ya no está activo
      }
    }
    if (pan.moved) {
      setCam(prev => ({
        ...prev,
        x: pan.camX - dx / prev.zoom,
        y: pan.camY - dy / prev.zoom,
      }));
    }
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    if (pan.moved) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignorar liberación redundante
      }
    }
    panStateRef.current = null;
    setIsPanning(false);
  };

  const selectedSet = useMemo(
    () => (selectedId ? new Set([selectedId]) : new Set<string>()),
    [selectedId],
  );
  const vecindario = useMemo(
    () => neighborhoodOf(selectedSet, links.values()),
    [selectedSet, links],
  );
  const isRelated = useCallback(
    (id: string) => vecindario.nodes.has(id) || vecindario.edges.has(id),
    [vecindario],
  );

  const selectedNode = selectedId ? nodes.get(selectedId) ?? null : null;
  const selectedLink = selectedId && !selectedNode ? links.get(selectedId) ?? null : null;
  const selectedNodeMark = selectedNode ? nodeDiffs?.get(selectedNode.id) : undefined;
  const selectedLinkMark = selectedLink ? linkDiffs?.get(selectedLink.id) : undefined;

  const vw = Math.max(viewport.w, 320);
  const vh = Math.max(viewport.h, 240);
  const viewW = vw / cam.zoom;
  const viewH = vh / cam.zoom;
  const frame = exporting
    ? bounds ? croppedViewBox(bounds, 40) : { x: 0, y: 0, w: 480, h: 270 }
    : { x: cam.x, y: cam.y, w: viewW, h: viewH };

  const sideDiffCount = (nodeDiffs?.size ?? 0) + (linkDiffs?.size ?? 0);

  return (
    <div
      ref={containerRef}
      data-readonly-dashboard={sideLabel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        setSelectedId(null);
      }}
      className={cn(
        "relative h-full min-h-[260px] w-full overflow-hidden rounded-lg border select-none",
        skinActiva === "editorial" ? "bg-ed-paper" : "bg-canvas",
        exporting ? "min-h-0 rounded-none border-0 [&_[data-dashboard-overlay]]:hidden" : isPanning ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      {/* Cabecera flotante compacta sobre el lienzo: etiqueta Antes/Después y conteo */}
      <div
        data-dashboard-overlay=""
        className="pointer-events-none absolute top-2.5 left-2.5 z-20 flex flex-wrap items-center gap-1.5"
      >
        <span className="rounded-md border bg-card/95 px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-xs backdrop-blur-sm">
          {sideLabel}
        </span>
        <span className="rounded-md border bg-card/85 px-2 py-0.5 text-2xs text-muted-foreground backdrop-blur-sm">
          {nodes.size} elem. · {links.size} conex.
          {sideDiffCount > 0 ? ` · ${sideDiffCount} con cambio` : ""}
        </span>
      </div>

      {!exporting && nodes.size === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="rounded-md border border-dashed bg-card/90 px-4 py-2 text-xs text-muted-foreground">
            Esta vista no tiene componentes en {sideLabel.toLowerCase()}.
          </p>
        </div>
      ) : null}

      <SkinContext.Provider value={skinCtx}>
        <svg
          width="100%"
          height="100%"
          viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
          role="img"
          aria-label={label}
          data-skin={skinActiva}
          className={cn("block h-full w-full", skinActiva === "editorial" ? "bg-ed-paper" : "bg-canvas")}
        >
          <defs>
            <pattern id={`${uid}-grid-minor`} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
              <circle cx={0.5} cy={0.5} r={0.75} className={CANVAS_CHROME.cuadriculaPunto} />
            </pattern>
            <pattern id={`${uid}-grid-major`} width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
              <rect width={GRID * 5} height={GRID * 5} fill={`url(#${uid}-grid-minor)`} />
              <path
                d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
                fill="none"
                className={CANVAS_CHROME.cuadriculaLinea}
                strokeWidth={1}
              />
            </pattern>
            <marker
              id="arrow-end"
              viewBox="0 -5 10 10"
              refX="10"
              refY="0"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,-5L10,0L0,5" className={cn(CANVAS_CHROME.flecha, "opacity-80 dark:opacity-90")} />
            </marker>
            <marker
              id="arrow-end-selected"
              viewBox="0 -5 10 10"
              refX="10"
              refY="0"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,-5L10,0L0,5" className="fill-primary" />
            </marker>
            <marker
              id="arrow-start"
              viewBox="0 -5 10 10"
              refX="10"
              refY="0"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,-5L10,0L0,5" className={cn(CANVAS_CHROME.flecha, "opacity-80 dark:opacity-90")} />
            </marker>
            <marker
              id="arrow-start-selected"
              viewBox="0 -5 10 10"
              refX="10"
              refY="0"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,-5L10,0L0,5" className="fill-primary" />
            </marker>
            {(["", "-selected"] as const).map(sel =>
              (["end", "start"] as const).map(punta =>
                Object.entries(EDGE_MARKER_SHAPES).map(([nombre, m]) => {
                  const trazo = sel ? "stroke-primary" : CANVAS_CHROME.arista;
                  const relleno =
                    m.fill === "solid"
                      ? sel
                        ? "fill-primary"
                        : CANVAS_CHROME.flecha
                      : m.fill === "hollow"
                        ? "fill-canvas"
                        : "fill-none";
                  return (
                    <marker
                      key={`mark-${nombre}-${punta}${sel}`}
                      id={`mark-${nombre}-${punta}${sel}`}
                      viewBox={m.viewBox}
                      refX={punta === "start" ? m.refXStart : m.refX}
                      refY="0"
                      markerWidth={m.size}
                      markerHeight={m.size}
                      orient={punta === "start" ? "auto-start-reverse" : "auto"}
                    >
                      {m.circle && (
                        <circle
                          cx={m.circle.cx}
                          cy={0}
                          r={m.circle.r}
                          className={cn("fill-canvas", trazo)}
                          strokeWidth={m.strokeWidth}
                        />
                      )}
                      {m.paths.map(d => (
                        <path key={d} d={d} className={cn(relleno, trazo)} strokeWidth={m.strokeWidth} />
                      ))}
                    </marker>
                  );
                }),
              ),
            )}
          </defs>

          {!exporting && <rect
            x={cam.x}
            y={cam.y}
            width={viewW}
            height={viewH}
            fill={`url(#${uid}-grid-major)`}
            pointerEvents="none"
          />}

          {/* Capa 1: Contenedores */}
          <g>
            {containerNodes.map(node => {
              const mark = nodeDiffs?.get(node.id);
              const { w, h } = nodeBox(node, notationId);
              const v = mark ? DIFF_VISUAL[mark.kind] : null;
              return (
                <g key={node.id}>
                  <DesignerNodeComponent
                    node={node}
                    notation={notationId}
                    isSelected={selectedId === node.id}
                    isRelated={isRelated(node.id)}
                    fragmentParts={fragmentosConRango.get(node.id)}
                    onClick={e => {
                      e.stopPropagation();
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      setSelectedId(prev => (prev === node.id ? null : node.id));
                    }}
                    onHover={e => {
                      if (!panStateRef.current?.moved) {
                        setHoverCard({ node, x: e.clientX, y: e.clientY });
                      }
                    }}
                    onHoverEnd={() => setHoverCard(null)}
                  />
                  {mark && v ? (
                    <g pointerEvents="none">
                      <rect
                        x={node.x - 5}
                        y={node.y - 5}
                        width={w + 10}
                        height={h + 10}
                        rx={12}
                        className={cn("fill-none", v.haloStroke)}
                        strokeWidth={3}
                        strokeDasharray={v.dash}
                      />
                      <SvgDiffPill x={node.x} y={node.y - 23} text={v.nodeBadge} kind={mark.kind} />
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* Capa 2: Barras de activación de secuencia */}
          {activaciones.length > 0 && (
            <g pointerEvents="none">
              {activaciones.map(a => (
                <rect
                  key={a.key}
                  x={a.x - 7}
                  y={a.y}
                  width={14}
                  height={a.alto}
                  className="fill-primary stroke-border"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          )}

          {/* Capa 3: Enlaces y sus resaltados de cambio */}
          <g>
            {linksList.map(link => {
              const mark = linkDiffs?.get(link.id);
              const v = mark ? DIFF_VISUAL[mark.kind] : null;
              const geo = mark ? linkGeometry(link, nodes, notationId) : null;
              return (
                <g key={link.id}>
                  {mark && v && geo ? (
                    <path
                      d={geo.path}
                      fill="none"
                      className={v.haloStroke}
                      strokeWidth={7}
                      opacity={0.35}
                      strokeLinecap="round"
                      strokeDasharray={v.dash}
                      pointerEvents="none"
                    />
                  ) : null}
                  <DesignerLinkComponent
                    link={link}
                    nodes={nodes}
                    notation={notationId}
                    isSelected={selectedId === link.id}
                    isRelated={isRelated(link.id)}
                    onClick={e => {
                      e.stopPropagation();
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      setSelectedId(prev => (prev === link.id ? null : link.id));
                    }}
                  />
                  {mark && v && geo ? (
                    <SvgDiffPill
                      x={geo.labelX - 36}
                      y={geo.labelY - 26}
                      text={v.linkBadge}
                      kind={mark.kind}
                    />
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* Capa 4: Componentes / nodos */}
          <g>
            {plainNodes.map(node => {
              const mark = nodeDiffs?.get(node.id);
              const { w, h } = nodeBox(node, notationId);
              const v = mark ? DIFF_VISUAL[mark.kind] : null;
              return (
                <g key={node.id}>
                  <DesignerNodeComponent
                    node={node}
                    notation={notationId}
                    isSelected={selectedId === node.id}
                    isRelated={isRelated(node.id)}
                    onClick={e => {
                      e.stopPropagation();
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      setSelectedId(prev => (prev === node.id ? null : node.id));
                    }}
                    onHover={e => {
                      if (!panStateRef.current?.moved) {
                        setHoverCard({ node, x: e.clientX, y: e.clientY });
                      }
                    }}
                    onHoverEnd={() => setHoverCard(null)}
                  />
                  {mark && v ? (
                    <g pointerEvents="none">
                      <rect
                        x={node.x - 5}
                        y={node.y - 5}
                        width={w + 10}
                        height={h + 10}
                        rx={10}
                        className={cn("fill-none", v.haloStroke)}
                        strokeWidth={3}
                        strokeDasharray={v.dash}
                      />
                      <SvgDiffPill x={node.x} y={node.y - 23} text={v.nodeBadge} kind={mark.kind} />
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </SkinContext.Provider>

      {/* Ficha flotante al pasar el ratón (como en el dashboard normal, solo lectura) */}
      {hoverCard && !isPanning && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"
          style={{
            left: Math.min(
              hoverCard.x + 16,
              (typeof window !== "undefined" ? window.innerWidth : 1200) - 336,
            ),
            top: Math.min(
              hoverCard.y + 18,
              (typeof window !== "undefined" ? window.innerHeight : 800) - 160,
            ),
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold leading-tight">{hoverCard.node.nombre}</p>
            {nodeDiffs?.get(hoverCard.node.id) ? (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold",
                  DIFF_VISUAL[nodeDiffs.get(hoverCard.node.id)!.kind].htmlChip,
                )}
              >
                {DIFF_VISUAL[nodeDiffs.get(hoverCard.node.id)!.kind].nodeBadge}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
            {hoverCard.node.tipo_elemento}
          </p>
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            {hoverCard.node.descripcion?.trim() || "Sin descripción registrada."}
          </p>
          {!!hoverCard.node.tags_tecnologia?.length && (
            <p className="mt-1 text-2xs italic text-muted-foreground">
              [{hoverCard.node.tags_tecnologia.join(", ")}]
            </p>
          )}
          {nodeDiffs?.get(hoverCard.node.id)?.fields.length ? (
            <p className="mt-1 border-t pt-1 text-2xs text-foreground">
              Detalle: {nodeDiffs.get(hoverCard.node.id)!.fields.join(", ")}
            </p>
          ) : null}
        </div>
      )}

      {/* Ficha de inspección detallada al hacer clic en un componente o conexión */}
      {(selectedNode || selectedLink) && (
        <aside
          data-dashboard-overlay=""
          onClick={e => e.stopPropagation()}
          className="absolute bottom-2.5 left-2.5 z-20 max-h-[58%] w-72 max-w-[calc(100%-8.5rem)] cursor-default overflow-y-auto rounded-lg border bg-popover/95 p-3 text-popover-foreground shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-xs font-semibold">
                  {selectedNode
                    ? selectedNode.nombre
                    : selectedLink?.descripcion?.trim() || "Conexión"}
                </p>
                {selectedNodeMark ? (
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-2xs font-semibold",
                      DIFF_VISUAL[selectedNodeMark.kind].htmlChip,
                    )}
                  >
                    {DIFF_VISUAL[selectedNodeMark.kind].nodeBadge}
                  </span>
                ) : null}
                {selectedLinkMark ? (
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-2xs font-semibold",
                      DIFF_VISUAL[selectedLinkMark.kind].htmlChip,
                    )}
                  >
                    {DIFF_VISUAL[selectedLinkMark.kind].linkBadge}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
                {selectedNode
                  ? selectedNode.tipo_elemento
                  : `${nodes.get(selectedLink!.sourceId)?.nombre ?? selectedLink!.sourceId} → ${nodes.get(selectedLink!.targetId)?.nombre ?? selectedLink!.targetId}`}
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar detalle del elemento"
              title="Cerrar detalle"
              onClick={() => setSelectedId(null)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {selectedNode ? (
            <div className="mt-2 space-y-1.5 text-xs">
              <p className="whitespace-pre-wrap leading-snug text-foreground">
                {selectedNode.descripcion?.trim() || "Sin descripción registrada."}
              </p>
              {selectedNode.agregado && !isContainerType(selectedNode.tipo_elemento) ? (
                <p className="text-2xs text-muted-foreground">
                  Grupo: <span className="text-foreground">{selectedNode.agregado}</span>
                </p>
              ) : null}
              {!!selectedNode.tags_tecnologia?.length && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {selectedNode.tags_tecnologia.map(tag => (
                    <span
                      key={tag}
                      className="rounded border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {!!selectedNode.metadata?.length && (
                <div className="space-y-0.5 border-t pt-1.5 text-2xs">
                  {selectedNode.metadata.map(m => (
                    <p key={m.clave} className="truncate text-muted-foreground">
                      <span className="font-medium text-foreground">{m.clave}:</span> {m.valor}
                    </p>
                  ))}
                </div>
              )}
              {selectedNode.fuente ? (
                <p className="border-t pt-1 text-2xs text-muted-foreground">
                  Fuente: {selectedNode.fuente}
                </p>
              ) : null}
              {selectedNodeMark?.fields.length ? (
                <p className="border-t pt-1 text-2xs font-medium text-foreground">
                  Cambios: {selectedNodeMark.fields.join(", ")}
                </p>
              ) : null}
            </div>
          ) : selectedLink ? (
            <div className="mt-2 space-y-1 text-xs">
              <p className="leading-snug text-foreground">
                {selectedLink.descripcion?.trim() || "Relación sin etiqueta."}
              </p>
              {selectedLinkMark?.fields.length ? (
                <p className="border-t pt-1 text-2xs font-medium text-foreground">
                  Cambios: {selectedLinkMark.fields.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </aside>
      )}

      {/* Controles de zoom de lectura (esquina inferior derecha, igual que el dashboard principal) */}
      <div
        data-dashboard-overlay=""
        onClick={e => e.stopPropagation()}
        className="absolute right-2.5 bottom-2.5 z-20 flex cursor-default items-center gap-0.5 rounded-lg border bg-card/95 p-1 shadow-md backdrop-blur-sm"
      >
        <button
          type="button"
          aria-label={`Alejar ${sideLabel}`}
          title="Alejar"
          disabled={cam.zoom <= ZOOM_MIN}
          onClick={() => zoomAround(cam.zoom / ZOOM_STEP)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Ajustar zoom de ${sideLabel}`}
          title="Ajustar al contenido"
          onClick={fitToContent}
          className="min-w-11 rounded-md px-1 py-1 text-center text-2xs font-medium tabular-nums text-foreground hover:bg-muted"
        >
          {Math.round(cam.zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label={`Acercar ${sideLabel}`}
          title="Acercar"
          disabled={cam.zoom >= ZOOM_MAX}
          onClick={() => zoomAround(cam.zoom * ZOOM_STEP)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Encuadrar ${sideLabel}`}
          title="Encuadrar diagrama completo"
          onClick={fitToContent}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
