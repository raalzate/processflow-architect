/**
 * Los metadatos del updater son un archivo que nadie mira: `electron-updater`
 * lee `latest*.yml`, pide el archivo que ahí dice y, si el nombre no existe entre
 * los assets, la actualización muere en un 404 silencioso. Eso fue exactamente lo
 * que pasó en Windows durante cinco releases (#235). Estas pruebas cubren la
 * parte que decide si un release es actualizable, sin red.
 */

import { describe, expect, it } from "vitest";
import {
  nombreConEspacios,
  parsearMetadatosUpdater,
  problemasDeMetadatos,
} from "../release-metadata";

const YML_WIN = `version: 0.8.5
files:
  - url: Processflow-Architect-Setup-0.8.5.exe
    sha512: UhSlXTKlNo4=
    size: 216802148
path: Processflow-Architect-Setup-0.8.5.exe
sha512: UhSlXTKlNo4=
releaseDate: '2026-09-01T19:23:51.995Z'
`;

describe("parsearMetadatosUpdater", () => {
  it("saca versión, path y tamaño del yml que escribe electron-builder", () => {
    const m = parsearMetadatosUpdater(YML_WIN)!;
    expect(m.version).toBe("0.8.5");
    expect(m.path).toBe("Processflow-Architect-Setup-0.8.5.exe");
    expect(m.files[0]).toEqual({
      url: "Processflow-Architect-Setup-0.8.5.exe",
      size: 216802148,
    });
  });

  it("un yml vacío o ilegible no se inventa nada", () => {
    expect(parsearMetadatosUpdater("")).toBeUndefined();
    expect(parsearMetadatosUpdater("cualquier cosa que no es yml")).toBeUndefined();
  });

  it("aguanta comillas alrededor del nombre del archivo", () => {
    const m = parsearMetadatosUpdater(`version: 1.2.3\npath: "una cosa.exe"\n`)!;
    expect(m.path).toBe("una cosa.exe");
  });
});

describe("problemasDeMetadatos", () => {
  const assets = [
    { name: "Processflow-Architect.Setup.0.8.5.exe", size: 216802148 },
    { name: "Processflow-Architect-0.8.5.AppImage", size: 297088789 },
  ];

  it("caza el 404 de Windows: el path del yml no está entre los assets (#235)", () => {
    const problemas = problemasDeMetadatos(parsearMetadatosUpdater(YML_WIN)!, assets, "0.8.5");
    expect(problemas.join(" ")).toMatch(/Processflow-Architect-Setup-0\.8\.5\.exe/);
    expect(problemas.join(" ")).toMatch(/no está entre los assets/i);
  });

  it("un release consistente no tiene nada que reportar", () => {
    const yml = `version: 0.8.5\nfiles:\n  - url: Processflow-Architect-0.8.5.AppImage\n    size: 297088789\npath: Processflow-Architect-0.8.5.AppImage\n`;
    expect(problemasDeMetadatos(parsearMetadatosUpdater(yml)!, assets, "0.8.5")).toEqual([]);
  });

  it("un tamaño distinto es un archivo distinto: el updater lo rechazaría al verificar", () => {
    const yml = `version: 0.8.5\nfiles:\n  - url: Processflow-Architect-0.8.5.AppImage\n    size: 123\npath: Processflow-Architect-0.8.5.AppImage\n`;
    const problemas = problemasDeMetadatos(parsearMetadatosUpdater(yml)!, assets, "0.8.5");
    expect(problemas.join(" ")).toMatch(/tamaño/i);
  });

  it("la versión del yml tiene que ser la del release, o se ofrece otra cosa", () => {
    const problemas = problemasDeMetadatos(parsearMetadatosUpdater(YML_WIN)!, assets, "0.8.6");
    expect(problemas.join(" ")).toMatch(/0\.8\.6/);
  });
});

describe("nombreConEspacios", () => {
  it("el default de NSIS lleva espacios: es la raíz del 404 (#235)", () => {
    expect(nombreConEspacios("${productName} Setup ${version}.${ext}")).toBe(true);
  });

  it("un nombre con guiones es seguro: GitHub lo sube tal cual", () => {
    expect(nombreConEspacios("${productName}-Setup-${version}.${ext}")).toBe(false);
    expect(nombreConEspacios("${productName}-${version}-${arch}.${ext}")).toBe(false);
  });

  it("sin nombre declarado se cuenta como peligroso: el default trae espacios", () => {
    expect(nombreConEspacios(undefined)).toBe(true);
    expect(nombreConEspacios("")).toBe(true);
  });
});
