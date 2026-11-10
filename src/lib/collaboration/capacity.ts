import type { Capacity, PeerRoute } from "./types";

export const MIN_ROOM_CAPACITY = 5; // Incluye al anfitrión.

/**
 * Memoria reutilizable en macOS a partir de la salida de `vm_stat` (#750).
 * `os.freemem()` allí cuenta sólo las páginas libres —decenas de MB en una Mac
 * con 16 GB, porque el sistema llena la RAM de caché— y el cupo de la sala caía
 * siempre al mínimo. Las inactivas, especulativas y purgables se recuperan sin
 * presión de memoria, así que cuentan como disponibles. `undefined` si la salida
 * no se puede leer: quien llama cae a `os.freemem()`.
 */
export function availableMemoryFromVmStat(salida: string): number | undefined {
  const pagina = /page size of (\d+) bytes/.exec(salida);
  if (!pagina) return undefined;
  const paginas = (nombre: string) => {
    const m = new RegExp(`^Pages ${nombre}:\\s+(\\d+)\\.`, "m").exec(salida);
    return m ? Number(m[1]) : undefined;
  };
  const libres = paginas("free");
  if (libres === undefined) return undefined;
  const total = libres + (paginas("inactive") ?? 0) + (paginas("speculative") ?? 0) + (paginas("purgeable") ?? 0);
  return total * Number(pagina[1]);
}

export interface RoutePathMeasurement {
  route: PeerRoute;
  cwnd: number;
  rttMs: number;
  calibrated?: boolean;
}

export function estimateCapacity(input: {
  freeMemoryBytes: number;
  projectBytes: number;
  mergeMs: number;
  uploadBytesPerSecond?: number;
  directUploadBytesPerSecond?: number;
  relayUploadBytesPerSecond?: number;
  updateBytesPerSecond?: number;
  networkSource?: "transport";
  routeAware?: boolean;
  calibrating?: boolean;
}): Capacity {
  const memoryPerPeer = Math.max(16 * 1024 ** 2, input.projectBytes * 6);
  const memory = Math.floor(Math.max(0, input.freeMemoryBytes * 0.25) / memoryPerPeer);
  // Reserve most of each second for the local editor and background work.
  const cpu = Math.floor(120 / Math.max(0.25, input.mergeMs));
  const hostLimit = Math.max(MIN_ROOM_CAPACITY, Math.min(memory, cpu));
  const hasUpdateRate =
    typeof input.updateBytesPerSecond === "number" &&
    Number.isFinite(input.updateBytesPerSecond) &&
    input.updateBytesPerSecond > 0;

  if (input.routeAware) {
    const hostGuestMax = hostLimit - 1;
    const hasDirect =
      hasUpdateRate &&
      typeof input.directUploadBytesPerSecond === "number" &&
      Number.isFinite(input.directUploadBytesPerSecond) &&
      input.directUploadBytesPerSecond > 0;
    const hasRelay =
      hasUpdateRate &&
      typeof input.relayUploadBytesPerSecond === "number" &&
      Number.isFinite(input.relayUploadBytesPerSecond) &&
      input.relayUploadBytesPerSecond > 0;
    const directGuestLimit = hasDirect
      ? Math.min(
          hostGuestMax,
          Math.max(1, Math.floor((input.directUploadBytesPerSecond! * 0.5) / input.updateBytesPerSecond!)),
        )
      : undefined;
    const relayGuestLimit = hasRelay
      ? Math.min(
          hostGuestMax,
          Math.max(1, Math.floor((input.relayUploadBytesPerSecond! * 0.5) / input.updateBytesPerSecond!)),
        )
      : undefined;
    const networkMeasured = hasDirect || hasRelay;
    return {
      freeMemoryBytes: input.freeMemoryBytes,
      projectBytes: input.projectBytes,
      mergeMs: input.mergeMs,
      limit: hostLimit,
      ...(directGuestLimit !== undefined ? { directGuestLimit } : {}),
      ...(relayGuestLimit !== undefined ? { relayGuestLimit } : {}),
      networkMeasured,
      reason:
        input.calibrating && !networkMeasured
          ? "Estimación de memoria y sincronización; rutas observadas en calibración (LAN, P2P y relay independientes)."
          : networkMeasured
            ? "Cupo independiente por ruta: un límite en relay no bloquea entradas por red local (LAN) ni P2P directo."
            : "Estimación de memoria y sincronización; admite conexiones combinadas por LAN, P2P directo y respaldo.",
    };
  }

  const networkMeasured =
    hasUpdateRate &&
    typeof input.uploadBytesPerSecond === "number" &&
    Number.isFinite(input.uploadBytesPerSecond) &&
    input.uploadBytesPerSecond > 0;
  const network = networkMeasured
    ? 1 + Math.floor((input.uploadBytesPerSecond! * 0.5) / input.updateBytesPerSecond!)
    : Infinity;
  const limit = Math.max(MIN_ROOM_CAPACITY, Math.min(hostLimit, network));
  return {
    ...input,
    limit,
    networkMeasured,
    reason: networkMeasured
      ? input.networkSource === "transport"
        ? "Estimación de memoria, sincronización y transporte observado; se ajusta con la actividad y la red."
        : "Presupuesto medido de memoria, sincronización y subida."
      : "Estimación provisional de memoria y sincronización; se ajustará al observar conexiones.",
  };
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
  private currentUpdateRate(): number {
    return Math.max(16384, ([...this.buckets.values()].reduce((a, b) => a + b, 0) * 2) / 5);
  }
  hasRecentActivity(now: number): boolean { this.prune(now); return this.buckets.size > 0; }
  budget(
    paths: { cwnd: number; rttMs: number }[],
    now: number,
  ): { uploadBytesPerSecond?: number; updateBytesPerSecond?: number; networkSource?: "transport" } {
    this.prune(now);
    const rates = paths
      .filter(p => Number.isFinite(p.cwnd) && p.cwnd > 0 && Number.isFinite(p.rttMs) && p.rttMs > 0)
      .map(p => (p.cwnd * 1000) / Math.max(10, p.rttMs));
    if (!rates.length) return {};
    // Una LAN rápida no debe ocultar la presión del camino directo/relay lento.
    return {
      uploadBytesPerSecond: Math.min(...rates),
      updateBytesPerSecond: this.currentUpdateRate(),
      networkSource: "transport",
    };
  }
  /** Mide P2P directo y relay por separado sin que el relay frene a LAN ni a P2P. */
  routeBudgets(
    paths: RoutePathMeasurement[],
    now: number,
  ): {
    directUploadBytesPerSecond?: number;
    relayUploadBytesPerSecond?: number;
    updateBytesPerSecond?: number;
    networkSource?: "transport";
    calibrating?: boolean;
  } {
    this.prune(now);
    const valid = paths.filter(
      p =>
        p.route !== "lan" && Number.isFinite(p.cwnd) && p.cwnd > 0 && Number.isFinite(p.rttMs) && p.rttMs > 0,
    );
    if (!valid.length) return {};
    const calibrating = valid.some(p => p.calibrated === false);
    const directRates = valid
      .filter(p => p.route === "direct" && p.calibrated !== false)
      .map(p => (p.cwnd * 1000) / Math.max(10, p.rttMs));
    const relayRates = valid
      .filter(p => p.route === "relay" && p.calibrated !== false)
      .map(p => (p.cwnd * 1000) / Math.max(10, p.rttMs));
    if (!directRates.length && !relayRates.length) return { calibrating };
    return {
      ...(directRates.length ? { directUploadBytesPerSecond: Math.min(...directRates) } : {}),
      ...(relayRates.length ? { relayUploadBytesPerSecond: Math.min(...relayRates) } : {}),
      updateBytesPerSecond: this.currentUpdateRate(),
      networkSource: "transport",
      calibrating,
    };
  }
}

/** Synchronous reservation by route: relay saturation never blocks LAN or direct P2P seats. */
export class Seats {
  private members = new Map<string, PeerRoute>();
  private limit: number;
  private directGuestLimit?: number;
  private relayGuestLimit?: number;

  constructor(limit: number, routeLimits?: { directGuestLimit?: number; relayGuestLimit?: number }) {
    this.limit = Math.max(1, Math.floor(limit));
    this.directGuestLimit = routeLimits?.directGuestLimit;
    this.relayGuestLimit = routeLimits?.relayGuestLimit;
  }
  get count() {
    return this.members.size + 1;
  }
  countsByRoute(): Record<PeerRoute, number> {
    const counts: Record<PeerRoute, number> = { lan: 0, direct: 0, relay: 0 };
    for (const route of this.members.values()) counts[route]++;
    return counts;
  }
  canEnter(id: string, route: PeerRoute = "direct"): boolean {
    if (this.members.has(id)) return true;
    if (this.count >= this.limit) return false;
    // Los primeros cuatro invitados comparten el cupo base por cualquier ruta.
    if (this.count < MIN_ROOM_CAPACITY || route === "lan") return true;
    const counts = this.countsByRoute();
    if (route === "direct" && this.directGuestLimit !== undefined && counts.direct >= this.directGuestLimit)
      return false;
    if (route === "relay" && this.relayGuestLimit !== undefined && counts.relay >= this.relayGuestLimit)
      return false;
    return true;
  }
  enter(id: string, route: PeerRoute = "direct"): boolean {
    if (!this.canEnter(id, route)) return false;
    this.members.set(id, route);
    return true;
  }
  updateRoute(id: string, route: PeerRoute) {
    if (this.members.has(id)) this.members.set(id, route);
  }
  leave(id: string) {
    this.members.delete(id);
  }
  resize(limit: number, routeLimits?: { directGuestLimit?: number; relayGuestLimit?: number }) {
    this.limit = Math.max(1, Math.floor(limit));
    this.directGuestLimit = routeLimits?.directGuestLimit;
    this.relayGuestLimit = routeLimits?.relayGuestLimit;
  }
}
