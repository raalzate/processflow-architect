import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { esOrigenPropio, permisoPermitido, PERMISOS_PERMITIDOS } from "../security";

/**
 * La ventana se arma con Electron vivo y no se puede instanciar acá: se lee su
 * fuente. Es la única forma de que volver a `webSecurity: isDev` (como estuvo desde
 * el primer commit, APAGADO en el binario) o a «conceder todo» ponga el gate en rojo.
 */
describe("main/window.ts no vuelve a abrir lo que se cerró", () => {
  const fuente = fs.readFileSync(path.join(__dirname, "..", "..", "window.ts"), "utf8");

  it("webSecurity y contextIsolation quedan en true; nodeIntegration en false", () => {
    expect(fuente).toMatch(/webSecurity:\s*true\b/);
    expect(fuente).toMatch(/contextIsolation:\s*true\b/);
    expect(fuente).toMatch(/nodeIntegration:\s*false\b/);
  });

  it("los permisos pasan por la política, nunca se conceden en bloque", () => {
    expect(fuente).not.toMatch(/cb\(\s*true\s*\)/);
    expect(fuente).toMatch(/setPermissionRequestHandler\([\s\S]*?permisoPermitido/);
    expect(fuente).toMatch(/setPermissionCheckHandler\([\s\S]*?permisoPermitido/);
  });
});

describe("esOrigenPropio", () => {
  it("en producción sólo el renderer empaquetado (app://)", () => {
    expect(esOrigenPropio("app://-/index.html", false)).toBe(true);
    expect(esOrigenPropio("http://localhost:3000/", false)).toBe(false);
    expect(esOrigenPropio("https://evil.example/", false)).toBe(false);
  });

  it("en desarrollo también el servidor local de Next", () => {
    expect(esOrigenPropio("http://localhost:3000/", true)).toBe(true);
    expect(esOrigenPropio("http://127.0.0.1:3001/", true)).toBe(true);
  });

  it("localhost con otro esquema o un dominio que lo imita no cuenta", () => {
    expect(esOrigenPropio("https://localhost.evil.example/", true)).toBe(false);
    expect(esOrigenPropio("file:///etc/passwd", true)).toBe(false);
  });

  it("una URL rota no es propia", () => {
    expect(esOrigenPropio("no es una url", true)).toBe(false);
    expect(esOrigenPropio(undefined, true)).toBe(false);
  });
});

describe("permisoPermitido", () => {
  it("concede el portapapeles a la propia app", () => {
    expect(permisoPermitido("clipboard-sanitized-write", "app://-/", false)).toBe(true);
    expect(permisoPermitido("clipboard-read", "app://-/", false)).toBe(true);
  });

  it("niega lo que la app no usa aunque lo pida ella misma", () => {
    for (const p of ["media", "geolocation", "notifications", "midi", "hid", "serial", "usb", "openExternal"]) {
      expect(permisoPermitido(p, "app://-/", false)).toBe(false);
    }
  });

  it("niega todo a un origen ajeno, incluso el portapapeles", () => {
    expect(permisoPermitido("clipboard-read", "https://evil.example/", false)).toBe(false);
  });

  it("la lista es corta a propósito: agregar un permiso es una decisión explícita", () => {
    expect([...PERMISOS_PERMITIDOS].sort()).toEqual(["clipboard-read", "clipboard-sanitized-write"]);
  });
});
