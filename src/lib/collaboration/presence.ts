export interface PresenceInput {
  leaving?: boolean;
  branchId?: string;
  name: string;
  viewId: string;
  pointer: { x: number; y: number } | null;
  selectedIds: string[];
  moving?: { id: string; x: number; y: number; width: number; height: number }[];
  connecting?: { sourceId: string; x: number; y: number; anchor?: { x: number; y: number }; id?: string };
  sessionId?: string;
}
export interface Presence extends PresenceInput {
  id: string;
  color: string;
  seenAt: number;
}
/** Los latidos renuevan la ubicación pero no son una medición de carga de edición. */
export function presenceIsActivity(previous: Presence | undefined, next: Presence): boolean {
  const activity = (p: Presence) => [p.branchId ?? "shared", p.viewId, p.pointer, p.selectedIds, p.moving ?? [], p.connecting];
  return !previous || JSON.stringify(activity(previous)) !== JSON.stringify(activity(next));
}
const COLORS = ["#be123c", "#1d4ed8", "#15803d", "#7e22ce", "#9a3412", "#0e7490", "#a21caf", "#4338ca"];
export function presenceColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}
export function sanitizePresence(raw: unknown, id: string, now: number): Presence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const input = raw as Partial<PresenceInput>;
  const coordinate = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 10_000_000;
  if (input.pointer && (!coordinate(input.pointer.x) || !coordinate(input.pointer.y))) return undefined;
  if (typeof input.viewId !== "string" || input.viewId.length > 200) return undefined;
  const moving = (Array.isArray(input.moving) ? input.moving : [])
    .slice(0, 5)
    .filter(
      p =>
        p &&
        typeof p.id === "string" &&
        p.id.length <= 200 &&
        [p.x, p.y, p.width, p.height].every(coordinate),
    );
  const draft = input.connecting;
  const connecting =
    draft &&
    typeof draft.sourceId === "string" &&
    draft.sourceId.length <= 200 &&
    coordinate(draft.x) &&
    coordinate(draft.y)
      ? {
          sourceId: draft.sourceId,
          x: draft.x,
          y: draft.y,
          ...(draft.anchor && [draft.anchor.x, draft.anchor.y].every(v => coordinate(v) && v >= 0 && v <= 1)
            ? { anchor: { x: draft.anchor.x, y: draft.anchor.y } }
            : {}),
          ...(typeof draft.id === "string" && draft.id.length <= 200 ? { id: draft.id } : {}),
        }
      : undefined;
  return {
    id,
    ...(input.leaving === true ? { leaving: true } : {}),
    color: presenceColor(id),
    seenAt: now,
    name:
      typeof input.name === "string"
        ? input.name.slice(0, 40).trim() || `Persona ${id.slice(0, 5)}`
        : `Persona ${id.slice(0, 5)}`,
    ...(typeof input.branchId === "string" && /^[\w-]{1,100}$/.test(input.branchId)
      ? { branchId: input.branchId }
      : {}),
    viewId: input.viewId,
    pointer: input.pointer ? { x: input.pointer.x, y: input.pointer.y } : null,
    selectedIds: (Array.isArray(input.selectedIds) ? input.selectedIds : [])
      .filter((v): v is string => typeof v === "string" && v.length <= 200)
      .slice(0, 20),
    moving,
    connecting,
    ...(typeof input.sessionId === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(input.sessionId)
      ? { sessionId: input.sessionId }
      : {}),
  };
}
export function livePresence(peers: Presence[], now: number): Presence[] {
  return peers.filter(peer => now - peer.seenAt < 8_000);
}
