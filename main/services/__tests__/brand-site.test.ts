import { describe, it, expect, vi } from "vitest";
import { hojasDe, leerSitio, MAX_HTML_BYTES } from "../brand-site";

const respuesta = (body: string, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(body, { status: init.status ?? 200, headers: { "content-type": "text/html", ...init.headers } });

const html = (links: string[] = []) =>
  `<html><head>${links.map((h) => `<link rel="stylesheet" href="${h}">`).join("")}<style>body{color:#111}</style></head><body></body></html>`;

describe("leerSitio (spec 023, P4)", () => {
  it("trae la página y hasta tres hojas del mismo origen; las demás van a omitidas", async () => {
    const f = vi.fn(async (u: string) => {
      if (u === "https://acme.example/") return respuesta(html(["/a.css", "/b.css", "/c.css", "/d.css", "https://cdn.other/x.css"]));
      return new Response(`/* ${u} */`, { headers: { "content-type": "text/css" } });
    });
    const s = await leerSitio("https://acme.example", { fetch: f as any });
    expect(s.css).toHaveLength(3);
    expect(s.css[0]).toContain("/a.css");
    expect(s.omitidas).toEqual(["https://acme.example/d.css: más de 3 hojas", "https://cdn.other/x.css: otro origen"]);
    expect(s.urlFinal).toBe("https://acme.example/");
  });

  it("rechaza http, credenciales, direcciones locales y URLs rotas", async () => {
    const f = vi.fn();
    await expect(leerSitio("http://acme.example", { fetch: f })).rejects.toThrow(/https/);
    await expect(leerSitio("https://u:p@acme.example", { fetch: f })).rejects.toThrow(/credenciales/);
    await expect(leerSitio("https://localhost:3000", { fetch: f })).rejects.toThrow(/locales/);
    await expect(leerSitio("https://192.168.1.4", { fetch: f })).rejects.toThrow(/locales/);
    await expect(leerSitio("no es url", { fetch: f })).rejects.toThrow(/URL válida/);
    expect(f).not.toHaveBeenCalled();
  });

  it("sigue UNA redirección (a https) y la informa; dos, no", async () => {
    const f = vi.fn(async (u: string) => {
      if (u === "https://acme.example/") return new Response("", { status: 301, headers: { location: "https://www.acme.example/" } });
      return respuesta(html());
    });
    const s = await leerSitio("https://acme.example", { fetch: f as any });
    expect(s.urlFinal).toBe("https://www.acme.example/");

    const doble = vi.fn(async () => new Response("", { status: 302, headers: { location: "https://x.example/" } }));
    await expect(leerSitio("https://acme.example", { fetch: doble as any })).rejects.toThrow(/más de una vez/);

    const aHttp = vi.fn(async () => new Response("", { status: 302, headers: { location: "http://x.example/" } }));
    await expect(leerSitio("https://acme.example", { fetch: aHttp as any })).rejects.toThrow(/https/);
  });

  it("corta por tamaño y por tipo de contenido, y reporta un estado no OK", async () => {
    const grande = vi.fn(async () => respuesta("x", { headers: { "content-length": String(MAX_HTML_BYTES + 1) } }));
    await expect(leerSitio("https://acme.example", { fetch: grande as any })).rejects.toThrow(/tope/);
    const pdf = vi.fn(async () => respuesta("x", { headers: { "content-type": "application/pdf" } }));
    await expect(leerSitio("https://acme.example", { fetch: pdf as any })).rejects.toThrow(/no es una página HTML/);
    const caido = vi.fn(async () => respuesta("x", { status: 503 }));
    await expect(leerSitio("https://acme.example", { fetch: caido as any })).rejects.toThrow(/503/);
  });

  it("con el tiempo agotado no pide más hojas y lo deja escrito", async () => {
    let t = 0;
    const f = vi.fn(async (u: string) => {
      t += 20_000;
      return u.endsWith("/") ? respuesta(html(["/a.css"])) : new Response("", { headers: { "content-type": "text/css" } });
    });
    const s = await leerSitio("https://acme.example", { fetch: f as any, ahora: () => t });
    expect(s.css).toEqual([]);
    expect(s.omitidas[0]).toMatch(/tiempo/);
  });

  it("hojasDe resuelve href relativos y sólo mira rel=stylesheet", () => {
    const h = hojasDe('<link rel="icon" href="/f.ico"><link href="../a.css" rel="stylesheet"><link rel="preload stylesheet" href="b.css">', "https://acme.example/docs/x");
    expect(h).toEqual(["https://acme.example/a.css", "https://acme.example/docs/b.css"]);
  });
});
