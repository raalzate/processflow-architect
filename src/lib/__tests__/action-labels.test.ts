import { describe, it, expect } from "vitest";
import { VERBO, accion } from "../action-labels";

describe("vocabulario de acciones", () => {
  it("un verbo por acción: sin sinónimos en el registro", () => {
    const textos = Object.values(VERBO).map((v) => v.toLowerCase());
    expect(new Set(textos).size).toBe(textos.length);
    // Los sinónimos que había en la UI no vuelven por la puerta de atrás.
    expect(textos).not.toContain("añadir");
    expect(textos).not.toContain("crear");
    expect(textos).not.toContain("nuevo");
  });

  it("compone el rótulo con el sustantivo y lo deja limpio sin él", () => {
    expect(accion("agregar", "vista")).toBe("Agregar vista");
    expect(accion("agregar", "  vista  ")).toBe("Agregar vista");
    expect(accion("agregar")).toBe("Agregar");
    expect(accion("limpiar")).toBe("Limpiar");
  });
});
