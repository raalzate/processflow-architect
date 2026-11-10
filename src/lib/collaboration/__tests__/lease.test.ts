import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEASE_POLICY,
  GRACE_OPTIONS_MS,
  LOCK_AFTER_MS,
  canExportShared,
  formatRemaining,
  GRACE_LABELS,
  leaseState,
  observeClock,
  recordContact,
  sanitizeLeasePolicy,
} from "../lease";

const HOUR = 3_600_000;
const policy = { graceMs: HOUR, allowExport: false };
const clock = (lastContact: number, observed = lastContact) => ({ lastContact, observed });

describe("política del préstamo", () => {
  it("por defecto: 24 h de gracia y exportar apagado", () => {
    expect(DEFAULT_LEASE_POLICY).toEqual({ graceMs: 24 * HOUR, allowExport: false });
  });
  it("sólo acepta plazos de la lista; lo demás cae al defecto", () => {
    for (const graceMs of GRACE_OPTIONS_MS)
      expect(sanitizeLeasePolicy({ graceMs, allowExport: true })).toEqual({ graceMs, allowExport: true });
    expect(sanitizeLeasePolicy({ graceMs: 123, allowExport: true }).graceMs).toBe(DEFAULT_LEASE_POLICY.graceMs);
    expect(sanitizeLeasePolicy(undefined)).toEqual(DEFAULT_LEASE_POLICY);
    expect(sanitizeLeasePolicy({ graceMs: HOUR, allowExport: "sí" })).toEqual({ graceMs: HOUR, allowExport: false });
  });
});

describe("estado del préstamo", () => {
  const base = { owner: false, sessionContact: true, revoked: false, policy };

  it("el anfitrión nunca queda bloqueado ni vencido", () => {
    expect(leaseState({ ...base, owner: true, sessionContact: false, revoked: true, clock: clock(0), now: 10 * HOUR }).state).toBe("active");
  });
  it("con contacto reciente en esta sesión: vigente", () => {
    expect(leaseState({ ...base, clock: clock(1_000), now: 1_000 + LOCK_AFTER_MS - 1 }).state).toBe("active");
  });
  it("un corte menor al umbral no bloquea", () => {
    expect(leaseState({ ...base, clock: clock(1_000), now: 1_000 + LOCK_AFTER_MS - 1 }).state).toBe("active");
  });
  it("al arrancar sin contacto en esta sesión: bloqueado aunque el último contacto sea reciente", () => {
    expect(leaseState({ ...base, sessionContact: false, clock: clock(1_000), now: 1_001 }).state).toBe("locked");
  });
  it("sin contacto por encima del umbral: bloqueado, con el tiempo restante", () => {
    const r = leaseState({ ...base, clock: clock(0), now: LOCK_AFTER_MS });
    expect(r).toEqual({ state: "locked", remainingMs: HOUR - LOCK_AFTER_MS });
  });
  it("al cumplirse el plazo de gracia: vencido", () => {
    expect(leaseState({ ...base, clock: clock(0), now: HOUR })).toEqual({ state: "expired", remainingMs: 0 });
  });
  it("plazo 0 vence al bloquearse, no en cada microcorte", () => {
    const zero = { ...base, policy: { graceMs: 0, allowExport: false } };
    expect(leaseState({ ...zero, clock: clock(0), now: LOCK_AFTER_MS - 1 }).state).toBe("active");
    expect(leaseState({ ...zero, clock: clock(0), now: LOCK_AFTER_MS }).state).toBe("expired");
  });
  it("revocado gana sobre cualquier otro estado", () => {
    expect(leaseState({ ...base, revoked: true, clock: clock(5), now: 5 }).state).toBe("revoked");
  });
  it("atrasar el reloj del sistema no prolonga el préstamo", () => {
    // Visto en la hora 2; el usuario atrasa el reloj a la hora 0,5.
    const r = leaseState({ ...base, clock: clock(0, 2 * HOUR), now: HOUR / 2 });
    expect(r.state).toBe("expired");
  });
});

describe("reloj del préstamo", () => {
  it("observar sólo avanza", () => {
    expect(observeClock(clock(0, 50), 10)).toEqual(clock(0, 50));
    expect(observeClock(clock(0, 50), 70)).toEqual(clock(0, 70));
  });
  it("un contacto nunca queda antes de lo ya observado", () => {
    expect(recordContact(clock(0, 50), 10)).toEqual(clock(50, 50));
    expect(recordContact(clock(0, 50), 80)).toEqual(clock(80, 80));
  });
});

describe("exportar un proyecto compartido", () => {
  it("el dueño siempre puede; el invitado sólo con permiso del anfitrión", () => {
    expect(canExportShared(undefined)).toBe(true);
    expect(canExportShared({ owner: true, lease: { policy } })).toBe(true);
    expect(canExportShared({ owner: false, lease: { policy } })).toBe(false);
    expect(canExportShared({ owner: false, lease: { policy: { ...policy, allowExport: true } } })).toBe(true);
    expect(canExportShared({ owner: false })).toBe(false);
  });
});

describe("textos del préstamo", () => {
  it("cada plazo ofrecido tiene etiqueta", () => {
    for (const ms of GRACE_OPTIONS_MS) expect(GRACE_LABELS[ms]).toBeTruthy();
  });
  it("el tiempo restante se lee en la unidad útil y nunca promete de más", () => {
    expect(formatRemaining(0)).toBe("unos segundos");
    expect(formatRemaining(30_000)).toBe("1 minuto");
    expect(formatRemaining(14 * 60_000 + 1)).toBe("15 minutos");
    expect(formatRemaining(HOUR + 1)).toBe("1 hora");
    expect(formatRemaining(23 * HOUR + 59 * 60_000)).toBe("23 horas");
    expect(formatRemaining(7 * 24 * HOUR)).toBe("7 días");
  });
});
