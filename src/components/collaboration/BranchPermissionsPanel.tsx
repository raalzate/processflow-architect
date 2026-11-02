"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectStyle } from "@/components/collaboration/branch-utils";
import type { Branch, DiagramHistory, HistoryAction } from "@/lib/collaboration/history";
import type { Presence } from "@/lib/collaboration/presence";
import type { CollaborationStatus } from "@/lib/collaboration/types";
import { deRegistro } from "@/lib/registro";

export function BranchPermissionsPanel({
  history,
  branch,
  status,
  peers,
  busy,
  onPerform,
}: {
  history: DiagramHistory;
  branch: Branch;
  status: CollaborationStatus;
  peers: Presence[];
  busy: boolean;
  onPerform: (action: HistoryAction) => void;
}) {
  const [chosenMember, setChosenMember] = useState(""),
    [permissionUntil, setPermissionUntil] = useState(""),
    [proposalLimit, setProposalLimit] = useState("");
  const [mergePermission, setMergePermission] = useState(false),
    [editPermission, setEditPermission] = useState(false),
    [restorePermission, setRestorePermission] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={e => {
        e.preventDefault();
        onPerform({
          type: "permission",
          id: crypto.randomUUID(),
          memberId: chosenMember,
          permission: {
            mergeMain: mergePermission,
            editMain: editPermission,
            restoreMain: restorePermission,
            ...(permissionUntil ? { until: new Date(permissionUntil).toISOString() } : {}),
            ...(proposalLimit ? { proposalId: proposalLimit } : {}),
          },
        });
      }}
    >
      <p className="flex items-center gap-2 text-sm">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Solo el anfitrión concede o revoca estos permisos.
      </p>
      <Label htmlFor="permission-person">Persona</Label>
      <select
        id="permission-person"
        className={`${selectStyle} w-full`}
        value={chosenMember}
        onChange={e => {
          const id = e.target.value,
            p = deRegistro(history.permissions, id);
          setChosenMember(id);
          setMergePermission(!!p?.mergeMain);
          setEditPermission(!!p?.editMain);
          setRestorePermission(!!p?.restoreMain);
          setPermissionUntil(p?.until ? p.until.slice(0, 16) : "");
          setProposalLimit(p?.proposalId ?? "");
        }}
        required
      >
        <option value="">Selecciona una persona</option>
        {status.members
          ?.filter(m => !m.revoked)
          .map((m, i) => (
            <option key={m.id} value={m.id}>
              {m.name ?? peers.find(p => p.id.startsWith(m.id))?.name ?? `Participante ${i + 1}`} (
              {m.role === "viewer" ? "Lectura" : "Edición"})
            </option>
          ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mergePermission}
          onChange={e => setMergePermission(e.target.checked)}
        />
        Aprobar fusiones hacia Principal
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={editPermission} onChange={e => setEditPermission(e.target.checked)} />
        Editar Principal directamente
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={restorePermission}
          onChange={e => setRestorePermission(e.target.checked)}
        />
        Restaurar versiones de Principal
      </label>
      <Label htmlFor="permission-until">Vencimiento opcional</Label>
      <Input
        id="permission-until"
        type="datetime-local"
        value={permissionUntil}
        onChange={e => setPermissionUntil(e.target.value)}
      />
      <Label htmlFor="permission-proposal">Limitar a una solicitud de fusión</Label>
      <select
        id="permission-proposal"
        className={`${selectStyle} w-full`}
        value={proposalLimit}
        onChange={e => setProposalLimit(e.target.value)}
      >
        <option value="">Sin limitar a una solicitud</option>
        {history.proposals
          .filter(p => p.status === "open")
          .map(p => (
            <option key={p.id} value={p.id}>
              {p.message}
            </option>
          ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Para quitar permisos, desmárcalos y guarda (o usa Revocar).
      </p>
      <div className="flex gap-2">
        <Button disabled={busy || !chosenMember}>Guardar permisos</Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !chosenMember}
          onClick={() =>
            onPerform({
              type: "permission",
              id: crypto.randomUUID(),
              memberId: chosenMember,
              permission: {},
            })
          }
        >
          Revocar permisos especiales
        </Button>
      </div>
      <fieldset className="space-y-2 border-t pt-3">
        <legend className="text-sm font-medium">Editores de {branch.name}</legend>
        {branch.id !== "main" ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onPerform({ type: "editors", id: crypto.randomUUID(), branchId: branch.id })}
            >
              Permitir a todos los editores
            </Button>
            {status.members
              ?.filter(m => m.role === "editor" && !m.revoked)
              .map((m, i) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!branch.editors || branch.editors.includes(m.id)}
                    onChange={e => {
                      const all = status
                          .members!.filter(member => member.role === "editor" && !member.revoked)
                          .map(member => member.id),
                        current = branch.editors ?? all;
                      onPerform({
                        type: "editors",
                        id: crypto.randomUUID(),
                        branchId: branch.id,
                        editors: e.target.checked ? [...current, m.id] : current.filter(id => id !== m.id),
                      });
                    }}
                  />
                  {m.name ?? peers.find(p => p.id.startsWith(m.id))?.name ?? `Participante ${i + 1}`}
                </label>
              ))}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Principal se controla con los permisos de arriba.</p>
        )}
      </fieldset>
    </form>
  );
}
