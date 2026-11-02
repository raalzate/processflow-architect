import assert from "node:assert/strict";
import { Endpoint, EndpointAddr, RelayMode } from "@number0/iroh";
import { deadline, readFrame, sendFrame } from "../main/services/collaboration/wire";

async function run() {
  const url = process.argv[2] || "http://127.0.0.1:3340"; const alpn = [...Buffer.from("pf-relay-smoke/1")];
  const build = async () => { const builder = Endpoint.builder(); builder.applyMinimal(); builder.alpns([alpn]); builder.relayMode(RelayMode.customFromUrls([url])); const e = await builder.bind(); await deadline(e.online()); return e; };
  const a = await build(), b = await build();
  try {
    const incoming = (async () => { const offer = await deadline(a.acceptNext()); assert.ok(offer); const c = await (await offer.accept()).connect(); const stream = await c.acceptBi(); const message = await readFrame(stream); assert.deepEqual(message, { text: "relay propio" }); await sendFrame(stream, { ok: true }); return c; })();
    // No direct addresses: the first stream must start through our relay.
    const connection = await deadline(b.connect(new EndpointAddr(a.id(), url, []), alpn));
    const stream = await connection.openBi(); await sendFrame(stream, { text: "relay propio" });
    assert.deepEqual(await readFrame(stream), { ok: true }); const server = await incoming;
    console.log("PASS: encrypted bidirectional stream through an independently hosted relay (no public services)");
    connection.close(BigInt(0), []); server.close(BigInt(0), []);
  } finally { await a.close(); await b.close(); }
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
