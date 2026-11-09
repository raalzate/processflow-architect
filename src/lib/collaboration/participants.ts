import type { Presence } from "./presence";
import type { Role } from "./types";
export interface Participant {
  id: string; name: string; owner: boolean; role: Role; branchIds: string[]; viewIds: string[];
  locations?: { branchId: string; viewId: string }[];
}
/** La membresía activa no caduca al dejar de mover el ratón ni se filtra por la rama del observador. */
export function participantsForRoom(input: {
  ownId: string; ownName: string; owner: boolean; connected: boolean;
  members: { id: string; name?: string; role: Role; connected: boolean; revoked: boolean }[];
  locations: Presence[];
}): Participant[] {
  const list: Participant[] = [{ id: input.ownId, name: input.ownName, owner: input.owner, role: "editor", branchIds: [], viewIds: [] }];
  if (input.owner || input.connected) for (const m of input.members) if (m.connected && !m.revoked && m.id !== input.ownId) list.push({ id: m.id, name: m.name || "Participante", owner: false, role: m.role, branchIds: [], viewIds: [] });
  for (const p of list) {
    const locations = input.locations.filter(l => l.id === p.id || l.id.startsWith(`${p.id}:`));
    p.branchIds = [...new Set(locations.map(l => l.branchId ?? "shared"))];
    p.viewIds = [...new Set(locations.map(l => l.viewId))];
    p.locations = locations.map(l => ({ branchId: l.branchId ?? "shared", viewId: l.viewId })).filter((l, i, all) => all.findIndex(a => a.branchId === l.branchId && a.viewId === l.viewId) === i);
  }
  return list;
}

/** Una persona cuenta una vez; una ventana en otra rama no se confunde con esta vista. */
export function collaboratorsDescription(people: Participant[], ownId: string | undefined, branchId: string, viewId?: string): string {
  const matching = people.filter(p => p.id !== ownId && (p.locations?.some(l => l.branchId === branchId && (viewId === undefined || l.viewId === viewId)) ?? (viewId === undefined && p.branchIds.includes(branchId))));
  if (!matching.length) return "";
  const names = matching.length === 1 ? matching[0].name : matching.length === 2 ? `${matching[0].name} y ${matching[1].name}` : `${matching[0].name} y ${matching.length - 1} compañeros más`;
  return `${names} ${matching.length === 1 ? "está" : "están"} trabajando en esta ${viewId === undefined ? "rama" : "vista"}.`;
}
