import { describe, it, expect } from "vitest";
import { artifactBodyMarkdown, artifactToMarkdown } from "@/lib/artifacts/to-markdown";
import type { Artifact } from "@/lib/agent-types";
import type { GraphNode } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Builds a minimal valid Artifact with sensible defaults. */
function makeArtifact(overrides: Partial<Artifact>): Artifact {
  return {
    id: "art-1",
    versionId: "v1",
    kind: "generic",
    render: "markdown",
    title: "Untitled",
    payload: {},
    createdAt: "2026-06-22T00:00:00.000Z",
    ...overrides,
  };
}

/** Builds a minimal valid GraphNode. */
function makeNode(id: string, nombre: string): GraphNode {
  return {
    id,
    nombre,
    tipo_elemento: "Comando" as GraphNode["tipo_elemento"],
    estado_comparativo: "nuevo",
  };
}

const NO_NODES: GraphNode[] = [];

/* -------------------------------------------------------------------------- */
/* artifactBodyMarkdown                                                       */
/* -------------------------------------------------------------------------- */

describe("artifactBodyMarkdown", () => {
  describe("render: markdown", () => {
    it("returns the markdown payload verbatim", () => {
      const a = makeArtifact({ render: "markdown", payload: { markdown: "# Hello\n\nworld" } });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("# Hello\n\nworld");
    });

    it("returns empty string when markdown field is missing", () => {
      const a = makeArtifact({ render: "markdown", payload: {} });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });

    it("returns empty string when payload is null", () => {
      const a = makeArtifact({ render: "markdown", payload: null });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });

    it("returns empty string when payload is undefined", () => {
      const a = makeArtifact({ render: "markdown", payload: undefined });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });

    it("preserves empty-string markdown (does not coalesce to default)", () => {
      const a = makeArtifact({ render: "markdown", payload: { markdown: "" } });
      // "" ?? default => "" because "" is not null/undefined
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });
  });

  describe("render: mermaid", () => {
    it("wraps the code in a mermaid fenced block", () => {
      const a = makeArtifact({ render: "mermaid", payload: { code: "graph TD; A-->B" } });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("```mermaid\ngraph TD; A-->B\n```");
    });

    it("produces an empty mermaid block when code is missing", () => {
      const a = makeArtifact({ render: "mermaid", payload: {} });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("```mermaid\n\n```");
    });

    it("produces an empty mermaid block when payload is null", () => {
      const a = makeArtifact({ render: "mermaid", payload: null });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("```mermaid\n\n```");
    });
  });

  describe("render: drivers", () => {
    it("formats drivers with node names resolved from allNodes", () => {
      const a = makeArtifact({
        render: "drivers",
        payload: {
          drivers: [
            {
              nombre: "Escalabilidad",
              descripcion: "Debe escalar horizontalmente.",
              nodos_relacionados: ["n1", "n2"],
            },
          ],
        },
      });
      const nodes = [makeNode("n1", "CrearPedido"), makeNode("n2", "PedidoCreado")];
      const out = artifactBodyMarkdown(a, nodes);
      expect(out).toContain("## Drivers de Arquitectura");
      expect(out).toContain("### Escalabilidad");
      expect(out).toContain("Debe escalar horizontalmente.");
      // separateCamelCase splits CrearPedido -> "Crear Pedido"
      expect(out).toContain("**Elementos claves:** `Crear Pedido`, `Pedido Creado`");
    });

    it("falls back to the raw id when a related node is not found", () => {
      const a = makeArtifact({
        render: "drivers",
        payload: {
          drivers: [
            { nombre: "Seguridad", descripcion: "x", nodos_relacionados: ["missing-id"] },
          ],
        },
      });
      const out = artifactBodyMarkdown(a, NO_NODES);
      expect(out).toContain("`missing-id`");
    });

    it("omits the 'Elementos claves' line when there are no related nodes", () => {
      const a = makeArtifact({
        render: "drivers",
        payload: { drivers: [{ nombre: "X", descripcion: "y", nodos_relacionados: [] }] },
      });
      const out = artifactBodyMarkdown(a, NO_NODES);
      expect(out).not.toContain("Elementos claves");
    });

    it("returns empty string when payload has no drivers field", () => {
      const a = makeArtifact({ render: "drivers", payload: {} });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });

    it("returns empty string when payload is null", () => {
      const a = makeArtifact({ render: "drivers", payload: null });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });
  });

  describe("render: constraints", () => {
    it("formats constraints/risks with type and name headers", () => {
      const a = makeArtifact({
        render: "constraints",
        payload: {
          constraintsAndRisks: [
            {
              nombre: "Latencia",
              descripcion: "Riesgo de alta latencia.",
              tipo: "Riesgo",
              nodos_relacionados: ["n1"],
            },
          ],
        },
      });
      const out = artifactBodyMarkdown(a, [makeNode("n1", "ConsultaSaldo")]);
      expect(out).toContain("## Restricciones y Riesgos");
      expect(out).toContain("### Riesgo: Latencia");
      expect(out).toContain("Riesgo de alta latencia.");
      expect(out).toContain("`Consulta Saldo`");
    });

    it("omits 'Elementos claves' when no related nodes", () => {
      const a = makeArtifact({
        render: "constraints",
        payload: {
          constraintsAndRisks: [
            { nombre: "C", descripcion: "d", tipo: "Restricción", nodos_relacionados: [] },
          ],
        },
      });
      const out = artifactBodyMarkdown(a, NO_NODES);
      expect(out).toContain("### Restricción: C");
      expect(out).not.toContain("Elementos claves");
    });

    it("returns empty string when constraintsAndRisks field is missing", () => {
      const a = makeArtifact({ render: "constraints", payload: {} });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });

    it("returns empty string when payload is null", () => {
      const a = makeArtifact({ render: "constraints", payload: null });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });
  });

  describe("render: proposal", () => {
    it("formats a full proposal with sections, observaciones and mermaid diagram", () => {
      const a = makeArtifact({
        render: "proposal",
        payload: {
          observaciones: "Solución basada en microservicios.",
          baseDeDatos: ["PostgreSQL"],
          backend: ["Node.js", "NestJS"],
          infraestructura: ["Kubernetes"],
          herramientas: ["Jest"],
          restricciones: ["Sin datos sensibles en logs"],
          diagrama: {
            nodes: [{ id: "a", label: "API" }],
            edges: [{ from: "a", to: "a", label: "self" }],
          },
        },
      });
      const out = artifactBodyMarkdown(a, NO_NODES);
      expect(out).toContain("## Propuesta de Implementación");
      expect(out).toContain("Solución basada en microservicios.");
      expect(out).toContain("### Base de datos");
      expect(out).toContain("- PostgreSQL");
      expect(out).toContain("### Backend");
      expect(out).toContain("- Node.js");
      expect(out).toContain("- NestJS");
      expect(out).toContain("### Infraestructura");
      expect(out).toContain("### Herramientas");
      expect(out).toContain("### Consideraciones");
      expect(out).toContain("- Sin datos sensibles en logs");
      expect(out).toContain("### Planteamiento de la solución");
      expect(out).toContain("```mermaid");
      expect(out).toContain("graph TD;");
    });

    it("skips empty array sections and omits the diagram block when it has no nodes", () => {
      const a = makeArtifact({
        render: "proposal",
        payload: {
          observaciones: "",
          baseDeDatos: [],
          backend: [],
          infraestructura: [],
          herramientas: [],
          restricciones: [],
          diagrama: { nodes: [], edges: [] },
        },
      });
      const out = artifactBodyMarkdown(a, NO_NODES);
      expect(out).toContain("## Propuesta de Implementación");
      expect(out).not.toContain("### Base de datos");
      expect(out).not.toContain("### Backend");
      // Diagrama sin nodos → no se emite el encabezado ni el bloque mermaid vacío.
      expect(out).not.toContain("### Planteamiento de la solución");
      expect(out).not.toContain("```mermaid");
    });

    it("returns empty string when proposal payload is null", () => {
      const a = makeArtifact({ render: "proposal", payload: null });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });
  });

  describe("render: roadmap", () => {
    it("formats phases with epics, roles and linked task names", () => {
      const a = makeArtifact({
        render: "roadmap",
        payload: {
          phases: [
            {
              phaseName: "Fase 1",
              duration: "2-3 semanas",
              epics: ["Onboarding", "Pagos"],
              requiredRoles: ["Backend", "QA"],
              taskIds: ["t1", "unknown"],
            },
          ],
        },
      });
      const out = artifactBodyMarkdown(a, [makeNode("t1", "Tarea Uno")]);
      expect(out).toContain("## Roadmap de Implementación (Propuesta)");
      expect(out).toContain("### Fase 1 (2-3 semanas)");
      expect(out).toContain("**Épicas Clave:**");
      expect(out).toContain("- Onboarding");
      expect(out).toContain("- Pagos");
      expect(out).toContain("**Roles Requeridos:**");
      expect(out).toContain("Backend, QA");
      expect(out).toContain("**Elementos Vinculadas:**");
      // resolved node name
      expect(out).toContain("- Tarea Uno");
      // unresolved id falls back to the id itself
      expect(out).toContain("- unknown");
    });

    it("omits roles and linked-tasks blocks when those arrays are empty/absent", () => {
      const a = makeArtifact({
        render: "roadmap",
        payload: {
          phases: [
            { phaseName: "Solo Epicas", duration: "1 semana", epics: ["E1"] },
          ],
        },
      });
      const out = artifactBodyMarkdown(a, NO_NODES);
      expect(out).toContain("### Solo Epicas (1 semana)");
      expect(out).toContain("- E1");
      expect(out).not.toContain("Roles Requeridos");
      expect(out).not.toContain("Elementos Vinculadas");
    });

    it("returns empty string when phases field is missing", () => {
      const a = makeArtifact({ render: "roadmap", payload: {} });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });

    it("returns empty string when payload is null", () => {
      const a = makeArtifact({ render: "roadmap", payload: null });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });

    it("returns header-only output for empty phases array", () => {
      const a = makeArtifact({ render: "roadmap", payload: { phases: [] } });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe(
        "## Roadmap de Implementación (Propuesta)\n\n"
      );
    });
  });

  describe("default / unknown render", () => {
    it("returns empty string for an unrecognized render value", () => {
      const a = makeArtifact({ render: "totally-unknown" as Artifact["render"] });
      expect(artifactBodyMarkdown(a, NO_NODES)).toBe("");
    });
  });
});

/* -------------------------------------------------------------------------- */
/* artifactToMarkdown                                                         */
/* -------------------------------------------------------------------------- */

describe("artifactToMarkdown", () => {
  it("prefixes a level-2 title header and appends a trailing newline", () => {
    const a = makeArtifact({
      render: "markdown",
      title: "Mi Documento",
      payload: { markdown: "contenido" },
    });
    expect(artifactToMarkdown(a, NO_NODES)).toBe("## Mi Documento\n\ncontenido\n");
  });

  it("composes title + body for a mermaid artifact", () => {
    const a = makeArtifact({
      render: "mermaid",
      title: "Diagrama",
      payload: { code: "graph TD; A-->B" },
    });
    expect(artifactToMarkdown(a, NO_NODES)).toBe(
      "## Diagrama\n\n```mermaid\ngraph TD; A-->B\n```\n"
    );
  });

  it("renders title header even when the body is empty", () => {
    const a = makeArtifact({ render: "markdown", title: "Vacío", payload: {} });
    expect(artifactToMarkdown(a, NO_NODES)).toBe("## Vacío\n\n\n");
  });

  it("delegates the body to artifactBodyMarkdown (drivers stay consistent)", () => {
    const a = makeArtifact({
      render: "drivers",
      title: "Drivers",
      payload: { drivers: [{ nombre: "D", descripcion: "x", nodos_relacionados: [] }] },
    });
    const expected = `## Drivers\n\n${artifactBodyMarkdown(a, NO_NODES)}\n`;
    expect(artifactToMarkdown(a, NO_NODES)).toBe(expected);
  });
});
