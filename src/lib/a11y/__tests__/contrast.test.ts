import { describe, expect, it } from "vitest";
import colors from "tailwindcss/colors";
import {
  UMBRAL_NO_TEXTO,
  UMBRAL_TEXTO,
  luminancia,
  medirContraste,
  relacion,
  resolverColor,
} from "@/lib/a11y/contrast";

describe("resolver un color", () => {
  it("hex, en sus dos largos", () => {
    expect(resolverColor("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(resolverColor("#000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("hsl con y sin la función, que es como viven los tokens del CSS", () => {
    expect(resolverColor("hsl(0 0% 100%)")).toEqual({ r: 255, g: 255, b: 255 });
    expect(resolverColor("0 0% 0%")).toEqual({ r: 0, g: 0, b: 0 });
    // El token real del fondo oscuro de la app.
    expect(resolverColor("222 16% 17%")).toEqual({ r: 36, g: 41, b: 50 });
  });

  it("clase de Tailwind, con cualquier prefijo de utilidad", () => {
    const zinc700 = resolverColor("fill-zinc-700");
    expect(zinc700).not.toBeNull();
    expect(resolverColor("text-zinc-700")).toEqual(zinc700);
    expect(resolverColor("stroke-zinc-700")).toEqual(zinc700);
    // Y es el color de verdad de la paleta, no uno inventado acá (el hex no
    // trae alfa; la clase sí, y es 1 porque no lleva `/`).
    expect({ ...zinc700, a: undefined }).toEqual({ ...resolverColor(colors.zinc[700]), a: undefined });
    expect(zinc700!.a).toBe(1);
  });

  it("el prefijo `dark:` se descarta: el tema lo decide quien llama", () => {
    expect(resolverColor("dark:fill-zinc-700")).toEqual(resolverColor("fill-zinc-700"));
  });

  it("blanco y negro por nombre", () => {
    expect(resolverColor("text-white")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(resolverColor("fill-black")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });
});

describe("lo que NO se puede medir se dice, no se supone", () => {
  it("un relleno translúcido resuelve CON su alfa: lo que falta es el fondo", () => {
    expect(resolverColor("fill-zinc-700/40")).toEqual({ r: 63, g: 63, b: 70, a: 0.4 });
  });

  it("una familia que no existe tampoco", () => {
    expect(resolverColor("fill-inventado-700")).toBeNull();
    expect(resolverColor("fill-zinc-999")).toBeNull();
  });

  it("`currentColor` no es medible; `transparent` sí, y es «lo que haya debajo»", () => {
    expect(resolverColor("text-current")).toBeNull();
    expect(resolverColor("fill-transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("vacío o basura", () => {
    expect(resolverColor("")).toBeNull();
    expect(resolverColor("   ")).toBeNull();
    expect(resolverColor("#12")).toBeNull();
  });

  it("medir con un color irresoluble FALLA (si pasara, el freno sería un adorno)", () => {
    const m = medirContraste("fill-inventado-700", "#ffffff");
    expect(m.ok).toBe(false);
    expect(m.ratio).toBeNull();
    expect(m.detalle).toContain("no se pudo resolver");
    expect(m.detalle).toContain("fill-inventado-700");
  });

  it("medir algo translúcido SIN decir qué hay debajo también falla", () => {
    const m = medirContraste("text-white", "fill-zinc-700/40");
    expect(m.ok).toBe(false);
    expect(m.ratio).toBeNull();
    expect(m.detalle).toContain("translúcido");
  });

  it("con el fondo declarado, lo translúcido se compone y se mide", () => {
    // El mismo relleno sobre blanco y sobre negro no es el mismo color: esa es
    // justamente la razón de pedir el fondo.
    const sobreBlanco = medirContraste("text-white", "fill-zinc-700/40", 4.5, "#ffffff");
    const sobreNegro = medirContraste("text-white", "fill-zinc-700/40", 4.5, "#000000");
    expect(sobreBlanco.ratio).not.toBeNull();
    expect(sobreNegro.ratio).not.toBeNull();
    expect(sobreBlanco.ratio).not.toBeCloseTo(sobreNegro.ratio!, 1);
    // Texto blanco: sobre el compuesto oscuro se lee; sobre el claro, no.
    expect(sobreNegro.ok).toBe(true);
    expect(sobreBlanco.ok).toBe(false);
  });

  it("el texto se compone sobre su fondo ya compuesto, que es como se pinta", () => {
    // Un texto translúcido sobre un relleno opaco claro tiende al color del relleno.
    const m = medirContraste("text-black/20", "fill-white", 4.5, "#ffffff");
    expect(m.ratio).not.toBeNull();
    expect(m.ok).toBe(false);
  });
});

describe("la medida", () => {
  it("blanco sobre negro es el máximo posible: 21:1", () => {
    expect(relacion({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 5);
  });

  it("un color contra sí mismo es 1:1", () => {
    const c = { r: 63, g: 63, b: 70 };
    expect(relacion(c, c)).toBeCloseTo(1, 10);
  });

  it("no depende del orden: contraste es una relación, no una resta", () => {
    const a = "#1d4ed8";
    const b = "#f8fafc";
    expect(medirContraste(a, b).ratio).toBe(medirContraste(b, a).ratio);
  });

  it("la luminancia respeta el orden obvio", () => {
    expect(luminancia({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(luminancia({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });

  it("aprueba y reprueba contra el umbral que se le pide", () => {
    // Blanco sobre un gris medio: pasa el umbral no textual y no el de texto.
    const m = medirContraste("#ffffff", "#767676", UMBRAL_TEXTO);
    expect(m.ratio).toBeGreaterThan(UMBRAL_NO_TEXTO);
    expect(m.ok).toBe(m.ratio! >= UMBRAL_TEXTO);
    expect(medirContraste("#ffffff", "#767676", UMBRAL_NO_TEXTO).ok).toBe(true);
  });

  it("el detalle trae el número medido y el mínimo: un fallo se entiende sin abrir el código", () => {
    const m = medirContraste("#ffffff", "#ffffff");
    expect(m.ok).toBe(false);
    expect(m.detalle).toBe("1.00:1 contra un mínimo de 4.5:1");
  });
});
