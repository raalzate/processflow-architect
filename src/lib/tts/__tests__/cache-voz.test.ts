import { describe, it, expect } from "vitest";
import { CacheDeAudio, claveDeAudio } from "../cache-voz";

const audio = (n: number) => new Float32Array(n);
/** Un Float32 ocupa 4 bytes. */
const BYTES = 4;

describe("claveDeAudio", () => {
  it("cambia con la voz, la velocidad o el texto: cualquiera cambia el audio", () => {
    const base = claveDeAudio("ef_dora", 1, "Hola.");
    expect(claveDeAudio("ef_dora", 1, "Hola.")).toBe(base);
    expect(claveDeAudio("em_alex", 1, "Hola.")).not.toBe(base);
    expect(claveDeAudio("ef_dora", 1.2, "Hola.")).not.toBe(base);
    expect(claveDeAudio("ef_dora", 1, "Chau.")).not.toBe(base);
  });
});

describe("CacheDeAudio", () => {
  it("devuelve lo guardado y nada para lo que no está", () => {
    const c = new CacheDeAudio(1000 * BYTES);
    c.guardar("a", audio(10), 24000);
    expect(c.leer("a")).toMatchObject({ sr: 24000 });
    expect(c.leer("a")!.audio.length).toBe(10);
    expect(c.leer("b")).toBeUndefined();
  });

  it("al pasarse del tope descarta lo usado hace más tiempo", () => {
    const c = new CacheDeAudio(100 * BYTES);
    c.guardar("a", audio(40), 24000);
    c.guardar("b", audio(40), 24000);
    c.leer("a"); // «a» se usó recién: el más viejo ahora es «b»
    c.guardar("c", audio(40), 24000);
    expect(c.leer("b")).toBeUndefined();
    expect(c.leer("a")).toBeDefined();
    expect(c.leer("c")).toBeDefined();
    expect(c.bytes).toBe(80 * BYTES);
  });

  it("lo que no entra solo no se guarda y no vacía la caché", () => {
    const c = new CacheDeAudio(100 * BYTES);
    c.guardar("a", audio(40), 24000);
    c.guardar("enorme", audio(500), 24000);
    expect(c.leer("enorme")).toBeUndefined();
    expect(c.leer("a")).toBeDefined();
  });

  it("guardar la misma clave reemplaza sin contar dos veces", () => {
    const c = new CacheDeAudio(100 * BYTES);
    c.guardar("a", audio(40), 24000);
    c.guardar("a", audio(20), 24000);
    expect(c.bytes).toBe(20 * BYTES);
  });

  it("un audio vacío no se guarda: no hay nada que ahorrar", () => {
    const c = new CacheDeAudio(100 * BYTES);
    c.guardar("a", audio(0), 24000);
    expect(c.leer("a")).toBeUndefined();
  });
});
