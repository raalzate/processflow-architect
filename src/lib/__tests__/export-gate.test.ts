import { afterEach, describe, expect, it } from "vitest";
import { assertExportAllowed, exportAllowed, ExportDeniedError, guardExport, setExportDeniedNotifier, setExportRule, EXPORT_DENIED_MESSAGE } from "../export-gate";

describe("freno único de exportación (#756)", () => {
  let restore = () => {};
  afterEach(() => restore());

  it("sin regla, exportar está permitido (proyectos propios)", () => {
    expect(exportAllowed()).toBe(true);
    expect(() => assertExportAllowed()).not.toThrow();
  });
  it("con la regla del préstamo, rechaza con el mensaje para el usuario", () => {
    restore = setExportRule(() => false);
    expect(exportAllowed()).toBe(false);
    expect(() => assertExportAllowed()).toThrow(ExportDeniedError);
    expect(() => assertExportAllowed()).toThrow(EXPORT_DENIED_MESSAGE);
  });
  it("la regla se evalúa al exportar, no al fijarla", () => {
    let permitido = false;
    restore = setExportRule(() => permitido);
    expect(exportAllowed()).toBe(false);
    permitido = true;
    expect(exportAllowed()).toBe(true);
  });
  it("restaurar devuelve la regla anterior y no pisa una más nueva", () => {
    const quitarA = setExportRule(() => false);
    const quitarB = setExportRule(() => true);
    quitarA();
    expect(exportAllowed()).toBe(true);
    quitarB();
    expect(exportAllowed()).toBe(false);
    restore = quitarA;
  });

  it("guardExport avisa una vez por intento rechazado y no lanza", () => {
    let avisos = 0;
    const quitarAviso = setExportDeniedNotifier(() => avisos++);
    expect(guardExport()).toBe(true);
    expect(avisos).toBe(0);
    restore = setExportRule(() => false);
    expect(guardExport()).toBe(false);
    expect(avisos).toBe(1);
    quitarAviso();
    expect(guardExport()).toBe(false);
    expect(avisos).toBe(1);
  });
});
