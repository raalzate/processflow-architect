"use client";

import { useState } from "react";
import { Users, Copy, RefreshCw, Download, Link2 } from "lucide-react";
import { useCollaboration } from "@/context/CollaborationContext";
import { useGraphContext } from "@/context/GraphContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { FieldConflictsNotice } from "@/components/collaboration/FieldConflictsNotice";
import { hostBridge } from "@/lib/host-bridge";
import type { PeerRoute, Role } from "@/lib/collaboration/types";
import { DEFAULT_LEASE_POLICY, GRACE_LABELS, GRACE_OPTIONS_MS, formatRemaining } from "@/lib/collaboration/lease";

function formatRouteCounts(counts?: Record<PeerRoute, number>): string {
  if (!counts) return "";
  const parts: string[] = [];
  if (counts.lan > 0) parts.push(`${counts.lan} en red local`);
  if (counts.direct > 0) parts.push(`${counts.direct} por P2P directo`);
  if (counts.relay > 0) parts.push(`${counts.relay} por respaldo cifrado`);
  return parts.join(", ");
}

export function CollaborationControl() {
  const collaboration = useCollaboration();
  const { currentFileId } = useGraphContext();
  const [invitation, setInvitation] = useState(""),
    [generated, setGenerated] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [notice, setNotice] = useState("");
  if (!collaboration?.available) return null;
  const { status, busy, error } = collaboration;
  const routeBreakdown = formatRouteCounts(status?.routeCounts);
  const policy = status?.lease?.policy ?? DEFAULT_LEASE_POLICY;
  const run = (operation: () => Promise<void>) => {
    setNotice("");
    void operation().catch(() => {
      /* Provider renders the error. */
    });
  };
  const copy = async () => {
    if (await hostBridge()?.copyToClipboard(generated))
      setNotice("Invitación copiada. Genera otra para la siguiente persona.");
    else {
      await navigator.clipboard.writeText(generated);
      setNotice("Invitación copiada.");
    }
  };
  const recover = async () => {
    const recovery = await collaboration.recover();
    const url = URL.createObjectURL(new Blob([recovery], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "processflow-recuperacion.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const stateLabel = !status
    ? "Colaborar"
    : status.state === "online" || status.owner
      ? "Proyecto vinculado"
      : status.state === "connecting"
        ? "Conectando…"
        : "Sin conexión";
  return (
    <Popover
      onOpenChange={open => {
        if (!open) {
          setGenerated("");
          setNotice("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant={status ? "secondary" : "outline"}
          className="gap-2"
          aria-label="Colaboración del proyecto"
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          <span>{stateLabel}</span>
          {status ? <Badge variant="outline" aria-label={`${status.peers} personas conectadas`}>{status.peers}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(26rem,calc(100vw-2rem))] space-y-4"
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Trabajar en el mismo proyecto</h2>
            {status ? (
              <Badge variant={status.owner ? "default" : status.role === "viewer" ? "outline" : "secondary"}>
                {status.owner ? "Anfitrión" : status.role === "viewer" ? "Huésped · Lectura" : "Huésped"}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Comparte el proyecto y sus vistas en vivo; los cambios quedan guardados.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="collaboration-name">Nombre que ven los demás</Label>
          <Input
            id="collaboration-name"
            value={collaboration.displayName}
            maxLength={40}
            onChange={event => collaboration.setDisplayName(event.target.value)}
          />
        </div>
        {status ? (
          <>
            <div className="space-y-2 text-sm" role="status" aria-live="polite">
              <p>
                {status.owner
                  ? "Estás alojando el proyecto compartido."
                  : status.role === "viewer"
                    ? "Tienes acceso de lectura."
                    : "Puedes editar este proyecto."}
              </p>
              <p className="tabular-nums">
                {!status.owner && collaboration.locked
                  ? `Sin conexión con el anfitrión: el proyecto queda bloqueado. ${status.lease?.state === "locked" ? `Si no vuelve en ${formatRemaining(status.lease.remainingMs)}, la copia se eliminará de este equipo.` : ""}`
                  : status.peers > status.capacity.limit
                  ? `${status.peers} personas conectadas; nuevas entradas en pausa (cupo estimado: ${status.capacity.limit})`
                  : `${status.peers} ${status.peers === 1 ? "persona conectada" : "personas conectadas"}, incluido el anfitrión. Cupo estimado: ${status.capacity.limit}.`}
              </p>
              {!status.owner && !status.connected && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => run(collaboration.retry)} className="gap-2">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Reconectar
                  </Button>
                  {status.saved && (
                    <span className="text-muted-foreground">También se reintenta automáticamente cada 5 segundos.</span>
                  )}
                </div>
              )}
              <p className="text-muted-foreground">{status.capacity.reason}</p>
              <p>
                {status.route === "lan"
                  ? "Conectado por la red local"
                  : status.route === "direct"
                    ? "Conexión directa"
                    : status.route === "relay"
                      ? "Conectado mediante respaldo automático cifrado"
                      : status.owner
                        ? status.peers > 1
                          ? `Conexiones de invitados${routeBreakdown ? `: ${routeBreakdown}` : ": activas"}`
                          : "Esperando a otras personas"
                        : "Los cambios se intercambiarán al reconectar"}
              </p>
              <p>{status.saved && !collaboration.pending ? "Copia local guardada" : "Guardando cambios…"}</p>
              {status.initialized === false ? (
                <p>Esperando la primera copia del proyecto. Podrás editar cuando llegue.</p>
              ) : null}
              <section className="space-y-2 rounded-md border p-3" aria-label="Personas conectadas">
                <h3 className="font-medium">{!status.owner && !status.connected ? "Personas conectadas · Esperando reconexión" : `Personas conectadas (${status.participants?.length ?? status.peers})`}</h3>
                {(status.participants ?? []).map(person => {
                  const branchNames = person.branchIds.map(id => collaboration.workspace?.history.branches.find(b => b.id === id)?.name ?? (id === "main" ? "Principal" : id === "shared" ? "Trabajo compartido" : "Otra rama"));
                  const locations = person.locations?.map(location => {
                    const branchName = collaboration.workspace?.history.branches.find(b => b.id === location.branchId)?.name ?? "Otra rama";
                    const viewName = location.viewId === "design" ? "Modelo" : collaboration.workspace?.snapshots[location.branchId]?.customViews.find(v => v.id === location.viewId)?.name ?? "Otra vista";
                    return `${branchName} · ${viewName}`;
                  });
                  return <div key={person.id} className="space-y-1 border-b pb-2 last:border-0 last:pb-0"><p className="flex items-center justify-between gap-2"><span className="font-medium">{person.name}{person.id === collaboration.workspace?.actor.id ? " (tú)" : ""}</span><Badge variant="outline">{person.owner ? "Anfitrión" : person.role === "viewer" ? "Lectura" : "Edición"}</Badge></p><p className="text-xs text-muted-foreground">{locations?.length ? locations.join("; ") : branchNames.length ? branchNames.join(", ") : "Conectado"}</p></div>;
                })}
                <p className="text-xs text-muted-foreground">Todos aparecen aquí. Los punteros se ven al coincidir en la misma rama y vista.</p>
              </section>
              {status.lastSynced ? (
                <p className="text-muted-foreground">
                  Último intercambio: {new Date(status.lastSynced).toLocaleString()}
                </p>
              ) : null}
            </div>
            {!collaboration.workspace && status.role === "editor" && status.discardedEdits?.length ? (
              <FieldConflictsNotice
                edits={status.discardedEdits}
                disabled={busy}
                onResolve={(editId, keep) => run(() => collaboration.resolveFieldConflict(editId, keep))}
              />
            ) : null}
            {status.owner ? (
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="collaboration-role">Permiso de la siguiente persona</Label>
                <Select value={role} onValueChange={value => setRole(value as Role)}>
                  <SelectTrigger id="collaboration-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editar</SelectItem>
                    <SelectItem value="viewer">Solo lectura</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setGenerated(await collaboration.invite(role));
                    })
                  }
                  className="w-full gap-2"
                >
                  <Link2 className="h-4 w-4" />
                  Generar invitación
                </Button>
                {generated ? (
                  <>
                    <Label htmlFor="collaboration-generated">Invitación para una persona</Label>
                    <Textarea
                      id="collaboration-generated"
                      readOnly
                      value={generated}
                      className="min-h-20 break-all text-xs"
                    />
                    <Button variant="outline" onClick={() => run(copy)} className="gap-2">
                      <Copy className="h-4 w-4" />
                      Copiar invitación
                    </Button>
                  </>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Mantén la aplicación abierta para recibir a los demás. Cada invitación queda asociada al
                  dispositivo de la primera persona que la use.
                </p>
                <div className="space-y-2 border-t pt-3">
                  <Label htmlFor="collaboration-grace">Copia de los invitados sin ti</Label>
                  <Select
                    value={String(policy.graceMs)}
                    onValueChange={value => run(() => collaboration.setPolicy({ ...policy, graceMs: Number(value) }))}
                  >
                    <SelectTrigger id="collaboration-grace"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GRACE_OPTIONS_MS.map(ms => (
                        <SelectItem key={ms} value={String(ms)}>{GRACE_LABELS[ms]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={policy.allowExport}
                      disabled={busy}
                      onChange={event => run(() => collaboration.setPolicy({ ...policy, allowExport: event.target.checked }))}
                    />
                    Permitir exportar a los invitados
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Si no respondes, la copia de cada invitado se bloquea y, al vencer el plazo, se elimina de su
                    equipo. Salir o ser revocado también la elimina.
                  </p>
                </div>
              </div>
            ) : null}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await hostBridge()?.openProjectWindow?.(currentFileId!);
                })
              }
            >
              Abrir proyecto en otra ventana
            </Button>
            <details className="border-t pt-3 text-sm">
              <summary className="cursor-pointer font-medium">Copia de recuperación y vínculo</summary>
              <div className="space-y-3 pt-3">
                <p className="text-muted-foreground">
                  {status.owner
                    ? "La recuperación conserva contenido borrado y el historial compartido. Desvincular conserva la copia visible."
                    : "La copia es un préstamo del anfitrión: al salir se elimina de este equipo."}
                </p>
                <Button variant="outline" disabled={busy || !collaboration.canExport} onClick={() => run(recover)} className="gap-2">
                  <Download className="h-4 w-4" />
                  Descargar recuperación
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (
                        !status.owner &&
                        !window.confirm(
                          collaboration.pending
                            ? `Hay ${collaboration.pending} cambios sin entregar al anfitrión y se perderán. La copia del proyecto se eliminará de este equipo. ¿Salir?`
                            : "La copia del proyecto se eliminará de este equipo. ¿Salir?",
                        )
                      )
                        return;
                      await collaboration.leave();
                      setGenerated("");
                    })
                  }
                >
                  Salir del proyecto compartido
                </Button>
              </div>
            </details>
            {status.owner && status.members?.length ? (
              <details className="border-t pt-3 text-sm">
                <summary className="cursor-pointer font-medium">Personas con acceso</summary>
                <div className="space-y-2 pt-3">
                  {status.members.map(member => (
                    <div key={member.id} className="flex items-center justify-between gap-3">
                      <span>
                        {member.name ??
                          collaboration.peers.find(
                            p => p.id === member.id || p.id.startsWith(`${member.id}:`),
                          )?.name ??
                          member.id.slice(0, 8)}{" "}
                        · {member.revoked ? "Revocado" : member.role === "viewer" ? "Lectura" : "Edición"}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || member.revoked}
                        onClick={() =>
                          run(async () => {
                            await collaboration.revoke(member.id);
                          })
                        }
                      >
                        Revocar
                      </Button>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <>
            <div className="space-y-3">
              <Button
                className="w-full"
                disabled={busy || !currentFileId}
                onClick={() =>
                  run(async () => {
                    await collaboration.create({});
                  })
                }
              >
                {busy ? "Preparando…" : "Vincular este proyecto y ser anfitrión"}
              </Button>
              {!currentFileId ? (
                <p className="text-sm text-muted-foreground">
                  Crea un proyecto para alojarlo o pega una invitación para unirte.
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Comparte la invitación y listo. La conexión elige la red local, una ruta directa o un respaldo
                cifrado gratuito automáticamente, sin configurar servidores ni puertos.
              </p>
              <p className="text-xs text-muted-foreground">
                Los cupos por red local, P2P directo y respaldo cifrado se gestionan por separado: si el
                respaldo llega a su tope, las demás personas siguen conectándose por LAN o P2P.
              </p>
            </div>
            <form
              className="space-y-2 border-t pt-3"
              onSubmit={event => {
                event.preventDefault();
                run(async () => {
                  await collaboration.join(invitation.trim());
                  setInvitation("");
                });
              }}
            >
              <Label htmlFor="collaboration-invitation">Invitación de otra persona</Label>
              <p className="text-xs text-muted-foreground">
                Lo que recibas es un préstamo: sólo existe mientras el anfitrión lo comparte. Si deja de
                responder, se bloquea y luego se elimina de este equipo.
              </p>
              <Textarea
                id="collaboration-invitation"
                value={invitation}
                onChange={e => setInvitation(e.target.value)}
                placeholder="processflow://…"
                className="min-h-20 text-xs"
                required
              />
              <Button
                type="submit"
                variant="outline"
                disabled={busy || !invitation.trim()}
                className="w-full"
              >
                Vincular una copia y unirme
              </Button>
            </form>
          </>
        )}
        {error || status?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {error ?? status?.error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm">
            {notice}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
