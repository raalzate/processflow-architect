import { describe, it, expect } from "vitest";
import { CDN_PERMITIDO, directivasCsp, politicaCsp } from "@/lib/csp";

const directiva = (politica: string, nombre: string) =>
  politica
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${nombre} `) || d === nombre);

describe("politicaCsp", () => {
  const p = politicaCsp();

  it("prohíbe plugins, cambiar la base y mandar formularios afuera", () => {
    expect(directiva(p, "object-src")).toBe("object-src 'none'");
    expect(directiva(p, "base-uri")).toBe("base-uri 'self'");
    expect(directiva(p, "form-action")).toBe("form-action 'self'");
  });

  it("no permite eval de JS, pero sí compilar WebAssembly (LiteRT, OCR)", () => {
    const script = directiva(p, "script-src")!;
    expect(script).not.toContain("'unsafe-eval'");
    expect(script).toContain("'wasm-unsafe-eval'");
  });

  it("el único origen remoto de código es el CDN de las librerías de IA", () => {
    const script = directiva(p, "script-src")!;
    const remotos = script.split(" ").filter((t) => t.startsWith("https:") || t.startsWith("http:"));
    expect(remotos).toEqual([CDN_PERMITIDO]);
  });

  it("los modelos locales se leen por su scheme propio", () => {
    expect(directiva(p, "connect-src")).toContain("litert-model:");
  });

  it("no deja conectarse a cualquier https: un XSS no puede mandar el lienzo a un servidor ajeno", () => {
    const connect = directiva(p, "connect-src")!.split(" ");
    expect(connect).not.toContain("https:");
    expect(connect).not.toContain("*");
  });

  it("no permite que otra página la meta en un iframe ni cargar iframes ajenos", () => {
    expect(directiva(p, "frame-src")).toBe("frame-src 'none'");
  });
});

describe("directivasCsp", () => {
  it("cada directiva aparece una sola vez", () => {
    const nombres = directivasCsp().map(([n]) => n);
    expect(new Set(nombres).size).toBe(nombres.length);
  });
});
