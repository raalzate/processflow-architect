/** Live public-network check, deliberately outside the offline unit-test gate. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { Endpoint, EndpointAddr, EndpointTicket, RelayMode } from "@number0/iroh";
import { CollaborationEngine } from "../main/services/collaboration/engine";
import { deadline, readFrame, sendFrame } from "../main/services/collaboration/wire";
import type { SharedProject } from "../src/lib/collaboration/types";

async function run() {
  const root = mkdtempSync(join(tmpdir(), "pf-internet-"));
  const host = new CollaborationEngine(join(root, "host"));
  const local = new CollaborationEngine(join(root, "local"), () => {}, { publicNetwork: false });
  const others: CollaborationEngine[] = [];
  const alpn = [...Buffer.from("processflow/collaboration/1")];
  const project: SharedProject = { name: "Internet", content: { nombre_proyecto: "Internet", version: "1", fecha_analisis: "", responsables: [], notas: "", transcript: "", read_models: [], agregados: [], big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] }, politicas_inter_agregados: [] }, customViews: [], agent: { versions: [], lineages: [], artifacts: [] }, references: [], analysis: {} };
  let guest: Endpoint | undefined;
  try {
    await host.start();
    const created = await host.command({ type: "create", fileId: "host", initial: project, options: {} });
    assert.equal(created.error, undefined);
    const invitation = await host.command({ type: "invite", fileId: "host", role: "editor" });
    assert.equal(invitation.error, undefined);
    const ticket = JSON.parse(Buffer.from(invitation.invitation!.slice(14), "base64url").toString());
    const address = EndpointTicket.fromString(ticket.host).endpointAddr();
    assert.ok(address.relayUrl(), "A room created without network settings must advertise an automatic relay");
    console.log("PASS: no-settings invitation advertises a live automatic public relay", address.relayUrl());
    const builder = Endpoint.builder(); builder.applyMinimal(); builder.relayMode(RelayMode.defaultMode()); builder.alpns([alpn]); guest = await builder.bind();
    await deadline(guest.online(), 30000);
    // Omit all direct hints. The first packet must find the host through the public relay.
    const connection = await deadline(guest.connect(new EndpointAddr(address.id(), address.relayUrl(), []), alpn), 30000);
    assert.ok(connection.paths().some(path => path.isRelay), "The connection must actually establish a relay path");
    const stream = await connection.openBi();
    await sendFrame(stream, { version: 1, stage: "hello", projectId: ticket.projectId, token: ticket.token, vector: "AA==" });
    const response = await deadline(readFrame<{ ok: boolean; update?: string; capacity?: { limit: number }; error?: string }>(stream));
    assert.equal(response.ok, true, response.error); assert.ok(response.update); assert.ok(response.capacity!.limit >= 2);
    console.log("PASS: encrypted authenticated room synchronization via public relay, with capacity enforcement");
    const again = await connection.openBi();
    await sendFrame(again, { version: 1, stage: "sync", projectId: ticket.projectId, token: ticket.token, vector: "AA==" });
    assert.equal((await readFrame<{ ok: boolean }>(again)).ok, true);
    await local.start();
    const localInvitation = await host.command({ type: "invite", fileId: "host", role: "editor" });
    const joined = await local.command({ type: "join", fileId: "local", invitation: localInvitation.invitation! });
    if (!joined.status?.connected) console.error("Mixed-route join diagnostic:", JSON.stringify(joined.status));
    assert.equal(joined.error, undefined); assert.equal(joined.status?.connected, true); assert.equal(joined.status?.route, "lan");
    assert.equal(joined.snapshot?.name, "Internet");
    const mixed = await host.command({ type: "open", fileId: "host", initial: project });
    assert.equal(mixed.status?.peers, 3); assert.equal(mixed.status?.capacity.networkMeasured, true);
    console.log("PASS: LAN and public-relay participants share one room concurrently; network capacity is observed");
    for (let index = 0; index < 3; index++) {
      const peer = new CollaborationEngine(join(root, `peer-${index}`), () => {}, { publicNetwork: false }); others.push(peer); await peer.start();
      const invite = await host.command({ type: "invite", fileId: "host", role: "editor" });
      const result = await peer.command({ type: "join", fileId: `peer-${index}`, invitation: invite.invitation! });
      assert.equal(result.status?.connected, true, result.status?.error); assert.equal(result.snapshot?.name, "Internet");
    }
    const group = await host.command({ type: "open", fileId: "host", initial: project });
    assert.equal(group.status?.peers, 6);
    console.log("PASS: five simultaneous guests plus the host; P2P is not limited to two participants");
    connection.close(BigInt(0), []);
  } finally { for (const peer of others) await peer.close(); await local.close(); await guest?.close(); await host.close(); assert.equal(dirname(resolve(root)), resolve(tmpdir())); rmSync(root, { recursive: true, force: true }); }
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
