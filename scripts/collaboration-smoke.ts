/** Real QUIC loopback/LAN integration. No public discovery, relay or Internet. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { CollaborationCommand, CollaborationResult, SharedProject } from "../src/lib/collaboration/types";
import type { Presence, PresenceInput } from "../src/lib/collaboration/presence";

class Device {
  presence: Presence[] = [];
  private child?: ChildProcess;
  private sequence = 0;
  private requests = new Map<number, (result: CollaborationResult) => void>();
  constructor(private root: string) {}
  start() {
    return new Promise<void>((resolve, reject) => {
      this.child = spawn(process.execPath, ["--import", "tsx", "scripts/collaboration-worker.ts", this.root], { stdio: ["ignore", "inherit", "inherit", "ipc"], windowsHide: true });
      this.child.on("message", (message: any) => {
        if (message.ready) resolve();
        else if (message.event) { if (message.event.presence) this.presence = message.event.presence; }
        else { this.requests.get(message.id)?.(message.result); this.requests.delete(message.id); }
      });
      this.child.once("error", reject);
      this.child.once("exit", code => { if (code) reject(new Error(`Device exited ${code}`)); });
    });
  }
  command(command: CollaborationCommand): Promise<CollaborationResult> {
    return this.request(command);
  }
  publish(fileId: string, presence: PresenceInput) { return this.request({ type: "publish-presence", fileId, presence }); }
  diskFault(enabled: boolean) { return this.request({ type: "disk-fault", enabled }); }
  private request(command: unknown): Promise<CollaborationResult> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence; const timer = setTimeout(() => reject(new Error("Device RPC timeout")), 30_000);
      this.requests.set(id, result => { clearTimeout(timer); resolve(result); }); this.child!.send({ id, command });
    });
  }
  async close() {
    if (!this.child || this.child.exitCode !== null) return;
    const child = this.child; this.child = undefined;
    await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.send({ id: 0, command: { type: "shutdown" } }); });
  }
}

const initial: SharedProject = {
  name: "Prueba", content: { nombre_proyecto: "Prueba", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [],
    agregados: [{ id: "group", nombre_agregado: "Grupo", entidad_raiz: "", descripcion: "", nodos: [
      { id: "a", nombre: "A", tipo_elemento: "custom", estado_comparativo: "nuevo", x: 10, y: 10 },
      { id: "b", nombre: "B", tipo_elemento: "custom", estado_comparativo: "nuevo", x: 100, y: 10 },
    ], aristas: [] }], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] },
  customViews: [], agent: { versions: [], lineages: [], artifacts: [] }, references: [], analysis: {},
};
function ok(result: CollaborationResult) { assert.equal(result.error, undefined, result.error); return result; }
async function eventually(action: () => Promise<boolean>, description: string) {
  for (let i = 0; i < 80; i++) { if (await action()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`No se cumplió: ${description}`);
}
async function run() {
  const dir = mkdtempSync(join(tmpdir(), "pf-collab-smoke-"));
  let host = new Device(join(dir, "host")); let guest = new Device(join(dir, "guest"));
  const viewer = new Device(join(dir, "viewer")); const trespasser = new Device(join(dir, "trespasser"));
  const state = async (engine: Device, fileId: string) => ok(await engine.command({ type: "open", fileId, initial })).snapshot!;
  try {
    await host.start(); await guest.start(); await viewer.start(); await trespasser.start();
    const created = ok(await host.command({ type: "create", fileId: "host-project", initial, options: {} }));
    assert.ok(created.status!.capacity.limit >= 2, "El entorno de integración requiere capacidad para dos equipos");
    const invite = ok(await host.command({ type: "invite", fileId: "host-project", role: "editor" })).invitation!;
    const joined = ok(await guest.command({ type: "join", fileId: "guest-project", invitation: invite }));
    assert.equal(joined.status!.state, "online", joined.status!.error); assert.equal(joined.snapshot!.name, "Prueba");
    console.log("PASS: encrypted native connection and initial project transfer");
    // A second identity cannot reuse the first guest's invitation.
    const rejected = await trespasser.command({ type: "join", fileId: "intruder", invitation: invite });
    assert.equal(rejected.status?.state, "offline"); assert.match(rejected.status?.error ?? "", /utilizada/);
    console.log("PASS: invitation bound to authenticated device identity");
    const hostBefore = await state(host, "host-project"); const guestBefore = await state(guest, "guest-project");
    await host.close();
    const guestNext = structuredClone(guestBefore); guestNext.content.agregados[0].aristas.push({ id: "ab", fuente: "a", destino: "b", descripcion: "offline" });
    ok(await guest.command({ type: "patch", fileId: "guest-project", before: guestBefore, after: guestNext }));
    await guest.close();
    // Restart with the same durable device identity, room link and document.
    host = new Device(join(dir, "host")); await host.start();
    const hostNext = structuredClone(hostBefore); hostNext.content.agregados[0].nodos[1].nombre = "B otro día"; hostNext.content.agregados[0].nodos[1].x = 350;
    ok(await host.command({ type: "patch", fileId: "host-project", before: hostBefore, after: hostNext }));
    guest = new Device(join(dir, "guest")); await guest.start();
    await eventually(async () => (await state(host, "host-project")).content.agregados[0].aristas.some(e => e.id === "ab"), "offline edge received");
    await eventually(async () => (await state(guest, "guest-project")).content.agregados[0].nodos[1].nombre === "B otro día", "other-day edits received");
    assert.deepEqual(await state(host, "host-project"), await state(guest, "guest-project"));
    console.log("PASS: both processes restart and merge offline edge with later component edits");
    await eventually(async () => {
      await host.publish("host-project", { name: "Ana", viewId: "design", pointer: { x: 50, y: 60 }, selectedIds: ["a"] });
      await guest.publish("guest-project", { name: "Luis", viewId: "design", pointer: { x: 100, y: 60 }, selectedIds: ["b"] });
      return host.presence.some(p => p.name === "Luis") && guest.presence.some(p => p.name === "Ana");
    }, "bidirectional live presence");
    assert.notEqual(host.presence.find(p => p.name === "Luis")!.id, guest.presence.find(p => p.name === "Ana")!.id);
    const backup = ok(await host.command({ type: "recover", fileId: "host-project" })).recovery!;
    assert.equal(backup.includes('"name": "Ana"'), false); assert.equal(backup.includes('"name": "Luis"'), false);
    console.log("PASS: authenticated live cursors and selections are exchanged without entering the durable document");
    const readInvite = ok(await host.command({ type: "invite", fileId: "host-project", role: "viewer" })).invitation!;
    const readJoined = ok(await viewer.command({ type: "join", fileId: "reader", invitation: readInvite }));
    assert.equal(readJoined.status!.state, "online", readJoined.status!.error);
    const denied = await viewer.command({ type: "patch", fileId: "reader", before: readJoined.snapshot!, after: { ...readJoined.snapshot!, name: "Unauthorized" } });
    assert.match(denied.error ?? "", /lectura/); assert.equal((await state(host, "host-project")).name, "Prueba");
    console.log("PASS: viewer role cannot publish edits");
    const refreshed = ok(await host.command({ type: "invite", fileId: "host-project", role: "editor" })).invitation!;
    const refreshResult = ok(await guest.command({ type: "refresh-link", fileId: "guest-project", invitation: refreshed }));
    assert.equal(refreshResult.status!.state, "online", refreshResult.status!.error); assert.equal(refreshResult.status!.projectId, created.status!.projectId);
    console.log("PASS: refreshing host addresses preserves room identity and existing membership");
    const member = ok(await host.command({ type: "open", fileId: "host-project", initial })).status!.members!.find(m => m.role === "viewer")!;
    ok(await host.command({ type: "revoke", fileId: "host-project", memberId: member.id }));
    const revoked = ok(await viewer.command({ type: "retry", fileId: "reader" })); assert.equal(revoked.status!.state, "offline"); assert.match(revoked.status!.error ?? "", /revocada/);
    console.log("PASS: revocation is enforced on authenticated reconnect");
    await host.diskFault(true);
    const beforeFault = await state(guest, "guest-project"), offlineWork = structuredClone(beforeFault); offlineWork.content.notas = "Trabajo que no debe confirmarse sin disco";
    ok(await guest.command({ type: "patch", fileId: "guest-project", before: beforeFault, after: offlineWork }));
    await eventually(async () => (await host.command({ type: "open", fileId: "host-project", initial })).status!.saved === false, "failed fsync surfaced");
    await host.diskFault(false); await guest.command({ type: "retry", fileId: "guest-project" });
    assert.equal((await host.command({ type: "open", fileId: "host-project", initial })).status!.saved, false);
    assert.ok(ok(await host.command({ type: "recover", fileId: "host-project" })).recovery!.includes(offlineWork.content.notas));
    await host.close(); host = new Device(join(dir, "host")); await host.start(); await guest.command({ type: "retry", fileId: "guest-project" });
    await eventually(async () => (await state(host, "host-project")).content.notas === offlineWork.content.notas, "unacknowledged work resent after restart");
    assert.equal((await host.command({ type: "open", fileId: "host-project", initial })).status!.saved, true);
    console.log("PASS: disk failure never yields a false durable ACK; the other replica restores the work after host restart");
  } finally {
    await Promise.allSettled([host.close(), guest.close(), viewer.close(), trespasser.close()]);
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
