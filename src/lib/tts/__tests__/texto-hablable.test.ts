import { describe, it, expect } from "vitest";
import { numeroEnPalabras, textoHablable, partirEnFrases } from "../texto-hablable";

describe("numeroEnPalabras", () => {
  it.each([
    [0, "cero"],
    [1, "uno"],
    [15, "quince"],
    [16, "dieciséis"],
    [21, "veintiuno"],
    [30, "treinta"],
    [42, "cuarenta y dos"],
    [100, "cien"],
    [101, "ciento uno"],
    [500, "quinientos"],
    [999, "novecientos noventa y nueve"],
    [1000, "mil"],
    [2026, "dos mil veintiséis"],
    [21000, "veintiún mil"],
    [1000000, "un millón"],
    [3500000, "tres millones quinientos mil"],
  ])("%d → %s", (n, texto) => {
    expect(numeroEnPalabras(n)).toBe(texto);
  });
});

describe("textoHablable · el markdown del agente no se lee en voz alta", () => {
  it("quita énfasis, encabezados y viñetas, y cierra cada línea con pausa", () => {
    expect(textoHablable("## Plan\n- **Uno**: leer\n- _Dos_")).toBe("Plan. Uno: leer. Dos.");
  });

  it("de un enlace queda el texto; una URL suelta se nombra", () => {
    expect(textoHablable("Ver [la guía](https://x.y/z) o https://a.b/c")).toBe("Ver la guía o un enlace.");
  });

  it("los bloques de código no se leen; el código en línea sí", () => {
    expect(textoHablable("Antes\n```mermaid\ngraph TD\n```\nUsá `npm run gate`")).toBe(
      "Antes. Usá npm run gate."
    );
  });

  it("las tablas se leen como listas", () => {
    expect(textoHablable("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("a, b. uno, dos.");
  });

  it("números, decimales y porcentajes en palabras", () => {
    expect(textoHablable("Son 3 vistas y 2,5 días: 40%")).toBe("Son tres vistas y dos coma cinco días: cuarenta por ciento.");
  });

  it("las siglas se deletrean", () => {
    expect(textoHablable("El MCP y UML")).toBe("El eme se pe y u eme ele.");
  });

  it("quita emojis", () => {
    expect(textoHablable("Listo ✅ 🔌")).toBe("Listo.");
  });

  it("texto vacío queda vacío", () => {
    expect(textoHablable("  ")).toBe("");
  });
});

describe("partirEnFrases · el primer audio sale con la primera frase", () => {
  it("parte por punto, interrogación y exclamación", () => {
    expect(partirEnFrases("Hola. ¿Todo bien? Sí!")).toEqual(["Hola.", "¿Todo bien?", "Sí!"]);
  });

  it("una frase larga se corta en comas para no pasar el tope", () => {
    const larga = Array.from({ length: 30 }, (_, i) => `parte ${i}`).join(", ") + ".";
    const trozos = partirEnFrases(larga, 80);
    expect(trozos.length).toBeGreaterThan(1);
    expect(trozos.every((t) => t.length <= 80)).toBe(true);
    expect(trozos.join(" ")).toBe(larga);
  });

  it("una palabra más larga que el tope se corta igual: nunca se pasa", () => {
    const trozos = partirEnFrases("a".repeat(50), 20);
    expect(trozos.every((t) => t.length <= 20)).toBe(true);
  });

  it("sin texto no hay frases", () => {
    expect(partirEnFrases("   ")).toEqual([]);
  });
});
