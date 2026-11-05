/** El coste recurrente caduca al dejar de recibir solicitudes; un GC aislado no fija el cupo. */
export class RecurringServiceCost {
  private samples: { cost: number; at: number }[] = [];
  record(cost: number, at: number) {
    if (!Number.isFinite(cost) || cost < 0) return;
    this.prune(at); this.samples.push({ cost, at });
    if (this.samples.length > 32) this.samples.shift();
  }
  private prune(now: number) { this.samples = this.samples.filter(s => now - s.at < 15_000); }
  value(now: number): number | undefined {
    this.prune(now); if (!this.samples.length) return undefined;
    const costs = this.samples.map(s => s.cost).sort((a, b) => a - b);
    return costs[Math.floor((costs.length - 1) * .75)];
  }
}
/** Sólo un incremento reciente del contador de congestión respalda limitar por la ventana QUIC. */
export class RecentCongestion {
  private paths = new Map<string, { count: number; seenAt: number; congestedAt?: number }>();
  observe(key: string, count: number, now: number): boolean {
    for (const [id, entry] of this.paths) if (entry.seenAt < now - 60_000) this.paths.delete(id);
    const previous = this.paths.get(key);
    const congestedAt = previous && count >= previous.count ? count > previous.count ? now : previous.congestedAt : undefined;
    this.paths.set(key, { count, seenAt: now, congestedAt });
    return congestedAt !== undefined && now - congestedAt < 15_000;
  }
}
