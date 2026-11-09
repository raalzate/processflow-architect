/** QUIC real, perfiles temporales; nunca abre ni modifica proyectos del usuario. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSocket } from "node:dgram";
import { CollaborationEngine } from "../main/services/collaboration/engine";
import type { CollaborationResult, SharedProject } from "../src/lib/collaboration/types";
import type { Presence } from "../src/lib/collaboration/presence";
import type { Connection } from "@number0/iroh";

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const initial: SharedProject = { name: "Prueba aislada", content: { nombre_proyecto: "Prueba aislada", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] }, customViews: [], agent: { versions: [], lineages: [], artifacts: [] }, references: [], analysis: {} };
function ok(result: CollaborationResult) { assert.equal(result.error, undefined); return result; }
async function until(check: () => Promise<boolean> | boolean, message: string) {
  const end = performance.now() + 15_000;
  while (performance.now() < end) { if (await check()) return; await wait(60); }
  throw new Error(message);
}
type Internals = { rooms: Map<string, { connection?: Connection; clients: Map<string, Connection> }>; presenceChannels: Map<Connection, unknown> };
async function main() {
  const root = mkdtempSync(join(tmpdir(), "processflow-session-")), engines: CollaborationEngine[] = [];
  const presences = new Map<string, Presence[]>();
  const make = async (id: string) => { const engine = new CollaborationEngine(join(root, id), e => { if (e.presence) presences.set(id, e.presence); }, { publicNetwork: false }); engines.push(engine); await engine.start(); return engine; };
  let blocker: ReturnType<typeof createSocket> | undefined;
  try {
    let host = await make("host");
    const created = ok(await host.command({ type: "create", fileId: "host", initial, options: {}, name: "Ana" }));
    const invite = async () => ok(await host.command({ type: "invite", fileId: "host", role: "editor" })).invitation!;
    const invitation = await invite();
    const idleStart = performance.now();
    console.log("Esperando 65 s sin invitados para probar admisión tardía…");
    await wait(65_100); assert(performance.now() - idleStart >= 65_000);
    const guest = await make("guest"), guest2 = await make("guest2");
    ok(await guest.command({ type: "join", fileId: "guest", invitation, name: "Nafes" }));
    const open = (engine: CollaborationEngine, fileId: string) => engine.command({ type: "open", fileId, initial });
    await until(async () => (await open(guest, "guest")).status?.connected === true, "No admitió el primer invitado después del reposo");
    ok(await guest2.command({ type: "join", fileId: "guest2", invitation: await invite(), name: "Luis" }));
    await until(async () => (await open(guest2, "guest2")).status?.connected === true, "No admitió un segundo invitado");
    assert.equal(ok(await open(host, "host")).status?.peers, 3);
    console.log("PASS: sala inactiva >65 s admite dos personas después, sin reiniciarla.");

    const internals = host as unknown as Internals, guestInternals = guest as unknown as Internals;
    const connections = [...internals.rooms.get("host")!.clients.values(), guestInternals.rooms.get("guest")!.connection!];
    let datagrams = 0;
    for (const connection of connections) {
      assert(internals.presenceChannels.has(connection) || guestInternals.presenceChannels.has(connection), "No negoció presencia fiable");
      Object.defineProperty(connection, "sendDatagram", { configurable: true, value: () => { datagrams++; throw new Error("Datagramas indisponibles en esta prueba"); } });
      Object.defineProperty(connection, "maxDatagramSize", { configurable: true, value: () => null });
    }
    const publish = (engine: CollaborationEngine, fileId: string, name: string, sessionId: string, x: number) => engine.presence(fileId, { name, branchId: "shared", viewId: "design", sessionId, pointer: { x, y: 30 }, selectedIds: [], connecting: { sourceId: "node", x, y: 40, anchor: { x: 1, y: .5 } } });
    for (let x = 0; x < 12; x++) { publish(guest, "guest", "Nafes", "window-a", x * 10); await wait(35); }
    publish(guest, "guest", "Nafes", "window-b", 99);
    publish(host, "host", "Ana", "window-host", 120);
    await until(() => !!presences.get("host")?.some(p => p.sessionId === "window-a" && p.pointer?.x === 110 && p.connecting?.anchor?.x === 1) && !!presences.get("host")?.some(p => p.sessionId === "window-b") && !!presences.get("guest")?.some(p => p.name === "Ana" && p.pointer?.x === 120), "No llegó la presencia fiable bidireccional");
    assert.equal(datagrams, 0);
    const roster = ok(await open(host, "host")).status?.participants!;
    assert.equal(roster.length, 3); assert(roster.some(p => p.name === "Nafes"));
    console.log("PASS: punteros y flecha desde el puerto entre ventanas, sin usar datagramas; lista con 3 personas.");

    await guest.close(); await guest2.close(); await host.close();
    const before = JSON.parse(readFileSync(join(root, "host", "device.json"), "utf8"));
    blocker = createSocket("udp4");
    // N-API puede retener el socket cerrado mientras siguen vivos wrappers de conexión.
    // Simulamos el puerto guardado ocupado de forma determinista en este perfil de prueba.
    await new Promise<void>((resolve, reject) => { blocker!.once("error", reject); blocker!.bind({ address: "0.0.0.0", port: 0, exclusive: true }, resolve); });
    const occupiedPort = (blocker.address() as { port: number }).port;
    writeFileSync(join(root, "host", "device.json"), JSON.stringify({ ...before, port: occupiedPort }));
    host = await make("host");
    const after = JSON.parse(readFileSync(join(root, "host", "device.json"), "utf8"));
    assert.notEqual(after.port, occupiedPort); assert.deepEqual(after.key, before.key);
    const restored = ok(await open(host, "host")); assert.equal(restored.status?.projectId, created.status?.projectId); assert.equal(restored.snapshot?.name, initial.name);
    const late = await make("late");
    ok(await late.command({ type: "join", fileId: "late", invitation: await invite(), name: "Paula" }));
    await until(async () => (await open(late, "late")).status?.connected === true, "No conectó al nuevo puerto");
    console.log("PASS: puerto UDP guardado ocupado; recupera otro puerto manteniendo identidad y proyecto.");
  } finally {
    blocker?.close(); await Promise.allSettled(engines.map(engine => engine.close()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
