import type { Choices, MergePreview } from "@/lib/collaboration/history";
import { guardExport } from "@/lib/export-gate";

export const formatBranchDate = (at: string) =>
  new Date(at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });

export const showConflictValue = (value: unknown) =>
  value === undefined ? "Eliminado / sin valor" : typeof value === "string" ? value : JSON.stringify(value);

export function downloadBoardJson(value: unknown, name: string) {
  if (!guardExport()) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ReviewState {
  mode: "pull" | "restore" | "compare";
  branchId: string;
  commitId: string;
  scopes: string[];
  head: string;
  vector: string;
  proposalId?: string;
  choices: Choices;
  preview: MergePreview;
}
