"use client";

import { Check } from "lucide-react";
import { ChangesBeforeAfter } from "@/components/collaboration/ChangesBeforeAfter";
import { showConflictValue, type ReviewState } from "@/components/collaboration/branch-utils";
import { Button } from "@/components/ui/button";
import { describeMergeConflictPath } from "@/lib/collaboration/field-conflicts";
import {
  canEditBranch,
  canManage,
  scopeOptions,
  type Choices,
  type HistoryAction,
} from "@/lib/collaboration/history";
import type { CollaborationWorkspace } from "@/lib/collaboration/types";
import { cn } from "@/lib/utils";

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

  const availableScopes = scopeOptions(targetSnapshot, incomingSnapshot).filter(
    o =>
      !review.proposalId ||
      s.proposals.find(p => p.id === review.proposalId)!.scopes.includes(o.id),
  );

  const hasConflictArea =
    resolvedCount > 0 ||
    review.preview.conflicts.length > 0 ||
    review.preview.dependencies.length > 0;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-2.5"
      aria-label="Revisión antes de incorporar"
    >
      {availableScopes.length > 1 && review.mode !== "compare" ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-muted-foreground">Incluir:</span>
            {availableScopes.map(option => {
              const checked = review.scopes.includes(option.id);
              const shortName = option.id === "project" ? "Datos comunes" : option.name;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => {
                    const next = checked
                      ? review.scopes.filter(v => v !== option.id)
                      : [...review.scopes, option.id];
                    if (next.length > 0) {
                      onRestartReview(
                        review.branchId,
                        review.commitId,
                        next,
                        review.proposalId,
                        review.choices,
                        review.mode,
                      );
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
                    checked
                      ? "border-primary/50 bg-primary/15 font-medium text-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {checked ? <Check className="h-3 w-3 text-primary" aria-hidden="true" /> : null}
                  {shortName}
                </button>
              );
            })}
          </div>
          {review.scopes.length < availableScopes.length ? (
            <button
              type="button"
              onClick={() =>
                onRestartReview(
                  review.branchId,
                  review.commitId,
                  availableScopes.map(o => o.id),
                  review.proposalId,
                  review.choices,
                  review.mode,
                )
              }
              className="text-xs font-medium text-primary hover:underline"
            >
              Incluir todas
            </button>
          ) : null}
        </div>
      ) : null}

      <ChangesBeforeAfter
        before={targetSnapshot}
        after={review.preview.project}
        activeScopes={review.scopes}
      />

      {hasConflictArea ? (
        <div className="max-h-36 shrink-0 space-y-2 overflow-y-auto pr-1">
          {resolvedCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
              <span>
                {resolvedCount === 1
                  ? "1 conflicto resuelto manualmente"
                  : `${resolvedCount} conflictos resueltos manualmente`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
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
            <fieldset key={conflict.id} className="space-y-1.5 rounded-md border bg-card p-2.5">
              <legend className="px-1 text-xs font-semibold">
                Conflicto: {describeMergeConflictPath(conflict.path, targetSnapshot, incomingSnapshot)}
              </legend>
              <p className="break-all text-2xs text-muted-foreground">
                Base anterior: {showConflictValue(conflict.base)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto max-w-full py-1 text-left text-xs whitespace-normal"
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
                  Conservar lo actual: {showConflictValue(conflict.ours)?.slice(0, 140)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto max-w-full py-1 text-left text-xs whitespace-normal"
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
                  Usar lo recibido: {showConflictValue(conflict.theirs)?.slice(0, 140)}
                </Button>
              </div>
            </fieldset>
          ))}

          {review.preview.dependencies.map(text => (
            <p key={text} role="alert" className="text-xs text-destructive">
              {text}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-2.5">
        <p className="text-2xs text-muted-foreground">
          Se guarda un respaldo automático · Arrastra el diagrama para mover · Rueda para zoom · Clic en un elemento para ver su descripción.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          {review.proposalId && onRejectProposal && canConfirm ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRejectProposal(review.proposalId!)}
            >
              Rechazar
            </Button>
          ) : null}
          {review.mode !== "compare" ? (
            <Button
              size="sm"
              disabled={
                busy ||
                !!review.preview.conflicts.length ||
                !!review.preview.dependencies.length ||
                !canConfirm
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
        </div>
      </div>
    </section>
  );
}
