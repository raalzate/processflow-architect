/** Capacidad observada con cada dispositivo en un proceso Node independiente. */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import type { CollaborationCommand, CollaborationResult, SharedProject } from "../src/lib/collaboration/types";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
class Device {
  private seq = 0; private pending = new Map<number, (r: any) => void>();
  private child: ReturnType<typeof spawn>;
  readonly ready: Promise<void>;
  constructor(root: string, receive: (event: any) => void) {
    this.child = spawn(process.execPath, ["--import", "tsx", "scripts/collaboration-worker.ts", root], { stdio: ["ignore", "ignore", "inherit", "ipc"], windowsHide: true });
    this.ready = new Promise((resolve, reject) => { this.child.on("error", reject); this.child.on("message", (m: any) => { if (m.ready) resolve(); else if (m.event) receive(m.event); else { this.pending.get(m.id)?.(m.result); this.pending.delete(m.id); } }); });
  }
  command(command: CollaborationCommand | unknown): Promise<CollaborationResult> { return new Promise((resolve, reject) => { const id = ++this.seq; const timer = setTimeout(() => reject(new Error("Dispositivo no respondió")), 30_000); this.pending.set(id, r => { clearTimeout(timer); resolve(r); }); this.child.send?.({ id, command }); }); }
  async close() { if (this.child.exitCode !== null) return; await new Promise<void>(resolve => { this.child.once("exit", () => resolve()); this.child.send?.({ id: 0, command: { type: "shutdown" } }); }); }
}
async function main() {
  const root = mkdtempSync(join(tmpdir(), "pf-process-capacity-")), output = resolve(process.argv[2] ?? "../../work/correcciones-19-capacidad-procesos.json"), devices: Device[] = [];
  const sent = new Map<number, number>(), samples: number[] = [];
  const observe = (event: any) => { for (const p of event.presence ?? []) { const started = sent.get(p.pointer?.x); if (p.name === "Persona 1" && started !== undefined) { samples.push(performance.now() - started); sent.delete(p.pointer.x); } } };
  const make = async (id: string, receive = (_event: any) => {}) => { const d = new Device(join(root, id), receive); devices.push(d); await d.ready; return d; };
  const initial: SharedProject = { name: "Carga aislada", content: { nombre_proyecto: "Carga aislada", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, nombre: `Nodo ${i}`, tipo_elemento: "custom", estado_comparativo: "nuevo" as const, x: i * 20, y: 20 })), aristas: [] }, politicas_inter_agregados: [] }, customViews: [], references: [], agent: { versions: [], lineages: [], artifacts: [] }, analysis: {} };
  try {
    const host = await make("host"); assert.equal((await host.command({ type: "create", fileId: "host", initial, options: {} })).error, undefined);
    const guests: Device[] = []; let denied: string | undefined;
    for (let i = 0; i < 10; i++) {
      const guest = await make(`guest-${i}`, i === 0 ? observe : undefined);
      const invitation = (await host.command({ type: "invite", fileId: "host", role: "editor" })).invitation!;
      let result = await guest.command({ type: "join", fileId: `guest-${i}`, invitation, name: `Persona ${i}` });
      // La admisión se reevalúa sola; jamás se fuerza un asiento por encima del cupo.
      if (!result.status?.connected) { await wait(15_100); result = await guest.command({ type: "open", fileId: `guest-${i}`, initial }); }
      if (!result.status?.connected) { denied = result.status?.error ?? result.error; break; }
      guests.push(guest); console.log(`Conectados: ${guests.length + 1}`);
    }
    let sequence = 0;
    for (let frame = 0; frame < 60; frame++) {
      await Promise.all(guests.map((guest, index) => { const x = ++sequence; if (index === 1) sent.set(x, performance.now()); return guest.command({ type: "publish-presence", fileId: `guest-${index}`, presence: { name: `Persona ${index}`, viewId: "design", selectedIds: [], pointer: { x, y: 40 } } }); }));
      await wait(60);
    }
    await wait(500); samples.sort((a, b) => a - b);
    const status = (await host.command({ type: "open", fileId: "host", initial })).status!;
    const result = { scope: "Dispositivos aislados en procesos independientes, QUIC local; no representa Internet ni un máximo universal", connected: guests.length + 1, estimatedCapacity: status.capacity, nodes: 100, pointerSamples: samples.length, pointerP95Ms: samples[Math.floor((samples.length - 1) * .95)], denied };
    writeFileSync(output, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
    assert(guests.length >= 1); assert(samples.length > 0 || guests.length < 2);
  } finally { await Promise.allSettled(devices.map(d => d.close())); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
