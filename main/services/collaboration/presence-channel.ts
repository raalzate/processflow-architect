import type { Connection, SendStream, RecvStream } from "@number0/iroh";
import { deadline } from "./wire";

/** Presencia efímera en un stream QUIC propio: funciona aunque el camino no admita datagramas. */
export class PresenceChannel {
  private pending = new Map<string, unknown>();
  private sending = false;
  private closed = false;
  private outbound?: SendStream;
  private inbound?: RecvStream;
  constructor(private connection: Pick<Connection, "openUni" | "acceptUni" | "closeReason">, private receive: (value: unknown) => void) { void this.read(); }
  send(key: string, value: unknown) {
    if (this.closed || this.connection.closeReason() !== null) return;
    if (!this.pending.has(key) && this.pending.size >= 64) this.pending.delete(this.pending.keys().next().value!);
    this.pending.set(key, value); void this.flush();
  }
  private async flush() {
    if (this.sending || this.closed) return;
    this.sending = true;
    try {
      while (this.pending.size && !this.closed && this.connection.closeReason() === null) {
        if (!this.outbound) { this.outbound = await deadline(this.connection.openUni(), 2000); await this.outbound.setPriority(10); }
        const first = this.pending.entries().next().value!; this.pending.delete(first[0]);
        const bytes = Buffer.from(JSON.stringify(first[1])); if (bytes.length > 8192) continue;
        const frame = Buffer.alloc(4 + bytes.length); frame.writeUInt32BE(bytes.length); frame.set(bytes, 4);
        await deadline(this.outbound.writeAll([...frame]), 2000);
      }
    } catch {
      void this.outbound?.reset(BigInt(1)).catch(() => {}); this.outbound = undefined;
      // Se conserva sólo la muestra más reciente que llegue después, nunca una cola de movimiento viejo.
    } finally { this.sending = false; }
  }
  private async read() {
    while (!this.closed && this.connection.closeReason() === null) {
      try {
        this.inbound = await this.connection.acceptUni();
        while (!this.closed) {
          const header = Buffer.from(await this.inbound.readExact(4)), size = header.readUInt32BE();
          if (size > 8192) { await this.inbound.stop(BigInt(1)); break; }
          const bytes = await this.inbound.readExact(size);
          try { this.receive(JSON.parse(Buffer.from(bytes).toString("utf8"))); } catch { /* Un paquete inválido no termina la presencia de la sesión. */ }
        }
      } catch {
        if (this.closed || this.connection.closeReason() !== null) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }
  close() { this.closed = true; this.pending.clear(); void this.outbound?.reset(BigInt(0)).catch(() => {}); void this.inbound?.stop(BigInt(0)).catch(() => {}); }
}
