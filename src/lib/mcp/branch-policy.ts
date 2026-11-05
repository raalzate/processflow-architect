import type { Role } from "../collaboration/types";
export interface AiBranchContext {
  branchId: string; branchName?: string; owner: boolean; role: Role; canEdit: boolean; saved: boolean; initialized: boolean; preview?: boolean;
}
/** La IA usa el permiso de su dispositivo; editar Principal con IA queda reservado al anfitrión. */
export function aiBranchPolicy(context?: AiBranchContext): { allowed: boolean; error?: string } {
  if (!context) return { allowed: true };
  if (context.preview) return { allowed: false, error: "Estás consultando una versión anterior. Vuelve al trabajo actual antes de editar con IA." };
  if (context.branchId === "main" && !context.owner) return { allowed: false, error: "Sólo la IA del anfitrión puede editar Principal. Selecciona una rama de trabajo para proponer los cambios." };
  if (context.role !== "editor" || !context.canEdit) return { allowed: false, error: "Esta rama es de solo lectura para este dispositivo. Selecciona una rama autorizada para la IA." };
  if (!context.saved || !context.initialized) return { allowed: false, error: "Espera a que la rama esté cargada y guardada antes de editar con IA." };
  return { allowed: true };
}
export interface AiResultTarget { fileId: string | null; scope?: string; readOnly: boolean }
export function aiResultStillApplies(start: AiResultTarget, current: AiResultTarget): boolean {
  return !current.readOnly && start.fileId === current.fileId && start.scope === current.scope;
}
