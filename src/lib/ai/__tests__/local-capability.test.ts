import { describe, expect, it, beforeEach } from "vitest";
import {
  estadoIaLocal,
  mensajeIaLocal,
  puedeUsarIaLocal,
  publicarEstadoIaLocal,
  razonarEstadoLocal,
  resetEstadoIaLocal,
  type EstadoIaLocal,
} from "@/lib/ai/local-capability";

beforeEach(() => resetEstadoIaLocal());

describe("razonarEstadoLocal", () => {
  it("fuera de Electron no hay motor local, y eso NO es culpa de la GPU", () => {
    expect(razonarEstadoLocal({ enElectron: false, webgpu: true })).toBe("sin-electron");
  });

  it("en Electron sin WebGPU: sin-webgpu", () => {
    expect(razonarEstadoLocal({ enElectron: true, webgpu: false })).toBe("sin-webgpu");
  });

  it("en Electron con WebGPU: disponible", () => {
    expect(razonarEstadoLocal({ enElectron: true, webgpu: true })).toBe("disponible");
  });

  it("mientras no se sabe si hay WebGPU, el estado es desconocido (no se afirma que sirve)", () => {
    expect(razonarEstadoLocal({ enElectron: true, webgpu: null })).toBe("desconocido");
  });
});

describe("puedeUsarIaLocal", () => {
  it("sólo cuando está disponible", () => {
    expect(puedeUsarIaLocal("disponible")).toBe(true);
    for (const e of ["sin-webgpu", "sin-electron", "desconocido"] as EstadoIaLocal[]) {
      expect(puedeUsarIaLocal(e), e).toBe(false);
    }
  });
});

describe("mensajeIaLocal", () => {
  it("sin WebGPU explica qué se pierde y qué se puede hacer", () => {
    const m = mensajeIaLocal("sin-webgpu", { remotoActivo: false })!;
    expect(m.titulo).toMatch(/IA local/i);
    expect(m.detalle).toMatch(/WebGPU/);
    // Lo importante: la app SÍ sirve, y hay una salida (la nube, opt-in).
    expect(m.detalle).toMatch(/diagram|lienzo|dibujar/i);
    expect(m.detalle).toMatch(/nube|proveedor|Ajustes/i);
  });

  it("sin WebGPU pero con la nube activada, no ofrece lo que ya está puesto", () => {
    expect(mensajeIaLocal("sin-webgpu", { remotoActivo: true })!.detalle).not.toMatch(/Ajustes/);
  });

  it("cuando está disponible no hay nada que avisar", () => {
    expect(mensajeIaLocal("disponible", { remotoActivo: false })).toBeUndefined();
  });

  it("fuera de Electron no se culpa a la GPU", () => {
    expect(mensajeIaLocal("sin-electron", { remotoActivo: false })!.detalle).not.toMatch(/WebGPU/);
  });
});

describe("el estado publicado lo consulta el resto de la app", () => {
  it("arranca en desconocido: nadie afirma que la IA local sirve antes de mirar", () => {
    expect(estadoIaLocal()).toBe("desconocido");
    expect(puedeUsarIaLocal(estadoIaLocal())).toBe(false);
  });

  it("publicar el estado lo deja disponible para el router y la UI", () => {
    publicarEstadoIaLocal("sin-webgpu");
    expect(estadoIaLocal()).toBe("sin-webgpu");
    publicarEstadoIaLocal("disponible");
    expect(estadoIaLocal()).toBe("disponible");
  });
});
