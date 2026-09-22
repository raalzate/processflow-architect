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
  const soloLocal = { modo: "local" as const, conLlave: false };

  it("sin WebGPU explica qué se pierde y qué se puede hacer", () => {
    const m = mensajeIaLocal("sin-webgpu", soloLocal)!;
    expect(m.titulo).toMatch(/IA local/i);
    expect(m.detalle).toMatch(/WebGPU/);
    // Lo importante: la app SÍ sirve, y hay una salida (la nube, opt-in).
    expect(m.detalle).toMatch(/diagram|lienzo|dibujar/i);
    expect(m.detalle).toMatch(/nube|proveedor|Ajustes/i);
    // Sin ninguna IA: el aviso se queda hasta que lo cierren.
    expect(m.persistente).toBe(true);
  });

  it("en modo remoto con llave NO avisa: el motor local no se iba a usar (#374)", () => {
    expect(mensajeIaLocal("sin-webgpu", { modo: "remote", conLlave: true })).toBeUndefined();
    expect(mensajeIaLocal("sin-electron", { modo: "remote", conLlave: true })).toBeUndefined();
  });

  it("en híbrido con llave avisa el cambio de destino, sin ofrecer lo que ya está puesto", () => {
    const m = mensajeIaLocal("sin-webgpu", { modo: "hybrid", conLlave: true })!;
    expect(m.detalle).not.toMatch(/Ajustes/);
    expect(m.detalle).toMatch(/híbrido|ligeras/i);
    // No es una limitación sin salida: se va solo.
    expect(m.persistente).toBe(false);
  });

  it("con modo de nube elegido pero SIN llave, manda a configurarla", () => {
    for (const modo of ["remote", "hybrid"] as const) {
      const m = mensajeIaLocal("sin-webgpu", { modo, conLlave: false })!;
      expect(m.detalle, modo).toMatch(/llave/i);
      expect(m.detalle, modo).toMatch(/Ajustes/);
      expect(m.persistente, modo).toBe(true);
    }
  });

  it("cuando está disponible no hay nada que avisar", () => {
    expect(mensajeIaLocal("disponible", soloLocal)).toBeUndefined();
  });

  it("fuera de Electron no se culpa a la GPU", () => {
    expect(mensajeIaLocal("sin-electron", soloLocal)!.detalle).not.toMatch(/WebGPU/);
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
