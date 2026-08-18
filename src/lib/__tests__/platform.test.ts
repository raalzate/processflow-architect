import { describe, it, expect } from "vitest";
import {
  hasPlatformModifier,
  isMacPlatform,
  modifierLabel,
  type PlatformSource,
} from "../platform";

const MAC_MODERNO: PlatformSource = { userAgentData: { platform: "macOS" } };
const MAC_VIEJO: PlatformSource = { platform: "MacIntel" };
const WINDOWS: PlatformSource = { userAgentData: { platform: "Windows" }, platform: "Win32" };
const LINUX: PlatformSource = { platform: "Linux x86_64" };

describe("isMacPlatform", () => {
  it("reconoce macOS por la API nueva y por la deprecada", () => {
    expect(isMacPlatform(MAC_MODERNO)).toBe(true);
    expect(isMacPlatform(MAC_VIEJO)).toBe(true);
  });

  it("cae al userAgent cuando no hay ninguna de las dos", () => {
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })).toBe(
      true,
    );
    expect(isMacPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(false);
  });

  it("no es Mac en Windows ni en Linux", () => {
    expect(isMacPlatform(WINDOWS)).toBe(false);
    expect(isMacPlatform(LINUX)).toBe(false);
  });

  it("sin ninguna señal asume que NO es Mac (Ctrl es el modificador más común)", () => {
    expect(isMacPlatform({})).toBe(false);
  });
});

describe("modifierLabel", () => {
  it("escribe el modificador de cada plataforma", () => {
    expect(modifierLabel(MAC_MODERNO)).toBe("⌘");
    expect(modifierLabel(WINDOWS)).toBe("Ctrl");
    expect(modifierLabel(LINUX)).toBe("Ctrl");
  });
});

describe("hasPlatformModifier", () => {
  it("en Mac exige ⌘ y en Windows exige Ctrl", () => {
    expect(hasPlatformModifier({ metaKey: true }, MAC_MODERNO)).toBe(true);
    expect(hasPlatformModifier({ ctrlKey: true }, WINDOWS)).toBe(true);
  });

  it("no acepta el modificador de la OTRA plataforma", () => {
    // En macOS, Ctrl+letra ya significa algo del sistema dentro de un campo de
    // texto: aceptarlo pisaría al sistema operativo, no a la app.
    expect(hasPlatformModifier({ ctrlKey: true }, MAC_MODERNO)).toBe(false);
    expect(hasPlatformModifier({ metaKey: true }, WINDOWS)).toBe(false);
  });

  it("sin modificador, false", () => {
    expect(hasPlatformModifier({}, MAC_MODERNO)).toBe(false);
    expect(hasPlatformModifier({ metaKey: false, ctrlKey: false }, WINDOWS)).toBe(false);
  });
});
