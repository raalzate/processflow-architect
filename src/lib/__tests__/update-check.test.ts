import { describe, expect, it } from "vitest";
import {
  compararVersiones,
  etiquetaBoton,
  hayActualizacion,
  puedeAutoInstalar,
  type EstadoUpdate,
} from "@/lib/update-check";

describe("compararVersiones", () => {
  it("compara por número, no alfabéticamente", () => {
    // El fallo clásico: "0.10.0" < "0.9.0" como texto.
    expect(compararVersiones("0.10.0", "0.9.0")).toBe(1);
    expect(compararVersiones("0.9.0", "0.10.0")).toBe(-1);
  });

  it("iguales dan 0, con o sin la v delante", () => {
    expect(compararVersiones("0.8.1", "0.8.1")).toBe(0);
    expect(compararVersiones("v0.8.1", "0.8.1")).toBe(0);
  });

  it("un parche mayor gana", () => {
    expect(compararVersiones("0.8.2", "0.8.1")).toBe(1);
  });

  it("las partes que faltan valen 0", () => {
    expect(compararVersiones("1.0", "1.0.0")).toBe(0);
    expect(compararVersiones("1.0.1", "1.0")).toBe(1);
  });

  it("una versión basura no gana nunca (queda por debajo)", () => {
    expect(compararVersiones("no-es-una-version", "0.1.0")).toBe(-1);
    expect(compararVersiones("0.1.0", "")).toBe(1);
  });

  it("ignora el sufijo de prerelease para ordenar el número base", () => {
    expect(compararVersiones("0.9.0-beta.1", "0.8.9")).toBe(1);
  });
});

describe("hayActualizacion", () => {
  it("sí cuando la publicada es más nueva", () => {
    expect(hayActualizacion("0.8.1", "0.8.2")).toBe(true);
  });

  it("no cuando están iguales", () => {
    expect(hayActualizacion("0.8.1", "0.8.1")).toBe(false);
  });

  it("NO ofrece volver atrás si la instalada es más nueva (compilación local)", () => {
    expect(hayActualizacion("0.9.0", "0.8.1")).toBe(false);
  });

  it("sin dato de la publicada no hay nada que ofrecer", () => {
    expect(hayActualizacion("0.8.1", undefined)).toBe(false);
    expect(hayActualizacion("0.8.1", "")).toBe(false);
  });
});

describe("puedeAutoInstalar", () => {
  it("Windows y Linux sí", () => {
    expect(puedeAutoInstalar("win32")).toBe(true);
    expect(puedeAutoInstalar("linux")).toBe(true);
  });

  it("macOS NO: sin firma ni notarización Squirrel.Mac no lo permite", () => {
    expect(puedeAutoInstalar("darwin")).toBe(false);
  });

  it("una plataforma desconocida se trata como que no puede", () => {
    expect(puedeAutoInstalar("aix")).toBe(false);
  });
});

describe("etiquetaBoton", () => {
  const label = (e: EstadoUpdate) => etiquetaBoton(e);

  it("al día no hay botón que rotular", () => {
    expect(label({ tipo: "al-dia" })).toBeUndefined();
  });

  it("disponible e instalable: invita a actualizar y dice a qué versión", () => {
    const t = label({ tipo: "disponible", version: "0.8.2", url: "https://x", instalable: true })!;
    expect(t).toMatch(/Actualizar/);
    expect(t).toContain("0.8.2");
  });

  it("disponible pero NO instalable: dice que la descarga es manual", () => {
    const t = label({ tipo: "disponible", version: "0.8.2", url: "https://x", instalable: false })!;
    expect(t).toMatch(/Actualizar/);
    expect(t).toMatch(/descarga/i);
  });

  it("descargando muestra el progreso", () => {
    expect(label({ tipo: "descargando", porcentaje: 42 })).toContain("42");
  });

  it("lista para instalar pide reiniciar", () => {
    expect(label({ tipo: "lista", version: "0.8.2" })).toMatch(/reiniciar/i);
  });

  it("un fallo se puede reintentar: el botón no queda muerto", () => {
    const t = label({ tipo: "fallo", motivo: "sin conexión" })!;
    expect(t).toMatch(/reintentar/i);
  });
});
