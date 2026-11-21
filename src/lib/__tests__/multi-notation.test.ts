import { describe, it, expect } from "vitest";
import {
  notacionesDeVista,
  alternarNotacion,
  separarNotaciones,
  paletaDeNotaciones,
  rotuloDeNotaciones,
  nombreCorto,
} from "@/lib/multi-notation";
import { getNotation, DEFAULT_NOTATION_ID, NOTATION_LIST } from "@/lib/notations";

// Ids tomados del registro, no cableados: la prueba sigue valiendo si cambian.
const [A, B, C] = NOTATION_LIST.map((n) => n.id);

describe("notacionesDeVista", () => {
  it("la principal va primero y las extra después, sin repetir", () => {
    expect(notacionesDeVista(A, [B, A, C, B])).toEqual([A, B, C]);
  });

  it("sin principal cae en la notación por defecto", () => {
    expect(notacionesDeVista(undefined, undefined)).toEqual([DEFAULT_NOTATION_ID]);
  });

  it("descarta ids que no existen en el registro", () => {
    expect(notacionesDeVista(A, ["no-existe", B])).toEqual([A, B]);
    expect(notacionesDeVista("tampoco", [])).toEqual([DEFAULT_NOTATION_ID]);
  });
});

describe("alternarNotacion", () => {
  it("marcar una nueva la agrega al final", () => {
    expect(alternarNotacion([A], B)).toEqual([A, B]);
  });

  it("desmarcar una extra la quita", () => {
    expect(alternarNotacion([A, B, C], B)).toEqual([A, C]);
  });

  it("desmarcar la principal promueve a la siguiente", () => {
    expect(alternarNotacion([A, B], A)).toEqual([B]);
  });

  it("la última no se puede desmarcar: una vista sin notación no tiene paleta", () => {
    expect(alternarNotacion([A], A)).toEqual([A]);
  });
});

describe("separarNotaciones", () => {
  it("parte la lista en principal y extra", () => {
    expect(separarNotaciones([A, B, C])).toEqual({ principal: A, extras: [B, C] });
  });

  it("sin extra, el campo queda vacío para no ensuciar lo guardado", () => {
    expect(separarNotaciones([A])).toEqual({ principal: A, extras: undefined });
  });
});

describe("paletaDeNotaciones", () => {
  it("con una sola notación la paleta es la suya, sin prefijos", () => {
    expect(paletaDeNotaciones([A])).toEqual(getNotation(A).paletteGroups);
  });

  it("con varias, suma los grupos de cada una con la notación como prefijo", () => {
    const grupos = paletaDeNotaciones([A, B]);
    const esperados =
      getNotation(A).paletteGroups.length + getNotation(B).paletteGroups.length;
    expect(grupos).toHaveLength(esperados);
    expect(grupos[0].label).toBe(`${nombreCorto(A)} · ${getNotation(A).paletteGroups[0].label}`);
    expect(grupos[grupos.length - 1].label.startsWith(`${nombreCorto(B)} · `)).toBe(true);
    expect(grupos[0].types).toEqual(getNotation(A).paletteGroups[0].types);
  });
});

describe("nombreCorto", () => {
  it("quita la aclaración entre paréntesis del nombre de la notación", () => {
    for (const n of NOTATION_LIST) {
      expect(nombreCorto(n.id)).toBe(n.label.replace(/\s*\(.*\)\s*$/, ""));
      expect(nombreCorto(n.id)).not.toContain("(");
    }
  });
});

describe("rotuloDeNotaciones", () => {
  it("una notación muestra su nombre completo", () => {
    expect(rotuloDeNotaciones([A])).toBe(getNotation(A).label);
  });

  it("varias se resumen: la principal y cuántas más", () => {
    expect(rotuloDeNotaciones([A, B, C])).toBe(`${getNotation(A).label} +2`);
  });
});
