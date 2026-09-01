import { describe, expect, it } from "vitest";
import {
  compararVersiones,
  elegirAsset,
  etiquetaBoton,
  etiquetaBreve,
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

  it("disponible pero NO instalable: ofrece descargar, no actualizar", () => {
    // Cambio de comportamiento pedido en #231: antes decía «Actualizar a X
    // (descarga manual)» y abría el navegador; ahora la app baja el archivo, así
    // que el verbo honesto es «Descargar».
    const t = label({ tipo: "disponible", version: "0.8.2", url: "https://x", instalable: false })!;
    expect(t).toMatch(/Descargar/);
    expect(t).toContain("0.8.2");
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

describe("etiquetaBoton · descarga sin auto-instalación (issue #231)", () => {
  it("disponible y NO instalable: la app baja el archivo, no manda al navegador", () => {
    const t = etiquetaBoton({ tipo: "disponible", version: "0.8.5", url: "https://x", instalable: false })!;
    expect(t).toMatch(/descargar/i);
    expect(t).toContain("0.8.5");
  });

  it("descargada: dice dónde quedó, porque instalarla es cosa del humano", () => {
    const t = etiquetaBoton({ tipo: "descargada", version: "0.8.5", ruta: "/Users/x/Downloads/a.dmg" })!;
    expect(t).toMatch(/descargas/i);
  });
});

describe("etiquetaBreve (aviso del pie, issue #231)", () => {
  it("al día no dice nada: el pie no gana ruido", () => {
    expect(etiquetaBreve({ tipo: "al-dia" })).toBeUndefined();
  });

  it("cabe al lado de la versión: nunca pasa de 28 caracteres", () => {
    const estados: EstadoUpdate[] = [
      { tipo: "disponible", version: "0.10.12", url: "https://x", instalable: true },
      { tipo: "disponible", version: "0.10.12", url: "https://x", instalable: false },
      { tipo: "descargando", porcentaje: 42.7 },
      { tipo: "descargada", version: "0.10.12", ruta: "/a/b.dmg" },
      { tipo: "lista", version: "0.10.12" },
      { tipo: "fallo", motivo: "sin conexión" },
    ];
    for (const e of estados) {
      const t = etiquetaBreve(e)!;
      expect(t, e.tipo).toBeTruthy();
      expect(t.length, `${e.tipo}: «${t}»`).toBeLessThanOrEqual(28);
    }
  });

  it("descargando redondea el progreso", () => {
    expect(etiquetaBreve({ tipo: "descargando", porcentaje: 42.7 })).toContain("43");
  });
});

describe("elegirAsset (multi-plataforma, issue #231)", () => {
  // Los nombres son los que publica electron-builder en el release.
  const assets = [
    "Processflow-Architect-0.8.4-arm64.dmg",
    "Processflow-Architect-0.8.4-arm64.dmg.blockmap",
    "Processflow-Architect.Setup.0.8.4.exe",
    "Processflow-Architect.Setup.0.8.4.exe.blockmap",
    "Processflow-Architect-0.8.4.AppImage",
    "latest.yml",
    "latest-mac.yml",
    "latest-linux.yml",
  ];

  it("macOS toma el .dmg de su arquitectura", () => {
    expect(elegirAsset(assets, "darwin", "arm64")).toBe("Processflow-Architect-0.8.4-arm64.dmg");
  });

  it("Windows toma el instalador .exe y Linux el .AppImage", () => {
    expect(elegirAsset(assets, "win32", "x64")).toBe("Processflow-Architect.Setup.0.8.4.exe");
    expect(elegirAsset(assets, "linux", "x64")).toBe("Processflow-Architect-0.8.4.AppImage");
  });

  it("NUNCA devuelve un blockmap ni un .yml: no son instalables", () => {
    for (const p of ["darwin", "win32", "linux"] as const) {
      const elegido = elegirAsset(assets, p, "arm64") ?? "";
      expect(elegido, p).not.toMatch(/\.(blockmap|yml)$/);
    }
  });

  it("una arquitectura sin build en el release no inventa otra", () => {
    // Sólo hay dmg arm64: a un Mac Intel no se le puede ofrecer ese archivo.
    expect(elegirAsset(assets, "darwin", "x64")).toBeUndefined();
  });

  it("un release sin artefactos no rompe: no hay nada que elegir", () => {
    expect(elegirAsset([], "darwin", "arm64")).toBeUndefined();
    expect(elegirAsset(assets, "aix", "x64")).toBeUndefined();
  });
});
