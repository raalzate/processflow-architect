import dgram from "node:dgram";
import { networkInterfaces } from "node:os";
import { EndpointTicket, type Endpoint, type EndpointAddr } from "@number0/iroh";

const GROUP = "239.255.77.33",
  PORT = 48572;
/** Optional LAN address discovery. Peer identity is still authenticated by QUIC. */
export class LanDiscovery {
  private socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  private cache = new Map<string, { address: EndpointAddr; seen: number }>();
  private timer?: ReturnType<typeof setInterval>;
  private ready = false;
  constructor(private endpoint: Endpoint) {
    this.socket.on("error", () => {
      /* Multicast can be blocked; tickets/relays remain usable. */
    });
    this.socket.on("message", bytes => {
      if (bytes.length > 8192) return;
      try {
        const message = JSON.parse(bytes.toString("utf8"));
        if (message.format !== "processflow-lan/1") return;
        if (message.find === this.endpoint.id().toString()) this.announce();
        if (typeof message.ticket === "string") {
          const address = EndpointTicket.fromString(message.ticket).endpointAddr();
          this.cache.set(address.id().toString(), { address, seen: Date.now() });
        }
      } catch {
        /* Ignore unrelated/invalid LAN datagrams. */
      }
    });
    this.socket.bind(PORT, "0.0.0.0", () => {
      this.ready = true;
      this.socket.setMulticastTTL(1);
      for (const iface of this.interfaces())
        try {
          this.socket.addMembership(GROUP, iface);
        } catch {
          /* Interface may not support multicast. */
        }
      this.announce();
      this.timer = setInterval(() => this.announce(), 3000);
      this.timer.unref();
      this.socket.unref();
    });
  }
  private interfaces() {
    return Object.values(networkInterfaces())
      .flatMap(list => list ?? [])
      .filter(n => n.family === "IPv4" && !n.internal)
      .map(n => n.address);
  }
  private broadcast(message: unknown) {
    if (!this.ready) return;
    const bytes = Buffer.from(JSON.stringify(message));
    for (const iface of this.interfaces())
      try {
        this.socket.setMulticastInterface(iface);
        this.socket.send(bytes, PORT, GROUP, () => {});
      } catch {
        /* Network changed. */
      }
  }
  private announce() {
    this.broadcast({
      format: "processflow-lan/1",
      ticket: EndpointTicket.fromAddr(this.endpoint.addr()).toString(),
    });
  }
  async find(id: string): Promise<EndpointAddr | undefined> {
    const cached = this.cache.get(id);
    if (cached && Date.now() - cached.seen < 15_000) return cached.address;
    this.broadcast({ format: "processflow-lan/1", find: id });
    await new Promise(resolve => setTimeout(resolve, 200));
    const result = this.cache.get(id);
    return result && Date.now() - result.seen < 15_000 ? result.address : undefined;
  }
  close() {
    if (this.timer) clearInterval(this.timer);
    try {
      this.socket.close();
    } catch {
      /* never bound */
    }
  }
}
