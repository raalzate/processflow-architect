import { describe, it, expect } from "vitest";
import { offerWiderWindow } from "../window-retry";

describe("offerWiderWindow (#358)", () => {
  it("con la ventana corta ofrece el siguiente escalón", () => {
    expect(offerWiderWindow("ventana-corta", 4096)).toEqual({
      next: 8192,
      label: "Ampliar a 8192 tokens y reintentar",
    });
  });

  it("sin hint no ofrece nada", () => {
    expect(offerWiderWindow(undefined, 4096)).toBeNull();
  });

  it("en el tope no ofrece un botón que no cambia nada", () => {
    expect(offerWiderWindow("ventana-corta", 8192)).toBeNull();
  });

  it("sin ventana configurada asume el default", () => {
    expect(offerWiderWindow("ventana-corta", undefined)?.next).toBe(8192);
  });
});
