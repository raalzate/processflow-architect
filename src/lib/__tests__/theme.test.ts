import { describe, expect, it } from "vitest";
import {
  THEME_DEFAULT,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  claseDelTema,
  leerPreferencia,
  resolverTema,
  scriptAntiDestello,
} from "@/lib/theme";

describe("preferencia guardada", () => {
  it("las tres opciones se leen tal cual", () => {
    expect(leerPreferencia("light")).toBe("light");
    expect(leerPreferencia("dark")).toBe("dark");
    expect(leerPreferencia("system")).toBe("system");
  });

  it("lo que no es una opción cae al default en vez de romper el arranque", () => {
    expect(leerPreferencia(null)).toBe(THEME_DEFAULT);
    expect(leerPreferencia(undefined)).toBe(THEME_DEFAULT);
    expect(leerPreferencia("Dark")).toBe(THEME_DEFAULT);
    expect(leerPreferencia("")).toBe(THEME_DEFAULT);
    expect(leerPreferencia({ tema: "light" })).toBe(THEME_DEFAULT);
  });

  it("el default es oscuro: actualizar la app no le cambia el color a nadie", () => {
    expect(THEME_DEFAULT).toBe("dark");
  });
});

describe("tema efectivo", () => {
  it("una preferencia explícita manda, diga lo que diga el sistema", () => {
    expect(resolverTema("light", true)).toBe("light");
    expect(resolverTema("dark", false)).toBe("dark");
  });

  it("«sistema» es preguntarle al sistema, no un tema", () => {
    expect(resolverTema("system", true)).toBe("dark");
    expect(resolverTema("system", false)).toBe("light");
  });
});

describe("clase en el <html>", () => {
  it("el tema claro es la AUSENCIA de clase (Tailwind está en darkMode: class)", () => {
    expect(claseDelTema("dark")).toBe("dark");
    expect(claseDelTema("light")).toBe("");
  });
});

describe("script anti-destello", () => {
  const ejecutar = (guardado: string | null, sistemaOscuro: boolean, storageRompe = false) => {
    const clases = new Set<string>();
    const doc = {
      documentElement: {
        classList: {
          toggle: (c: string, on: boolean) => (on ? clases.add(c) : clases.delete(c)),
        },
      },
    };
    const win = {
      matchMedia: () => ({ matches: sistemaOscuro }),
      localStorage: {
        getItem: (k: string) => {
          if (storageRompe) throw new Error("almacenamiento bloqueado");
          return k === THEME_STORAGE_KEY ? guardado : null;
        },
      },
    };
    // El script vive en el `<head>`: se evalúa con `document`, `window` y
    // `localStorage` como globales, igual que en el navegador.
    new Function("document", "window", "localStorage", scriptAntiDestello())(
      doc,
      win,
      win.localStorage
    );
    return clases.has("dark");
  };

  it("sin nada guardado pinta el default, y no el tema del sistema", () => {
    expect(ejecutar(null, false)).toBe(true);
    expect(ejecutar(null, true)).toBe(true);
  });

  it("respeta lo elegido", () => {
    expect(ejecutar("light", true)).toBe(false);
    expect(ejecutar("dark", false)).toBe(true);
  });

  it("en «sistema» mira al sistema", () => {
    expect(ejecutar("system", true)).toBe(true);
    expect(ejecutar("system", false)).toBe(false);
  });

  it("con el almacenamiento bloqueado no deja la página en blanco: cae al default", () => {
    expect(ejecutar(null, false, true)).toBe(true);
  });

  it("usa la MISMA clave y el MISMO default que el resto del módulo", () => {
    expect(scriptAntiDestello()).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(scriptAntiDestello()).toContain(JSON.stringify(THEME_DEFAULT));
  });
});

describe("opciones de Ajustes", () => {
  it("son exactamente las tres preferencias, sin repetidas", () => {
    const ids = THEME_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(3);
    expect([...ids].sort()).toEqual(["dark", "light", "system"]);
  });

  it("cada una dice para qué sirve: la pantalla no inventa el texto", () => {
    for (const o of THEME_OPTIONS) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.detalle.length).toBeGreaterThan(10);
    }
  });
});
