/**
 * El freno de red tiene que morder, o es decoración.
 *
 * `vitest.setup.ts` reemplaza `fetch` y los `request` de node:http/https por algo
 * que revienta. Esta prueba lo verifica en los tres caminos y verifica también lo
 * contrario: que un test PUEDA simular la red cuando la necesita (si no, el freno
 * sería incumplible y alguien lo apagaría).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import http from "node:http";
import https from "node:https";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("frontera de red de la suite", () => {
  it("fetch revienta con un mensaje que dice qué hacer", async () => {
    expect(() => fetch("https://api.anthropic.com/v1/messages")).toThrowError(/Frontera de red/);
    expect(() => fetch("https://api.anthropic.com/v1/messages")).toThrowError(/vi\.stubGlobal/);
  });

  it("el destino aparece en el error: se ve a quién se quiso llamar", () => {
    expect(() => fetch("https://generativelanguage.googleapis.com/v1/models")).toThrowError(
      /generativelanguage\.googleapis\.com/,
    );
  });

  it("http.request y https.get también están cerrados", () => {
    expect(() => http.request("http://127.0.0.1:1234/x")).toThrowError(/Frontera de red/);
    expect(() => https.get({ hostname: "example.com", path: "/y" })).toThrowError(/example\.com\/y/);
  });

  it("simular la red sigue siendo posible: el stub del test gana", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ hola: "mundo" }) }));
    const res: any = await fetch("https://lo-que-sea/api");
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ hola: "mundo" });
  });
});
