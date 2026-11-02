"use client";
import type { Presence } from "@/lib/collaboration/presence";

interface Box { x: number; y: number; width?: number; height?: number }
export function PresenceLayer({ peers, viewId, nodes, zoom }: { peers: Presence[]; viewId: string; nodes: Map<string, Box>; zoom: number }) {
  return <g pointerEvents="none" aria-hidden="true">
    {peers.filter(peer => peer.viewId === viewId).map(peer => <g key={peer.id}>
      {peer.selectedIds.map(id => {
        const box = nodes.get(id); if (!box) return null;
        return <rect key={id} x={box.x - 4} y={box.y - 4} width={(box.width ?? 180) + 8} height={(box.height ?? 80) + 8} rx={5} fill="none" stroke={peer.color} strokeWidth={2 / zoom} strokeDasharray={`${5 / zoom} ${3 / zoom}`} />;
      })}
      {peer.moving?.map(box => <g key={`moving-${box.id}`}><rect x={box.x} y={box.y} width={box.width} height={box.height} rx={4} fill={peer.color} fillOpacity={0.12} stroke={peer.color} strokeWidth={2 / zoom} /><text x={box.x} y={box.y - 8 / zoom} fontSize={12 / zoom} fill={peer.color}>{peer.name} moviendo</text></g>)}
      {peer.pointer ? <g transform={`translate(${peer.pointer.x} ${peer.pointer.y}) scale(${1 / zoom})`}>
        <path d="M0 0 L0 19 L5 14 L9 23 L13 21 L9 12 L17 12 Z" fill={peer.color} stroke="white" strokeWidth={1.5} />
        <rect x={15} y={18} width={Math.min(270, (peer.name.length + 7) * 7 + 16)} height={24} rx={4} fill={peer.color} />
        <text x={23} y={34} fill="white" fontSize={12} fontWeight={600}>{peer.name.slice(0, 28)} · {peer.id.slice(0, 4)}</text>
      </g> : null}
    </g>)}
  </g>;
}
