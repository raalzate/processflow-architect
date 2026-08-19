/**
 * Freno del mapa de iconos: si alguien agrega un `kind` al registro con un icono
 * que la UI no sabe resolver, el artefacto se vería con el genérico y nadie se
 * enteraría. Acá falla.
 */
import { describe, it, expect } from "vitest";
import { Workflow, FileText } from "lucide-react";
import { ARTIFACT_ICON_MAP, iconForArtifact, iconForArtifactKind } from "../artifact-icon";
import { ARTIFACT_REGISTRY } from "@/lib/artifacts/registry";

describe("mapa de iconos de artefactos", () => {
  it("todo icono del registro está resuelto en la UI", () => {
    const faltan = ARTIFACT_REGISTRY.map((d) => d.icon).filter((n) => !ARTIFACT_ICON_MAP[n]);
    expect(faltan).toEqual([]);
  });

  it("cada preset resuelve un icono propio, no el genérico de su familia", () => {
    for (const d of ARTIFACT_REGISTRY) {
      const Icon = iconForArtifactKind(d.kind, d.family);
      expect(Icon).toBe(ARTIFACT_ICON_MAP[d.icon]);
    }
  });

  it("un kind inventado cae al icono de su familia", () => {
    expect(iconForArtifactKind("invento-raro")).toBe(FileText);
    expect(iconForArtifactKind("invento-raro", "diagram")).toBe(Workflow);
  });

  it("para un artefacto generado, la familia sale del render", () => {
    expect(iconForArtifact({ kind: "invento-raro", render: "mermaid" })).toBe(Workflow);
    expect(iconForArtifact({ kind: "invento-raro", render: "markdown" })).toBe(FileText);
    // Un preset conserva su icono propio en cualquiera de los dos caminos.
    const drivers = ARTIFACT_REGISTRY.find((d) => d.kind === "drivers")!;
    expect(iconForArtifact({ kind: "drivers", render: "markdown" })).toBe(
      ARTIFACT_ICON_MAP[drivers.icon]
    );
  });
});
