import { describe, it, expect } from "vitest";
import { resumirUso, formatearMB, debeMostrarUso, type MuestraUso } from "../resource-usage";

const muestra = (procesos: MuestraUso["procesos"], extra: Partial<MuestraUso> = {}): MuestraUso => ({
  nucleos: 4,
  ramTotalMB: 16384,
  procesos,
  ...extra,
});

describe("resumirUso · el consumo de la app entera, no de un proceso (#602)", () => {
  it("suma CPU y memoria de todos los procesos y aparta la del proceso GPU", () => {
    const u = resumirUso(
      muestra([
        { tipo: "Browser", cpuPct: 20, memKB: 200 * 1024 },
        { tipo: "Tab", cpuPct: 60, memKB: 600 * 1024 },
        { tipo: "GPU", cpuPct: 120, memKB: 1200 * 1024 },
      ])
    );
    // 200 % de CPU repartido en 4 núcleos = 50 % del equipo.
    expect(u.cpuPct).toBe(50);
    expect(u.ramMB).toBe(2000);
    expect(u.gpuMB).toBe(1200);
  });

  it("la CPU nunca pasa de 100 ni baja de 0", () => {
    expect(resumirUso(muestra([{ tipo: "GPU", cpuPct: 900, memKB: 0 }])).cpuPct).toBe(100);
    expect(resumirUso(muestra([{ tipo: "GPU", cpuPct: -3, memKB: 0 }])).cpuPct).toBe(0);
  });

  it("sin núcleos conocidos no divide por cero", () => {
    expect(resumirUso(muestra([{ tipo: "Tab", cpuPct: 30, memKB: 0 }], { nucleos: 0 })).cpuPct).toBe(30);
  });

  it("el nivel lo marca el peor de CPU y memoria", () => {
    const bajo = resumirUso(muestra([{ tipo: "Tab", cpuPct: 40, memKB: 1024 * 1024 }]));
    expect(bajo.nivel).toBe("bajo");
    // 12 GB de 16 = 75 % de la RAM del equipo.
    const medio = resumirUso(muestra([{ tipo: "GPU", cpuPct: 0, memKB: 12 * 1024 * 1024 }]));
    expect(medio.nivel).toBe("medio");
    const alto = resumirUso(muestra([{ tipo: "GPU", cpuPct: 360, memKB: 0 }]));
    expect(alto.nivel).toBe("alto");
  });

  it("sin RAM total conocida el nivel sale sólo de la CPU", () => {
    const u = resumirUso(muestra([{ tipo: "GPU", cpuPct: 0, memKB: 99 * 1024 * 1024 }], { ramTotalMB: 0 }));
    expect(u.ramPct).toBeNull();
    expect(u.nivel).toBe("bajo");
  });

  it("sin procesos todo es cero", () => {
    const u = resumirUso(muestra([]));
    expect(u).toMatchObject({ cpuPct: 0, ramMB: 0, gpuMB: 0, nivel: "bajo" });
  });
});

describe("formatearMB", () => {
  it("debajo de un GB va en MB enteros", () => {
    expect(formatearMB(850.4)).toBe("850 MB");
  });
  it("desde un GB va en GB con un decimal", () => {
    expect(formatearMB(2150)).toBe("2.1 GB");
  });
});

describe("debeMostrarUso · el indicador es del motor local", () => {
  it("se muestra cuando el motor local puede estar trabajando y el host sabe medir", () => {
    expect(debeMostrarUso("local", true)).toBe(true);
    expect(debeMostrarUso("hybrid", true)).toBe(true);
  });
  it("no en modo nube ni CLI: ahí el consumo no es del equipo", () => {
    expect(debeMostrarUso("remote", true)).toBe(false);
    expect(debeMostrarUso("cli", true)).toBe(false);
  });
  it("no si el host no sabe medir (edición web)", () => {
    expect(debeMostrarUso("local", false)).toBe(false);
  });
});
