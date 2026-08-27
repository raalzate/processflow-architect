import { describe, expect, it } from "vitest";
import { diagnosticoGpu, esDriverGenerico, resumenGpu } from "@/lib/gpu-status";

/** Lo que devuelve `app.getGPUFeatureStatus()` en un equipo sin GPU real. */
const soloSoftware = {
  gpu_compositing: "disabled_software",
  webgpu: "unavailable_software",
  webgl: "unavailable_software",
  video_decode: "disabled_software",
  multiple_raster_threads: "enabled_on",
};

const conAceleracion = {
  gpu_compositing: "enabled",
  webgpu: "enabled",
  webgl: "enabled",
};

describe("diagnosticoGpu", () => {
  it("sin WebGPU acelerado lo dice y nombra la causa probable", () => {
    const d = diagnosticoGpu({ features: soloSoftware, adaptador: null, vendorId: 0x1414 });
    expect(d.webgpuAcelerado).toBe(false);
    expect(d.causaProbable).toMatch(/driver|gpu/i);
    // Vendor 0x1414 = Microsoft Basic Render Driver: no hay GPU utilizable.
    expect(d.causaProbable).toMatch(/Basic Render|sin GPU|virtual/i);
  });

  it("con WebGPU acelerado no hay nada que diagnosticar", () => {
    const d = diagnosticoGpu({ features: conAceleracion, adaptador: "Apple M3 Pro", vendorId: null });
    expect(d.webgpuAcelerado).toBe(true);
    expect(d.causaProbable).toBeUndefined();
  });

  it("un vendor de GPU real sin aceleración apunta al driver, no a la máquina", () => {
    const d = diagnosticoGpu({ features: soloSoftware, adaptador: null, vendorId: 0x10de });
    expect(d.causaProbable).toMatch(/driver/i);
    expect(d.causaProbable).not.toMatch(/Basic Render/);
  });

  it("sin datos del main no se inventa un veredicto", () => {
    const d = diagnosticoGpu(undefined);
    expect(d.webgpuAcelerado).toBeNull();
    expect(d.causaProbable).toBeUndefined();
  });

  it("las recomendaciones son accionables y no se repiten", () => {
    const d = diagnosticoGpu({ features: soloSoftware, adaptador: null, vendorId: 0x1414 });
    expect(d.recomendaciones.length).toBeGreaterThan(0);
    expect(new Set(d.recomendaciones).size).toBe(d.recomendaciones.length);
    expect(d.recomendaciones.join(" ")).toMatch(/nube|Ajustes/);
  });
});

describe("esDriverGenerico", () => {
  it("reconoce el driver de software de Microsoft", () => {
    expect(esDriverGenerico(0x1414)).toBe(true);
  });

  it("una GPU real no es genérica", () => {
    for (const v of [0x10de, 0x1002, 0x8086, null]) expect(esDriverGenerico(v), String(v)).toBe(false);
  });
});

describe("resumenGpu", () => {
  it("resume en una línea legible el estado de lo que importa", () => {
    const linea = resumenGpu({ features: soloSoftware, adaptador: null, vendorId: 0x1414 });
    expect(linea).toMatch(/webgpu/i);
    expect(linea).toMatch(/software|no acelerado/i);
  });

  it("sin datos lo dice en vez de mentir", () => {
    expect(resumenGpu(undefined)).toMatch(/sin datos|desconocido/i);
  });
});
