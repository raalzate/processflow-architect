import type { DiagramHistory, HistoryAction, HistoryActor, Choices } from "../collaboration/history";
import { parseHistoryAction } from "../collaboration/history-validation";

export interface CollaborationAppRequest {
  kind: "collaboration";
  command: "inspect" | "switch" | "preview" | "return" | "history" | "preview-merge" | "resolve-field" | "repair-connection";
  viewId?: string;
  edgeId?: string;
  sourceId?: string;
  targetId?: string;
  branchId?: string;
  commitId?: string;
  action?: HistoryAction;
  scopes?: string[];
  choices?: Choices;
  expectedVector?: string;
  editId?: string;
  keep?: "current" | "discarded";
}

/** Complementa los permisos humanos del motor: ninguna delegación autoriza IA invitada en Principal. */
export function assertAiHistoryAction(raw: HistoryAction, history: DiagramHistory, actor: HistoryActor): HistoryAction {
  const action = parseHistoryAction(raw);
  if ((action.type === "merge" || action.type === "reject") && !history.proposals.some(p => p.id === action.proposalId)) throw new Error("La solicitud no está disponible. Consulta el historial actualizado antes de continuar.");
  const target = action.type === "merge" || action.type === "reject" ? history.proposals.find(p => p.id === action.proposalId)?.targetId : "branchId" in action ? action.branchId : undefined;
  if (!actor.owner && (action.type === "permission" || (target === "main" && action.type !== "propose"))) throw new Error("La IA solo puede modificar Principal o conceder permisos desde el equipo del anfitrión.");
  if (actor.role !== "editor") throw new Error("Tu acceso es de solo lectura.");
  return action;
}
