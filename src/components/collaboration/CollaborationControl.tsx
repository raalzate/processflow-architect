"use client";

import { useState } from "react";
import { Users, Copy, RefreshCw, Download, Link2 } from "lucide-react";
import { useCollaboration } from "@/context/CollaborationContext";
import { useGraphContext } from "@/context/GraphContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { hostBridge } from "@/lib/host-bridge";
import type { Role } from "@/lib/collaboration/types";

export function CollaborationControl() {
  const collaboration = useCollaboration(); const { currentFileId } = useGraphContext();
  const [invitation, setInvitation] = useState(""), [generated, setGenerated] = useState("");
  const [relay, setRelay] = useState(""), [address, setAddress] = useState(""), [role, setRole] = useState<Role>("editor");
  const [notice, setNotice] = useState("");
  if (!collaboration?.available) return null;
  const { status, busy, error } = collaboration;
  const run = (operation: () => Promise<void>) => { setNotice(""); void operation().catch(() => { /* Provider renders the error. */ }); };
  const copy = async () => {
    if (await hostBridge()?.copyToClipboard(generated)) setNotice("Invitación copiada. Genera otra para el siguiente equipo.");
    else { await navigator.clipboard.writeText(generated); setNotice("Invitación copiada."); }
  };
  const recover = async () => {
    const recovery = await collaboration.recover();
    const url = URL.createObjectURL(new Blob([recovery], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "processflow-recuperacion.json"; a.click(); URL.revokeObjectURL(url);
  };
  const stateLabel = !status ? "Colaborar" : status.state === "online" || status.owner ? "Proyecto vinculado" : status.state === "connecting" ? "Conectando…" : "Sin conexión";
  return (
    <Popover onOpenChange={open => { if (!open) { setGenerated(""); setNotice(""); } }}>
      <PopoverTrigger asChild>
        <Button variant={status ? "secondary" : "outline"} className="gap-2" aria-label="Colaboración del proyecto">
          <Users className="h-4 w-4" aria-hidden="true" /><span>{stateLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80vh] w-[min(26rem,calc(100vw-2rem))] space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Trabajar en el mismo proyecto</h2>
          <p className="text-sm text-muted-foreground">Cada equipo conserva su copia. El vínculo y los cambios se guardan para continuar otro día.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="collaboration-name">Nombre que ven los demás</Label><Input id="collaboration-name" value={collaboration.displayName} maxLength={40} onChange={event => collaboration.setDisplayName(event.target.value)} /></div>
        {status ? (
          <>
            <div className="space-y-2 text-sm" role="status" aria-live="polite">
              <p>{status.owner ? "Este equipo es el anfitrión." : status.role === "viewer" ? "Tienes acceso de lectura." : "Puedes editar este proyecto."}</p>
              <p className="tabular-nums">{status.peers} de {status.capacity.limit} participantes estimados</p>
              <p className="text-muted-foreground">{status.capacity.reason}</p>
              <p>{status.route === "lan" ? "Conectado por la red local" : status.route === "direct" ? "Conexión directa" : status.route === "relay" ? "Conectado mediante tu intermediario" : status.owner ? status.peers > 1 ? `${status.peers - 1} equipo(s) conectado(s)` : "Esperando a otros equipos" : "Los cambios se intercambiarán al reconectar"}</p>
              <p>{status.saved && !collaboration.pending ? "Copia guardada en este equipo" : "Guardando cambios…"}</p>
              {status.initialized === false ? <p>Esperando la primera copia del proyecto. Podrás editar cuando llegue.</p> : null}
              {collaboration.peers.map(peer => <p key={peer.id} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: peer.color }} />{peer.name} · {peer.id.slice(0, 4)}</p>)}
              {status.lastSynced ? <p className="text-muted-foreground">Último intercambio: {new Date(status.lastSynced).toLocaleString()}</p> : null}
              {status.pendingEdges ? <p>{status.pendingEdges} conexiones esperan componentes pendientes.</p> : null}
            </div>
            {status.owner ? (
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="collaboration-role">Permiso del siguiente equipo</Label>
                <select id="collaboration-role" value={role} onChange={e => setRole(e.target.value as Role)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="editor">Editar</option><option value="viewer">Solo lectura</option>
                </select>
                <Button disabled={busy} onClick={() => run(async () => { setGenerated(await collaboration.invite(role)); })} className="w-full gap-2"><Link2 className="h-4 w-4" />Generar invitación</Button>
                {generated ? <><Label htmlFor="collaboration-generated">Invitación para un equipo</Label><Textarea id="collaboration-generated" readOnly value={generated} className="min-h-20 break-all text-xs" /><Button variant="outline" onClick={() => run(copy)} className="gap-2"><Copy className="h-4 w-4" />Copiar invitación</Button></> : null}
                <p className="text-xs text-muted-foreground">Mantén la aplicación abierta para recibir a los demás. Cada invitación queda asociada al primer equipo que la use.</p>
              </div>
            ) : <Button variant="outline" disabled={busy} onClick={() => run(collaboration.retry)} className="gap-2"><RefreshCw className="h-4 w-4" />Reconectar ahora</Button>}
            <details className="border-t pt-3 text-sm"><summary className="cursor-pointer font-medium">Copia de recuperación y vínculo</summary><div className="space-y-3 pt-3">
              <p className="text-muted-foreground">La recuperación conserva contenido borrado y el historial compartido. Desvincular conserva la copia visible en este equipo.</p>
              <Button variant="outline" disabled={busy} onClick={() => run(recover)} className="gap-2"><Download className="h-4 w-4" />Descargar recuperación</Button>
              <Button variant="outline" disabled={busy} onClick={() => run(async () => { await collaboration.leave(); setGenerated(""); })}>Desvincular este equipo</Button>
            </div></details>
            {status.owner && status.members?.length ? <details className="border-t pt-3 text-sm"><summary className="cursor-pointer font-medium">Accesos de los equipos</summary><div className="space-y-2 pt-3">
              {status.members.map(member => <div key={member.id} className="flex items-center justify-between gap-3"><span>{collaboration.peers.find(p => p.id === member.id)?.name ?? member.id.slice(0, 8)} · {member.revoked ? "Revocado" : member.role === "viewer" ? "Lectura" : "Edición"}</span><Button size="sm" variant="outline" disabled={busy || member.revoked} onClick={() => run(async () => { await collaboration.revoke(member.id); })}>Revocar</Button></div>)}
            </div></details> : null}
            {!status.owner ? <details className="border-t pt-3 text-sm"><summary className="cursor-pointer font-medium">El anfitrión cambió de red</summary><div className="space-y-2 pt-3"><p className="text-muted-foreground">La red local se detecta automáticamente. Si necesitas actualizar la dirección por Internet, pega una invitación nueva del mismo anfitrión. Tu vínculo y tu trabajo se conservan.</p><Label htmlFor="collaboration-refresh">Invitación con la dirección actual</Label><Textarea id="collaboration-refresh" value={invitation} onChange={e => setInvitation(e.target.value)} /><Button variant="outline" disabled={busy || !invitation.trim()} onClick={() => run(async () => { await collaboration.refreshLink(invitation.trim()); setInvitation(""); })}>Actualizar dirección</Button></div></details> : null}
          </>
        ) : (
          <>
            <div className="space-y-3">
              <Button className="w-full" disabled={busy || !currentFileId} onClick={() => run(async () => { await collaboration.create({ relayUrls: relay.trim() ? [relay.trim()] : [], externalAddresses: address.trim() ? [address.trim()] : [] }); })}>{busy ? "Preparando…" : "Vincular este proyecto y ser anfitrión"}</Button>
              {!currentFileId ? <p className="text-sm text-muted-foreground">Crea un proyecto para alojarlo o pega una invitación para unirte.</p> : null}
              <details className="text-sm"><summary className="cursor-pointer font-medium">Conectar desde otras redes</summary><div className="space-y-2 pt-3">
                <Label htmlFor="collaboration-relay">Intermediario propio (opcional)</Label><Input id="collaboration-relay" value={relay} onChange={e => setRelay(e.target.value)} placeholder="https://relay.ejemplo.com" />
                <Label htmlFor="collaboration-address">Dirección pública directa (opcional)</Label><Input id="collaboration-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="IP:puerto UDP" />
                <p className="text-muted-foreground">Primero se intenta la red local y la conexión directa. Un intermediario propio permite atravesar redes que las bloquean. El software es gratuito; el equipo y la conexión los aportas tú.</p>
              </div></details>
            </div>
            <form className="space-y-2 border-t pt-3" onSubmit={event => { event.preventDefault(); run(async () => { await collaboration.join(invitation.trim()); setInvitation(""); }); }}>
              <Label htmlFor="collaboration-invitation">Invitación de otra persona</Label>
              <Textarea id="collaboration-invitation" value={invitation} onChange={e => setInvitation(e.target.value)} placeholder="processflow://…" className="min-h-20 text-xs" required />
              <Button type="submit" variant="outline" disabled={busy || !invitation.trim()} className="w-full">Vincular una copia y unirme</Button>
            </form>
          </>
        )}
        {error || status?.error ? <p role="alert" className="text-sm text-destructive">{error ?? status?.error}</p> : null}
        {notice ? <p role="status" className="text-sm">{notice}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
