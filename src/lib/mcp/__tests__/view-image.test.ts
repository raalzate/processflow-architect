/**
 * Captura de la vista para el agente (#670): la imagen de lo que el humano ve,
 * para que el skill razone sobre el layout real y reacomode mejor las líneas.
 */
import { describe, it, expect } from "vitest";
import { imagenDeDataUrl, textoDeCaptura } from "../view-image";

describe("imagenDeDataUrl", () => {
  it("separa el tipo y el base64 de una data URL PNG", () => {
    expect(imagenDeDataUrl("data:image/png;base64,iVBORw0KGgo=")).toEqual({
      type: "image",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
    });
  });

  it("acepta JPEG", () => {
    expect(imagenDeDataUrl("data:image/jpeg;base64,/9j/4AAQ")?.mimeType).toBe("image/jpeg");
  });

  it("lo que no es una imagen en base64 no pasa", () => {
    expect(imagenDeDataUrl("data:text/plain;base64,aG9sYQ==")).toBeNull();
    expect(imagenDeDataUrl("data:image/png;base64,")).toBeNull();
    expect(imagenDeDataUrl("hola")).toBeNull();
  });
});

describe("textoDeCaptura", () => {
  it("dice qué vista es y cómo usarla", () => {
    const t = textoDeCaptura("Contenedores");
    expect(t).toContain('"Contenedores"');
    expect(t).toMatch(/relayout_diagram|update_edge/);
  });
});
