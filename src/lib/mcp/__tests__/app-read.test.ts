import { describe, it, expect } from "vitest";
import {
  artifactBriefs,
  clampBody,
  formatArtifact,
  formatArtifactList,
  formatViewList,
  normalizeRef,
  resolveAppRead,
  pickByName,
  selectArtifact,
  selectView,
  viewBriefs,
  MAX_ARTIFACT_CHARS,
  type ArtifactInput,
  type ViewInput,
  type AppReadContext,
} from "../app-read";
import type { GraphData } from "@/lib/types";

const art = (over: Partial<ArtifactInput> = {}): ArtifactInput => ({
  title: "Drivers de Arquitectura",
  kind: "drivers",
  render: "markdown",
  revision: 1,
  createdAt: "2026-08-19T00:00:00.000Z",
  lineageId: "lin-1",
  markdown: "## Contexto\ncuerpo",
  ...over,
});

const graph = (nodos: number): GraphData =>
  ({
    nombre_proyecto: "P",
    version: "1.0.0",
    fecha_analisis: "2026-08-19",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: Array.from({ length: nodos }, (_, i) => ({
        id: `n${i}`,
        nombre: `N${i}`,
        tipo_elemento: "Comando",
        descripcion: "",
        estado_comparativo: "nuevo",
      })),
      aristas: [],
    },
    agregados: [],
  }) as unknown as GraphData;

describe("normalizeRef · pickByName", () => {
  it("ignora acentos, mayúsculas y puntuación", () => {
    expect(normalizeRef("Cotización: Emisión")).toBe("cotizacion emision");
  });

  it("resuelve por coincidencia parcial cuando hay UNA sola candidata", () => {
    const items = [{ n: "Drivers de Arquitectura" }, { n: "Mapa de Contexto" }];
    expect(pickByName(items, "drivers", (i) => i.n)?.n).toBe("Drivers de Arquitectura");
  });

  it("con dos candidatas NO adivina", () => {
    const items = [{ n: "Vista de Pagos" }, { n: "Vista de Cobros" }];
    expect(pickByName(items, "vista", (i) => i.n)).toBeNull();
  });

  it("el exacto gana sobre el parcial", () => {
    const items = [{ n: "Pagos" }, { n: "Pagos y Cobros" }];
    expect(pickByName(items, "Pagos", (i) => i.n)?.n).toBe("Pagos");
  });

  it("una referencia vacía no resuelve", () => {
    expect(pickByName([{ n: "X" }], "  ", (i) => i.n)).toBeNull();
  });
});

describe("artifactBriefs", () => {
  it("una fila por linaje con la revisión vigente y el histórico declarado", () => {
    const items = [
      art({ revision: 1, markdown: "v1" }),
      art({ revision: 2, markdown: "cuerpo v2" }),
      art({ title: "ADR 1", kind: "adr", lineageId: "lin-2", markdown: "adr" }),
    ];
    const briefs = artifactBriefs(items);
    expect(briefs.map((b) => b.title)).toEqual(["ADR 1", "Drivers de Arquitectura"]);
    const drivers = briefs.find((b) => b.kind === "drivers")!;
    expect(drivers.revision).toBe(2);
    expect(drivers.revisions).toEqual([1, 2]);
    expect(drivers.chars).toBe("cuerpo v2".length);
  });

  it("sin linaje (estado viejo) agrupa por título normalizado", () => {
    const items = [
      art({ lineageId: undefined, revision: 1 }),
      art({ lineageId: undefined, revision: 2, title: "drivers de arquitectura" }),
    ];
    expect(artifactBriefs(items)).toHaveLength(1);
  });
});

describe("selectArtifact", () => {
  const items = [art({ revision: 1, markdown: "primero" }), art({ revision: 2, markdown: "segundo" })];

  it("sin revisión devuelve la vigente", () => {
    expect(selectArtifact(items, "drivers")!.markdown).toBe("segundo");
  });

  it("con revisión devuelve esa revisión del histórico", () => {
    const a = selectArtifact(items, "Drivers de Arquitectura", 1)!;
    expect(a.revision).toBe(1);
    expect(a.markdown).toBe("primero");
  });

  it("una revisión que no existe no cae a otra: devuelve null", () => {
    expect(selectArtifact(items, "drivers", 9)).toBeNull();
  });

  it("un título que no resuelve devuelve null", () => {
    expect(selectArtifact(items, "roadmap")).toBeNull();
  });
});

describe("viewBriefs · selectView", () => {
  const views: ViewInput[] = [
    { name: "Modelo", kind: "graph", notation: "ddd", builtin: true, graph: graph(3) },
    { name: "Pagos BPMN", kind: "graph", notation: "bpmn", graph: graph(7), description: "proceso de cobro" },
    { name: "Secuencia", kind: "mermaid", mermaidCode: "sequenceDiagram\nA->>B: x" },
  ];

  it("cuenta elementos y marca las vistas del sistema", () => {
    const b = viewBriefs(views);
    expect(b.map((v) => v.elements)).toEqual([3, 7, 0]); // la Mermaid es código, no elementos
    expect(b[0].builtin).toBe(true);
  });

  it("selectView devuelve el grafo de una vista de tipo grafo", () => {
    const v = selectView(views, "pagos")!;
    expect(v.notation).toBe("bpmn");
    expect(v.graph?.big_picture?.nodos).toHaveLength(7);
  });

  it("selectView devuelve el código de una vista Mermaid", () => {
    expect(selectView(views, "Secuencia")!.mermaidCode).toContain("sequenceDiagram");
  });

  it("un nombre ambiguo no resuelve", () => {
    expect(selectView([{ name: "Vista A", kind: "graph" }, { name: "Vista B", kind: "graph" }], "vista")).toBeNull();
  });
});

describe("clampBody", () => {
  it("un cuerpo corto viaja entero", () => {
    expect(clampBody("corto")).toBe("corto");
  });

  it("uno largo se corta DICIENDO cuánto quedó afuera", () => {
    const largo = "x".repeat(MAX_ARTIFACT_CHARS + 500);
    const r = clampBody(largo);
    expect(r.length).toBeLessThan(largo.length);
    expect(r).toContain("recortado: 500 de");
  });
});

describe("formatos de respuesta", () => {
  it("la lista vacía explica de dónde salen los artefactos", () => {
    expect(formatArtifactList("Seguros", [])).toContain("no tiene artefactos");
  });

  it("la lista dice cómo pedir el contenido", () => {
    const t = formatArtifactList("Seguros", artifactBriefs([art()]));
    expect(t).toContain("| Drivers de Arquitectura | drivers |");
    expect(t).toContain("get_artifact");
  });

  it("el artefacto llega con su encabezado, proyecto y revisiones", () => {
    const a = selectArtifact([art({ revision: 1 }), art({ revision: 2 })], "drivers")!;
    const t = formatArtifact("Seguros", a);
    expect(t).toContain("# Drivers de Arquitectura (v2)");
    expect(t).toContain('Proyecto "Seguros"');
    expect(t).toContain("v1, v2");
  });

  it("la lista de vistas distingue sistema de custom y ofrece importAs", () => {
    const t = formatViewList(
      "Seguros",
      viewBriefs([
        { name: "Modelo", kind: "graph", notation: "ddd", builtin: true, graph: graph(2) },
        { name: "Cobros", kind: "graph", notation: "bpmn", graph: graph(5) },
      ])
    );
    expect(t).toContain("| Modelo | graph / ddd | sistema | 2 |");
    expect(t).toContain("| Cobros | graph / bpmn | custom | 5 |");
    expect(t).toContain("importAs");
  });
});

describe("resolveAppRead", () => {
  const ctx = (over: Partial<AppReadContext> = {}): AppReadContext => ({
    active: { id: "f1", name: "Seguros" },
    projects: [
      { id: "f1", name: "Seguros" },
      { id: "f2", name: "Banca Digital" },
    ],
    viewsOf: (id) =>
      id === "f1"
        ? [{ name: "Modelo", kind: "design", notation: "ddd", builtin: true, graph: graph(4) }]
        : [{ name: "Cobros", kind: "graph", notation: "bpmn", graph: graph(6) }],
    artifactsOf: (id) => (id === "f1" ? [art()] : [art({ title: "ADR Banca", lineageId: "lin-9" })]),
    ...over,
  });

  it("sin `project` responde sobre el proyecto ACTIVO", () => {
    const r = resolveAppRead({ kind: "artifacts" }, ctx());
    expect(r.ok && r.project).toBe("Seguros");
    expect(r.ok && r.kind === "artifacts" && r.artifacts[0].title).toBe("Drivers de Arquitectura");
  });

  it("con `project` lee OTRO proyecto sin cambiar el activo", () => {
    const r = resolveAppRead({ kind: "views", project: "banca" }, ctx());
    expect(r.ok && r.project).toBe("Banca Digital");
    expect(r.ok && r.kind === "views" && r.views[0].name).toBe("Cobros");
  });

  it("un proyecto inexistente devuelve las opciones, no un error pelado", () => {
    const r = resolveAppRead({ kind: "views", project: "Aurora" }, ctx());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.options).toEqual(["Seguros", "Banca Digital"]);
  });

  it("sin proyecto activo lo dice y ofrece los guardados", () => {
    const r = resolveAppRead({ kind: "artifacts" }, ctx({ active: null }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("No hay proyecto activo");
    expect(!r.ok && r.options).toContain("Banca Digital");
  });

  it("un artefacto que no resuelve devuelve los títulos disponibles con su revisión", () => {
    const r = resolveAppRead({ kind: "artifact", title: "roadmap" }, ctx());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.options).toEqual(["Drivers de Arquitectura (v1)"]);
  });

  it("pedir una revisión que no existe se distingue de un título que no existe", () => {
    const r = resolveAppRead({ kind: "artifact", title: "drivers", revision: 7 }, ctx());
    expect(!r.ok && r.error).toContain("revisión v7");
  });

  it("devuelve el artefacto con su Markdown", () => {
    const r = resolveAppRead({ kind: "artifact", title: "drivers" }, ctx());
    expect(r.ok && r.kind === "artifact" && r.artifact.markdown).toContain("cuerpo");
  });

  it("una vista vacía no se entrega como si tuviera contenido", () => {
    const r = resolveAppRead(
      { kind: "view", name: "Vacia" },
      ctx({ viewsOf: () => [{ name: "Vacia", kind: "graph" }] })
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("está vacía");
  });

  it("devuelve la vista con su grafo", () => {
    const r = resolveAppRead({ kind: "view", name: "Modelo" }, ctx());
    expect(r.ok && r.kind === "view" && r.view.graph?.big_picture?.nodos).toHaveLength(4);
  });
});
