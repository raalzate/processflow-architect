import assert from "node:assert/strict";
import { Endpoint, EndpointAddr, RelayMode, type Connection } from "@number0/iroh";
import { deadline, readFrame, sendFrame } from "../main/services/collaboration/wire";

async function run() {
  const url = process.argv[2] || "http://127.0.0.1:3340",
    alpn = [...Buffer.from("pf-relay-smoke/1")];
  const build = async (relay = true) => {
    const builder = Endpoint.builder();
    builder.applyMinimal();
    builder.alpns([alpn]);
    if (relay) builder.relayMode(RelayMode.customFromUrls([url]));
    const endpoint = await builder.bind();
    if (relay) await deadline(endpoint.online());
    return endpoint;
  };
  const a = await build(),
    b = await build(),
    c = await build(false),
    servers: Connection[] = [];
  const accept = async () => {
    const offer = await deadline(a.acceptNext());
    assert.ok(offer);
    const connection = await (await offer.accept()).connect();
    servers.push(connection);
    return connection;
  };
  const roundtrip = async (client: Connection, server: Connection, text: string) => {
    const receive = (async () => {
      const stream = await server.acceptBi();
      assert.deepEqual(await readFrame(stream), { text });
      await sendFrame(stream, { ok: true });
    })();
    const stream = await client.openBi();
    await sendFrame(stream, { text });
    assert.deepEqual(await readFrame(stream), { ok: true });
    await receive;
  };
  try {
    const acceptingRelay = accept();
    // Sin direcciones directas conocidas: el primer contacto necesita el relay.
    const relayed = await deadline(b.connect(new EndpointAddr(a.id(), url, []), alpn));
    const relayServer = await acceptingRelay,
      stableId = relayed.stableId();
    await roundtrip(relayed, relayServer, "relay propio");
    console.log(
      "PASS: encrypted bidirectional stream through an independently hosted relay (no public services)",
    );
    const acceptingDirect = accept();
    const direct = await deadline(
      c.connect(new EndpointAddr(a.id(), null, a.addr().directAddresses()), alpn),
    );
    const directServer = await acceptingDirect;
    await Promise.all([
      roundtrip(direct, directServer, "participante directo"),
      roundtrip(relayed, relayServer, "participante inicialmente por relay"),
    ]);
    assert.ok(direct.paths().some(path => path.isSelected && path.isIp));
    console.log("PASS: participants using different routes exchange data with the same host concurrently");
    for (let i = 0; i < 100 && !relayed.paths().some(path => path.isSelected && path.isIp); i++)
      await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(
      relayed.paths().some(path => path.isSelected && path.isIp),
      "upgrade to a direct path when available",
    );
    assert.equal(relayed.stableId(), stableId, "the existing QUIC connection survives the path upgrade");
    await roundtrip(relayed, relayServer, "directo sin reiniciar");
    console.log(
      "PASS: relay becomes direct in the background without replacing the connection or losing a message",
    );
    direct.close(BigInt(0), []);
    relayed.close(BigInt(0), []);
  } finally {
    for (const connection of servers) connection.close(BigInt(0), []);
    await a.close();
    await b.close();
    await c.close();
  }
}
run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
