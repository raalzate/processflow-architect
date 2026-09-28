import { describe, it, expect } from "vitest";
import { debeResembrar } from "../designer-reseed";

describe("debeResembrar", () => {
  const grafoA = { big_picture: { nodos: [], aristas: [] } };
  const grafoB = { big_picture: { nodos: [{ id: "n1" }], aristas: [] } };

  it("no siembra si no hay fuente", () => {
    expect(
      debeResembrar({ loadedKey: null, sourceKey: null, incoming: grafoA, lastEmitted: null, lastSeeded: null })
    ).toBe(false);
  });

  it("siembra en la primera carga de una fuente", () => {
    expect(
      debeResembrar({ loadedKey: null, sourceKey: "view:x", incoming: grafoA, lastEmitted: null, lastSeeded: null })
    ).toBe(true);
  });

  it("siembra al cambiar de fuente", () => {
    expect(
      debeResembrar({ loadedKey: "view:x", sourceKey: "view:y", incoming: grafoA, lastEmitted: null, lastSeeded: grafoA })
    ).toBe(true);
  });

  it("NO re-siembra en el round-trip del autoguardado (mismo objeto emitido)", () => {
    // El lienzo emitió grafoA; vuelve por la vista como el MISMO objeto.
    expect(
      debeResembrar({ loadedKey: "view:x", sourceKey: "view:x", incoming: grafoA, lastEmitted: grafoA, lastSeeded: grafoA })
    ).toBe(false);
  });

  it("NO re-siembra si el entrante es lo último que sembró", () => {
    expect(
      debeResembrar({ loadedKey: "view:x", sourceKey: "view:x", incoming: grafoA, lastEmitted: null, lastSeeded: grafoA })
    ).toBe(false);
  });

  it("SÍ re-siembra cuando un escritor externo pisa la vista con un objeto nuevo", () => {
    // El bug: misma fuente cargada, pero llega grafoB (objeto que el lienzo nunca
    // produjo). Antes se descartaba y el lienzo quedaba con la escena vieja.
    expect(
      debeResembrar({ loadedKey: "view:x", sourceKey: "view:x", incoming: grafoB, lastEmitted: grafoA, lastSeeded: grafoA })
    ).toBe(true);
  });
});
