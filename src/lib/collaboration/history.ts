import type { SharedProject, Role } from "./types";
import { encodeProject, decodeProject } from "./graph-codec";
import { assertEncodedProject, assertJson } from "./validation";
import { enRegistro } from "../registro";

export interface HistoryActor { id: string; name: string; owner: boolean; role: Role }
export interface BranchPermission { mergeMain?: boolean; editMain?: boolean; restoreMain?: boolean; until?: string; proposalId?: string }
export interface Branch { id: string; name: string; head: string; creator: string; editors?: string[] }
export interface DiagramCommit {
  id: string; branchId: string; parents: string[]; at: string; author: { id: string; name: string };
  message: string; scopes: string[]; snapshot: SharedProject; kind: "initial" | "commit" | "recovery" | "restore" | "merge" | "pull";
  mergeParent?: string; mergedScopes?: string[];
}
export interface MergeProposal { id: string; branchId: string; targetId: string; commitId: string; scopes: string[]; message: string; author: { id: string; name: string }; at: string; status: "open" | "merged" | "rejected" }
export interface DiagramHistory { format: "processflow-history/1"; revision: number; branches: Branch[]; commits: DiagramCommit[]; proposals: MergeProposal[]; permissions: Record<string, BranchPermission>; operations: string[] }
export type Choices = Record<string, "ours" | "theirs">;
export type HistoryAction = { id: string } & (
  | { type: "branch"; branchId: string; name: string; fromCommit: string }
  | { type: "commit"; branchId: string; scopes: string[]; message: string }
  | { type: "permission"; memberId: string; permission: BranchPermission }
  | { type: "editors"; branchId: string; editors?: string[] }
  | { type: "propose"; branchId: string; targetId: string; commitId: string; scopes: string[]; message: string }
  | { type: "reject"; proposalId: string }
  | { type: "merge"; proposalId: string; expectedHead: string; choices: Choices; scopes?: string[] }
  | { type: "pull"; branchId: string; commitId: string; scopes: string[]; expectedHead: string; choices: Choices }
  | { type: "restore"; branchId: string; commitId: string; scopes: string[] }
);
export interface MergeConflict { id: string; path: string; base: unknown; ours: unknown; theirs: unknown }
export interface MergePreview { project: SharedProject; conflicts: MergeConflict[]; dependencies: string[] }
export const equalProject = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const clone = <T>(v: T): T => structuredClone(v);
const findBranch = (s: DiagramHistory, id: string) => { const b = s.branches.find(b => b.id === id); if (!b) throw new Error("La rama ya no existe."); return b; };
export const findCommit = (s: DiagramHistory, id: string) => { const c = s.commits.find(c => c.id === id); if (!c) throw new Error("La versión no está disponible."); return c; };
export function scopeOptions(...projects: SharedProject[]) {
  const views = new Map<string, string>(); for (const p of projects) for (const v of p.customViews) views.set(`view:${v.id}`, v.name);
  return [{ id: "design", name: "Modelo" }, ...[...views].map(([id, name]) => ({ id, name })), { id: "project", name: "Datos comunes: nombre, referencias, artefactos y análisis" }];
}
function checkScopes(scopes: string[], ...projects: SharedProject[]) {
  const known = new Set(scopeOptions(...projects).map(s => s.id));
  if (!Array.isArray(scopes) || !scopes.length || new Set(scopes).size !== scopes.length || scopes.some(s => !known.has(s))) throw new Error("Selecciona vistas válidas o los datos comunes del proyecto.");
}
export function selectScopes(base: SharedProject, next: SharedProject, scopes: string[]): SharedProject {
  checkScopes(scopes, base, next); const result = clone(base);
  if (scopes.includes("design")) result.content = clone(next.content);
  for (const scope of scopes) if (scope.startsWith("view:")) {
    const id = scope.slice(5), view = next.customViews.find(v => v.id === id), index = result.customViews.findIndex(v => v.id === id);
    if (view && index >= 0) result.customViews[index] = clone(view);
    else if (view) result.customViews.push(clone(view));
    else if (index >= 0) result.customViews.splice(index, 1);
  }
  if (scopes.includes("project")) { result.name = next.name; result.references = clone(next.references); result.agent = clone(next.agent); result.analysis = clone(next.analysis); }
  return result;
}
export function canManage(s: DiagramHistory, actor: HistoryActor, permission: keyof Pick<BranchPermission, "mergeMain" | "editMain" | "restoreMain">, at: string, proposalId?: string) {
  if (actor.role !== "editor") return false;
  if (actor.owner) return true;
  const p = enRegistro(s.permissions, actor.id) ? s.permissions[actor.id] : undefined;
  return !!p?.[permission] && (!p.until || Date.parse(p.until) > Date.parse(at)) && (!p.proposalId || permission === "mergeMain" && p.proposalId === proposalId);
}
export function canEditBranch(s: DiagramHistory, id: string, actor: HistoryActor, at: string) {
  const branch = s.branches.find(b => b.id === id); if (!branch || actor.role !== "editor") return false;
  return id === "main" ? canManage(s, actor, "editMain", at) : actor.owner || !branch.editors || branch.editors.includes(actor.id);
}
export function createHistory(project: SharedProject, actor: HistoryActor, stamp: { id: string; at: string }): DiagramHistory {
  assertEncodedProject(encodeProject(project));
  return { format: "processflow-history/1", revision: 1, branches: [{ id: "main", name: "Principal", head: stamp.id, creator: actor.id }, { id: "shared", name: "Trabajo compartido", head: stamp.id, creator: actor.id }],
    commits: [{ id: stamp.id, branchId: "main", parents: [], author: { id: actor.id, name: actor.name }, at: stamp.at, message: "Versión inicial antes de colaborar", scopes: scopeOptions(project).map(s => s.id), snapshot: clone(project), kind: "initial" }], proposals: [], permissions: {}, operations: [] };
}

/** Las aristas de fusión sólo son ancestros de los ámbitos efectivamente aprobados. */
function ancestors(s: DiagramHistory, start: string, scope?: string) {
  const distances = new Map<string, number>(), queue: [string, number][] = [[start, 0]];
  for (let i = 0; i < queue.length; i++) {
    const [id, distance] = queue[i]; if (distances.has(id)) continue; distances.set(id, distance);
    const c = findCommit(s, id); for (const parent of c.parents) queue.push([parent, distance + 1]);
    if (c.mergeParent && (!scope || c.mergedScopes?.includes(scope))) queue.push([c.mergeParent, distance + 1]);
  }
  return distances;
}
export function commonBase(s: DiagramHistory, ours: string, theirs: string, scope: string): DiagramCommit {
  const a = ancestors(s, ours, scope), b = ancestors(s, theirs, scope);
  const common = [...a.keys()].filter(id => b.has(id)).sort((x, y) => a.get(x)! + b.get(x)! - a.get(y)! - b.get(y)!);
  if (!common.length) throw new Error("Estas versiones no tienen una base común."); return findCommit(s, common[0]);
}
export function versionAt(s: DiagramHistory, branchId: string, at: string) {
  const known = ancestors(s, findBranch(s, branchId).head);
  return s.commits.filter(c => known.has(c.id) && Date.parse(c.at) <= Date.parse(at)).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

/** Tres vías por identidad de entidad; eliminar frente a editar es conflicto, nunca resurrección implícita. */
export function mergeProjects(base: SharedProject, ours: SharedProject, theirs: SharedProject, scopes: string[], choices: Choices = {}): MergePreview {
  checkScopes(scopes, base, ours, theirs); const conflicts: MergeConflict[] = [];
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const byId = (v: unknown): v is { id: string }[] => Array.isArray(v) && v.every(x => object(x) && typeof x.id === "string");
  const merge = (b: unknown, o: unknown, t: unknown, path: string[]): unknown => {
    if (equalProject(o, t) || equalProject(b, t)) return clone(o);
    if (equalProject(b, o)) return clone(t);
    if (object(b) && object(o) && object(t)) {
      const result: Record<string, unknown> = Object.create(null);
      for (const k of new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])) {
        const value = merge(b[k], o[k], t[k], [...path, k]); if (value !== undefined) result[k] = value;
      }
      return result;
    }
    if (byId(b) && byId(o) && byId(t)) {
      const bm = new Map(b.map(v => [v.id, v])), om = new Map(o.map(v => [v.id, v])), tm = new Map(t.map(v => [v.id, v]));
      return [...new Set([...o.map(v => v.id), ...t.map(v => v.id), ...b.map(v => v.id)])].map(id => merge(bm.get(id), om.get(id), tm.get(id), [...path, `@${id}`])).filter(v => v !== undefined);
    }
    const id = JSON.stringify(path), choice = enRegistro(choices, id) ? choices[id] : undefined;
    if (choice) return clone(choice === "ours" ? o : t);
    conflicts.push({ id, path: path.join(" / "), base: b, ours: o, theirs: t }); return clone(o);
  };
  const b = encodeProject(base), o = encodeProject(ours), t = encodeProject(theirs), merged = clone(o);
  if (scopes.includes("design")) merged.content = merge(b.content, o.content, t.content, ["Modelo"]) as typeof o.content;
  for (const scope of scopes) if (scope.startsWith("view:")) {
    const id = scope.slice(5), read = (p: typeof b) => p.customViews.find(v => v.id === id);
    const view = merge(read(b), read(o), read(t), [scope]) as typeof o.customViews[number] | undefined;
    const index = merged.customViews.findIndex(v => v.id === id);
    if (view && index >= 0) merged.customViews[index] = view; else if (view) merged.customViews.push(view); else if (index >= 0) merged.customViews.splice(index, 1);
  }
  if (scopes.includes("project")) for (const field of ["name", "references", "agent", "analysis"] as const) (merged as unknown as Record<string, unknown>)[field] = merge(b[field], o[field], t[field], ["Datos comunes", field]);
  const dependencies: string[] = [];
  for (const [name, graph] of [["Modelo", merged.content], ...merged.customViews.filter(v => v.graph).map(v => [v.name, v.graph])] as [string, typeof merged.content][]) {
    const ids = new Set([...graph.nodes.map(n => n.id), ...graph.containers.map(c => c.id)]);
    for (const edge of graph.edges) if (!ids.has(edge.fuente) || !ids.has(edge.destino)) dependencies.push(`${name}: la conexión ${edge.id} necesita sus dos componentes. Resuelve el borrado o incluye ambos extremos.`);
    for (const node of graph.nodes) if (node.parent && !ids.has(node.parent)) dependencies.push(`${name}: ${node.id} necesita el contenedor ${node.parent}.`);
  }
  assertJson(merged); assertEncodedProject(merged);
  return { project: decodeProject(merged).project, conflicts, dependencies };
}

export function previewIncorporation(s: DiagramHistory, branchId: string, commitId: string, draft: SharedProject, scopes: string[], choices: Choices = {}): MergePreview {
  const branch = findBranch(s, branchId), theirs = findCommit(s, commitId).snapshot;
  let result = clone(draft); const conflicts: MergeConflict[] = [], dependencies: string[] = [];
  for (const scope of scopes) {
    const base = commonBase(s, branch.head, commitId, scope).snapshot;
    const next = mergeProjects(base, result, theirs, [scope], choices); result = next.project; conflicts.push(...next.conflicts); dependencies.push(...next.dependencies);
  }
  return { project: result, conflicts, dependencies: [...new Set(dependencies)] };
}

export function executeHistory(input: DiagramHistory, action: HistoryAction, actor: HistoryActor, drafts: Record<string, SharedProject>, at: string): { state: DiagramHistory; writes: Record<string, SharedProject> } {
  if (!action || typeof action.id !== "string" || !/^[\w-]{1,100}$/.test(action.id)) throw new Error("Operación de historial inválida.");
  if (input.operations.includes(action.id)) return { state: input, writes: {} };
  if (actor.role !== "editor") throw new Error("El vínculo permite solo lectura.");
  const s = clone(input), writes: Record<string, SharedProject> = {};
  const requireEdit = (id: string) => { if (!canEditBranch(s, id, actor, at)) throw new Error("No tienes permiso para editar esta rama."); };
  const requireOwner = () => { if (!actor.owner) throw new Error("Solo el anfitrión administra los permisos."); };
  const draft = (id: string) => { if (!enRegistro(drafts, id)) throw new Error("La rama no está cargada."); return drafts[id]; };
  const addCommit = (id: string, branchId: string, snapshot: SharedProject, scopes: string[], message: string, kind: DiagramCommit["kind"]) => {
    const branch = findBranch(s, branchId);
    if (s.commits.some(c => c.id === id)) throw new Error("La versión ya existe con otra operación.");
    assertEncodedProject(encodeProject(snapshot));
    s.commits.push({ id, branchId, parents: [branch.head], snapshot: clone(snapshot), scopes: [...scopes], message: message.trim().slice(0, 500), kind, at, author: { id: actor.id, name: actor.name.slice(0, 40) } }); branch.head = id;
    return s.commits[s.commits.length - 1];
  };
  const checkpoint = (branchId: string) => addCommit(`${action.id}-before`, branchId, draft(branchId), scopeOptions(draft(branchId)).map(v => v.id), "Punto de recuperación antes de incorporar cambios", "recovery");
  switch (action.type) {
    case "branch": {
      if (s.branches.some(b => b.id === action.branchId || b.name === action.name.trim()) || !/^[\w-]{1,100}$/.test(action.branchId) || !action.name.trim() || action.name.length > 80) throw new Error("Elige un nombre de rama nuevo y válido.");
      const commit = findCommit(s, action.fromCommit); s.branches.push({ id: action.branchId, name: action.name.trim(), head: commit.id, creator: actor.id }); writes[action.branchId] = clone(commit.snapshot); break;
    }
    case "commit": {
      requireEdit(action.branchId); if (!action.message.trim()) throw new Error("Describe esta versión.");
      const head = findCommit(s, findBranch(s, action.branchId).head);
      const snapshot = selectScopes(head.snapshot, draft(action.branchId), action.scopes);
      addCommit(action.id, action.branchId, snapshot, action.scopes, action.message, "commit"); break;
    }
    case "permission": {
      requireOwner(); const p = action.permission;
      if (!action.memberId || action.memberId.length > 200 || p.until && (!Number.isFinite(Date.parse(p.until)) || Date.parse(p.until) <= Date.parse(at))) throw new Error("Permiso o vencimiento inválido.");
      Object.defineProperty(s.permissions, action.memberId, { value: clone(p), enumerable: true, writable: true, configurable: true }); break;
    }
    case "editors": requireOwner(); findBranch(s, action.branchId).editors = action.editors ? [...new Set(action.editors)] : undefined; break;
    case "propose": {
      requireEdit(action.branchId); const branch = findBranch(s, action.branchId); findBranch(s, action.targetId);
      if (action.branchId === action.targetId || !ancestors(s, branch.head).has(action.commitId)) throw new Error("Selecciona una versión de una rama diferente al destino.");
      const c = findCommit(s, action.commitId); checkScopes(action.scopes, c.snapshot, findCommit(s, findBranch(s, action.targetId).head).snapshot);
      s.proposals.push({ ...action, author: { id: actor.id, name: actor.name }, at, status: "open" }); break;
    }
    case "reject": {
      const p = s.proposals.find(p => p.id === action.proposalId && p.status === "open"); if (!p) throw new Error("La solicitud ya se resolvió.");
      if (p.targetId === "main" ? !canManage(s, actor, "mergeMain", at, p.id) : !canEditBranch(s, p.targetId, actor, at)) throw new Error("No tienes permiso para revisar esta solicitud."); p.status = "rejected"; break;
    }
    case "restore": {
      if (action.branchId === "main") { if (!canManage(s, actor, "restoreMain", at)) throw new Error("No tienes permiso para restaurar Principal."); } else requireEdit(action.branchId);
      const old = findCommit(s, action.commitId), restored = selectScopes(draft(action.branchId), old.snapshot, action.scopes);
      checkpoint(action.branchId); addCommit(action.id, action.branchId, restored, action.scopes, `Restaurar: ${old.message}`, "restore"); writes[action.branchId] = restored; break;
    }
    case "pull": case "merge": {
      const p = action.type === "merge" ? s.proposals.find(p => p.id === action.proposalId && p.status === "open") : undefined;
      if (action.type === "merge" && !p) throw new Error("La solicitud ya se resolvió.");
      const branchId = p ? p.targetId : (action as Extract<HistoryAction, { type: "pull" }>).branchId;
      const commitId = p ? p.commitId : (action as Extract<HistoryAction, { type: "pull" }>).commitId;
      if (p && branchId === "main") { if (!canManage(s, actor, "mergeMain", at, p.id)) throw new Error("No tienes permiso para fusionar hacia Principal."); } else requireEdit(branchId);
      if (findBranch(s, branchId).head !== action.expectedHead) throw new Error("El destino cambió. Revisa de nuevo antes de confirmar.");
      const scopes = action.scopes ?? p!.scopes;
      if (p && scopes.some(scope => !p.scopes.includes(scope))) throw new Error("La selección excede las vistas solicitadas.");
      const preview = previewIncorporation(s, branchId, commitId, draft(branchId), scopes, action.choices);
      if (preview.conflicts.length || preview.dependencies.length) throw new Error("Resuelve los conflictos y dependencias antes de incorporar los cambios.");
      checkpoint(branchId); const c = addCommit(action.id, branchId, preview.project, scopes, p ? `Incorporar: ${p.message}` : "Traer cambios revisados", p ? "merge" : "pull");
      c.mergeParent = commitId; c.mergedScopes = [...scopes]; writes[branchId] = preview.project;
      if (p) { p.scopes = p.scopes.filter(scope => !scopes.includes(scope)); if (!p.scopes.length) p.status = "merged"; }
      break;
    }
    default: throw new Error("Acción de historial desconocida.");
  }
  s.operations.push(action.id); s.revision++; return { state: s, writes };
}
