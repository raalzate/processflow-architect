/**
 * La copia del invitado es un préstamo (feature 028, #756): vive mientras el anfitrión
 * responde o dura el plazo de gracia que él fijó. Esto decide el estado; el motor del main
 * lo aplica (bloquea, purga) y la UI lo muestra. No es DRM: protege al cliente legítimo.
 */

const MINUTE = 60_000,
  HOUR = 60 * MINUTE;

/** Un corte más corto no bloquea: evita que un parpadeo de red tape el lienzo. */
export const LOCK_AFTER_MS = 10_000;
export const GRACE_OPTIONS_MS = [0, 15 * MINUTE, HOUR, 24 * HOUR, 7 * 24 * HOUR] as const;

export const GRACE_LABELS: Record<number, string> = {
  0: "Se elimina al desconectarte",
  [15 * MINUTE]: "Se elimina a los 15 minutos",
  [HOUR]: "Se elimina a la hora",
  [24 * HOUR]: "Se elimina a las 24 horas",
  [7 * 24 * HOUR]: "Se elimina a los 7 días",
};

/** Tiempo restante legible para el aviso del invitado, en la unidad que sirve para decidir. */
export function formatRemaining(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "unos segundos";
  const minutes = Math.ceil(ms / MINUTE);
  if (minutes < 60) return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hora" : `${hours} horas`;
  const days = Math.floor(hours / 24);
  return `${days} días`;
}

export interface LeasePolicy {
  graceMs: number;
  allowExport: boolean;
}
export const DEFAULT_LEASE_POLICY: LeasePolicy = { graceMs: 24 * HOUR, allowExport: false };

/** La política llega por red: un valor fuera de la lista no puede alargar el préstamo. */
export function sanitizeLeasePolicy(input: unknown): LeasePolicy {
  const value = (input ?? {}) as Partial<LeasePolicy>;
  return {
    graceMs: (GRACE_OPTIONS_MS as readonly number[]).includes(value.graceMs as number)
      ? (value.graceMs as number)
      : DEFAULT_LEASE_POLICY.graceMs,
    allowExport: value.allowExport === true,
  };
}

/**
 * Reloj en tiempo de pared, persistido. `observed` es el máximo visto: atrasar el reloj del
 * sistema no devuelve tiempo al préstamo, porque el transcurrido se mide desde ese máximo.
 */
export interface LeaseClock {
  lastContact: number;
  observed: number;
}
export const observeClock = (clock: LeaseClock, now: number): LeaseClock => ({
  lastContact: clock.lastContact,
  observed: Math.max(clock.observed, now),
});
export function recordContact(clock: LeaseClock, now: number): LeaseClock {
  const observed = Math.max(clock.observed, now);
  return { lastContact: observed, observed };
}

export type LeaseStateName = "active" | "locked" | "expired" | "revoked";
export interface LeaseState {
  state: LeaseStateName;
  remainingMs: number;
}

export function leaseState(input: {
  owner: boolean;
  /** Hubo al menos un contacto válido con el anfitrión desde que arrancó la app. */
  sessionContact: boolean;
  revoked: boolean;
  policy: LeasePolicy;
  clock: LeaseClock;
  now: number;
}): LeaseState {
  const { owner, sessionContact, revoked, policy, clock, now } = input;
  if (owner) return { state: "active", remainingMs: Infinity };
  if (revoked) return { state: "revoked", remainingMs: 0 };
  const elapsed = Math.max(0, Math.max(now, clock.observed) - clock.lastContact);
  // Plazo 0 = «al desconectar»: vence cuando bloquearía, no en cada microcorte.
  const grace = Math.max(policy.graceMs, LOCK_AFTER_MS);
  if (elapsed >= grace) return { state: "expired", remainingMs: 0 };
  // Manda el tiempo sin respuesta, no `connected` (que cae en cada microcorte). Pero al
  // arrancar la app no hay contacto en esta sesión: el préstamo no se presume vigente.
  if (sessionContact && elapsed < LOCK_AFTER_MS) return { state: "active", remainingMs: grace - elapsed };
  return { state: "locked", remainingMs: grace - elapsed };
}

/** Sacar contenido de un proyecto compartido es decisión del anfitrión. */
export function canExportShared(status: { owner: boolean; lease?: { policy: LeasePolicy } } | undefined): boolean {
  if (!status || status.owner) return true;
  return status.lease?.policy.allowExport === true;
}
