import type { Capacity } from "./types";

export function estimateCapacity(input: {
  freeMemoryBytes: number; projectBytes: number; mergeMs: number;
  uploadBytesPerSecond?: number; updateBytesPerSecond?: number;
}): Capacity {
  const memoryPerPeer = Math.max(16 * 1024 ** 2, input.projectBytes * 6);
  const memory = Math.floor(Math.max(0, input.freeMemoryBytes * 0.25) / memoryPerPeer);
  // Reserve most of each second for the local editor and background work.
  const cpu = Math.floor(120 / Math.max(0.25, input.mergeMs));
  const networkMeasured = !!input.uploadBytesPerSecond && !!input.updateBytesPerSecond;
  const network = networkMeasured ? Math.floor(input.uploadBytesPerSecond! * 0.5 / input.updateBytesPerSecond!) : Infinity;
  const limit = Math.max(1, Math.floor(Math.min(memory, cpu, network)));
  return { ...input, limit, networkMeasured, reason: networkMeasured ? "Presupuesto medido de memoria, sincronización y subida." : "Estimación provisional de memoria y sincronización; la subida aún no está medida." };
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
