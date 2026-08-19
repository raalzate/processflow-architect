import { describe, it, expect } from "vitest";
import {
  artifactRequestDirective,
  resolveArtifactRequest,
} from "../request";
import { diagramDefinitions } from "../registry";

describe("resolveArtifactRequest", () => {
  it("un kind de documento resuelve familia, etiqueta y herramienta", () => {
    const r = resolveArtifactRequest("constraints")!;
    expect(r.family).toBe("document");
    expect(r.tool).toBe("generate_document");
    expect(r.label).toBe("Riesgos y Restricciones");
  });

  it("un kind de diagrama pide la herramienta de diagramas", () => {
    // Se toma del registro: así la prueba no se ata a un preset que puede cambiar.
    const preset = diagramDefinitions()[0];
    const r = resolveArtifactRequest(preset.kind)!;
    expect(r.family).toBe("diagram");
    expect(r.tool).toBe("generate_diagram");
    expect(r.label).toBe(preset.label);
  });

  it("un kind que no está en el registro cae a documento", () => {
    const r = resolveArtifactRequest("artefacto-inventado")!;
    expect(r.family).toBe("document");
    expect(r.tool).toBe("generate_document");
  });

  it("sin kind no hay pedido", () => {
    expect(resolveArtifactRequest("")).toBeNull();
    expect(resolveArtifactRequest(undefined)).toBeNull();
    expect(resolveArtifactRequest(null)).toBeNull();
  });
});

describe("artifactRequestDirective", () => {
  it("pone la orden con kind y herramienta, y el texto del usuario como instrucciones", () => {
    const req = resolveArtifactRequest("constraints")!;
    const out = artifactRequestDirective(req, "Identifica riesgos y restricciones");
    expect(out).toContain('"generate_document"');
    expect(out).toContain('"kind":"constraints"');
    expect(out).toContain("Riesgos y Restricciones");
    expect(out).toContain("Instrucciones del usuario: Identifica riesgos y restricciones");
  });

  it("sin texto del usuario, la orden sola alcanza", () => {
    const req = resolveArtifactRequest("drivers")!;
    const out = artifactRequestDirective(req, "   ");
    expect(out).not.toContain("Instrucciones del usuario");
    expect(out).toContain("Drivers de Arquitectura");
  });
});
