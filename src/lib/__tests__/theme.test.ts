import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStoredTheme,
  setStoredTheme,
  resolveTheme,
  applyThemeClass,
  DEFAULT_THEME,
  THEME_STORAGE,
  type ClassTarget,
} from "../theme";

/** localStorage falso en memoria (el entorno de test es `node`, sin DOM). */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as unknown as Storage;
}

describe("resolveTheme", () => {
  it("system sigue la preferencia del SO", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("light/dark explícitos ignoran la preferencia del SO", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("applyThemeClass", () => {
  it("pone la clase dark sólo cuando el tema resuelto es dark", () => {
    const calls: Array<[string, boolean]> = [];
    const root: ClassTarget = { classList: { toggle: (c, f) => void calls.push([c, f]) } };
    applyThemeClass(root, "dark");
    applyThemeClass(root, "light");
    expect(calls).toEqual([
      ["dark", true],
      ["dark", false],
    ]);
  });
});

describe("get/setStoredTheme", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", fakeStorage());
  });

  it("por defecto sigue al sistema", () => {
    expect(getStoredTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe("system");
  });

  it("persiste y relee un tema válido", () => {
    setStoredTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE)).toBe("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("un valor corrupto cae al default", () => {
    localStorage.setItem(THEME_STORAGE, "neon");
    expect(getStoredTheme()).toBe(DEFAULT_THEME);
  });

  it("no revienta si localStorage no existe", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getStoredTheme()).toBe(DEFAULT_THEME);
    expect(() => setStoredTheme("light")).not.toThrow();
  });

  it("tolera un localStorage que lanza (catch → default)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    });
    expect(getStoredTheme()).toBe(DEFAULT_THEME);
    expect(() => setStoredTheme("dark")).not.toThrow();
  });
});
