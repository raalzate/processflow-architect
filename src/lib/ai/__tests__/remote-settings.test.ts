import { describe, it, expect } from "vitest";
import {
  DEFAULT_AI_SETTINGS,
  REMOTE_PROVIDERS,
  providerInfo,
  modelFor,
  isRemoteActive,
  normalizeSettings,
  type AiRemoteSettings,
} from "@/lib/ai/remote-settings";

describe("REMOTE_PROVIDERS", () => {
  it("has the four configured providers with a default model", () => {
    expect(REMOTE_PROVIDERS.map((p) => p.id).sort()).toEqual(["anthropic", "gemini", "openai", "openrouter"]);
    for (const p of REMOTE_PROVIDERS) {
      expect(p.defaultModel.length).toBeGreaterThan(0);
      expect(p.models).toContain(p.defaultModel);
    }
  });
});

describe("modelFor", () => {
  it("returns the chosen model when set", () => {
    const s: AiRemoteSettings = { mode: "remote", provider: "openai", models: { openai: "gpt-4o" } };
    expect(modelFor(s, "openai")).toBe("gpt-4o");
  });
  it("falls back to the provider default when unset", () => {
    expect(modelFor(DEFAULT_AI_SETTINGS, "gemini")).toBe(providerInfo("gemini").defaultModel);
  });
  it("ignores blank chosen model", () => {
    const s: AiRemoteSettings = { mode: "remote", provider: "openai", models: { openai: "   " } };
    expect(modelFor(s, "openai")).toBe(providerInfo("openai").defaultModel);
  });
});

describe("isRemoteActive", () => {
  const s: AiRemoteSettings = { mode: "remote", provider: "gemini", models: {} };
  it("true only when mode remote AND provider key present", () => {
    expect(isRemoteActive(s, { gemini: true })).toBe(true);
    expect(isRemoteActive(s, { gemini: false })).toBe(false);
    expect(isRemoteActive(s, {})).toBe(false);
    expect(isRemoteActive({ ...s, mode: "local" }, { gemini: true })).toBe(false);
  });
});

describe("normalizeSettings", () => {
  it("defaults to local/gemini for garbage", () => {
    expect(normalizeSettings(null)).toEqual({ mode: "local", provider: "gemini", models: {} });
    expect(normalizeSettings({ mode: "x", provider: "z" })).toEqual({
      mode: "local",
      provider: "gemini",
      models: {},
    });
  });
  it("keeps openrouter and its vendor-prefixed model id", () => {
    // OpenRouter nombra el modelo con el proveedor delante («google/…»): la barra
    // es parte del id y no se toca al sanear.
    const out = normalizeSettings({ mode: "remote", provider: "openrouter", models: { openrouter: "google/gemini-2.5-flash" } });
    expect(out.provider).toBe("openrouter");
    expect(modelFor(out, "openrouter")).toBe("google/gemini-2.5-flash");
  });
  it("openrouter's suggested models all carry the vendor prefix", () => {
    for (const m of providerInfo("openrouter").models) expect(m).toMatch(/^[a-z0-9-]+\/[\w.:-]+$/);
  });
  it("keeps valid values and trims model strings", () => {
    const out = normalizeSettings({ mode: "remote", provider: "anthropic", models: { anthropic: " claude-x " } });
    expect(out.mode).toBe("remote");
    expect(out.provider).toBe("anthropic");
    expect(out.models.anthropic).toBe("claude-x");
  });
});
