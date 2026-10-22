/**
 * El fix de #353 vive en una bandera: si alguien la quita, la bomba de error de
 * Mermaid vuelve a quedarse pegada al `body`. Esta prueba es el mecanismo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MERMAID_INIT_CONFIG, configMermaidParaTema, temaMermaid } from "../render-config";

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
    expect(src).toMatch(/initialize\(\s*configMermaidParaTema\(/);
  });
});

describe("tema de Mermaid según el tema de la app (#621)", () => {
  it("en oscuro usa el tema oscuro de Mermaid: texto y trazos claros", () => {
    expect(temaMermaid("dark")).toBe("dark");
    expect(configMermaidParaTema("dark")).toMatchObject({ theme: "dark", darkMode: true });
  });

  it("en claro conserva el neutral de siempre", () => {
    expect(temaMermaid("light")).toBe("neutral");
    expect(configMermaidParaTema("light")).toMatchObject({ theme: "neutral", darkMode: false });
  });

  it("cambiar de tema no pierde la seguridad ni el fix de #353", () => {
    for (const tema of ["light", "dark"] as const) {
      const cfg = configMermaidParaTema(tema);
      expect(cfg.suppressErrorRendering).toBe(true);
      expect(cfg.securityLevel).toBe("strict");
      expect(cfg.startOnLoad).toBe(false);
      // flowchart y secuencia comparten la misma config: el tema les llega a todos.
      expect(cfg.sequence).toBe(MERMAID_INIT_CONFIG.sequence);
      expect(cfg.flowchart).toBe(MERMAID_INIT_CONFIG.flowchart);
    }
  });

  it("la config base no fija un tema: lo decide quien sabe cuál se pinta", () => {
    expect("theme" in MERMAID_INIT_CONFIG).toBe(false);
  });
});
