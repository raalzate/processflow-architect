"use client";

import { Button } from "@/components/ui/button";
import { ChangesBeforeAfter } from "@/components/collaboration/ChangesBeforeAfter";
import { ScopeSelection } from "@/components/collaboration/ScopeSelection";
import { showConflictValue, type ReviewState } from "@/components/collaboration/branch-utils";
import { describeMergeConflictPath } from "@/lib/collaboration/field-conflicts";
import {
  canEditBranch,
  canManage,
  scopeOptions,
  type Choices,
  type HistoryAction,
} from "@/lib/collaboration/history";
import type { CollaborationWorkspace } from "@/lib/collaboration/types";

export function BranchReviewPanel({
  review,
  workspace,
  busy,
  connected,
  at,
  onRestartReview,
  onConfirm,
  onRejectProposal,
  onCancel,
}: {
  review: ReviewState;
  workspace: CollaborationWorkspace;
  busy: boolean;
  connected: boolean;
  at: string;
  onRestartReview: (
    branchId: string,
    commitId: string,
    scopes: string[],
    proposalId?: string,
    choices?: Choices,
    mode?: ReviewState["mode"],
  ) => void;
  onConfirm: (action: HistoryAction, vector: string) => void;
  onRejectProposal?: (proposalId: string) => void;
  onCancel: () => void;
}) {
  const s = workspace.history;
  const targetSnapshot = workspace.snapshots[review.branchId];
  const incomingSnapshot = s.commits.find(v => v.id === review.commitId)!.snapshot;
  const resolvedCount = Object.keys(review.choices).length;
  const canConfirm = review.proposalId
    ? canManage(s, workspace.actor, "mergeMain", at, review.proposalId) && connected
    : review.mode === "restore" && review.branchId === "main"
      ? canManage(s, workspace.actor, "restoreMain", at)
      : canEditBranch(s, review.branchId, workspace.actor, at);

  return (
    <section
      className="space-y-3 rounded-md border-2 border-primary p-4"
      aria-label="Revisión antes de incorporar"
    >
      <h3 className="font-semibold">
        {review.mode === "compare"
          ? "Comparar versión con"
          : review.mode === "restore"
            ? "Revisar restauración de"
            : "Revisar incorporación a"}{" "}
        {s.branches.find(b => b.id === review.branchId)?.name}
      </h3>
      <p className="text-xs text-muted-foreground">
        Se guarda un respaldo automático antes de aplicar los cambios.
      </p>
      <ScopeSelection
        options={scopeOptions(targetSnapshot, incomingSnapshot).filter(
          o => !review.proposalId || s.proposals.find(p => p.id === review.proposalId)!.scopes.includes(o.id),
        )}
        selected={review.scopes}
        onChange={selected => {
          if (selected.length)
            onRestartReview(
              review.branchId,
              review.commitId,
              selected,
              review.proposalId,
              review.choices,
              review.mode,
            );
        }}
      />
      <ChangesBeforeAfter before={targetSnapshot} after={review.preview.project} />
      {resolvedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-2 text-xs">
          <span>
            {resolvedCount === 1
              ? "1 conflicto resuelto manualmente"
              : `${resolvedCount} conflictos resueltos manualmente`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onRestartReview(
                review.branchId,
                review.commitId,
                review.scopes,
                review.proposalId,
                {},
                review.mode,
              )
            }
          >
            Reiniciar elecciones
          </Button>
        </div>
      ) : null}
      {review.preview.conflicts.map(conflict => (
        <fieldset key={conflict.id} className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Conflicto: {describeMergeConflictPath(conflict.path, targetSnapshot, incomingSnapshot)}
          </legend>
          <p className="break-all text-xs text-muted-foreground">Antes: {showConflictValue(conflict.base)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto max-w-full whitespace-normal text-left"
              onClick={() =>
                onRestartReview(
                  review.branchId,
                  review.commitId,
                  review.scopes,
                  review.proposalId,
                  { ...review.choices, [conflict.id]: "ours" },
                  review.mode,
                )
              }
            >
              Conservar lo actual: {showConflictValue(conflict.ours)?.slice(0, 180)}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto max-w-full whitespace-normal text-left"
              onClick={() =>
                onRestartReview(
                  review.branchId,
                  review.commitId,
                  review.scopes,
                  review.proposalId,
                  { ...review.choices, [conflict.id]: "theirs" },
                  review.mode,
                )
              }
            >
              Usar lo recibido: {showConflictValue(conflict.theirs)?.slice(0, 180)}
            </Button>
          </div>
        </fieldset>
      ))}
      {review.preview.dependencies.map(text => (
        <p key={text} role="alert" className="text-sm text-destructive">
          {text}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        {review.mode !== "compare" ? (
          <Button
            disabled={
              busy || !!review.preview.conflicts.length || !!review.preview.dependencies.length || !canConfirm
            }
            onClick={() => {
              const action: HistoryAction = review.proposalId
                ? {
                    type: "merge",
                    id: crypto.randomUUID(),
                    proposalId: review.proposalId,
                    expectedHead: review.head,
                    choices: review.choices,
                    scopes: review.scopes,
                  }
                : review.mode === "restore"
                  ? {
                      type: "restore",
                      id: crypto.randomUUID(),
                      branchId: review.branchId,
                      commitId: review.commitId,
                      scopes: review.scopes,
                    }
                  : {
                      type: "pull",
                      id: crypto.randomUUID(),
                      branchId: review.branchId,
                      commitId: review.commitId,
                      expectedHead: review.head,
                      choices: review.choices,
                      scopes: review.scopes,
                    };
              onConfirm(action, review.vector);
            }}
          >
            {review.proposalId
              ? "Aprobar y fusionar"
              : review.mode === "restore"
                ? "Confirmar restauración"
                : "Confirmar incorporación"}
          </Button>
        ) : null}
        {review.proposalId && onRejectProposal && canConfirm ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onRejectProposal(review.proposalId!)}
          >
            Rechazar
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}
