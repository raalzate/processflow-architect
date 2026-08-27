import { describe, it, expect } from "vitest";
import { describeEngine } from "../provenance";
import type { AiRemoteSettings } from "../remote-settings";

const base: AiRemoteSettings = { mode: "local", provider: "gemini", models: {} };

describe("describeEngine", () => {
  it("modo local → siempre IA local (aunque haya llave)", () => {
    const d = describeEngine({ ...base, mode: "local" }, { gemini: true });
    expect(d.isLocal).toBe(true);
    expect(d.label).toBe("IA local");
  });

  it("modo remoto CON llave → nube con el nombre del proveedor", () => {
    const d = describeEngine({ ...base, mode: "remote", provider: "anthropic" }, { anthropic: true });
    expect(d.isLocal).toBe(false);
    expect(d.label).toBe("IA en la nube");
    expect(d.detail).toContain("Anthropic");
  });

  it("modo remoto SIN llave → cae a local y lo dice (no miente 'nube')", () => {
    const d = describeEngine({ ...base, mode: "remote", provider: "openai" }, { openai: false });
    expect(d.isLocal).toBe(true);
    expect(d.label).toContain("respaldo");
    expect(d.detail).toContain("OpenAI");
  });

  it("modo híbrido CON llave → híbrida (parte local)", () => {
    const d = describeEngine({ ...base, mode: "hybrid", provider: "gemini" }, { gemini: true });
    expect(d.isLocal).toBe(true);
    expect(d.label).toBe("IA híbrida");
  });

  it("sin estado de llaves → confía en la configuración (nube)", () => {
    const d = describeEngine({ ...base, mode: "remote", provider: "gemini" });
    expect(d.isLocal).toBe(false);
    expect(d.label).toBe("IA en la nube");
  });
});

// -----------------------------------------------------------------------------
// El equipo sin motor local (#202): el badge no puede decir «IA local»
// -----------------------------------------------------------------------------

describe("cuando el equipo no puede con la IA local", () => {
  const sinLocal = { estadoLocal: "sin-webgpu" as const };

  it("en modo local no hay IA: lo dice, y dice por qué", () => {
    const e = describeEngine({ mode: "local", provider: "gemini" } as never, undefined, sinLocal);
    expect(e.available).toBe(false);
    expect(e.isLocal).toBe(false);
    expect(e.label).toMatch(/sin ia/i);
    expect(e.detail).toMatch(/WebGPU/);
  });

  it("en híbrido con llave, TODO va a la nube (y el detalle no promete local)", () => {
    const e = describeEngine(
      { mode: "hybrid", provider: "gemini" } as never,
      { gemini: true } as never,
      sinLocal
    );
    expect(e.available).toBe(true);
    expect(e.isLocal).toBe(false);
    expect(e.detail).not.toMatch(/[Ll]igero en local/);
  });

  it("en remoto con llave, nada cambia: la nube no necesita GPU", () => {
    const e = describeEngine(
      { mode: "remote", provider: "gemini" } as never,
      { gemini: true } as never,
      sinLocal
    );
    expect(e.available).toBe(true);
    expect(e.isLocal).toBe(false);
    expect(e.label).toMatch(/nube/i);
  });

  it("sin llave y sin motor local no queda nada: no se ofrece un respaldo que no existe", () => {
    const e = describeEngine(
      { mode: "remote", provider: "gemini" } as never,
      { gemini: false } as never,
      sinLocal
    );
    expect(e.available).toBe(false);
    expect(e.label).toMatch(/sin ia/i);
  });

  it("con motor local disponible, todo se comporta como antes", () => {
    const e = describeEngine({ mode: "local", provider: "gemini" } as never, undefined, {
      estadoLocal: "disponible",
    });
    expect(e.available).toBe(true);
    expect(e.isLocal).toBe(true);
    expect(e.label).toBe("IA local");
  });

  it("sin decir nada del estado local, se asume que sirve (compatibilidad)", () => {
    expect(describeEngine({ mode: "local", provider: "gemini" } as never).available).toBe(true);
  });
});
