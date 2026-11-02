import type { Capacity } from "./types";

export function estimateCapacity(input: {
  freeMemoryBytes: number; projectBytes: number; mergeMs: number;
  uploadBytesPerSecond?: number; updateBytesPerSecond?: number;
  networkSource?: "transport";
}): Capacity {
  const memoryPerPeer = Math.max(16 * 1024 ** 2, input.projectBytes * 6);
  const memory = Math.floor(Math.max(0, input.freeMemoryBytes * 0.25) / memoryPerPeer);
  // Reserve most of each second for the local editor and background work.
  const cpu = Math.floor(120 / Math.max(0.25, input.mergeMs));
  const networkMeasured = [input.uploadBytesPerSecond, input.updateBytesPerSecond].every(value => typeof value === "number" && Number.isFinite(value) && value > 0);
  const network = networkMeasured ? 1 + Math.floor(input.uploadBytesPerSecond! * 0.5 / input.updateBytesPerSecond!) : Infinity;
  const limit = Math.max(1, Math.floor(Math.min(memory, cpu, network)));
  return { ...input, limit, networkMeasured, reason: networkMeasured ? input.networkSource === "transport" ? "Estimación de memoria, sincronización y transporte observado; se ajusta con la actividad y la red." : "Presupuesto medido de memoria, sincronización y subida." : "Estimación provisional de memoria y sincronización; se ajustará al observar conexiones." };
}

/** Presupuesto conservador del transporte real; no es una prueba de velocidad. */
export class NetworkLoad {
  private buckets = new Map<number, number>();
  record(bytes: number, now: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    this.prune(now);
    const bucket = Math.floor(now / 1000);
    this.buckets.set(bucket, (this.buckets.get(bucket) ?? 0) + bytes);
  }
  private prune(now: number) {
    for (const bucket of this.buckets.keys()) if (bucket * 1000 <= now - 5000) this.buckets.delete(bucket);
  }
  budget(paths: { cwnd: number; rttMs: number }[], now: number): { uploadBytesPerSecond?: number; updateBytesPerSecond?: number; networkSource?: "transport" } {
    this.prune(now);
    const rates = paths.filter(p => Number.isFinite(p.cwnd) && p.cwnd > 0 && Number.isFinite(p.rttMs) && p.rttMs > 0)
      .map(p => p.cwnd * 1000 / Math.max(10, p.rttMs));
    if (!rates.length) return {};
    // Una LAN rápida no debe ocultar la presión del camino directo/relay lento.
    return { uploadBytesPerSecond: Math.min(...rates), updateBytesPerSecond: Math.max(16384, [...this.buckets.values()].reduce((a, b) => a + b, 0) * 2 / 5), networkSource: "transport" };
  }
}

/** Synchronous reservation: checking and occupying never yield between steps. */
export class Seats {
  private members = new Set<string>();
  constructor(private limit: number) {}
  get count() { return this.members.size + 1; }
  enter(id: string): boolean {
    if (this.members.has(id)) return true;
    if (this.count >= this.limit) return false;
    this.members.add(id); return true;
  }
  leave(id: string) { this.members.delete(id); }
  resize(limit: number) { this.limit = Math.max(1, Math.floor(limit)); }
}
