export interface PresenceInput {
  name: string;
  viewId: string;
  pointer: { x: number; y: number } | null;
  selectedIds: string[];
  moving?: { id: string; x: number; y: number; width: number; height: number }[];
}
export interface Presence extends PresenceInput { id: string; color: string; seenAt: number }
const COLORS = ["#be123c", "#1d4ed8", "#15803d", "#7e22ce", "#9a3412", "#0e7490", "#a21caf", "#4338ca"];
export function presenceColor(id: string): string {
  let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}
export function sanitizePresence(raw: unknown, id: string, now: number): Presence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Partial<PresenceInput>;
  const coordinate = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10_000_000;
  if (input.pointer && (!coordinate(input.pointer.x) || !coordinate(input.pointer.y))) return undefined;
  if (typeof input.viewId !== "string" || input.viewId.length > 200) return undefined;
  const moving = (Array.isArray(input.moving) ? input.moving : []).slice(0, 5).filter(p => p && typeof p.id === "string" && p.id.length <= 200 && [p.x, p.y, p.width, p.height].every(coordinate));
  return { id, color: presenceColor(id), seenAt: now, name: typeof input.name === "string" ? input.name.slice(0, 40).trim() || `Persona ${id.slice(0, 5)}` : `Persona ${id.slice(0, 5)}`,
    viewId: input.viewId, pointer: input.pointer ? { x: input.pointer.x, y: input.pointer.y } : null,
    selectedIds: (Array.isArray(input.selectedIds) ? input.selectedIds : []).filter((v): v is string => typeof v === "string" && v.length <= 200).slice(0, 20), moving };
}
export function livePresence(peers: Presence[], now: number): Presence[] { return peers.filter(peer => now - peer.seenAt < 8_000); }
