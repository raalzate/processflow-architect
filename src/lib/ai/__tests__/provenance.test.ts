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
