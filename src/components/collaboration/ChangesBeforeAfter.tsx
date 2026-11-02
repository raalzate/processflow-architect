"use client";

import { MermaidDiagram } from "@/components/canvas/MermaidDiagram";
import { encodeGraph } from "@/lib/collaboration/graph-codec";
import { scopeOptions } from "@/lib/collaboration/history";
import type { SharedProject } from "@/lib/collaboration/types";
import type { GraphData } from "@/lib/types";

function DiagramPreview({ graph, label }: { graph: GraphData; label: string }) {
  const record = encodeGraph(graph),
    nodes = record.nodes.map((n, index) => ({
      id: n.id,
      name: n.value.nombre,
      x: n.value.x ?? (index % 3) * 210,
      y: n.value.y ?? Math.floor(index / 3) * 110,
    }));
  const minX = Math.min(0, ...nodes.map(n => n.x)),
    minY = Math.min(0, ...nodes.map(n => n.y));
  const width = Math.max(300, ...nodes.map(n => n.x + 190)) - minX + 30,
    height = Math.max(150, ...nodes.map(n => n.y + 90)) - minY + 30;
  const positions = new Map(nodes.map(n => [n.id, n]));
  return (
    <div className="rounded border bg-muted/20 p-2">
      <svg
        viewBox={`${minX - 15} ${minY - 15} ${width} ${height}`}
        role="img"
        aria-label={label}
        className="h-56 w-full text-foreground"
      >
        {record.edges.map(e => {
          const a = positions.get(e.fuente),
            b = positions.get(e.destino);
          return a && b ? (
            <g key={e.id}>
              <path
                d={`M${a.x + 90} ${a.y + 32} L${b.x + 90} ${b.y + 32}`}
                fill="none"
                stroke="currentColor"
                opacity={0.5}
              />
              <text x={(a.x + b.x) / 2 + 90} y={(a.y + b.y) / 2 + 26} fontSize={10} fill="currentColor">
                {e.descripcion?.slice(0, 24)}
              </text>
            </g>
          ) : null;
        })}
        {nodes.map(n => (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={180} height={64} rx={5} className="fill-background stroke-primary" />
            <text x={n.x + 90} y={n.y + 35} textAnchor="middle" fill="currentColor" fontSize={12}>
              {n.name.slice(0, 25)}
            </text>
            <title>{n.name}</title>
          </g>
        ))}
      </svg>
      <p className="text-xs text-muted-foreground">
        {nodes.length} componentes · {record.edges.length} conexiones
      </p>
    </div>
  );
}

export function ChangesBeforeAfter({ before, after }: { before: SharedProject; after: SharedProject }) {
  const options = scopeOptions(before, after),
    changed = options.filter(
      o =>
        JSON.stringify(
          o.id === "design"
            ? before.content
            : o.id === "project"
              ? [before.name, before.references, before.agent, before.analysis]
              : before.customViews.find(v => `view:${v.id}` === o.id),
        ) !==
        JSON.stringify(
          o.id === "design"
            ? after.content
            : o.id === "project"
              ? [after.name, after.references, after.agent, after.analysis]
              : after.customViews.find(v => `view:${v.id}` === o.id),
        ),
    );
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {changed.length ? `Cambios en ${changed.length} ámbitos` : "No hay diferencias de contenido"}
      </p>
      {changed.map(o => (
        <details key={o.id} open className="rounded-md border p-2">
          <summary className="cursor-pointer text-sm">{o.name} · antes / después</summary>
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            {[
              { label: "Actual", p: before },
              { label: "Resultado propuesto", p: after },
            ].map(({ label, p }) => {
              const view = p.customViews.find(v => `view:${v.id}` === o.id),
                graph = o.id === "design" ? p.content : view?.graph;
              return (
                <div key={label} className="min-w-0 space-y-2">
                  <p className="text-xs font-medium">{label}</p>
                  {graph ? (
                    <DiagramPreview graph={graph} label={`${label}: ${o.name}`} />
                  ) : view?.kind === "mermaid" ? (
                    <div className="max-h-64 overflow-auto rounded bg-muted p-2">
                      <MermaidDiagram code={view.mermaidCode ?? ""} />
                    </div>
                  ) : o.id === "project" ? (
                    <div className="rounded bg-muted p-3 text-sm">
                      <p>{p.name}</p>
                      <p>
                        {p.references.length} documentos de referencia · {p.agent.artifacts.length} artefactos
                      </p>
                      <p>{Object.values(p.analysis).filter(Boolean).length} resultados de análisis</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Vista eliminada</p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
