"use client";
import type { Presence } from "@/lib/collaboration/presence";

interface Box { x: number; y: number; width?: number; height?: number }
export function PresenceLayer({ peers, viewId, nodes, links, zoom }: { peers: Presence[]; viewId: string; nodes: Map<string, Box>; links: ReadonlyMap<string, unknown>; zoom: number }) {
  return <g pointerEvents="none" aria-hidden="true">
    {peers.filter(peer => peer.viewId === viewId).map(peer => <g key={peer.id} data-presence-name={peer.name}>
      {peer.selectedIds.map(id => {
        const box = nodes.get(id); if (!box) return null;
        return <rect key={id} x={box.x - 4} y={box.y - 4} width={(box.width ?? 180) + 8} height={(box.height ?? 80) + 8} rx={5} fill="none" stroke={peer.color} strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />;
      })}
      {peer.connecting && (() => {
        if (peer.connecting.id && links.has(peer.connecting.id)) return null;
        const from = nodes.get(peer.connecting.sourceId); if (!from) return null;
        const x = from.x + (from.width ?? 180) * (peer.connecting.anchor?.x ?? .5), y = from.y + (from.height ?? 80) * (peer.connecting.anchor?.y ?? .5);
        const dx = peer.connecting.x - x, dy = peer.connecting.y - y;
        const angle = Math.atan2(dy, dx), length = Math.hypot(dx, dy);
        return <g data-presence-connecting={peer.connecting.sourceId}>
          <g style={{ transform: `translate(${x}px, ${y}px) rotate(${angle}rad) scale(${length}, 1)`, transition: "transform 80ms linear" }}><path d="M0 0 L1 0" fill="none" stroke={peer.color} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" /></g>
          <g data-presence-arrow-tip="" style={{ transform: `translate(${peer.connecting.x}px, ${peer.connecting.y}px) rotate(${angle}rad) scale(${1 / zoom})`, transition: "transform 80ms linear" }}><path d="M0 0 L-10 -5 L-10 5 Z" fill={peer.color} /></g>
          <text x={x} y={y - 12 / zoom} fontSize={12 / zoom} fill={peer.color}>{peer.name} conectando</text>
        </g>;
      })()}
      {peer.moving?.map(box => <g key={`moving-${box.id}`} data-presence-moving={box.id} style={{ transform: `translate(${box.x}px, ${box.y}px)`, transition: "transform 80ms linear" }}><rect width={box.width} height={box.height} rx={4} fill={peer.color} fillOpacity={0.12} stroke={peer.color} strokeWidth={2 / zoom} /><text y={-8 / zoom} fontSize={12 / zoom} fill={peer.color}>{peer.name} moviendo</text></g>)}
      {/* Interpolar los paquetes evita saltos entre muestras de red a 25 Hz. */}
      {peer.pointer ? <g data-presence-pointer="" style={{ transform: `translate(${peer.pointer.x}px, ${peer.pointer.y}px) scale(${1 / zoom})`, transition: "transform 80ms linear" }}>
        <path d="M0 0 L0 19 L5 14 L9 23 L13 21 L9 12 L17 12 Z" fill={peer.color} stroke="white" strokeWidth={1.5} />
        <rect x={15} y={18} width={Math.min(270, (peer.name.length + 7) * 7 + 16)} height={24} rx={4} fill={peer.color} />
        <text x={23} y={34} fill="white" fontSize={12} fontWeight={600}>{peer.name.slice(0, 28)} · {peer.id.slice(0, 4)}</text>
      </g> : null}
    </g>)}
  </g>;
}
