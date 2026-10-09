import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { moverSalida } from "../move-out.mjs";

let raiz = "";
beforeEach(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), "move-out-"));
});
afterEach(() => fs.rmSync(raiz, { recursive: true, force: true }));

const escribir = (rel: string, texto: string) => {
  const abs = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, texto);
};

describe("moverSalida (#489)", () => {
  it("mueve out/ a build/out sin dependencias externas", () => {
    escribir("out/index.html", "nuevo");
    moverSalida(raiz);
    expect(fs.readFileSync(path.join(raiz, "build/out/index.html"), "utf8")).toBe("nuevo");
    expect(fs.existsSync(path.join(raiz, "out"))).toBe(false);
  });

  it("reemplaza el build/out anterior entero: no quedan archivos viejos", () => {
    escribir("build/out/viejo.html", "viejo");
    escribir("build/main.js", "proceso main");
    escribir("out/index.html", "nuevo");
    moverSalida(raiz);
    expect(fs.existsSync(path.join(raiz, "build/out/viejo.html"))).toBe(false);
    // Lo que vive al lado de build/out no se toca.
    expect(fs.readFileSync(path.join(raiz, "build/main.js"), "utf8")).toBe("proceso main");
  });

  it("crea build/ si todavía no existe", () => {
    escribir("out/index.html", "nuevo");
    moverSalida(raiz);
    expect(fs.existsSync(path.join(raiz, "build/out/index.html"))).toBe(true);
  });

  it("sin out/ falla con un mensaje que dice qué pasó", () => {
    expect(() => moverSalida(raiz)).toThrow(/No existe .*out/);
  });
});
