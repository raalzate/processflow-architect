"use client";

import { useState } from "react";
import { History, Save, ArrowDownToLine, ShieldCheck, GitPullRequest, Plus, X } from "lucide-react";
import { useCollaboration } from "@/context/CollaborationContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BranchPermissionsPanel } from "@/components/collaboration/BranchPermissionsPanel";
import { BranchReviewPanel } from "@/components/collaboration/BranchReviewPanel";
import { CommitTree } from "@/components/collaboration/CommitTree";
import { FieldConflictsNotice } from "@/components/collaboration/FieldConflictsNotice";
import { ScopeSelection } from "@/components/collaboration/ScopeSelection";
import {
  downloadBoardJson,
  formatBranchDate,
  selectStyle,
  type ReviewState,
} from "@/components/collaboration/branch-utils";
import {
  canEditBranch,
  canManage,
  scopeOptions,
  selectScopes,
  projectDependencies,
  versionAt,
  type Choices,
  type HistoryAction,
} from "@/lib/collaboration/history";
import { packBoard } from "@/lib/board-file";
import { deRegistro } from "@/lib/registro";

type InlinePanel = "none" | "new-branch" | "save" | "propose";
type ModalSection = "history" | "requests" | "permissions" | "review";

export function BranchControl() {
  const c = useCollaboration();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [inlinePanel, setInlinePanel] = useState<InlinePanel>("none");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [section, setSection] = useState<ModalSection>("history");
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [message, setMessage] = useState(""),
    [branchName, setBranchName] = useState("");
  const [selection, setSelection] = useState<{ branch: string; scopes: string[] }>();
  const [proposeSelection, setProposeSelection] = useState<{ commitId: string; scopes: string[] }>();
  const [selectedCommit, setSelectedCommit] = useState<string>(),
    [review, setReview] = useState<ReviewState>();
  const [notice, setNotice] = useState(""),
    [localError, setLocalError] = useState("");

  if (!c?.workspace || !c.status) return null;
  const w = c.workspace,
    s = w.history,
    branch = s.branches.find(b => b.id === c.branchId) ?? s.branches[1];
  const draft = deRegistro(w.snapshots, branch.id) ?? w.snapshots.shared,
    head = s.commits.find(v => v.id === branch.head)!;
  const chosen = s.commits.find(v => v.id === selectedCommit) ?? head;
  const options = scopeOptions(head.snapshot, draft, chosen.snapshot);
  const scopes =
    selection?.branch === branch.id
      ? selection.scopes.filter(id => options.some(o => o.id === id))
      : options.map(o => o.id);
  const setScopes = (nextScopes: string[]) => setSelection({ branch: branch.id, scopes: nextScopes });

  const proposeOptions = scopeOptions(head.snapshot, w.snapshots.main);
  const defaultProposeScopes = head.scopes.filter(id => proposeOptions.some(o => o.id === id));
  const proposeScopes =
    proposeSelection?.commitId === head.id
      ? proposeSelection.scopes.filter(id => proposeOptions.some(o => o.id === id))
      : defaultProposeScopes.length
        ? defaultProposeScopes
        : proposeOptions.map(o => o.id);

  const at = new Date().toISOString(),
    owner = w.actor.owner,
    canCreateBranch = w.actor.role === "editor",
    editable = canEditBranch(s, branch.id, w.actor, at),
    canRestoreBranch = branch.id === "main" ? canManage(s, w.actor, "restoreMain", at) : editable;

  const pendingProposals = s.proposals.filter(p => p.status === "open" && p.targetId === "main");
  const reviewableProposals = pendingProposals.filter(p => canManage(s, w.actor, "mergeMain", at, p.id));
  const canSeeRequests =
    owner ||
    canManage(s, w.actor, "mergeMain", at) ||
    s.proposals.some(p => canManage(s, w.actor, "mergeMain", at, p.id));
  const myPendingProposals = !canSeeRequests ? pendingProposals.filter(p => p.author.id === w.actor.id) : [];
  const unacknowledgedProposals = owner
    ? reviewableProposals.filter(p => !dismissedAlerts.includes(p.id))
    : [];
  const branchFieldConflicts = w.discardedEdits ? (deRegistro(w.discardedEdits, branch.id) ?? []) : [];

  const roleLabel = owner ? "Anfitrión" : w.actor.role === "viewer" ? "Huésped · Lectura" : "Huésped";

  const run = async (operation: () => Promise<void>) => {
    setLocalError("");
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };
  const perform = async (action: HistoryAction, vector?: string, feedback = "Guardado.") => {
    await c.historyAction(action, vector);
    setNotice(feedback);
  };
  const chooseVersion = async (id: string) => {
    setSelectedCommit(id);
    await c.previewVersion(id);
  };
  const openSection = (next: ModalSection) => {
    setPopoverOpen(false);
    if (next !== "review") setReview(undefined);
    setSection(next);
    setDialogOpen(true);
  };
  const startReview = async (
    targetBranchId: string,
    commitId: string,
    selected: string[],
    proposalId?: string,
    choices: Choices = {},
    mode: ReviewState["mode"] = "pull",
  ) => {
    if (mode !== "pull") {
      const commit = s.commits.find(item => item.id === commitId)!;
      const targetDraft = deRegistro(w.snapshots, targetBranchId)!;
      const project = selectScopes(targetDraft, commit.snapshot, selected);
      setReview({
        mode,
        branchId: targetBranchId,
        commitId,
        scopes: selected,
        choices,
        head: s.branches.find(b => b.id === targetBranchId)!.head,
        vector: deRegistro(w.vectors, targetBranchId) ?? "",
        preview: { project, conflicts: [], dependencies: projectDependencies(project) },
      });
      openSection("review");
      return;
    }
    const result = await c.previewMerge(targetBranchId, commitId, selected, choices);
    if (result.preview && result.workspace) {
      setReview({
        mode,
        branchId: targetBranchId,
        commitId,
        scopes: selected,
        proposalId,
        choices,
        preview: result.preview,
        head: result.workspace.history.branches.find(b => b.id === targetBranchId)!.head,
        vector: deRegistro(result.workspace.vectors, targetBranchId) ?? "",
      });
      openSection("review");
    }
  };

  const openProposalReview = (proposalId: string) => {
    const proposal = s.proposals.find(p => p.id === proposalId);
    if (!proposal) return;
    void run(() => startReview(proposal.targetId, proposal.commitId, proposal.scopes, proposal.id));
  };

  const hasExtraModalTabs = canSeeRequests || owner;

  return (
    <>
      {c.previewCommitId ? (
        <Button variant="secondary" size="sm" onClick={() => void run(() => c.previewVersion())}>
          Volver al trabajo actual
        </Button>
      ) : null}

      <Popover
        open={popoverOpen}
        onOpenChange={next => {
          setPopoverOpen(next);
          if (!next) {
            setInlinePanel("none");
            setNotice("");
            setLocalError("");
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant={reviewableProposals.length ? "secondary" : "outline"}
            className="gap-2"
            aria-label="Ramas y versiones"
            data-branch-trigger=""
          >
            <GitPullRequest className="h-4 w-4" aria-hidden="true" />
            <span className="max-w-36 truncate">{branch.name}</span>
            {reviewableProposals.length ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-foreground tabular-nums">
                {reviewableProposals.length}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          data-branch-controls=""
          className="max-h-[80vh] w-[min(22rem,calc(100vw-2rem))] space-y-3 overflow-y-auto p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <GitPullRequest className="h-4 w-4 text-primary" aria-hidden="true" />
              Ramas
            </span>
            <Badge variant={owner ? "default" : w.actor.role === "viewer" ? "outline" : "secondary"}>
              {roleLabel}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="current-branch" className="text-xs text-muted-foreground">
              Rama activa
            </Label>
            <div className="flex items-center gap-1.5">
              <select
                id="current-branch"
                className={`${selectStyle} min-w-0 flex-1 font-medium`}
                value={branch.id}
                disabled={c.busy || c.pending > 0}
                onChange={e => {
                  setSelectedCommit(undefined);
                  setSelection(undefined);
                  setProposeSelection(undefined);
                  setInlinePanel("none");
                  void run(() => c.selectBranch(e.target.value));
                }}
              >
                {s.branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {canCreateBranch ? (
                <Button
                  type="button"
                  variant={inlinePanel === "new-branch" ? "secondary" : "outline"}
                  size="sm"
                  className="h-10 shrink-0 gap-1 px-2.5"
                  disabled={c.busy}
                  onClick={() => setInlinePanel(prev => (prev === "new-branch" ? "none" : "new-branch"))}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nueva
                </Button>
              ) : null}
            </div>
            {!editable ? (
              <p className="text-xs text-muted-foreground">
                {w.actor.role === "viewer"
                  ? "Solo lectura."
                  : branch.id === "main"
                    ? "Solo lectura aquí. Elige otra rama o crea una para editar."
                    : "No tienes permiso de edición en esta rama."}
              </p>
            ) : null}
          </div>

          {canCreateBranch && inlinePanel === "new-branch" ? (
            <form
              className="space-y-2 rounded-md border bg-muted/20 p-2.5"
              onSubmit={e => {
                e.preventDefault();
                void run(async () => {
                  const id = crypto.randomUUID();
                  await perform(
                    {
                      type: "branch",
                      id: crypto.randomUUID(),
                      branchId: id,
                      name: branchName,
                      fromCommit: c.previewCommitId ?? chosen.id,
                    },
                    undefined,
                    "Rama creada.",
                  );
                  setBranchName("");
                  setInlinePanel("none");
                  await c.selectBranch(id);
                });
              }}
            >
              <Label htmlFor="new-branch" className="text-xs">
                Nombre de la nueva rama
              </Label>
              <div className="flex gap-1.5">
                <Input
                  id="new-branch"
                  autoFocus
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  placeholder="Ej: Mi propuesta"
                  maxLength={80}
                  className="h-8 text-xs"
                  required
                />
                <Button type="submit" size="sm" className="h-8" disabled={c.busy || !branchName.trim()}>
                  Crear rama
                </Button>
              </div>
            </form>
          ) : null}

          {reviewableProposals.length ? (
            <div className="space-y-2 rounded-md border border-primary/40 bg-primary/10 p-2.5" role="status">
              <p className="text-xs font-semibold">
                {reviewableProposals.length === 1
                  ? "1 solicitud pendiente para fusionar"
                  : `${reviewableProposals.length} solicitudes pendientes para fusionar`}
              </p>
              {reviewableProposals.slice(0, 3).map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    <strong>{p.author.name}:</strong> {p.message}
                  </span>
                  <Button
                    size="sm"
                    className="h-7 shrink-0 px-2.5 text-xs"
                    disabled={c.busy}
                    onClick={() => openProposalReview(p.id)}
                  >
                    Revisar y fusionar
                  </Button>
                </div>
              ))}
              {reviewableProposals.length > 3 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-full text-xs"
                  onClick={() => openSection("requests")}
                >
                  Ver todas ({reviewableProposals.length})
                </Button>
              ) : null}
            </div>
          ) : null}

          {myPendingProposals.length ? (
            <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
              Enviado al anfitrión: «{myPendingProposals[0].message}» (en espera)
            </p>
          ) : null}

          {c.previewCommitId ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-2 text-xs">
              <span className="min-w-0 truncate">
                Viendo: <strong>{s.commits.find(v => v.id === c.previewCommitId)?.message}</strong>
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => void run(() => c.previewVersion())}
              >
                Volver
              </Button>
            </div>
          ) : null}

          {editable && !c.previewCommitId && branchFieldConflicts.length ? (
            <FieldConflictsNotice
              edits={branchFieldConflicts}
              disabled={c.busy}
              onResolve={(editId, keep) => void run(() => c.resolveFieldConflict(editId, keep))}
            />
          ) : null}

          {editable && !c.previewCommitId ? (
            <div className="space-y-2 border-t pt-2.5">
              <div className={branch.id !== "main" ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-1 gap-1.5"}>
                <Button
                  size="sm"
                  variant={inlinePanel === "save" ? "secondary" : "default"}
                  className="gap-1.5 text-xs"
                  disabled={c.busy}
                  onClick={() => setInlinePanel(prev => (prev === "save" ? "none" : "save"))}
                >
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  Guardar versión
                </Button>
                {branch.id !== "main" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    disabled={c.busy}
                    onClick={() =>
                      void run(async () => {
                        const main = s.branches.find(b => b.id === "main")!;
                        await startReview(
                          branch.id,
                          main.head,
                          scopeOptions(draft, w.snapshots.main).map(o => o.id),
                        );
                      })
                    }
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />
                    Traer cambios
                  </Button>
                ) : null}
              </div>

              {inlinePanel === "save" ? (
                <form
                  className="space-y-2 rounded-md border bg-muted/20 p-2.5"
                  onSubmit={e => {
                    e.preventDefault();
                    void run(async () => {
                      await perform(
                        {
                          type: "commit",
                          id: crypto.randomUUID(),
                          branchId: branch.id,
                          scopes,
                          message,
                        },
                        undefined,
                        "Versión guardada.",
                      );
                      setMessage("");
                      setProposeSelection(undefined);
                      setInlinePanel("none");
                    });
                  }}
                >
                  <Label htmlFor="version-message" className="text-xs">
                    Nombre corto del cambio
                  </Label>
                  <Input
                    id="version-message"
                    autoFocus
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Ej: Ajustar urgencias"
                    maxLength={500}
                    className="h-8 text-xs"
                    required
                  />
                  {options.length > 1 ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Vistas incluidas ({scopes.length}/{options.length})
                      </summary>
                      <div className="pt-2">
                        <ScopeSelection options={options} selected={scopes} onChange={setScopes} />
                      </div>
                    </details>
                  ) : null}
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 w-full text-xs"
                    disabled={c.busy || !scopes.length || !message.trim()}
                  >
                    Guardar
                  </Button>
                </form>
              ) : null}

              {branch.id !== "main" ? (
                <>
                  <Button
                    size="sm"
                    variant={inlinePanel === "propose" ? "secondary" : "outline"}
                    className="w-full gap-1.5 text-xs"
                    disabled={c.busy || head.kind === "initial" || w.pending > 0}
                    title={head.kind === "initial" ? "Guarda una versión antes de enviar" : undefined}
                    onClick={() => setInlinePanel(prev => (prev === "propose" ? "none" : "propose"))}
                  >
                    <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                    {owner ? "Fusionar rama en Principal" : "Enviar al anfitrión para fusionar"}
                  </Button>
                  {head.kind === "initial" ? (
                    <p className="text-2xs text-muted-foreground">
                      Guarda una versión cuando quieras enviarla a Principal.
                    </p>
                  ) : null}
                  {inlinePanel === "propose" && head.kind !== "initial" ? (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-2.5 text-xs">
                      <p className="truncate">
                        Versión: <strong>{head.message}</strong>
                      </p>
                      {proposeOptions.length > 1 ? (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">
                            Vistas a enviar ({proposeScopes.length}/{proposeOptions.length})
                          </summary>
                          <div className="pt-2">
                            <ScopeSelection
                              options={proposeOptions}
                              selected={proposeScopes}
                              onChange={next => setProposeSelection({ commitId: head.id, scopes: next })}
                            />
                          </div>
                        </details>
                      ) : null}
                      <Button
                        size="sm"
                        className="h-8 w-full gap-1.5 text-xs"
                        disabled={c.busy || !proposeScopes.length || w.pending > 0}
                        onClick={() =>
                          void run(async () => {
                            const proposalId = crypto.randomUUID();
                            await perform(
                              {
                                type: "propose",
                                id: proposalId,
                                branchId: branch.id,
                                targetId: "main",
                                commitId: head.id,
                                scopes: proposeScopes,
                                message: head.message,
                              },
                              undefined,
                              owner ? "Lista para revisar y fusionar." : "Solicitud enviada al anfitrión.",
                            );
                            setInlinePanel("none");
                            if (owner) {
                              setDismissedAlerts(prev => [...new Set([...prev, proposalId])]);
                              await startReview("main", head.id, proposeScopes, proposalId);
                            }
                          })
                        }
                      >
                        <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                        {owner ? "Revisar y fusionar ahora" : "Enviar solicitud"}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={() => openSection("history")}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              Historial
            </Button>
            {canSeeRequests ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => openSection("requests")}
              >
                <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
                Solicitudes{reviewableProposals.length ? ` (${reviewableProposals.length})` : ""}
              </Button>
            ) : null}
            {owner ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => openSection("permissions")}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Permisos
              </Button>
            ) : null}
          </div>

          {w.recoveries.length ? (
            <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs">
              <span className="text-muted-foreground">Respaldo disponible ({w.recoveries.length})</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  const first = w.recoveries.find(r => r.snapshot);
                  if (!first?.snapshot) return;
                  downloadBoardJson(
                    packBoard(
                      first.snapshot.content,
                      {
                        customViews: first.snapshot.customViews,
                        activeViewId: "design",
                        injectedViewIds: [],
                      },
                      first.snapshot,
                    ),
                    "trabajo-recuperado.json",
                  );
                }}
              >
                Descargar
              </Button>
            </div>
          ) : null}

          {localError || c.error ? (
            <p role="alert" className="text-xs text-destructive">
              {localError || c.error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>

      {unacknowledgedProposals.length > 0 && !dialogOpen ? (
        <aside
          role="status"
          aria-live="polite"
          data-merge-alert=""
          className="fixed right-4 bottom-24 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-primary/40 bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <GitPullRequest className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="truncate text-sm font-semibold">
                {unacknowledgedProposals.length === 1
                  ? "Solicitud para fusionar"
                  : `${unacknowledgedProposals.length} solicitudes para fusionar`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              aria-label="Cerrar alerta de fusión"
              title="Cerrar alerta"
              onClick={() =>
                setDismissedAlerts(prev => [...new Set([...prev, ...unacknowledgedProposals.map(p => p.id)])])
              }
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {unacknowledgedProposals[0].author.name}: «{unacknowledgedProposals[0].message}»
          </p>
          <div className="mt-2.5 flex justify-end">
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={c.busy}
              onClick={() => openProposalReview(unacknowledgedProposals[0].id)}
            >
              <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />
              Revisar y fusionar
            </Button>
          </div>
        </aside>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={next => {
          setDialogOpen(next);
          if (!next) setReview(undefined);
        }}
      >
        <DialogContent className="flex max-h-[88vh] w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <DialogTitle>
                {section === "review"
                  ? "Revisar cambios"
                  : section === "requests"
                    ? "Solicitudes de fusión"
                    : section === "permissions"
                      ? "Permisos de ramas"
                      : `Historial · ${branch.name}`}
              </DialogTitle>
              <Badge variant={owner ? "default" : w.actor.role === "viewer" ? "outline" : "secondary"}>
                {roleLabel}
              </Badge>
            </div>
            <DialogDescription className="sr-only">
              Gestión de versiones y revisiones de la rama {branch.name}.
            </DialogDescription>
          </DialogHeader>

          {section !== "review" && hasExtraModalTabs ? (
            <nav className="flex flex-wrap gap-1.5 border-b pb-2.5" aria-label="Secciones">
              <Button
                size="sm"
                variant={section === "history" ? "secondary" : "ghost"}
                aria-pressed={section === "history"}
                onClick={() => {
                  setSection("history");
                  setReview(undefined);
                }}
              >
                Historial
              </Button>
              {canSeeRequests ? (
                <Button
                  size="sm"
                  variant={section === "requests" ? "secondary" : "ghost"}
                  aria-pressed={section === "requests"}
                  onClick={() => {
                    setSection("requests");
                    setReview(undefined);
                  }}
                >
                  Solicitudes{reviewableProposals.length ? ` (${reviewableProposals.length})` : ""}
                </Button>
              ) : null}
              {owner ? (
                <Button
                  size="sm"
                  variant={section === "permissions" ? "secondary" : "ghost"}
                  aria-pressed={section === "permissions"}
                  onClick={() => {
                    setSection("permissions");
                    setReview(undefined);
                  }}
                >
                  Permisos
                </Button>
              ) : null}
            </nav>
          ) : null}

          <div className="space-y-4 overflow-y-auto px-1 pb-2">
            {c.previewCommitId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted p-2.5">
                <p className="text-xs">
                  <strong>Viendo versión anterior:</strong>{" "}
                  {s.commits.find(v => v.id === c.previewCommitId)?.message}
                </p>
                <Button size="sm" className="h-7 text-xs" onClick={() => void run(() => c.previewVersion())}>
                  Volver al trabajo actual
                </Button>
              </div>
            ) : null}
            {localError || c.error ? (
              <p role="alert" className="rounded-md border border-destructive p-2.5 text-xs text-destructive">
                {localError || c.error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="rounded-md border p-2.5 text-xs">
                {notice}
              </p>
            ) : null}

            {section === "history" && !review ? (
              <>
                <CommitTree
                  commits={s.commits}
                  branches={s.branches}
                  selected={c.previewCommitId ?? chosen.id}
                  choose={id => void run(() => chooseVersion(id))}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="history-time" className="text-xs text-muted-foreground">
                    Buscar por fecha:
                  </Label>
                  <Input
                    id="history-time"
                    type="datetime-local"
                    className="h-8 w-auto text-xs"
                    onChange={e => {
                      if (!e.target.value) return;
                      const v = versionAt(s, branch.id, new Date(e.target.value).toISOString());
                      if (v) void run(() => chooseVersion(v.id));
                      else setNotice("No hay versiones anteriores a esa fecha.");
                    }}
                  />
                </div>
                <div className="max-h-56 overflow-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-background">
                      <tr>
                        <th className="p-2">Versión</th>
                        <th className="p-2">Rama / autor</th>
                        <th className="p-2">Fecha</th>
                        <th className="p-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...s.commits].reverse().map(v => (
                        <tr key={v.id} className={chosen.id === v.id ? "border-t bg-muted" : "border-t"}>
                          <td className="p-2 font-medium">{v.message}</td>
                          <td className="p-2 text-muted-foreground">
                            {s.branches.find(b => b.id === v.branchId)?.name} · {v.author.name}
                          </td>
                          <td className="p-2 text-muted-foreground">{formatBranchDate(v.at)}</td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              aria-label={`Ver ${v.message}`}
                              onClick={() => {
                                setSelection({ branch: branch.id, scopes: v.scopes });
                                void run(() => chooseVersion(v.id));
                              }}
                            >
                              Ver
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {options.length > 1 ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">
                      Vistas seleccionadas ({scopes.length}/{options.length})
                    </summary>
                    <div className="pt-2">
                      <ScopeSelection options={options} selected={scopes} onChange={setScopes} />
                    </div>
                  </details>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={c.busy || !scopes.length}
                    onClick={() =>
                      void run(() => startReview(branch.id, chosen.id, scopes, undefined, {}, "compare"))
                    }
                  >
                    Comparar con actual
                  </Button>
                  {canRestoreBranch ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={c.busy || !scopes.length}
                      onClick={() =>
                        void run(() => startReview(branch.id, chosen.id, scopes, undefined, {}, "restore"))
                      }
                    >
                      Restaurar versión
                    </Button>
                  ) : null}
                  {canCreateBranch ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false);
                        setBranchName(`Desde ${formatBranchDate(chosen.at)}`);
                        setInlinePanel("new-branch");
                        setPopoverOpen(true);
                      }}
                    >
                      Crear rama desde aquí
                    </Button>
                  ) : null}
                  {branch.id !== "main" && editable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={c.busy || !scopes.length || w.pending > 0 || chosen.kind === "initial"}
                      onClick={() =>
                        void run(async () => {
                          const proposalId = crypto.randomUUID();
                          await perform(
                            {
                              type: "propose",
                              id: proposalId,
                              branchId: branch.id,
                              targetId: "main",
                              commitId: chosen.id,
                              scopes,
                              message: chosen.message,
                            },
                            undefined,
                            owner ? "Lista para fusionar." : "Solicitud enviada al anfitrión.",
                          );
                          if (owner) {
                            setDismissedAlerts(prev => [...new Set([...prev, proposalId])]);
                            await startReview("main", chosen.id, scopes, proposalId);
                          } else if (canSeeRequests) {
                            setSection("requests");
                          }
                        })
                      }
                    >
                      {owner ? "Fusionar en Principal" : "Enviar al anfitrión"}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}

            {section === "requests" && canSeeRequests && !review ? (
              <div className="space-y-2.5">
                {!s.proposals.length ? (
                  <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
                ) : (
                  s.proposals.map(p => {
                    const canApproveThis = canManage(s, w.actor, "mergeMain", at, p.id);
                    if (!owner && !canApproveThis) return null;
                    return (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium">{p.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.branches.find(b => b.id === p.branchId)?.name} → Principal · {p.author.name} ·{" "}
                            {p.status === "open"
                              ? "Pendiente"
                              : p.status === "merged"
                                ? "Fusionada"
                                : "Rechazada"}
                          </p>
                        </div>
                        {p.status === "open" && canApproveThis ? (
                          <div className="flex gap-2">
                            <Button size="sm" disabled={c.busy} onClick={() => openProposalReview(p.id)}>
                              Revisar y fusionar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={c.busy || !c.status?.connected}
                              onClick={() =>
                                void run(() =>
                                  perform(
                                    { type: "reject", id: crypto.randomUUID(), proposalId: p.id },
                                    undefined,
                                    "Solicitud rechazada.",
                                  ),
                                )
                              }
                            >
                              Rechazar
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            ) : null}

            {review ? (
              <BranchReviewPanel
                review={review}
                workspace={w}
                busy={c.busy}
                connected={!!c.status.connected}
                at={at}
                onRestartReview={(targetBranchId, commitId, selected, proposalId, choices, mode) =>
                  void run(() => startReview(targetBranchId, commitId, selected, proposalId, choices, mode))
                }
                onConfirm={(action, vector) =>
                  void run(async () => {
                    await perform(
                      action,
                      vector,
                      action.type === "merge" ? "Cambios fusionados en Principal." : "Cambios aplicados.",
                    );
                    setReview(undefined);
                    await c.previewVersion();
                    setDialogOpen(false);
                  })
                }
                onRejectProposal={proposalId =>
                  void run(async () => {
                    await perform(
                      { type: "reject", id: crypto.randomUUID(), proposalId },
                      undefined,
                      "Solicitud rechazada.",
                    );
                    setReview(undefined);
                    setDialogOpen(false);
                  })
                }
                onCancel={() => {
                  setReview(undefined);
                  if (section === "review") setDialogOpen(false);
                }}
              />
            ) : null}

            {section === "permissions" && owner && !review ? (
              <BranchPermissionsPanel
                history={s}
                branch={branch}
                status={c.status}
                peers={c.peers}
                busy={c.busy}
                onPerform={action => void run(() => perform(action, undefined, "Permisos actualizados."))}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
