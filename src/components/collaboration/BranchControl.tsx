"use client";

import { useState } from "react";
import { GitBranch, History, Save, ArrowDownToLine, ShieldCheck, GitPullRequest, Plus } from "lucide-react";
import { useCollaboration } from "@/context/CollaborationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { canEditBranch, canManage, scopeOptions, selectScopes, projectDependencies, versionAt, type Choices, type DiagramCommit, type HistoryAction, type MergePreview } from "@/lib/collaboration/history";
import type { SharedProject } from "@/lib/collaboration/types";
import type { GraphData } from "@/lib/types";
import { encodeGraph } from "@/lib/collaboration/graph-codec";
import { MermaidDiagram } from "@/components/canvas/MermaidDiagram";
import { packBoard } from "@/lib/board-file";

const selectStyle = "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const date = (at: string) => new Date(at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
const download = (value: unknown, name: string) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
type Review = { mode: "pull" | "restore" | "compare"; branchId: string; commitId: string; scopes: string[]; head: string; vector: string; proposalId?: string; choices: Choices; preview: MergePreview };

function ScopeSelection({ options, selected, onChange }: { options: { id: string; name: string }[]; selected: string[]; onChange: (selected: string[]) => void }) {
  return <fieldset className="space-y-2 rounded-md border p-3"><legend className="px-1 text-sm font-medium">Vistas que se incluirán</legend>
    <Button type="button" variant="ghost" size="sm" onClick={() => onChange(selected.length === options.length ? [] : options.map(o => o.id))}>{selected.length === options.length ? "Desmarcar todas" : "Seleccionar todas"}</Button>
    <div className="grid gap-2 sm:grid-cols-2">{options.map(o => <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(o.id)} onChange={e => onChange(e.target.checked ? [...selected, o.id] : selected.filter(id => id !== o.id))} />{o.name}</label>)}</div>
  </fieldset>;
}

function CommitTree({ commits, branches, selected, choose }: { commits: DiagramCommit[]; branches: { id: string; name: string }[]; selected?: string; choose: (id: string) => void }) {
  const lane = new Map(branches.map((b, i) => [b.id, i]));
  const points = new Map(commits.map((c, i) => [c.id, { x: 30 + (lane.get(c.branchId) ?? 0) * 220, y: 48 + i * 54 }]));
  return <div className="max-h-80 overflow-auto rounded-md border bg-muted/20" aria-label="Árbol de ramas y versiones">
    <svg role="group" aria-label="Selecciona una versión del árbol" width={Math.max(600, branches.length * 220 + 240)} height={Math.max(100, commits.length * 54 + 40)}>
      {branches.map((branch, index) => <text key={branch.id} x={18 + index * 220} y={19} fill="currentColor" fontSize={12} fontWeight={600}>{branch.name.slice(0, 28)}</text>)}
      {commits.flatMap(c => [...c.parents, ...(c.mergeParent ? [c.mergeParent] : [])].map(parent => {
        const a = points.get(parent), b = points.get(c.id); return a && b ? <path key={`${c.id}-${parent}`} d={`M${a.x} ${a.y} C${a.x} ${b.y}, ${b.x} ${a.y}, ${b.x} ${b.y}`} stroke="currentColor" className="text-muted-foreground" strokeWidth={2} fill="none" strokeDasharray={parent === c.mergeParent ? "5 4" : undefined} /> : null;
      }))}
      {commits.map(c => { const p = points.get(c.id)!; return <g key={c.id} role="button" tabIndex={0} aria-label={`Ver versión: ${c.message}, ${date(c.at)}, ${c.author.name}`} aria-pressed={selected === c.id} className="cursor-pointer text-foreground outline-none focus-visible:text-primary" onClick={() => choose(c.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(c.id); } }}>
        <title>{`${branches.find(b => b.id === c.branchId)?.name ?? "Rama"}: ${c.message} · ${c.author.name} · ${date(c.at)}`}</title>
        <circle cx={p.x} cy={p.y} r={selected === c.id ? 9 : 6} fill="currentColor" className={selected === c.id ? "text-primary" : "text-muted-foreground"} />
        <text x={p.x + 15} y={p.y - 3} fill="currentColor" fontSize={12}>{c.message.slice(0, 34)}</text>
        <text x={p.x + 15} y={p.y + 14} fill="currentColor" fontSize={11}>{c.author.name} · {date(c.at)}</text>
      </g>; })}
    </svg>
  </div>;
}

export function BranchControl() {
  const c = useCollaboration();
  const [open, setOpen] = useState(false), [tab, setTab] = useState("work");
  const [message, setMessage] = useState(""), [branchName, setBranchName] = useState("");
  const [selection, setSelection] = useState<{ branch: string; scopes: string[] }>();
  const [selectedCommit, setSelectedCommit] = useState<string>(), [review, setReview] = useState<Review>();
  const [notice, setNotice] = useState(""), [localError, setLocalError] = useState("");
  const [chosenMember, setChosenMember] = useState(""), [permissionUntil, setPermissionUntil] = useState(""), [proposalLimit, setProposalLimit] = useState("");
  const [mergePermission, setMergePermission] = useState(false), [editPermission, setEditPermission] = useState(false), [restorePermission, setRestorePermission] = useState(false);
  if (!c?.workspace || !c.status) return null;
  const w = c.workspace, s = w.history, branch = s.branches.find(b => b.id === c.branchId) ?? s.branches[1];
  const draft = w.snapshots[branch.id], head = s.commits.find(v => v.id === branch.head)!;
  const chosen = s.commits.find(v => v.id === selectedCommit) ?? head;
  const options = scopeOptions(head.snapshot, draft, chosen.snapshot);
  const scopes = selection?.branch === branch.id ? selection.scopes.filter(id => options.some(o => o.id === id)) : options.map(o => o.id);
  const setScopes = (scopes: string[]) => setSelection({ branch: branch.id, scopes });
  const at = new Date().toISOString(), editable = canEditBranch(s, branch.id, w.actor, at), owner = w.actor.owner;
  const pendingProposals = s.proposals.filter(p => p.status === "open" && p.targetId === "main");
  const run = async (operation: () => Promise<void>) => { setLocalError(""); setNotice(""); try { await operation(); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } };
  const perform = async (action: HistoryAction, vector?: string) => { await c.historyAction(action, vector); setNotice("Operación guardada. Las versiones pendientes se sincronizan al conectar."); };
  const chooseVersion = async (id: string) => { setSelectedCommit(id); await c.previewVersion(id); };
  const startReview = async (branchId: string, commitId: string, selected: string[], proposalId?: string, choices: Choices = {}, mode: Review["mode"] = "pull") => {
    if (mode !== "pull") {
      const commit = s.commits.find(c => c.id === commitId)!;
      const project = selectScopes(w.snapshots[branchId], commit.snapshot, selected);
      setReview({ mode, branchId, commitId, scopes: selected, choices, head: s.branches.find(b => b.id === branchId)!.head, vector: w.vectors[branchId], preview: { project, conflicts: [], dependencies: projectDependencies(project) } }); return;
    }
    const result = await c.previewMerge(branchId, commitId, selected, choices);
    if (result.preview && result.workspace) setReview({ mode, branchId, commitId, scopes: selected, proposalId, choices, preview: result.preview, head: result.workspace.history.branches.find(b => b.id === branchId)!.head, vector: result.workspace.vectors[branchId] });
  };
  const showValue = (v: unknown) => v === undefined ? "Eliminado / sin valor" : typeof v === "string" ? v : JSON.stringify(v);
  return <>
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3" data-branch-controls="">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="current-branch" className="flex items-center gap-2 text-xs text-muted-foreground"><GitBranch className="h-3.5 w-3.5" aria-hidden="true" />Estás trabajando en esta rama</Label>
            <select id="current-branch" className={`${selectStyle} w-56 max-w-full font-medium`} value={branch.id} disabled={c.busy || c.pending > 0} onChange={e => { setSelectedCommit(undefined); setSelection(undefined); void run(() => c.selectBranch(e.target.value)); }}>{s.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </div>
          <Button variant="ghost" className="gap-2" disabled={c.busy || w.actor.role !== "editor"} onClick={() => { setOpen(true); setTab("work"); setTimeout(() => document.getElementById("new-branch")?.focus(), 100); }}><Plus className="h-4 w-4" aria-hidden="true" />Nueva rama</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3" aria-label="Acciones de versiones">
          <Button className="gap-2" disabled={c.busy || !editable || !!c.previewCommitId} onClick={() => { setOpen(true); setTab("work"); setTimeout(() => document.getElementById("version-message")?.focus(), 100); }}><Save className="h-4 w-4" aria-hidden="true" />Guardar versión</Button>
          <Button variant="outline" className="gap-2" disabled={c.busy || !editable || branch.id === "main" || !!c.previewCommitId} onClick={() => { setOpen(true); setTab("work"); void run(async () => { const main = s.branches.find(b => b.id === "main")!; await startReview(branch.id, main.head, scopeOptions(draft, w.snapshots.main).map(o => o.id)); }); }}><ArrowDownToLine className="h-4 w-4" aria-hidden="true" />Traer cambios</Button>
          <Button variant="outline" className="gap-2" onClick={() => { setOpen(true); setTab("history"); }}><History className="h-4 w-4" aria-hidden="true" />Historial</Button>
          {branch.id !== "main" ? <Button variant="outline" className="gap-2" disabled={!editable || head.kind === "initial" || c.busy} onClick={() => { setOpen(true); setTab("work"); setTimeout(() => document.getElementById("send-for-review")?.scrollIntoView({ block: "center" }), 100); }}><GitPullRequest className="h-4 w-4" aria-hidden="true" />Enviar a revisión</Button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={pendingProposals.length && owner ? "secondary" : "ghost"} className="gap-2" onClick={() => { setOpen(true); setTab("requests"); }}><GitPullRequest className="h-4 w-4" aria-hidden="true" />Solicitudes{s.proposals.some(p => p.status === "open") ? ` (${s.proposals.filter(p => p.status === "open").length})` : ""}</Button>
          {owner ? <Button variant="ghost" className="gap-2" onClick={() => { setOpen(true); setTab("permissions"); }}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Permisos</Button> : null}
        </div>
      </div>
      {c.previewCommitId ? <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-sm font-medium">Viendo una versión anterior · solo lectura</p><Button variant="secondary" onClick={() => void run(() => c.previewVersion())}>Volver al trabajo actual</Button></div> : <p className="text-xs text-muted-foreground">{branch.id === "main" ? "Principal contiene la versión aprobada del proyecto." : "Tu trabajo se guarda en esta rama. Traer cambios conserva lo que estás haciendo."}</p>}
      {owner && pendingProposals.length ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 p-3" role="status" aria-live="polite"><div><p className="text-sm font-semibold">{pendingProposals.length === 1 ? "Tienes una solicitud de fusión por revisar" : `Tienes ${pendingProposals.length} solicitudes de fusión por revisar`}</p><p className="text-xs text-muted-foreground">{pendingProposals[0].author.name} envió «{pendingProposals[0].message}» desde {s.branches.find(b => b.id === pendingProposals[0].branchId)?.name} hacia Principal.</p></div><Button onClick={() => { setOpen(true); setTab("requests"); }} className="gap-2"><GitPullRequest className="h-4 w-4" aria-hidden="true" />Revisar y fusionar</Button></div> : null}
      {w.recoveries.length ? <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" role="status"><p className="text-sm">Conservamos una copia de los cambios que no pudieron publicarse.</p><Button variant="outline" onClick={() => { setOpen(true); setTab("work"); }}>Ver recuperación</Button></div> : null}
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle>Ramas y versiones · {branch.name}</DialogTitle><DialogDescription>Guarda versiones, revisa cambios y recupera estados anteriores. Tu trabajo se guarda automáticamente dentro de su rama.</DialogDescription></DialogHeader>
        <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Secciones de versiones">
          {[["work", "Trabajo"], ["history", "Historial y árbol"], ["requests", "Solicitudes"], ...(owner ? [["permissions", "Permisos"]] : [])].map(([id, label]) => <Button key={id} variant={tab === id ? "secondary" : "ghost"} aria-pressed={tab === id} onClick={() => { setTab(id); setReview(undefined); }}>{label}</Button>)}
        </nav>
        <div className="space-y-4 overflow-y-auto px-1 pb-2">
          {c.previewCommitId ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted p-3"><p className="text-sm"><strong>Viendo versión anterior · solo lectura.</strong> {s.commits.find(v => v.id === c.previewCommitId)?.message}</p><Button size="sm" onClick={() => void run(() => c.previewVersion())}>Volver al trabajo actual</Button></div> : null}
          {localError || c.error ? <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{localError || c.error}</p> : null}
          {notice ? <p role="status" className="rounded-md border p-3 text-sm">{notice}</p> : null}
          <p className="text-xs text-muted-foreground">{c.pending ? "Guardando en este dispositivo…" : c.status.saved ? "Guardado en este dispositivo" : "Guardado pendiente"} · {c.status.connected ? "Conectado con la sala" : "Sin conexión: conservamos tu trabajo"}{w.pending ? ` · ${w.pending} versiones u operaciones pendientes de sincronizar` : ""}</p>

          {tab === "work" ? <>
            <div><h3 className="font-semibold">1. Guarda una versión (commit)</h3><p className="text-sm text-muted-foreground">Un commit es un punto guardado del trabajo que eliges. No modifica Principal. Selecciona las vistas y describe el cambio.</p></div>
            <ScopeSelection options={options} selected={scopes} onChange={setScopes} />
            <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(async () => { await perform({ type: "commit", id: crypto.randomUUID(), branchId: branch.id, scopes, message }); setMessage(""); }); }}>
              <Label htmlFor="version-message">¿Qué cambiaste en esta versión?</Label><Input id="version-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Por ejemplo: mejorar la atención de especialistas" maxLength={500} required />
              <Button type="submit" disabled={c.busy || !editable || !scopes.length || !!c.previewCommitId || !message.trim()} className="gap-2"><Save className="h-4 w-4" aria-hidden="true" />Guardar versión</Button>
              {!editable ? <p className="text-sm text-muted-foreground">Esta rama está protegida. Crea una rama para trabajar o solicita permiso al anfitrión.</p> : null}
            </form>
            {branch.id !== "main" ? <section id="send-for-review" className="space-y-3 rounded-md border bg-muted/20 p-3"><h3 className="font-semibold">2. Envía una solicitud de fusión (pull request)</h3><p className="text-sm text-muted-foreground">Pide al anfitrión que revise e incorpore una versión a Principal. Tu rama sigue independiente hasta que aprueben la fusión.</p><p className="text-sm">Versión que enviarás: <strong>{head.message}</strong> · {date(head.at)}</p><p className="text-xs text-muted-foreground">Se enviarán únicamente las vistas marcadas arriba de esta versión guardada. Tus cambios posteriores sin versión quedan fuera.</p><Button disabled={c.busy || !editable || head.kind === "initial" || !scopes.length || w.pending > 0} className="gap-2" onClick={() => void run(async () => { await perform({ type: "propose", id: crypto.randomUUID(), branchId: branch.id, targetId: "main", commitId: head.id, scopes, message: head.message }); setTab("requests"); })}><GitPullRequest className="h-4 w-4" aria-hidden="true" />Enviar solicitud de fusión</Button></section> : null}
            <div className="space-y-2 border-t pt-4"><p className="font-medium">Traer cambios sin perder tu trabajo pendiente</p><p className="text-sm text-muted-foreground">Se incluyen todas las vistas de Principal por defecto. Revisar no modifica tu rama; los conflictos se resuelven antes de confirmar.</p>
              <Button variant="outline" disabled={c.busy || !editable || branch.id === "main" || !!c.previewCommitId} onClick={() => void run(async () => { const main = s.branches.find(b => b.id === "main")!; await startReview(branch.id, main.head, scopeOptions(draft, w.snapshots.main).map(o => o.id)); })} className="gap-2"><ArrowDownToLine className="h-4 w-4" aria-hidden="true" />Traer cambios de Principal</Button>
            </div>
            <form className="space-y-2 border-t pt-4" onSubmit={e => { e.preventDefault(); void run(async () => { const id = crypto.randomUUID(); await perform({ type: "branch", id: crypto.randomUUID(), branchId: id, name: branchName, fromCommit: c.previewCommitId ?? chosen.id }); setBranchName(""); await c.selectBranch(id); }); }}>
              <Label htmlFor="new-branch">Crear rama desde «{chosen.message}»</Label><div className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" id="new-branch" value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="Nombre de la rama" maxLength={80} required /><Button type="submit" variant="outline" disabled={c.busy || w.actor.role !== "editor" || !branchName.trim()}>Crear rama</Button></div><p className="text-xs text-muted-foreground">Parte de la versión elegida. Los cambios todavía sin versión permanecen en la rama actual.</p>
            </form>
          </> : null}

          {tab === "history" ? <>
            <CommitTree commits={s.commits} branches={s.branches} selected={c.previewCommitId ?? chosen.id} choose={id => void run(() => chooseVersion(id))} />
            <div className="space-y-2"><Label htmlFor="history-time">Ver la última versión guardada hasta una fecha</Label><Input id="history-time" type="datetime-local" onChange={e => { if (!e.target.value) return; const v = versionAt(s, branch.id, new Date(e.target.value).toISOString()); if (v) void run(() => chooseVersion(v.id)); else setNotice("No hay una versión guardada anterior a esa fecha."); }} /></div>
            <div className="max-h-64 overflow-auto rounded-md border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-background"><tr><th className="p-2">Versión</th><th className="p-2">Rama / persona</th><th className="p-2">Fecha</th><th className="p-2">Consultar</th></tr></thead><tbody>{[...s.commits].reverse().map(v => <tr key={v.id} className={chosen.id === v.id ? "border-t bg-muted" : "border-t"}><td className="p-2">{v.message}<span className="block text-xs text-muted-foreground">{v.scopes.map(id => scopeOptions(v.snapshot).find(o => o.id === id)?.name ?? "Vista eliminada").join(", ")}</span></td><td className="p-2">{s.branches.find(b => b.id === v.branchId)?.name}<br />{v.author.name}</td><td className="p-2">{date(v.at)}</td><td className="p-2"><Button size="sm" variant="ghost" aria-label={`Ver ${v.message}`} onClick={() => void run(() => chooseVersion(v.id))}>Ver</Button></td></tr>)}</tbody></table></div>
            <ScopeSelection options={options} selected={scopes} onChange={setScopes} />
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={c.busy || !scopes.length} onClick={() => void run(() => startReview(branch.id, chosen.id, scopes, undefined, {}, "compare"))}>Comparar con el trabajo actual</Button>
              <Button variant="outline" disabled={c.busy || !scopes.length || (branch.id === "main" ? !canManage(s, w.actor, "restoreMain", at) : !editable)} onClick={() => void run(() => startReview(branch.id, chosen.id, scopes, undefined, {}, "restore"))}>Restaurar vistas seleccionadas</Button>
              <Button variant="outline" onClick={() => { setTab("work"); setBranchName(`Desde ${date(chosen.at)}`); }}>Crear rama desde esta versión</Button>
              <Button variant="outline" onClick={() => void run(async () => { await perform({ type: "propose", id: crypto.randomUUID(), branchId: branch.id, targetId: "main", commitId: chosen.id, scopes, message: chosen.message }); setTab("requests"); })} disabled={c.busy || branch.id === "main" || !editable || !scopes.length || w.pending > 0}>Solicitar incorporación a Principal</Button>
            </div><p className="text-xs text-muted-foreground">Restaurar añade una versión y guarda un punto de recuperación de tu trabajo actual. No elimina versiones posteriores.</p>
          </> : null}

          {tab === "requests" ? <div className="space-y-3"><div><h3 className="font-semibold">Solicitudes de fusión (pull requests)</h3><p className="text-sm text-muted-foreground">Revisar muestra lo que enviaron. Aprobar y fusionar incorpora esa versión a Principal; rechazar deja la rama de origen intacta.</p></div>{!s.proposals.length ? <p className="text-sm text-muted-foreground">Todavía no hay solicitudes. Guarda una versión y pulsa Enviar a revisión.</p> : s.proposals.map(p => <div key={p.id} className="space-y-2 rounded-md border p-3"><p className="font-medium">{p.message}</p><p className="text-sm text-muted-foreground">{s.branches.find(b => b.id === p.branchId)?.name} → {s.branches.find(b => b.id === p.targetId)?.name} · {p.author.name} · {p.status === "open" ? "Pendiente de revisión" : p.status === "merged" ? "Fusionada" : "Rechazada"}</p><p className="text-xs">Versión fijada: {s.commits.find(v => v.id === p.commitId)?.message}. Los borradores posteriores quedan fuera.</p><p className="text-xs">Vistas enviadas: {p.scopes.map(scope => scopeOptions(s.commits.find(v => v.id === p.commitId)!.snapshot).find(o => o.id === scope)?.name ?? "Vista eliminada").join(", ") || "Todas las vistas enviadas ya fueron incorporadas"}.</p>
              {p.status === "open" ? <div className="flex gap-2"><Button variant="outline" disabled={c.busy} onClick={() => void run(() => startReview(p.targetId, p.commitId, p.scopes, p.id))}>Revisar cambios</Button>{canManage(s, w.actor, "mergeMain", at, p.id) ? <Button variant="ghost" disabled={c.busy || !c.status?.connected} onClick={() => void run(() => perform({ type: "reject", id: crypto.randomUUID(), proposalId: p.id }))}>Rechazar</Button> : null}</div> : null}
            </div>)}</div> : null}

          {review ? <section className="space-y-3 rounded-md border-2 border-primary p-4" aria-label="Revisión antes de incorporar"><h3 className="font-semibold">{review.mode === "compare" ? "Comparar versión con" : review.mode === "restore" ? "Revisar restauración de" : "Revisar incorporación a"} {s.branches.find(b => b.id === review.branchId)?.name}</h3><p className="text-sm">Se conservará tu trabajo pendiente y se guardará una versión de recuperación antes de aplicar el resultado.</p>
            <ScopeSelection options={scopeOptions(w.snapshots[review.branchId], s.commits.find(v => v.id === review.commitId)!.snapshot).filter(o => !review.proposalId || s.proposals.find(p => p.id === review.proposalId)!.scopes.includes(o.id))} selected={review.scopes} onChange={selected => { if (selected.length) void run(() => startReview(review.branchId, review.commitId, selected, review.proposalId, review.choices, review.mode)); }} />
            <ChangesBeforeAfter before={w.snapshots[review.branchId]} after={review.preview.project} />
            {review.preview.conflicts.map(conflict => <fieldset key={conflict.id} className="space-y-2 rounded-md border p-3"><legend className="text-sm font-medium">Conflicto: {conflict.path}</legend><p className="break-all text-xs text-muted-foreground">Antes: {showValue(conflict.base)}</p><Button variant="outline" className="h-auto max-w-full whitespace-normal text-left" onClick={() => void run(() => startReview(review.branchId, review.commitId, review.scopes, review.proposalId, { ...review.choices, [conflict.id]: "ours" }))}>Conservar lo actual: {showValue(conflict.ours)?.slice(0, 180)}</Button><Button variant="outline" className="h-auto max-w-full whitespace-normal text-left" onClick={() => void run(() => startReview(review.branchId, review.commitId, review.scopes, review.proposalId, { ...review.choices, [conflict.id]: "theirs" }))}>Usar lo recibido: {showValue(conflict.theirs)?.slice(0, 180)}</Button></fieldset>)}
            {review.preview.dependencies.map(text => <p key={text} role="alert" className="text-sm text-destructive">{text}</p>)}
            <div className="flex flex-wrap gap-2">{review.mode !== "compare" ? <Button disabled={c.busy || !!review.preview.conflicts.length || !!review.preview.dependencies.length || (review.proposalId ? !canManage(s, w.actor, "mergeMain", at, review.proposalId) || !c.status.connected : review.mode === "restore" && review.branchId === "main" ? !canManage(s, w.actor, "restoreMain", at) : !canEditBranch(s, review.branchId, w.actor, at))} onClick={() => void run(async () => {
              const action: HistoryAction = review.proposalId ? { type: "merge", id: crypto.randomUUID(), proposalId: review.proposalId, expectedHead: review.head, choices: review.choices, scopes: review.scopes } : review.mode === "restore" ? { type: "restore", id: crypto.randomUUID(), branchId: review.branchId, commitId: review.commitId, scopes: review.scopes } : { type: "pull", id: crypto.randomUUID(), branchId: review.branchId, commitId: review.commitId, expectedHead: review.head, choices: review.choices, scopes: review.scopes };
              await perform(action, review.vector); setReview(undefined); await c.previewVersion();
            })}>{review.proposalId ? "Aprobar y fusionar" : review.mode === "restore" ? "Confirmar restauración" : "Confirmar incorporación"}</Button> : null}<Button variant="ghost" onClick={() => setReview(undefined)}>Cancelar sin cambios</Button></div>
          </section> : null}

          {tab === "permissions" && owner ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(() => perform({ type: "permission", id: crypto.randomUUID(), memberId: chosenMember, permission: { mergeMain: mergePermission, editMain: editPermission, restoreMain: restorePermission, ...(permissionUntil ? { until: new Date(permissionUntil).toISOString() } : {}), ...(proposalLimit ? { proposalId: proposalLimit } : {}) } })); }}>
            <p className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Solo el anfitrión concede o revoca estos permisos.</p>
            <Label htmlFor="permission-person">Persona</Label><select id="permission-person" className={`${selectStyle} w-full`} value={chosenMember} onChange={e => { const id = e.target.value, p = s.permissions[id]; setChosenMember(id); setMergePermission(!!p?.mergeMain); setEditPermission(!!p?.editMain); setRestorePermission(!!p?.restoreMain); setPermissionUntil(p?.until ? p.until.slice(0, 16) : ""); setProposalLimit(p?.proposalId ?? ""); }} required><option value="">Selecciona una persona</option>{c.status.members?.filter(m => !m.revoked).map((m, i) => <option key={m.id} value={m.id}>{m.name ?? c.peers.find(p => p.id.startsWith(m.id))?.name ?? `Participante ${i + 1}`} ({m.role === "viewer" ? "Lectura" : "Edición"})</option>)}</select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mergePermission} onChange={e => setMergePermission(e.target.checked)} />Aprobar fusiones hacia Principal</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editPermission} onChange={e => setEditPermission(e.target.checked)} />Editar Principal directamente</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={restorePermission} onChange={e => setRestorePermission(e.target.checked)} />Restaurar versiones de Principal</label>
            <Label htmlFor="permission-until">Vencimiento opcional</Label><Input id="permission-until" type="datetime-local" value={permissionUntil} onChange={e => setPermissionUntil(e.target.value)} />
            <Label htmlFor="permission-proposal">Limitar a una solicitud de fusión</Label><select id="permission-proposal" className={`${selectStyle} w-full`} value={proposalLimit} onChange={e => setProposalLimit(e.target.value)}><option value="">Sin limitar a una solicitud</option>{s.proposals.filter(p => p.status === "open").map(p => <option key={p.id} value={p.id}>{p.message}</option>)}</select><p className="text-xs text-muted-foreground">Para revocar, desmarca los permisos y guarda. Fusionar no concede edición ni restauración. Una limitación por solicitud se aplica exclusivamente a la aprobación de fusiones.</p>
            <div className="flex gap-2"><Button disabled={c.busy || !chosenMember}>Guardar permisos</Button><Button type="button" variant="outline" disabled={c.busy || !chosenMember} onClick={() => void run(() => perform({ type: "permission", id: crypto.randomUUID(), memberId: chosenMember, permission: {} }))}>Revocar permisos especiales</Button></div>
            <fieldset className="space-y-2 border-t pt-3"><legend className="font-medium">Quién puede editar {branch.name}</legend><p className="text-xs text-muted-foreground">Principal usa los permisos especiales de arriba. Las otras ramas pueden ser compartidas o tener personas asignadas.</p>{branch.id !== "main" ? <><Button type="button" variant="outline" disabled={c.busy} onClick={() => void run(() => perform({ type: "editors", id: crypto.randomUUID(), branchId: branch.id }))}>Permitir a todos los editores</Button>{c.status.members?.filter(m => m.role === "editor" && !m.revoked).map((m, i) => <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!branch.editors || branch.editors.includes(m.id)} onChange={e => { const all = c.status!.members!.filter(m => m.role === "editor" && !m.revoked).map(m => m.id), current = branch.editors ?? all; void run(() => perform({ type: "editors", id: crypto.randomUUID(), branchId: branch.id, editors: e.target.checked ? [...current, m.id] : current.filter(id => id !== m.id) })); }} />{m.name ?? c.peers.find(p => p.id.startsWith(m.id))?.name ?? `Participante ${i + 1}`}</label>)}</> : null}</fieldset>
          </form> : null}
          {w.recoveries.length ? <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">Trabajo conservado para recuperación ({w.recoveries.length})</summary>{w.recoveries.map(r => <div key={r.id} className="space-y-2 border-t py-2"><p className="text-sm">{r.error}</p>{r.snapshot ? <Button size="sm" variant="outline" onClick={() => { const p = r.snapshot!; download(packBoard(p.content, { customViews: p.customViews, activeViewId: "design", injectedViewIds: [] }, p), "trabajo-recuperado.json"); }}>Descargar copia conservada</Button> : null}</div>)}</details> : null}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function ChangesBeforeAfter({ before, after }: { before: SharedProject; after: SharedProject }) {
  const options = scopeOptions(before, after), changed = options.filter(o => JSON.stringify(o.id === "design" ? before.content : o.id === "project" ? [before.name, before.references, before.agent, before.analysis] : before.customViews.find(v => `view:${v.id}` === o.id)) !== JSON.stringify(o.id === "design" ? after.content : o.id === "project" ? [after.name, after.references, after.agent, after.analysis] : after.customViews.find(v => `view:${v.id}` === o.id)));
  return <div className="space-y-2"><p className="text-sm font-medium">{changed.length ? `Cambios en ${changed.length} ámbitos` : "No hay diferencias de contenido"}</p>{changed.map(o => <details key={o.id} open className="rounded-md border p-2"><summary className="cursor-pointer text-sm">{o.name} · antes / después</summary><div className="grid gap-2 pt-2 sm:grid-cols-2">{[{ label: "Actual", p: before }, { label: "Resultado propuesto", p: after }].map(({ label, p }) => {
    const view = p.customViews.find(v => `view:${v.id}` === o.id), graph = o.id === "design" ? p.content : view?.graph;
    return <div key={label} className="min-w-0 space-y-2"><p className="text-xs font-medium">{label}</p>{graph ? <DiagramPreview graph={graph} label={`${label}: ${o.name}`} /> : view?.kind === "mermaid" ? <div className="max-h-64 overflow-auto rounded bg-muted p-2"><MermaidDiagram code={view.mermaidCode ?? ""} /></div> : o.id === "project" ? <div className="rounded bg-muted p-3 text-sm"><p>{p.name}</p><p>{p.references.length} documentos de referencia · {p.agent.artifacts.length} artefactos</p><p>{Object.values(p.analysis).filter(Boolean).length} resultados de análisis</p></div> : <p className="text-sm text-muted-foreground">Vista eliminada</p>}</div>;
  })}</div></details>)}</div>;
}

function DiagramPreview({ graph, label }: { graph: GraphData; label: string }) {
  const record = encodeGraph(graph), nodes = record.nodes.map((n, index) => ({ id: n.id, name: n.value.nombre, x: n.value.x ?? index % 3 * 210, y: n.value.y ?? Math.floor(index / 3) * 110 }));
  const minX = Math.min(0, ...nodes.map(n => n.x)), minY = Math.min(0, ...nodes.map(n => n.y));
  const width = Math.max(300, ...nodes.map(n => n.x + 190)) - minX + 30, height = Math.max(150, ...nodes.map(n => n.y + 90)) - minY + 30;
  const positions = new Map(nodes.map(n => [n.id, n]));
  return <div className="rounded border bg-muted/20 p-2"><svg viewBox={`${minX - 15} ${minY - 15} ${width} ${height}`} role="img" aria-label={label} className="h-56 w-full text-foreground">
    {record.edges.map(e => { const a = positions.get(e.fuente), b = positions.get(e.destino); return a && b ? <g key={e.id}><path d={`M${a.x + 90} ${a.y + 32} L${b.x + 90} ${b.y + 32}`} fill="none" stroke="currentColor" opacity={.5} /><text x={(a.x + b.x) / 2 + 90} y={(a.y + b.y) / 2 + 26} fontSize={10} fill="currentColor">{e.descripcion?.slice(0, 24)}</text></g> : null; })}
    {nodes.map(n => <g key={n.id}><rect x={n.x} y={n.y} width={180} height={64} rx={5} className="fill-background stroke-primary" /><text x={n.x + 90} y={n.y + 35} textAnchor="middle" fill="currentColor" fontSize={12}>{n.name.slice(0, 25)}</text><title>{n.name}</title></g>)}
  </svg><p className="text-xs text-muted-foreground">{nodes.length} componentes · {record.edges.length} conexiones</p></div>;
}
