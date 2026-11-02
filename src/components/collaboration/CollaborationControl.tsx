"use client";

import { useEffect, useState } from "react";
import { Users, Copy, RefreshCw, Download, Link2 } from "lucide-react";
import { useCollaboration } from "@/context/CollaborationContext";
import { useGraphContext } from "@/context/GraphContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { FieldConflictsNotice } from "@/components/collaboration/FieldConflictsNotice";
import { hostBridge } from "@/lib/host-bridge";
import type { Role, RoomOptions } from "@/lib/collaboration/types";

const parseLines = (text: string): string[] =>
  text
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean);

export function CollaborationControl() {
  const collaboration = useCollaboration();
  const { currentFileId } = useGraphContext();
  const [invitation, setInvitation] = useState(""),
    [generated, setGenerated] = useState(""),
    [updatedLink, setUpdatedLink] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [notice, setNotice] = useState("");
  const [selfHostedOnly, setSelfHostedOnly] = useState(false);
  const [relayText, setRelayText] = useState("");
  const [externalText, setExternalText] = useState("");

  const status = collaboration?.status;
  useEffect(() => {
    if (!status?.owner) return;
    setSelfHostedOnly(!!status.selfHostedOnly);
    setRelayText((status.relayUrls ?? []).join("\n"));
    setExternalText((status.externalAddresses ?? []).join("\n"));
  }, [
    status?.owner,
    status?.projectId,
    status?.selfHostedOnly,
    status?.relayUrls,
    status?.externalAddresses,
  ]);

  if (!collaboration?.available) return null;
  const { busy, error } = collaboration;
  const buildNetworkOptions = (): RoomOptions => ({
    selfHostedOnly,
    relayUrls: parseLines(relayText),
    externalAddresses: parseLines(externalText),
  });
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
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[80vh] w-[min(26rem,calc(100vw-2rem))] space-y-4 overflow-y-auto"
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Trabajar en el mismo proyecto</h2>
          <p className="text-sm text-muted-foreground">
            Todas las personas comparten este proyecto y sus vistas. Los cambios se guardan para continuar
            otro día.
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
              <p className="text-xs text-muted-foreground">
                {status.selfHostedOnly
                  ? "Modo independiente: solo red local, ruta directa o tu propio relay (sin servidores de terceros)."
                  : "Modo automático: red local, ruta directa y respaldo cifrado."}
              </p>
              <p className="tabular-nums">
                {status.peers > status.capacity.limit
                  ? `${status.peers} personas conectadas; nuevas entradas en pausa (cupo estimado: ${status.capacity.limit})`
                  : `${status.peers} de ${status.capacity.limit} participantes estimados, incluido el anfitrión`}
              </p>
              <p className="text-muted-foreground">{status.capacity.reason}</p>
              <p>
                {status.route === "lan"
                  ? "Conectado por la red local"
                  : status.route === "direct"
                    ? "Conexión directa"
                    : status.route === "relay"
                      ? status.selfHostedOnly
                        ? "Conectado mediante intermediario (relay) propio cifrado"
                        : "Conectado mediante respaldo automático cifrado"
                      : status.owner
                        ? status.peers > 1
                          ? `${status.peers - 1} personas conectadas`
                          : "Esperando a otras personas"
                        : "Los cambios se intercambiarán al reconectar"}
              </p>
              <p>{status.saved && !collaboration.pending ? "Copia local guardada" : "Guardando cambios…"}</p>
              {status.initialized === false ? (
                <p>Esperando la primera copia del proyecto. Podrás editar cuando llegue.</p>
              ) : null}
              {collaboration.peers.map(peer => (
                <p key={peer.id} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: peer.color }} />
                  {peer.name}
                </p>
              ))}
              {status.lastSynced ? (
                <p className="text-muted-foreground">
                  Último intercambio: {new Date(status.lastSynced).toLocaleString()}
                </p>
              ) : null}
              {status.pendingEdges ? (
                <p>{status.pendingEdges} conexiones esperan componentes pendientes.</p>
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
                <select
                  id="collaboration-role"
                  value={role}
                  onChange={e => setRole(e.target.value as Role)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="editor">Editar</option>
                  <option value="viewer">Solo lectura</option>
                </select>
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
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(collaboration.retry)}
                  className="w-full gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reconectar ahora
                </Button>
                <details className="border-t pt-3 text-sm">
                  <summary className="cursor-pointer font-medium">Actualizar dirección del anfitrión</summary>
                  <form
                    className="space-y-2 pt-3"
                    onSubmit={event => {
                      event.preventDefault();
                      run(async () => {
                        await collaboration.refreshLink(updatedLink.trim());
                        setUpdatedLink("");
                        setNotice("Dirección del anfitrión actualizada.");
                      });
                    }}
                  >
                    <p className="text-xs text-muted-foreground">
                      Si el anfitrión cambió de relay propio o de dirección pública, pega aquí un enlace
                      actualizado del mismo proyecto. Tu copia y tus permisos se conservan.
                    </p>
                    <Label htmlFor="collaboration-refresh-link">Nuevo enlace del anfitrión</Label>
                    <Textarea
                      id="collaboration-refresh-link"
                      value={updatedLink}
                      onChange={e => setUpdatedLink(e.target.value)}
                      placeholder="processflow://…"
                      className="min-h-16 text-xs"
                      required
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={busy || !updatedLink.trim()}
                      className="w-full"
                    >
                      Actualizar dirección
                    </Button>
                  </form>
                </details>
              </div>
            )}
            {status.owner ? (
              <details className="border-t pt-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Red e intermediario propio (sin terceros)
                </summary>
                <div className="space-y-3 pt-3">
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input
                      id="collaboration-self-hosted"
                      type="checkbox"
                      checked={selfHostedOnly}
                      onChange={e => setSelfHostedOnly(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Usar solo infraestructura propia (desactivar relays y descubrimiento públicos de
                      Iroh/n0)
                    </span>
                  </label>
                  <div className="space-y-1">
                    <Label htmlFor="collaboration-relays" className="text-xs">
                      Relay(s) propios opcionales (uno por línea)
                    </Label>
                    <Textarea
                      id="collaboration-relays"
                      value={relayText}
                      onChange={e => setRelayText(e.target.value)}
                      placeholder="http://mi-servidor:3340"
                      className="min-h-16 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="collaboration-external-addrs" className="text-xs">
                      Dirección pública directa opcional (IP:puerto)
                    </Label>
                    <Input
                      id="collaboration-external-addrs"
                      value={externalText}
                      onChange={e => setExternalText(e.target.value)}
                      placeholder="203.0.113.10:4433"
                      className="text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    className="w-full"
                    onClick={() =>
                      run(async () => {
                        await collaboration.configureNetwork(buildNetworkOptions());
                        setGenerated("");
                        setNotice(
                          "Configuración de red guardada. Genera un nuevo enlace si cambiaste de relay.",
                        );
                      })
                    }
                  >
                    Guardar red de la sala
                  </Button>
                </div>
              </details>
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
                  La recuperación conserva contenido borrado y el historial compartido. Desvincular conserva
                  la copia visible.
                </p>
                <Button variant="outline" disabled={busy} onClick={() => run(recover)} className="gap-2">
                  <Download className="h-4 w-4" />
                  Descargar recuperación
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
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
                    await collaboration.create(buildNetworkOptions());
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
                Comparte la invitación y listo. La conexión elige la red local, una ruta directa o un
                intermediario cifrado automáticamente.
              </p>
              <details className="rounded-md border p-2.5 text-sm">
                <summary className="cursor-pointer text-xs font-medium">
                  Red e intermediario propio (opcional, sin terceros)
                </summary>
                <div className="space-y-2.5 pt-2.5">
                  <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input
                      id="collaboration-create-self-hosted"
                      type="checkbox"
                      checked={selfHostedOnly}
                      onChange={e => setSelfHostedOnly(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Solo infraestructura propia (no usar servidores públicos de Iroh/n0; opera por LAN, IP
                      directa o tu propio relay)
                    </span>
                  </label>
                  <div className="space-y-1">
                    <Label htmlFor="collaboration-create-relays" className="text-xs">
                      Relay(s) propios opcionales (uno por línea)
                    </Label>
                    <Textarea
                      id="collaboration-create-relays"
                      value={relayText}
                      onChange={e => setRelayText(e.target.value)}
                      placeholder="http://mi-servidor:3340"
                      className="min-h-16 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="collaboration-create-external" className="text-xs">
                      Dirección pública directa opcional (IP:puerto)
                    </Label>
                    <Input
                      id="collaboration-create-external"
                      value={externalText}
                      onChange={e => setExternalText(e.target.value)}
                      placeholder="203.0.113.10:4433"
                      className="text-xs"
                    />
                  </div>
                </div>
              </details>
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
