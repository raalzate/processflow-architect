/** Integración real, dos procesos y perfiles aislados; no modifica proyectos del usuario. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { CollaborationCommand, CollaborationResult, SharedProject } from "../src/lib/collaboration/types";
class Device {
  child?: ChildProcess; sequence = 0; requests = new Map<number, (r: CollaborationResult) => void>();
  constructor(private root: string) {}
  start() { return new Promise<void>((resolve, reject) => { this.child = spawn(process.execPath, ["--import", "tsx", "scripts/collaboration-worker.ts", this.root], { stdio: ["ignore", "inherit", "inherit", "ipc"], windowsHide: true }); this.child.on("message", (m: any) => { if (m.ready) resolve(); else if (m.result) { this.requests.get(m.id)?.(m.result); this.requests.delete(m.id); } }); this.child.once("error", reject); }); }
  command(command: CollaborationCommand) { return new Promise<CollaborationResult>((resolve, reject) => { const id = ++this.sequence, timer = setTimeout(() => reject(new Error("Se agotó el tiempo de la prueba")), 30_000); this.requests.set(id, r => { clearTimeout(timer); resolve(r); }); this.child!.send({ id, command }); }); }
  close() { return new Promise<void>(resolve => { if (!this.child || this.child.exitCode !== null) { resolve(); return; } this.child.once("exit", () => resolve()); this.child.send({ id: 0, command: { type: "shutdown" } }); }); }
}
const initial: SharedProject = { name: "Clínica de prueba", content: { nombre_proyecto: "Clínica de prueba", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [{ id: "a", nombre: "Consulta", tipo_elemento: "custom", estado_comparativo: "nuevo", x: 10, y: 20 }], aristas: [] }, politicas_inter_agregados: [] }, customViews: [{ id: "web", name: "App Web", kind: "mermaid", mermaidCode: "graph TD; A-->B", createdAt: "2026-11-02" }], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} };
const ok = (r: CollaborationResult) => { assert.equal(r.error, undefined, r.error); return r; };
async function eventually(action: () => Promise<boolean>, label: string) { for (let i = 0; i < 100; i++) { if (await action()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(label); }
async function run() {
  const root = mkdtempSync(join(tmpdir(), "pf-branch-integration-")); let host = new Device(join(root, "host")); const guest = new Device(join(root, "guest"));
  const state = async (device: Device, fileId: string) => ok(await device.command({ type: "open", fileId, initial }));
  try {
    await host.start(); await guest.start(); const fileId = "clinic-host", other = "clinic-guest";
    const created = ok(await host.command({ type: "create", fileId, initial, options: {} })); assert.equal(created.workspace, undefined);
    const invitation = ok(await host.command({ type: "invite", fileId, role: "editor" })).invitation!;
    const joined = ok(await guest.command({ type: "join", fileId: other, invitation })); assert.ok(joined.workspace); assert.deepEqual(joined.workspace.snapshots.main, initial);
    console.log("PASS: activación al segundo dispositivo, base inicial y Principal protegida");
    const original = joined.workspace.snapshots.shared, changed = structuredClone(original); changed.content.big_picture.nodos![0].nombre = "Consulta colaborativa"; changed.customViews[0].mermaidCode = "graph TD; C-->D";
    ok(await guest.command({ type: "patch", fileId: other, before: original, after: changed, branchId: "shared" }));
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", action: { type: "commit", id: "model-version", branchId: "shared", scopes: ["design"], message: "Actualizar consultas" } }));
    await eventually(async () => (await state(host, fileId)).workspace!.history.commits.some(c => c.id === "model-version"), "Sincronizar versión selectiva");
    const committed = (await state(host, fileId)).workspace!.history.commits.find(c => c.id === "model-version")!; assert.equal(committed.snapshot.customViews[0].mermaidCode, initial.customViews[0].mermaidCode);
    console.log("PASS: commit selectivo inmutable, vista no seleccionada permanece pendiente");
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", action: { type: "branch", id: "create-backend", branchId: "backend", name: "Backend", fromCommit: "model-version" } }));
    await eventually(async () => !!(await state(host, fileId)).workspace!.snapshots.backend, "Crear rama compartida");
    const denied = await guest.command({ type: "patch", fileId: other, branchId: "main", before: initial, after: changed }); assert.match(denied.error!, /permiso/);
    const h = (await state(host, fileId)).workspace!, main = structuredClone(h.snapshots.main); main.content.big_picture.nodos![0].x = 90; main.customViews[0].mermaidCode = "graph TD; Principal-->Nueva";
    ok(await host.command({ type: "patch", fileId, branchId: "main", before: h.snapshots.main, after: main }));
    ok(await host.command({ type: "history", fileId, name: "Ana", action: { type: "commit", id: "main-update", branchId: "main", scopes: ["design", "view:web"], message: "Nueva versión principal" } }));
    await host.close();
    const beforeOffline = (await state(guest, other)).workspace!.snapshots.backend, offline = structuredClone(beforeOffline); offline.content.big_picture.nodos![0].nombre = "Borrador sin commit";
    ok(await guest.command({ type: "patch", fileId: other, branchId: "backend", before: beforeOffline, after: offline }));
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", action: { type: "commit", id: "offline-version", branchId: "backend", scopes: ["project"], message: "Versión preparada offline" } }));
    host = new Device(join(root, "host")); await host.start();
    await eventually(async () => { await guest.command({ type: "retry", fileId: other }); return !!(await state(guest, other)).workspace!.history.commits.find(c => c.id === "main-update"); }, "Reconectar tras reiniciar anfitrión");
    await eventually(async () => !!(await state(host, fileId)).workspace!.history.commits.find(c => c.id === "offline-version"), "Publicar versión offline");
    const g = (await state(guest, other)).workspace!, target = g.history.branches.find(b => b.id === "backend")!;
    assert.equal(g.snapshots.backend.content.big_picture.nodos![0].nombre, "Borrador sin commit");
    const preview = ok(await guest.command({ type: "history-preview", fileId: other, branchId: "backend", commitId: "main-update", scopes: ["design", "view:web", "project"] })); assert.equal(preview.preview!.conflicts.length, 0);
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", expectedVector: g.vectors.backend, action: { type: "pull", id: "pull-main", branchId: "backend", commitId: "main-update", expectedHead: target.head, choices: {}, scopes: ["design", "view:web", "project"] } }));
    await eventually(async () => !!(await state(host, fileId)).workspace!.history.commits.find(c => c.id === "pull-main"), "Aplicar pull sin perder borrador");
    const pulled = (await state(guest, other)).workspace!; assert.equal(pulled.snapshots.backend.content.big_picture.nodos![0].nombre, "Borrador sin commit"); assert.equal(pulled.snapshots.backend.content.big_picture.nodos![0].x, 90); assert.equal(pulled.snapshots.backend.customViews[0].mermaidCode, main.customViews[0].mermaidCode);
    assert.ok(pulled.history.commits.find(c => c.id === "pull-main-before"));
    console.log("PASS: reinicio, commit offline y pull de todas las vistas conserva borrador propio sin commit");
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", action: { type: "propose", id: "proposal", branchId: "backend", targetId: "main", commitId: "pull-main", scopes: ["design"], message: "Revisar consultas" } }));
    await eventually(async () => !!(await state(host, fileId)).workspace!.history.proposals.find(p => p.id === "proposal"), "Publicar solicitud");
    const hs = (await state(host, fileId)).workspace!;
    const noMerge = await guest.command({ type: "history", fileId: other, name: "Luis", expectedVector: hs.vectors.main, action: { type: "merge", id: "bad-merge", proposalId: "proposal", expectedHead: "main-update", choices: {} } }); assert.match(noMerge.error!, /permiso/);
    ok(await host.command({ type: "history", fileId, name: "Ana", expectedVector: hs.vectors.main, action: { type: "merge", id: "approved", proposalId: "proposal", expectedHead: "main-update", choices: {} } }));
    assert.equal((await state(host, fileId)).workspace!.snapshots.main.content.big_picture.nodos![0].nombre, "Borrador sin commit");
    const latest = (await state(host, fileId)).workspace!;
    ok(await host.command({ type: "history", fileId, name: "Ana", expectedVector: latest.vectors.main, action: { type: "restore", id: "restore-initial", branchId: "main", commitId: latest.history.commits[0].id, scopes: ["design", "view:web", "project"] } }));
    const final = (await state(host, fileId)).workspace!; assert.deepEqual(final.snapshots.main, initial); assert.ok(final.history.commits.find(c => c.id === "restore-initial-before")); assert.ok(final.history.commits.find(c => c.id === "approved"));
    console.log("PASS: solicitud fija, aprobación autenticada y restauración de Principal con historial intacto");
    await guest.command({ type: "retry", fileId: other });
    const beforeDelegation = (await state(guest, other)).workspace!, delegatedDraft = structuredClone(beforeDelegation.snapshots.backend); delegatedDraft.content.big_picture.nodos![0].nombre = "Solicitud delegada";
    ok(await guest.command({ type: "patch", fileId: other, branchId: "backend", before: beforeDelegation.snapshots.backend, after: delegatedDraft }));
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", action: { type: "commit", id: "delegated-version", branchId: "backend", scopes: ["design"], message: "Nueva solicitud" } }));
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", action: { type: "propose", id: "delegated-proposal", branchId: "backend", targetId: "main", commitId: "delegated-version", scopes: ["design"], message: "Aprobación excepcional" } }));
    await eventually(async () => !!(await state(host, fileId)).workspace!.history.proposals.find(p => p.id === "delegated-proposal"), "Solicitud delegada publicada");
    ok(await host.command({ type: "history", fileId, name: "Ana", action: { type: "permission", id: "delegation", memberId: beforeDelegation.actor.id, permission: { mergeMain: true, proposalId: "delegated-proposal", until: new Date(Date.now() + 60_000).toISOString() } } }));
    await eventually(async () => { await guest.command({ type: "retry", fileId: other }); return !!(await state(guest, other)).workspace!.history.permissions[beforeDelegation.actor.id]; }, "Permiso excepcional sincronizado");
    const delegatedState = (await state(guest, other)).workspace!;
    const stillDenied = await guest.command({ type: "patch", fileId: other, branchId: "main", before: delegatedState.snapshots.main, after: delegatedDraft }); assert.match(stillDenied.error!, /permiso/);
    const review = ok(await guest.command({ type: "history-preview", fileId: other, branchId: "main", commitId: "delegated-version", scopes: ["design"] }));
    const choices = Object.fromEntries(review.preview!.conflicts.map(c => [c.id, "theirs" as const]));
    ok(await guest.command({ type: "history", fileId: other, name: "Luis", expectedVector: delegatedState.vectors.main, action: { type: "merge", id: "delegated-merge", proposalId: "delegated-proposal", expectedHead: "restore-initial", choices } }));
    await eventually(async () => !!(await state(host, fileId)).workspace!.history.commits.find(c => c.id === "delegated-merge"), "Fusión delegada confirmada");
    assert.equal((await state(host, fileId)).workspace!.snapshots.main.content.big_picture.nodos![0].nombre, "Solicitud delegada");
    const recovery = JSON.parse(ok(await host.command({ type: "recover", fileId })).recovery!); assert.ok(recovery.ramas.documents.backend); assert.ok(recovery.ramas.history.commits.some((c: { id: string }) => c.id === "delegated-merge"));
    console.log("PASS: permiso temporal por solicitud permite fusionar sin editar Principal; recuperación exporta todas las ramas");
  } finally { await guest.close(); await host.close(); rmSync(root, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
