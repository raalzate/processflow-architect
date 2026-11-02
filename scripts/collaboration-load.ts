/** Controlled load on isolated native profiles; never an Internet-wide capacity claim. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, cpus, freemem } from "node:os";
import { join, resolve, dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { CollaborationEngine } from "../main/services/collaboration/engine";
import type { SharedProject, CollaborationEvent } from "../src/lib/collaboration/types";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] : null;
async function run() {
  const root = mkdtempSync(join(tmpdir(), "pf-load-"));
  const output = resolve(process.argv[2] || "../network-load.json"), maximum = Number(process.argv[3] || 40);
  const relay = process.argv[4];
  const guests: CollaborationEngine[] = [], phases: unknown[] = [];
  let sequence = 0, phase: { pointer: number[]; document: number[]; seen: Map<string, number>; sent: Map<number, number>; changes: Map<string, number>; began: number } | undefined;
  const observe = (event: CollaborationEvent) => {
    if (!phase) return;
    for (const peer of event.presence ?? []) {
      if (event.fileId === "guest-0" && peer.name === "Persona 0") continue;
      const seq = peer.pointer?.x, key = `${event.fileId}:${peer.name}`;
      if (seq === undefined || seq <= (phase.seen.get(key) ?? -1)) continue;
      phase.seen.set(key, seq); const sent = phase.sent.get(seq); if (sent !== undefined) phase.pointer.push(performance.now() - sent);
    }
    const notes = event.snapshot?.content.notas;
    if (event.fileId === "guest-0" && typeof notes === "string" && phase.changes.has(notes)) { phase.document.push(performance.now() - phase.changes.get(notes)!); phase.changes.delete(notes); }
  };
  const host = new CollaborationEngine(join(root, "host"), observe, { publicNetwork: false });
  let model: SharedProject = { name: "Load", content: { nombre_proyecto: "Load", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, nombre: `Componente ${i}`, tipo_elemento: "custom", estado_comparativo: "nuevo", x: (i % 10) * 200, y: Math.floor(i / 10) * 100 })), aristas: [] }, politicas_inter_agregados: [] }, customViews: [], agent: { versions: [], lineages: [], artifacts: [] }, references: [], analysis: {} };
  try {
    await host.start(); assert.equal((await host.command({ type: "create", fileId: "host", initial: model, options: relay ? { relayUrls: [relay] } : {} })).error, undefined);
    for (const total of [2, 5, 10, 20, 40].filter(n => n <= maximum)) {
      let denied: string | undefined;
      while (guests.length < total - 1) {
        const index = guests.length, peer = new CollaborationEngine(join(root, `guest-${index}`), index === 0 ? observe : () => {}, { publicNetwork: false });
        await peer.start(); const invite = await host.command({ type: "invite", fileId: "host", role: "editor" });
        const result = await peer.command({ type: "join", fileId: `guest-${index}`, invitation: invite.invitation! });
        if (!result.status?.connected) { denied = result.status?.error || result.error || "Not connected"; await peer.close(); break; }
        guests.push(peer);
      }
      await wait(500);
      phase = { pointer: [], document: [], seen: new Map(), sent: new Map(), changes: new Map(), began: performance.now() };
      const timers: number[] = [], cpu = process.cpuUsage(), memoryBefore = process.memoryUsage().rss;
      let last = performance.now(), edits = 0;
      const timer = setInterval(() => {
        const now = performance.now(); timers.push(now - last); last = now;
        for (let index = 0; index < guests.length; index++) {
          const seq = ++sequence; phase!.sent.set(seq, performance.now());
          guests[index].presence(`guest-${index}`, { name: `Persona ${index}`, viewId: "design", selectedIds: [], pointer: { x: seq, y: index * 10 } });
        }
      }, 40);
      const editTimer = setInterval(() => {
        const notes = `change-${++edits}-${total}`, before = model;
        phase!.changes.set(notes, performance.now()); model = { ...model, content: { ...model.content, notas: notes } };
        void host.command({ type: "patch", fileId: "host", before, after: model });
      }, relay ? 500 : 200);
      await wait(5000); clearInterval(timer); clearInterval(editTimer); await wait(850);
      const p95 = percentile(phase.pointer, .95), doc95 = percentile(phase.document, .95);
      const selected = await Promise.all(guests.map((peer, i) => peer.command({ type: "open", fileId: `guest-${i}`, initial: model })));
      if (relay) assert.ok(selected.every(result => result.status?.route === "relay"), "The relay load test must stay relayed: UDP direct paths are blocked in its isolated runner");
      const capacity = (await host.command({ type: "open", fileId: "host", initial: model })).status?.capacity;
      const report = { requestedParticipants: total, connectedParticipants: guests.length + 1, denied, capacity, nodes: 100, samples: phase.pointer.length, pointerP50Ms: percentile(phase.pointer, .5), pointerP95Ms: p95, durableP95Ms: doc95, durableChangesSeen: phase.document.length, editsSent: edits, schedulerP95Ms: percentile(timers, .95), rssBytes: process.memoryUsage().rss, rssGrowthBytes: process.memoryUsage().rss - memoryBefore, cpuMicros: process.cpuUsage(cpu), selectedRoutes: selected.map(result => result.status?.route), fluid: p95 !== null && p95 < (relay ? 300 : 180) && doc95 !== null && doc95 < (relay ? 650 : 250) };
      phases.push(report); console.log(JSON.stringify(report)); phase = undefined;
      if (denied || (p95 !== null && p95 > 250)) break;
    }
  } finally {
    phase = undefined; for (const peer of guests) await peer.close(); await host.close();
    mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify({ measuredAt: new Date().toISOString(), environment: { platform: process.platform, cpus: cpus().length, freeMemoryBytes: freemem() }, scope: relay ? "Native QUIC over an isolated relay with direct UDP blocked and controlled network delay; not a worldwide maximum" : "Native QUIC direct connections on one machine; not a WAN or worldwide maximum", phases }, null, 2));
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); rmSync(root, { recursive: true, force: true });
  }
  assert.ok(phases.length); assert.ok((phases[0] as { fluid: boolean }).fluid, "Even two participants must deliver live pointers and durable edits fluidly");
  const first = phases[0] as { durableChangesSeen: number; editsSent: number };
  assert.ok(first.durableChangesSeen >= first.editsSent * .8, "Remote live editing must display most incremental states, not only a snapshot every 700 ms");
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
