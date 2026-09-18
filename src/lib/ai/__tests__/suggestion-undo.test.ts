/**
 * #352: una sugerencia de IA que pisa lo escrito tiene que poder devolverse.
 * Acá se fija la regla; el cableado en la ficha la usa campo por campo.
 */
import { describe, it, expect } from "vitest";
import {
  anotarSugerencia,
  olvidarSugerencia,
  tieneRevert,
  valorPrevio,
  SIN_PREVIOS,
} from "../suggestion-undo";

describe("vuelta atrás de una sugerencia", () => {
  it("anota lo que había antes de que la IA escribiera", () => {
    const p = anotarSugerencia(SIN_PREVIOS, "desc", "lo mío", "lo de la IA");
    expect(tieneRevert(p, "desc")).toBe(true);
    expect(valorPrevio(p, "desc")).toBe("lo mío");
  });

  it("un campo vacío también se puede devolver a vacío", () => {
    const p = anotarSugerencia(SIN_PREVIOS, "desc", "", "texto de la IA");
    expect(tieneRevert(p, "desc")).toBe(true);
    expect(valorPrevio(p, "desc")).toBe("");
  });

  it("si la sugerencia no cambia nada, no ofrece deshacer", () => {
    const p = anotarSugerencia(SIN_PREVIOS, "desc", "igual", "igual");
    expect(tieneRevert(p, "desc")).toBe(false);
    expect(p).toBe(SIN_PREVIOS);
  });

  it("vacío y ausente son lo mismo: nada que deshacer", () => {
    expect(tieneRevert(anotarSugerencia(SIN_PREVIOS, "desc", undefined, ""), "desc")).toBe(false);
  });

  it("los tags se comparan como datos, no por referencia", () => {
    const sinCambio = anotarSugerencia(SIN_PREVIOS, "tags", ["a", "b"], ["a", "b"]);
    expect(tieneRevert(sinCambio, "tags")).toBe(false);
    const conCambio = anotarSugerencia(SIN_PREVIOS, "tags", ["a"], ["a", "b"]);
    expect(valorPrevio(conCambio, "tags")).toEqual(["a"]);
  });

  it("cada campo guarda lo suyo: sugerir el nombre no borra lo anotado en la descripción", () => {
    let p = anotarSugerencia(SIN_PREVIOS, "desc", "mi descripción", "otra");
    p = anotarSugerencia(p, "name", "mi nombre", "otro");
    expect(valorPrevio(p, "desc")).toBe("mi descripción");
    expect(valorPrevio(p, "name")).toBe("mi nombre");
  });

  it("la segunda sugerencia seguida deja volver al texto del humano, no al de la IA", () => {
    // Regla: lo anotado es lo que había antes de la PRIMERA pisada, que es el
    // único texto que el humano escribió. Encadenar sugerencias no lo pierde.
    let p = anotarSugerencia(SIN_PREVIOS, "desc", "lo mío", "IA 1");
    p = anotarSugerencia(p, "desc", valorPrevio(p, "desc"), "IA 2");
    expect(valorPrevio(p, "desc")).toBe("lo mío");
  });

  it("editar a mano vale por aceptación: se olvida", () => {
    const p = anotarSugerencia(SIN_PREVIOS, "desc", "lo mío", "IA");
    const q = olvidarSugerencia(p, "desc");
    expect(tieneRevert(q, "desc")).toBe(false);
    expect(valorPrevio(q, "desc")).toBeUndefined();
  });

  it("olvidar lo que no está no crea objetos nuevos", () => {
    expect(olvidarSugerencia(SIN_PREVIOS, "desc")).toBe(SIN_PREVIOS);
  });
});
