"use client";

import React, { useRef } from "react";
import { isContainerType, type DesignerNode } from "./serialize";
import { NODE_WIDTH, NODE_HEIGHT, AGGREGATE_DEFAULT_WIDTH, AGGREGATE_DEFAULT_HEIGHT } from "./DesignerCanvas";
import { minimapScale, viewportRect, miniPointToCanvas } from "./minimap-geom";

const MINI_W = 168;
const MINI_H = 120;

/**
 * Minimapa: panorámica del lienzo completo para no perderse en diagramas grandes
 * (el lienzo mide 2000×2000 con zoom). Dibuja cada nodo a escala y un rectángulo
 * con la porción visible; hacer clic/arrastrar mueve el viewport allí.
 *
 * Recibe el viewport en píxeles de scroll + el zoom para traducir a coordenadas
 * del lienzo (coord = scroll / zoom). `onNavigate` recibe el CENTRO deseado en
 * coordenadas del lienzo; el padre ajusta el scroll.
 */
export function Minimap({
  nodes,
  zoom,
  canvasSize,
  viewport,
  onNavigate,
}: {
  nodes: Map<string, DesignerNode>;
  zoom: number;
  canvasSize: number;
  viewport: { left: number; top: number; w: number; h: number };
  onNavigate: (cx: number, cy: number) => void;
}) {
  const s = minimapScale(canvasSize, MINI_W, MINI_H); // escala lienzo→mini
  const list = Array.from(nodes.values());
  const dragging = useRef(false);

  const { x: vx, y: vy, w: vw, h: vh } = viewportRect(viewport, zoom, s);

  // Traduce un punto del SVG del minimapa a coordenadas del lienzo y navega.
  const navFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = miniPointToCanvas(e.clientX - rect.left, e.clientY - rect.top, s);
    onNavigate(p.x, p.y);
  };

  return (
    <div
      className="absolute right-4 top-4 z-20 overflow-hidden rounded-lg border bg-card/95 shadow-md backdrop-blur"
      title="Minimapa — clic o arrastra para navegar"
    >
      <svg
        width={MINI_W}
        height={MINI_H}
        className="block cursor-pointer"
        onMouseDown={(e) => {
          dragging.current = true;
          navFromEvent(e);
        }}
        onMouseMove={(e) => {
          if (dragging.current) navFromEvent(e);
        }}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
      >
        <rect width={MINI_W} height={MINI_H} className="fill-muted/40" />
        {list.map((n) => {
          const isC = isContainerType(n.tipo_elemento);
          const w = (n.width ?? (isC ? AGGREGATE_DEFAULT_WIDTH : NODE_WIDTH)) * s;
          const h = (n.height ?? (isC ? AGGREGATE_DEFAULT_HEIGHT : NODE_HEIGHT)) * s;
          return (
            <rect
              key={n.id}
              x={n.x * s}
              y={n.y * s}
              width={Math.max(1, w)}
              height={Math.max(1, h)}
              rx={1}
              className={
                isC
                  ? "fill-muted-foreground/10 stroke-muted-foreground/40"
                  : "fill-primary/50"
              }
              strokeWidth={isC ? 0.5 : 0}
            />
          );
        })}
        {/* Viewport visible */}
        <rect
          x={vx}
          y={vy}
          width={vw}
          height={vh}
          className="fill-primary/10 stroke-primary"
          strokeWidth={1}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}
