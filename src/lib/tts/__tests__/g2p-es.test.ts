import { describe, it, expect } from "vitest";
import { fonemasDePalabra, fonematizar } from "../g2p-es";

/**
 * Referencia: `espeak-ng -q --ipa -v es-419` (seseo), que es lo que Kokoro vio al
 * entrenar las voces españolas. Donde espeak tiene manías que no cambian el audio
 * (ɛ abierta, acento secundario ˌ) el G2P propio no las copia.
 */
describe("fonemasDePalabra · consonantes", () => {
  it.each([
    ["casa", "kˈasa"],
    ["queso", "kˈeso"],
    ["guerra", "ɡˈera"],
    ["jirafa", "xiɾˈafa"],
    ["gente", "xˈente"],
    ["llave", "ʝˈaβe"],
    ["yo", "ʝˈo"],
    ["año", "ˈaɲo"],
    ["chico", "tʃˈiko"],
    ["zapato", "sapˈato"],
    ["perro", "pˈero"],
    ["pero", "pˈeɾo"],
    ["ratón", "ratˈon"],
    ["honra", "ˈonra"],
    ["examen", "eksˈamen"],
    ["lago", "lˈaɣo"],
    ["hablar", "aβlˈaɾ"],
    ["técnica", "tˈeknika"],
    ["revisá", "reβisˈa"],
  ])("%s → %s", (palabra, ipa) => {
    expect(fonemasDePalabra(palabra)).toBe(ipa);
  });

  it("b/v, d y g son oclusivas al inicio o tras nasal, fricativas entre vocales", () => {
    expect(fonemasDePalabra("vaca")).toBe("bˈaka");
    expect(fonemasDePalabra("ambos")).toBe("ˈambos");
    expect(fonemasDePalabra("abogado")).toBe("aβoɣˈaðo");
    expect(fonemasDePalabra("donde")).toBe("dˈonde");
    expect(fonemasDePalabra("tengo")).toBe("tˈeŋɡo");
  });
});

describe("fonemasDePalabra · vocales, diptongos y acento", () => {
  it.each([
    ["cielo", "sjˈelo"],
    ["hielo", "jˈelo"],
    ["huevo", "wˈeβo"],
    ["agua", "ˈaɣwa"],
    ["ciudad", "sjuðˈad"],
    ["cliente", "kljˈente"],
    ["rueda", "rwˈeða"],
    ["pingüino", "piŋɡwˈino"],
    ["muy", "mˈuj"],
    ["rey", "rˈej"],
    ["arquitectura", "aɾkitektˈuɾa"],
    ["microservicios", "mikɾoseɾβˈisjos"],
    ["información", "infoɾmasjˈon"],
    ["evento", "eβˈento"],
    ["agregado", "aɣɾeɣˈaðo"],
  ])("%s → %s", (palabra, ipa) => {
    expect(fonemasDePalabra(palabra)).toBe(ipa);
  });

  it("dos vocales fuertes no forman diptongo (hiato)", () => {
    expect(fonemasDePalabra("poema")).toBe("poˈema");
    expect(fonemasDePalabra("ahora")).toBe("aˈoɾa");
  });

  it("la tilde sobre la débil rompe el diptongo", () => {
    expect(fonemasDePalabra("día")).toBe("dˈia");
    expect(fonemasDePalabra("país")).toBe("paˈis");
  });

  it("aguda si termina en consonante que no es n ni s", () => {
    expect(fonemasDePalabra("papel")).toBe("papˈel");
  });

  it("las palabras de función no llevan acento", () => {
    expect(fonemasDePalabra("el")).toBe("el");
    expect(fonemasDePalabra("de")).toBe("de");
    expect(fonemasDePalabra("que")).toBe("ke");
  });

  it("y sola es la vocal i", () => {
    expect(fonemasDePalabra("y")).toBe("i");
  });

  it("mayúsculas y letras fuera del español no rompen", () => {
    expect(fonemasDePalabra("Casa")).toBe("kˈasa");
    expect(fonemasDePalabra("web")).toBe("wˈeβ");
    expect(fonemasDePalabra("")).toBe("");
  });
});

describe("fonematizar · frases", () => {
  it("conserva la puntuación y los espacios: Kokoro los usa para la prosodia", () => {
    expect(fonematizar("Hola, revisá el plan.")).toBe("ˈola, reβisˈa el plˈan.");
  });

  it("los signos de apertura y las comillas pasan", () => {
    expect(fonematizar("¿Listo? «Sí»")).toBe("¿lˈisto? «sˈi»");
  });

  it("descarta lo que Kokoro no sabe leer", () => {
    expect(fonematizar("casa # @ casa")).toBe("kˈasa kˈasa");
  });
});
