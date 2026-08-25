import { describe, it, expect } from "vitest";
import { resolveDiagramId } from "../active-diagram";

describe("resolveDiagramId · precedencia", () => {
  const disponibles = ["uno", "dos"];

  it("el id de la llamada gana sobre el fijado y el configurado", () => {
    const r = resolveDiagramId({ explicit: "dos", pinned: "uno", configured: "uno", disponibles });
    expect(r).toEqual({ id: "dos", origen: "parametro" });
  });

  it("sin id, manda el fijado; sin fijado, el de la configuración", () => {
    expect(resolveDiagramId({ pinned: "dos", configured: "uno", disponibles }).id).toBe("dos");
    expect(resolveDiagramId({ configured: "uno", disponibles })).toEqual({
      id: "uno",
      origen: "configuracion",
    });
  });

  it("con un solo diagrama en el workspace, no hace falta decir cuál", () => {
    expect(resolveDiagramId({ disponibles: ["solo"] })).toEqual({ id: "solo", origen: "unico" });
  });

  it("un id explícito inexistente NO cae al fijado: editaría otro diagrama", () => {
    expect(() => resolveDiagramId({ explicit: "fantasma", pinned: "uno", disponibles })).toThrow(
      /No existe el diagrama "fantasma"/
    );
  });

  it("un fijado que ya no existe se ignora y se dice por qué", () => {
    expect(() => resolveDiagramId({ pinned: "borrado", disponibles })).toThrow(/ya no está/);
  });

  it("con varios y sin pista, el error lista lo que hay y cómo fijarlo", () => {
    try {
      resolveDiagramId({ disponibles });
      expect.unreachable("debía lanzar");
    } catch (e: any) {
      expect(e.message).toContain('"uno", "dos"');
      expect(e.message).toContain("use_diagram");
    }
  });

  it("sin diagramas, el error empuja a crear o importar", () => {
    expect(() => resolveDiagramId({ disponibles: [] })).toThrow(/create_diagram|import_diagram/);
  });
});
