import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TOKENS_POR_DEFECTO,
  ajustarAlUmbral,
  completarTokens,
  cssVarsDePerfil,
  normalizarColor,
  partesDeTriplete,
  perfilVigente,
  rgbAHsl,
  temaDePapel,
  validarPerfil,
  type PerfilDeMarca,
} from "../profile";
import { EDITORIAL_TOKENS } from "../../skin";
import { UMBRAL_TEXTO } from "../../a11y/contrast";

const perfil = (orgId: string | null, id = orgId ?? "default"): PerfilDeMarca => ({
  id,
  orgId,
  nombre: id,
  tokens: { accent: "14 71% 44%" },
  recibo: [],
  fecha: "2026-10-12",
});

describe("normalizarColor", () => {
  it("acepta hex largo y corto, rgb(), hsl(), el triplete y nombres básicos", () => {
    expect(normalizarColor("#ffffff")).toBe("0 0% 100%");
    expect(normalizarColor("#000")).toBe("0 0% 0%");
    expect(normalizarColor("rgb(191, 69, 32)")).toBe("14 71% 44%");
    expect(normalizarColor("hsl(14 71% 44%)")).toBe("14 71% 44%");
    expect(normalizarColor(" 14  71% 44% ")).toBe("14 71% 44%");
    expect(normalizarColor("white")).toBe("0 0% 100%");
  });

  it("rechaza lo que no se puede medir", () => {
    expect(normalizarColor("")).toBeNull();
    expect(normalizarColor("rojo fuerte")).toBeNull();
    expect(normalizarColor("var(--x)")).toBeNull();
  });

  it("rgbAHsl y partesDeTriplete son inversas razonables", () => {
    const t = rgbAHsl({ r: 46, g: 90, b: 168 });
    expect(partesDeTriplete(t)).toEqual({ h: 218, s: 57, l: 42 });
  });
});

describe("contraste del perfil", () => {
  it("los valores por defecto son los del CSS (una sola fuente de verdad)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");
    const bloque = (sel: string) => {
      const i = css.indexOf(sel);
      return css.slice(i, css.indexOf("\n  }", i));
    };
    for (const [tema, sel] of [["light", ":root {"], ["dark", ".dark {"]] as const) {
      for (const t of EDITORIAL_TOKENS) {
        const m = new RegExp(`--ed-${t}\\s*:\\s*([^;]+);`).exec(bloque(sel));
        expect(m?.[1].trim(), `${tema} ${t}`).toBe(TOKENS_POR_DEFECTO[tema][t]);
      }
    }
  });

  it("mide texto a 4,5:1 y marcas a 3:1 contra el papel DEL PERFIL", () => {
    const m = validarPerfil({ paper: "0 0% 100%", ink: "0 0% 10%", accent: "14 71% 60%", "rule-solid": "0 0% 50%" });
    const por = Object.fromEntries(m.map((x) => [x.token, x]));
    expect(por.ink.ok).toBe(true);
    expect(por.ink.umbral).toBe(4.5);
    expect(por.accent.ok).toBe(false);
    expect(por["rule-solid"].umbral).toBe(3);
    expect(por["rule-solid"].ok).toBe(true);
  });

  it("propone el ajuste que cumple conservando el tono", () => {
    const m = validarPerfil({ paper: "0 0% 96%", accent: "14 71% 60%" }).find((x) => x.token === "accent")!;
    expect(m.ok).toBe(false);
    expect(m.propuesta).toMatch(/^14 71% \d+%$/);
    expect(m.ratioPropuesta!).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
    expect(partesDeTriplete(m.propuesta!)!.l).toBeLessThan(60);
  });

  it("sobre papel oscuro el ajuste aclara en vez de oscurecer", () => {
    const a = ajustarAlUmbral("218 57% 30%", "229 19% 22%", UMBRAL_TEXTO)!;
    expect(partesDeTriplete(a.valor)!.l).toBeGreaterThan(30);
    expect(a.ratio).toBeGreaterThanOrEqual(UMBRAL_TEXTO);
    expect(temaDePapel("229 19% 22%")).toBe("dark");
    expect(temaDePapel("0 0% 96%")).toBe("light");
  });

  it("sin ajuste posible devuelve null (un color que nunca contrasta)", () => {
    // Gris medio sobre gris medio: la luminosidad llega al extremo y cumple;
    // lo imposible es un papel del mismo gris con umbral absurdo.
    expect(ajustarAlUmbral("0 0% 50%", "0 0% 50%", 30)).toBeNull();
  });
});

describe("completarTokens", () => {
  it("deriva papel-2, suave y regla de lo que hay y rellena el resto con la skin del tema del papel", () => {
    const t = completarTokens({ paper: "0 0% 100%", ink: "0 0% 10%", muted: "0 0% 40%", accent: "14 71% 44%" });
    expect(t["paper-2"]).toBe("0 0% 97%");
    expect(t.soft).toBe("0 0% 45%");
    expect(t["rule-solid"]).toBe("0 0% 57%");
    expect(t.link).toBe("14 71% 44%");
    const oscuro = completarTokens({ paper: "0 0% 10%" });
    expect(oscuro.ink).toBe(TOKENS_POR_DEFECTO.dark.ink);
    expect(oscuro["paper-2"]).toBe("0 0% 15%");
  });
});

describe("aplicación", () => {
  it("cssVarsDePerfil sólo emite los tokens que el perfil declara; sin perfil, nada", () => {
    expect(cssVarsDePerfil(null)).toEqual({});
    expect(cssVarsDePerfil(perfil("acme"))).toEqual({ "--ed-accent": "14 71% 44%" });
  });

  it("perfilVigente: el de la organización, si no el por defecto, si no ninguno", () => {
    const acme = perfil("acme");
    const def = perfil(null);
    expect(perfilVigente("acme", [def, acme])).toBe(acme);
    expect(perfilVigente("otra", [def, acme])).toBe(def);
    expect(perfilVigente(null, [def, acme])).toBe(def);
    expect(perfilVigente("otra", [acme])).toBeNull();
    expect(perfilVigente(undefined, [])).toBeNull();
  });
});
