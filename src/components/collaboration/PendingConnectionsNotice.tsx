"use client";
import { useState } from "react";
import { useCollaboration } from "@/context/CollaborationContext";
import { Button } from "@/components/ui/button";
import type { PendingConnection } from "@/lib/collaboration/document";
import type { SharedProject } from "@/lib/collaboration/types";

function ConnectionRow({ item, project, disabled, repair }: { item: PendingConnection; project: SharedProject; disabled: boolean; repair: (viewId: string, edgeId: string, source?: string, target?: string) => Promise<void> }) {
  const view = project.customViews.find(v => v.id === item.viewId);
  const graph = item.viewId === "design" ? project.content : view?.graph;
  const options = [...(graph?.big_picture.nodos ?? []), ...(graph?.agregados ?? []).flatMap(g => [{ id: g.id!, nombre: g.nombre_agregado }, ...g.nodos])];
  const exists = (id: string) => options.some(o => o.id === id);
  const [source, setSource] = useState(exists(item.sourceId) ? item.sourceId : "");
  const [target, setTarget] = useState(exists(item.targetId) ? item.targetId : "");
  const [error, setError] = useState("");
  const run = (remove: boolean) => { setError(""); void repair(item.viewId, item.id, remove ? undefined : source, remove ? undefined : target).catch(e => setError(e instanceof Error ? e.message : String(e))); };
  return <div className="space-y-2 rounded-md border bg-background p-3">
    <p className="text-xs font-medium">{item.viewId === "design" ? "Modelo" : view?.name ?? "Otra vista"} · {item.description || "Conexión sin nombre"}</p>
    <p className="break-words text-xs text-muted-foreground">Referencia anterior: {item.sourceId} → {item.targetId}</p>
    {([['Origen', source, setSource], ['Destino', target, setTarget]] as const).map(([label, value, setter]) => <label key={label} className="block space-y-1 text-xs">{label}<select aria-label={`${label} de ${item.description || item.id}`} className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={e => setter(e.target.value)} disabled={disabled}><option value="">Elegir componente…</option>{options.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>)}
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={disabled || !source || !target} onClick={() => run(false)}>Volver a conectar</Button><Button size="sm" variant="outline" disabled={disabled} onClick={() => run(true)}>Retirar conexión</Button></div>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>;
}

export function PendingConnectionsNotice() {
  const c = useCollaboration();
  const [visible, setVisible] = useState(10);
  if (!c?.workspace) return null;
  const items = c.workspace.pendingConnections?.[c.branchId] ?? [], project = c.workspace.snapshots[c.branchId];
  if (!items.length || !project) return null;
  return <details className="space-y-2 rounded-md border p-3" data-pending-connections=""><summary className="cursor-pointer text-sm font-medium">{items.length} conexiones incompletas · Revisar</summary>
    <p className="text-xs text-muted-foreground">Estas flechas apuntan a componentes que no están en su vista. Si otro compañero los está creando, aparecerán al sincronizar. También puedes corregir sus extremos o retirarlas; se conservan los datos originales para recuperación.</p>
    {items.slice(0, visible).map(item => <ConnectionRow key={`${c.branchId}:${item.viewId}:${item.id}`} item={item} project={project} disabled={c.busy || c.readOnly} repair={c.repairConnection} />)}
    {visible < items.length ? <Button variant="outline" size="sm" onClick={() => setVisible(v => v + 10)}>Ver 10 más</Button> : null}
  </details>;
}
