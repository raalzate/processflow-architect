"use client";

import { useState } from "react";
import { GitBranch, History, Save, ArrowDownToLine, ShieldCheck, GitPullRequest, Plus } from "lucide-react";
import { useCollaboration } from "@/context/CollaborationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function BranchControl() {
  const c = useCollaboration();
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState("work");
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
    editable = canEditBranch(s, branch.id, w.actor, at),
    owner = w.actor.owner;
  const pendingProposals = s.proposals.filter(p => p.status === "open" && p.targetId === "main");
  const reviewableProposals = pendingProposals.filter(p => canManage(s, w.actor, "mergeMain", at, p.id));
  const branchFieldConflicts = w.discardedEdits ? (deRegistro(w.discardedEdits, branch.id) ?? []) : [];

  const run = async (operation: () => Promise<void>) => {
    setLocalError("");
    setNotice("");
    try {
      await operation();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };
  const perform = async (action: HistoryAction, vector?: string) => {
    await c.historyAction(action, vector);
    setNotice("Operación guardada. Las versiones pendientes se sincronizan al conectar.");
  };
  const chooseVersion = async (id: string) => {
    setSelectedCommit(id);
    await c.previewVersion(id);
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
      return;
    }
    const result = await c.previewMerge(targetBranchId, commitId, selected, choices);
    if (result.preview && result.workspace)
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
  };

  return (
    <>
      <div className="space-y-3 rounded-lg border bg-muted/20 p-3" data-branch-controls="">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label
                htmlFor="current-branch"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                Estás trabajando en esta rama
              </Label>
              <select
                id="current-branch"
                className={`${selectStyle} w-56 max-w-full font-medium`}
                value={branch.id}
                disabled={c.busy || c.pending > 0}
                onChange={e => {
                  setSelectedCommit(undefined);
                  setSelection(undefined);
                  setProposeSelection(undefined);
                  void run(() => c.selectBranch(e.target.value));
                }}
              >
                {s.branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="ghost"
              className="gap-2"
              disabled={c.busy || w.actor.role !== "editor"}
              onClick={() => {
                setOpen(true);
                setTab("work");
                setTimeout(() => document.getElementById("new-branch")?.focus(), 100);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva rama
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3" aria-label="Acciones de versiones">
            <Button
              className="gap-2"
              disabled={c.busy || !editable || !!c.previewCommitId}
              onClick={() => {
                setOpen(true);
                setTab("work");
                setTimeout(() => document.getElementById("version-message")?.focus(), 100);
              }}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Guardar versión
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={c.busy || !editable || branch.id === "main" || !!c.previewCommitId}
              onClick={() => {
                setOpen(true);
                setTab("work");
                void run(async () => {
                  const main = s.branches.find(b => b.id === "main")!;
                  await startReview(
                    branch.id,
                    main.head,
                    scopeOptions(draft, w.snapshots.main).map(o => o.id),
                  );
                });
              }}
            >
              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
              Traer cambios
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                setOpen(true);
                setTab("history");
              }}
            >
              <History className="h-4 w-4" aria-hidden="true" />
              Historial
            </Button>
            {branch.id !== "main" ? (
              <Button
                variant="outline"
                className="gap-2"
                disabled={!editable || head.kind === "initial" || c.busy}
                onClick={() => {
                  setOpen(true);
                  setTab("work");
                  setTimeout(
                    () => document.getElementById("send-for-review")?.scrollIntoView({ block: "center" }),
                    100,
                  );
                }}
              >
                <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                Enviar a revisión
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={reviewableProposals.length ? "secondary" : "ghost"}
              className="gap-2"
              onClick={() => {
                setOpen(true);
                setTab("requests");
              }}
            >
              <GitPullRequest className="h-4 w-4" aria-hidden="true" />
              Solicitudes
              {pendingProposals.length ? ` (${pendingProposals.length})` : ""}
            </Button>
            {owner ? (
              <Button
                variant="ghost"
                className="gap-2"
                onClick={() => {
                  setOpen(true);
                  setTab("permissions");
                }}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Permisos
              </Button>
            ) : null}
          </div>
        </div>
        {c.previewCommitId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-sm font-medium">Viendo una versión anterior · solo lectura</p>
            <Button variant="secondary" onClick={() => void run(() => c.previewVersion())}>
              Volver al trabajo actual
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {branch.id === "main"
              ? "Principal contiene la versión aprobada del proyecto."
              : "Tu trabajo se guarda en esta rama. Traer cambios conserva lo que estás haciendo."}
          </p>
        )}
        {reviewableProposals.length ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 p-3"
            role="status"
            aria-live="polite"
          >
            <div>
              <p className="text-sm font-semibold">
                {reviewableProposals.length === 1
                  ? "Tienes una solicitud de fusión por revisar"
                  : `Tienes ${reviewableProposals.length} solicitudes de fusión por revisar`}
              </p>
              <p className="text-xs text-muted-foreground">
                {reviewableProposals[0].author.name} envió «{reviewableProposals[0].message}» desde{" "}
                {s.branches.find(b => b.id === reviewableProposals[0].branchId)?.name} hacia Principal.
              </p>
            </div>
            <Button
              onClick={() => {
                setOpen(true);
                setTab("requests");
              }}
              className="gap-2"
            >
              <GitPullRequest className="h-4 w-4" aria-hidden="true" />
              Revisar y fusionar
            </Button>
          </div>
        ) : null}
        {editable && !c.previewCommitId && branchFieldConflicts.length ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-muted/40 p-3"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm">
              {branchFieldConflicts.length === 1
                ? "Dos personas editaron el mismo campo en vivo en esta rama."
                : `Hay ${branchFieldConflicts.length} campos con ediciones simultáneas en esta rama.`}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(true);
                setTab("work");
              }}
            >
              Elegir valor
            </Button>
          </div>
        ) : null}
        {w.recoveries.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" role="status">
            <p className="text-sm">Conservamos una copia de los cambios que no pudieron publicarse.</p>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(true);
                setTab("work");
              }}
            >
              Ver recuperación
            </Button>
          </div>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Ramas y versiones · {branch.name}</DialogTitle>
            <DialogDescription>
              Guarda versiones, revisa cambios y recupera estados anteriores. Tu trabajo se guarda
              automáticamente dentro de su rama.
            </DialogDescription>
          </DialogHeader>
          <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Secciones de versiones">
            {[
              ["work", "Trabajo"],
              ["history", "Historial y árbol"],
              ["requests", "Solicitudes"],
              ...(owner ? [["permissions", "Permisos"]] : []),
            ].map(([id, label]) => (
              <Button
                key={id}
                variant={tab === id ? "secondary" : "ghost"}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setReview(undefined);
                }}
              >
                {label}
              </Button>
            ))}
          </nav>
          <div className="space-y-4 overflow-y-auto px-1 pb-2">
            {c.previewCommitId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted p-3">
                <p className="text-sm">
                  <strong>Viendo versión anterior · solo lectura.</strong>{" "}
                  {s.commits.find(v => v.id === c.previewCommitId)?.message}
                </p>
                <Button size="sm" onClick={() => void run(() => c.previewVersion())}>
                  Volver al trabajo actual
                </Button>
              </div>
            ) : null}
            {localError || c.error ? (
              <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
                {localError || c.error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="rounded-md border p-3 text-sm">
                {notice}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {c.pending
                ? "Guardando en este dispositivo…"
                : c.status.saved
                  ? "Guardado en este dispositivo"
                  : "Guardado pendiente"}{" "}
              · {c.status.connected ? "Conectado con la sala" : "Sin conexión: conservamos tu trabajo"}
              {w.pending ? ` · ${w.pending} versiones u operaciones pendientes de sincronizar` : ""}
            </p>

            {tab === "work" ? (
              <>
                {editable && !c.previewCommitId && branchFieldConflicts.length ? (
                  <FieldConflictsNotice
                    edits={branchFieldConflicts}
                    disabled={c.busy}
                    onResolve={(editId, keep) => void run(() => c.resolveFieldConflict(editId, keep))}
                  />
                ) : null}
                <div>
                  <h3 className="font-semibold">1. Guarda una versión (commit)</h3>
                  <p className="text-sm text-muted-foreground">
                    Un commit es un punto guardado del trabajo que eliges. No modifica Principal. Selecciona
                    las vistas y describe el cambio.
                  </p>
                </div>
                <ScopeSelection options={options} selected={scopes} onChange={setScopes} />
                <form
                  className="space-y-2"
                  onSubmit={e => {
                    e.preventDefault();
                    void run(async () => {
                      await perform({
                        type: "commit",
                        id: crypto.randomUUID(),
                        branchId: branch.id,
                        scopes,
                        message,
                      });
                      setMessage("");
                      setProposeSelection(undefined);
                    });
                  }}
                >
                  <Label htmlFor="version-message">¿Qué cambiaste en esta versión?</Label>
                  <Input
                    id="version-message"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Por ejemplo: mejorar la atención de especialistas"
                    maxLength={500}
                    required
                  />
                  <Button
                    type="submit"
                    disabled={c.busy || !editable || !scopes.length || !!c.previewCommitId || !message.trim()}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Guardar versión
                  </Button>
                  {!editable ? (
                    <p className="text-sm text-muted-foreground">
                      Esta rama está protegida. Crea una rama para trabajar o solicita permiso al anfitrión.
                    </p>
                  ) : null}
                </form>
                {branch.id !== "main" ? (
                  <section id="send-for-review" className="space-y-3 rounded-md border bg-muted/20 p-3">
                    <h3 className="font-semibold">2. Envía una solicitud de fusión (pull request)</h3>
                    <p className="text-sm text-muted-foreground">
                      Pide al anfitrión que revise e incorpore una versión a Principal. Tu rama sigue
                      independiente hasta que aprueben la fusión.
                    </p>
                    <p className="text-sm">
                      Versión que enviarás: <strong>{head.message}</strong> · {formatBranchDate(head.at)}
                    </p>
                    <ScopeSelection
                      legend="Vistas de esta versión que propones fusionar"
                      options={proposeOptions}
                      selected={proposeScopes}
                      onChange={next => setProposeSelection({ commitId: head.id, scopes: next })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Por defecto se marcan las vistas guardadas en «{head.message}». Tus cambios posteriores
                      sin versión quedan fuera.
                    </p>
                    <Button
                      disabled={
                        c.busy ||
                        !editable ||
                        head.kind === "initial" ||
                        !proposeScopes.length ||
                        w.pending > 0
                      }
                      className="gap-2"
                      onClick={() =>
                        void run(async () => {
                          await perform({
                            type: "propose",
                            id: crypto.randomUUID(),
                            branchId: branch.id,
                            targetId: "main",
                            commitId: head.id,
                            scopes: proposeScopes,
                            message: head.message,
                          });
                          setTab("requests");
                        })
                      }
                    >
                      <GitPullRequest className="h-4 w-4" aria-hidden="true" />
                      Enviar solicitud de fusión
                    </Button>
                  </section>
                ) : null}
                <div className="space-y-2 border-t pt-4">
                  <p className="font-medium">Traer cambios sin perder tu trabajo pendiente</p>
                  <p className="text-sm text-muted-foreground">
                    Se incluyen todas las vistas de Principal por defecto. Revisar no modifica tu rama; los
                    conflictos se resuelven antes de confirmar.
                  </p>
                  <Button
                    variant="outline"
                    disabled={c.busy || !editable || branch.id === "main" || !!c.previewCommitId}
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
                    className="gap-2"
                  >
                    <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                    Traer cambios de Principal
                  </Button>
                </div>
                <form
                  className="space-y-2 border-t pt-4"
                  onSubmit={e => {
                    e.preventDefault();
                    void run(async () => {
                      const id = crypto.randomUUID();
                      await perform({
                        type: "branch",
                        id: crypto.randomUUID(),
                        branchId: id,
                        name: branchName,
                        fromCommit: c.previewCommitId ?? chosen.id,
                      });
                      setBranchName("");
                      await c.selectBranch(id);
                    });
                  }}
                >
                  <Label htmlFor="new-branch">Crear rama desde «{chosen.message}»</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      className="min-w-48 flex-1"
                      id="new-branch"
                      value={branchName}
                      onChange={e => setBranchName(e.target.value)}
                      placeholder="Nombre de la rama"
                      maxLength={80}
                      required
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={c.busy || w.actor.role !== "editor" || !branchName.trim()}
                    >
                      Crear rama
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Parte de la versión elegida. Los cambios todavía sin versión permanecen en la rama actual.
                  </p>
                </form>
              </>
            ) : null}

            {tab === "history" ? (
              <>
                <CommitTree
                  commits={s.commits}
                  branches={s.branches}
                  selected={c.previewCommitId ?? chosen.id}
                  choose={id => void run(() => chooseVersion(id))}
                />
                <div className="space-y-2">
                  <Label htmlFor="history-time">Ver la última versión guardada hasta una fecha</Label>
                  <Input
                    id="history-time"
                    type="datetime-local"
                    onChange={e => {
                      if (!e.target.value) return;
                      const v = versionAt(s, branch.id, new Date(e.target.value).toISOString());
                      if (v) void run(() => chooseVersion(v.id));
                      else setNotice("No hay una versión guardada anterior a esa fecha.");
                    }}
                  />
                </div>
                <div className="max-h-64 overflow-auto rounded-md border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr>
                        <th className="p-2">Versión</th>
                        <th className="p-2">Rama / persona</th>
                        <th className="p-2">Fecha</th>
                        <th className="p-2">Consultar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...s.commits].reverse().map(v => (
                        <tr key={v.id} className={chosen.id === v.id ? "border-t bg-muted" : "border-t"}>
                          <td className="p-2">
                            {v.message}
                            <span className="block text-xs text-muted-foreground">
                              {v.scopes
                                .map(
                                  id =>
                                    scopeOptions(v.snapshot).find(o => o.id === id)?.name ??
                                    "Vista eliminada",
                                )
                                .join(", ")}
                            </span>
                          </td>
                          <td className="p-2">
                            {s.branches.find(b => b.id === v.branchId)?.name}
                            <br />
                            {v.author.name}
                          </td>
                          <td className="p-2">{formatBranchDate(v.at)}</td>
                          <td className="p-2">
                            <Button
                              size="sm"
                              variant="ghost"
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
                <ScopeSelection options={options} selected={scopes} onChange={setScopes} />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={c.busy || !scopes.length}
                    onClick={() =>
                      void run(() => startReview(branch.id, chosen.id, scopes, undefined, {}, "compare"))
                    }
                  >
                    Comparar con el trabajo actual
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      c.busy ||
                      !scopes.length ||
                      (branch.id === "main" ? !canManage(s, w.actor, "restoreMain", at) : !editable)
                    }
                    onClick={() =>
                      void run(() => startReview(branch.id, chosen.id, scopes, undefined, {}, "restore"))
                    }
                  >
                    Restaurar vistas seleccionadas
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTab("work");
                      setBranchName(`Desde ${formatBranchDate(chosen.at)}`);
                    }}
                  >
                    Crear rama desde esta versión
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run(async () => {
                        await perform({
                          type: "propose",
                          id: crypto.randomUUID(),
                          branchId: branch.id,
                          targetId: "main",
                          commitId: chosen.id,
                          scopes,
                          message: chosen.message,
                        });
                        setTab("requests");
                      })
                    }
                    disabled={c.busy || branch.id === "main" || !editable || !scopes.length || w.pending > 0}
                  >
                    Solicitar incorporación a Principal
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Restaurar añade una versión y guarda un punto de recuperación de tu trabajo actual. No
                  elimina versiones posteriores.
                </p>
              </>
            ) : null}

            {tab === "requests" ? (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold">Solicitudes de fusión (pull requests)</h3>
                  <p className="text-sm text-muted-foreground">
                    Revisar muestra lo que enviaron. Aprobar y fusionar incorpora esa versión a Principal;
                    rechazar deja la rama de origen intacta.
                  </p>
                </div>
                {!s.proposals.length ? (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay solicitudes. Guarda una versión y pulsa Enviar a revisión.
                  </p>
                ) : (
                  s.proposals.map(p => (
                    <div key={p.id} className="space-y-2 rounded-md border p-3">
                      <p className="font-medium">{p.message}</p>
                      <p className="text-sm text-muted-foreground">
                        {s.branches.find(b => b.id === p.branchId)?.name} →{" "}
                        {s.branches.find(b => b.id === p.targetId)?.name} · {p.author.name} ·{" "}
                        {p.status === "open"
                          ? "Pendiente de revisión"
                          : p.status === "merged"
                            ? "Fusionada"
                            : "Rechazada"}
                      </p>
                      <p className="text-xs">
                        Versión fijada: {s.commits.find(v => v.id === p.commitId)?.message}. Los borradores
                        posteriores quedan fuera.
                      </p>
                      <p className="text-xs">
                        Vistas enviadas:{" "}
                        {p.scopes
                          .map(
                            scope =>
                              scopeOptions(s.commits.find(v => v.id === p.commitId)!.snapshot).find(
                                o => o.id === scope,
                              )?.name ?? "Vista eliminada",
                          )
                          .join(", ") || "Todas las vistas enviadas ya fueron incorporadas"}
                        .
                      </p>
                      {p.status === "open" ? (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            disabled={c.busy}
                            onClick={() =>
                              void run(() => startReview(p.targetId, p.commitId, p.scopes, p.id))
                            }
                          >
                            Revisar cambios
                          </Button>
                          {canManage(s, w.actor, "mergeMain", at, p.id) ? (
                            <Button
                              variant="ghost"
                              disabled={c.busy || !c.status?.connected}
                              onClick={() =>
                                void run(() =>
                                  perform({ type: "reject", id: crypto.randomUUID(), proposalId: p.id }),
                                )
                              }
                            >
                              Rechazar
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
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
                    await perform(action, vector);
                    setReview(undefined);
                    await c.previewVersion();
                  })
                }
                onCancel={() => setReview(undefined)}
              />
            ) : null}

            {tab === "permissions" && owner ? (
              <BranchPermissionsPanel
                history={s}
                branch={branch}
                status={c.status}
                peers={c.peers}
                busy={c.busy}
                onPerform={action => void run(() => perform(action))}
              />
            ) : null}
            {w.recoveries.length ? (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer font-medium">
                  Trabajo conservado para recuperación ({w.recoveries.length})
                </summary>
                {w.recoveries.map(r => (
                  <div key={r.id} className="space-y-2 border-t py-2">
                    <p className="text-sm">{r.error}</p>
                    {r.snapshot ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const p = r.snapshot!;
                          downloadBoardJson(
                            packBoard(
                              p.content,
                              { customViews: p.customViews, activeViewId: "design", injectedViewIds: [] },
                              p,
                            ),
                            "trabajo-recuperado.json",
                          );
                        }}
                      >
                        Descargar copia conservada
                      </Button>
                    ) : null}
                  </div>
                ))}
              </details>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
