/**
 * El fix de #353 vive en una bandera: si alguien la quita, la bomba de error de
 * Mermaid vuelve a quedarse pegada al `body`. Esta prueba es el mecanismo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MERMAID_INIT_CONFIG } from "../render-config";

describe("configuración de Mermaid", () => {
  it("suprime el render de error: la bomba no se cuelga del body (#353)", () => {
    expect(MERMAID_INIT_CONFIG.suppressErrorRendering).toBe(true);
  });

  it("no arranca sola ni afloja la seguridad", () => {
    expect(MERMAID_INIT_CONFIG.startOnLoad).toBe(false);
    expect(MERMAID_INIT_CONFIG.securityLevel).toBe("strict");
  });

  it("el componente inicializa con ESTA config y no con un objeto suyo", () => {
    const src = readFileSync(
      new URL("../../../components/canvas/MermaidDiagram.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/initialize\(\s*MERMAID_INIT_CONFIG\s*\)/);
  });
});
