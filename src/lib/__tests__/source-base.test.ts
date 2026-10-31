/**
 * Ruta base de las fuentes (#670): dónde viven en ESTA máquina los archivos que
 * cita el campo «Fuente» de cada caja, para que el agente que la recibe los abra.
 */
import { describe, it, expect } from "vitest";
import {
  SOURCE_BASE_KEY,
  normalizarRutaBase,
  leerRutaBase,
  guardarRutaBase,
  citaConRutaBase,
  lineaRutaBase,
} from "../source-base";

/** Storage en memoria: lo justo que usan las funciones. */
function memoria(inicial: Record<string, string> = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k: string) => (k in datos ? datos[k] : null),
    setItem: (k: string, v: string) => {
      datos[k] = v;
    },
  };
}

describe("normalizarRutaBase", () => {
  it("recorta espacios y la barra final", () => {
    expect(normalizarRutaBase("  /Users/ana/repo/  ")).toBe("/Users/ana/repo");
    expect(normalizarRutaBase("C:\\repos\\app\\")).toBe("C:\\repos\\app");
  });

  it("vacía o en blanco es que no hay ruta", () => {
    expect(normalizarRutaBase("   ")).toBeUndefined();
    expect(normalizarRutaBase(undefined)).toBeUndefined();
  });

  it("la raíz sola se conserva", () => {
    expect(normalizarRutaBase("/")).toBe("/");
  });
});

describe("leer y guardar por proyecto", () => {
  it("cada proyecto tiene la suya", () => {
    const s = memoria();
    guardarRutaBase(s, "p1", "/repo/uno/");
    guardarRutaBase(s, "p2", "/repo/dos");
    expect(leerRutaBase(s, "p1")).toBe("/repo/uno");
    expect(leerRutaBase(s, "p2")).toBe("/repo/dos");
    expect(leerRutaBase(s, "p3")).toBeUndefined();
  });

  it("borrarla deja el proyecto sin ruta", () => {
    const s = memoria();
    guardarRutaBase(s, "p1", "/repo");
    guardarRutaBase(s, "p1", "  ");
    expect(leerRutaBase(s, "p1")).toBeUndefined();
    expect(JSON.parse(s.datos[SOURCE_BASE_KEY])).toEqual({});
  });

  it("un valor corrupto no rompe: es como no tener ruta", () => {
    expect(leerRutaBase(memoria({ [SOURCE_BASE_KEY]: "{no-json" }), "p1")).toBeUndefined();
    expect(leerRutaBase(memoria({ [SOURCE_BASE_KEY]: '{"p1":7}' }), "p1")).toBeUndefined();
  });

  it("sin proyecto no hay ruta", () => {
    expect(leerRutaBase(memoria(), null)).toBeUndefined();
  });
});

describe("citaConRutaBase", () => {
  it("cada archivo citado queda absoluto, conservando la línea", () => {
    expect(citaConRutaBase("src/lib/a.ts · docs/b.md:36", "/repo")).toBe("/repo/src/lib/a.ts · /repo/docs/b.md:36");
  });

  it("una cita ya absoluta o una URL no se toca", () => {
    expect(citaConRutaBase("/otro/x.ts", "/repo")).toBe("/otro/x.ts");
    expect(citaConRutaBase("https://wiki/x", "/repo")).toBe("https://wiki/x");
    expect(citaConRutaBase("C:\\x\\y.ts", "/repo")).toBe("C:\\x\\y.ts");
  });

  it("quita el ./ inicial", () => {
    expect(citaConRutaBase("./src/a.ts", "/repo")).toBe("/repo/src/a.ts");
  });

  it("sin ruta base o sin cita, la cita queda igual", () => {
    expect(citaConRutaBase("src/a.ts", undefined)).toBe("src/a.ts");
    expect(citaConRutaBase("", "/repo")).toBe("");
  });
});

describe("lineaRutaBase", () => {
  it("le dice al agente dónde abrir las fuentes", () => {
    const l = lineaRutaBase("/repo");
    expect(l).toContain("/repo");
    expect(l).toMatch(/Fuente/);
  });

  it("sin ruta no agrega nada", () => {
    expect(lineaRutaBase(undefined)).toBe("");
  });
});
