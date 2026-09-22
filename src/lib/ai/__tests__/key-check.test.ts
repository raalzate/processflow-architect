import { describe, expect, it } from "vitest";
import {
  diagnosticarFalloDeLlave,
  veredictoLlaveOk,
  PROMPT_DE_PRUEBA,
} from "@/lib/ai/key-check";

describe("diagnosticarFalloDeLlave", () => {
  it("401 y 403 culpan a la llave, no al modelo", () => {
    for (const estado of [401, 403]) {
      const v = diagnosticarFalloDeLlave("openai", new Error(`OpenAI ${estado}: nope`), "gpt-4o-mini");
      expect(v.ok, String(estado)).toBe(false);
      expect(v.titulo, String(estado)).toMatch(/llave/i);
    }
  });

  it("404 culpa al modelo y lo nombra, para que se pueda corregir", () => {
    const v = diagnosticarFalloDeLlave("gemini", new Error("Gemini 404: not found"), "gemini-inventado");
    expect(v.titulo).toMatch(/modelo/i);
    expect(v.detalle).toContain("gemini-inventado");
  });

  it("429 aclara que la llave SÍ sirve (es cupo)", () => {
    const v = diagnosticarFalloDeLlave("anthropic", new Error("Anthropic 429: rate limit"), "claude-sonnet-4-5");
    expect(v.detalle).toMatch(/válida/i);
  });

  it("5xx dice explícitamente que no es culpa del usuario", () => {
    const v = diagnosticarFalloDeLlave("openai", new Error("OpenAI 503: down"), "gpt-4o");
    expect(v.detalle).toMatch(/no es tu llave/i);
  });

  it("sin estado HTTP asume red, no llave", () => {
    const v = diagnosticarFalloDeLlave("gemini", new Error("fetch failed"), "gemini-2.5-flash");
    expect(v.titulo).toMatch(/no se pudo probar/i);
    expect(v.detalle).toMatch(/conexión/i);
  });

  it("no vuelca el cuerpo entero del proveedor: es ruido y puede traer de todo", () => {
    const enorme = new Error(`Gemini 400: ${"x".repeat(5000)}`);
    const v = diagnosticarFalloDeLlave("gemini", enorme, "gemini-2.5-flash");
    expect(v.detalle.length).toBeLessThan(400);
  });

  it("aguanta un error que no es Error", () => {
    expect(diagnosticarFalloDeLlave("openai", undefined, "gpt-4o").ok).toBe(false);
  });
});

describe("veredictoLlaveOk", () => {
  it("nombra proveedor y modelo probados", () => {
    const v = veredictoLlaveOk("anthropic", "claude-haiku-4-5");
    expect(v.ok).toBe(true);
    expect(v.detalle).toMatch(/Anthropic/);
    expect(v.detalle).toContain("claude-haiku-4-5");
  });
});

describe("PROMPT_DE_PRUEBA", () => {
  it("es mínimo: la prueba no puede costar como una generación real", () => {
    expect(PROMPT_DE_PRUEBA.length).toBeLessThan(20);
  });
});
