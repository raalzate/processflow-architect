import { describe, it, expect } from "vitest";
import { getNotation, DEFAULT_NOTATION_ID } from "@/lib/notations";

// El encabezado sale del `modelLabel` de la notación: derivarlo del registro
// evita fijar "Modelo de Dominio" y volver a romper si cambia el default (P6).
const TITULO_MODELO = `## ${getNotation(DEFAULT_NOTATION_ID).modelLabel}`;
import {
  formatDriversToMarkdown,
  formatConstraintsToMarkdown,
  formatRoadmapToMarkdown,
  formatProposalToMarkdown,
  formatNodeTreeToMarkdown,
  formatTaskListToMarkdown,
} from "@/lib/markdown-utils";
import type {
  GraphNode,
  GraphData,
  ArchitectureDriversOutput,
  ConstraintsRisksOutput,
  RoadmapOutput,
  TechnicalElementsOutput,
} from "@/lib/types";

// -----------------------------------------------------------------------------
// Fixtures built from the real exported types in src/lib/types.ts
// -----------------------------------------------------------------------------

const makeNode = (over: Partial<GraphNode> = {}): GraphNode => ({
  id: "n1",
  nombre: "MiNodo",
  tipo_elemento: "Comando",
  descripcion: "desc",
  estado_comparativo: "existente",
  ...over,
});

const allNodes: GraphNode[] = [
  makeNode({ id: "node_a", nombre: "RegistrarCliente", tipo_elemento: "Comando" }),
  makeNode({ id: "node_b", nombre: "ClienteRegistrado", tipo_elemento: "Evento" }),
];

// -----------------------------------------------------------------------------
// formatDriversToMarkdown
// -----------------------------------------------------------------------------
describe("formatDriversToMarkdown", () => {
  it("returns empty string for null/undefined drivers", () => {
    expect(formatDriversToMarkdown(null as unknown as ArchitectureDriversOutput, allNodes)).toBe("");
    expect(
      formatDriversToMarkdown({} as unknown as ArchitectureDriversOutput, allNodes)
    ).toBe("");
  });

  it("renders heading and driver names; resolves related node names", () => {
    const drivers: ArchitectureDriversOutput = {
      drivers: [
        {
          nombre: "Escalabilidad",
          descripcion: "Debe escalar horizontalmente.",
          nodos_relacionados: ["node_a", "node_b"],
        },
      ],
    };
    const md = formatDriversToMarkdown(drivers, allNodes);
    expect(md).toContain("## Drivers de Arquitectura");
    expect(md).toContain("### Escalabilidad");
    expect(md).toContain("Debe escalar horizontalmente.");
    // separateCamelCase splits the resolved node name
    expect(md).toContain("**Elementos claves:**");
    expect(md).toContain("`Registrar Cliente`");
    expect(md).toContain("`Cliente Registrado`");
  });

  it("falls back to the node id when id is not found", () => {
    const drivers: ArchitectureDriversOutput = {
      drivers: [
        {
          nombre: "Seguridad",
          descripcion: "Hardening.",
          nodos_relacionados: ["unknown_id"],
        },
      ],
    };
    const md = formatDriversToMarkdown(drivers, allNodes);
    expect(md).toContain("`unknown id`"); // underscores replaced by separateCamelCase
  });

  it("omits the related-nodes line when nodos_relacionados is empty", () => {
    const drivers: ArchitectureDriversOutput = {
      drivers: [{ nombre: "Rendimiento", descripcion: "Rápido.", nodos_relacionados: [] }],
    };
    const md = formatDriversToMarkdown(drivers, allNodes);
    expect(md).toContain("### Rendimiento");
    expect(md).not.toContain("**Elementos claves:**");
  });
});

// -----------------------------------------------------------------------------
// formatConstraintsToMarkdown
// -----------------------------------------------------------------------------
describe("formatConstraintsToMarkdown", () => {
  it("returns empty string for null/undefined constraints", () => {
    expect(
      formatConstraintsToMarkdown(null as unknown as ConstraintsRisksOutput, allNodes)
    ).toBe("");
    expect(
      formatConstraintsToMarkdown({} as unknown as ConstraintsRisksOutput, allNodes)
    ).toBe("");
  });

  it("renders heading, tipo, nombre and related node names", () => {
    const constraints: ConstraintsRisksOutput = {
      constraintsAndRisks: [
        {
          nombre: "Presupuesto limitado",
          descripcion: "Solo 3 meses.",
          tipo: "Restricción",
          nodos_relacionados: ["node_a"],
        },
        {
          nombre: "Caída de proveedor",
          descripcion: "El proveedor puede fallar.",
          tipo: "Riesgo",
          nodos_relacionados: [],
        },
      ],
    };
    const md = formatConstraintsToMarkdown(constraints, allNodes);
    expect(md).toContain("## Restricciones y Riesgos");
    expect(md).toContain("### Restricción: Presupuesto limitado");
    expect(md).toContain("Solo 3 meses.");
    expect(md).toContain("`Registrar Cliente`");
    expect(md).toContain("### Riesgo: Caída de proveedor");
    // the second item has no related nodes -> no second "Elementos claves" for it
    const occurrences = md.split("**Elementos claves:**").length - 1;
    expect(occurrences).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// formatRoadmapToMarkdown
// -----------------------------------------------------------------------------
describe("formatRoadmapToMarkdown", () => {
  it("returns empty string for null/undefined roadmap", () => {
    expect(formatRoadmapToMarkdown(null as unknown as RoadmapOutput, allNodes)).toBe("");
    expect(formatRoadmapToMarkdown({} as unknown as RoadmapOutput, allNodes)).toBe("");
  });

  it("renders phase name, duration, epics, roles and linked tasks (by node name)", () => {
    const roadmap: RoadmapOutput = {
      phases: [
        {
          phaseName: "Fase 1",
          duration: "2-3 semanas",
          epics: ["Onboarding", "Pagos"],
          requiredRoles: ["Backend", "QA"],
          taskIds: ["node_a", "missing_task"],
        },
      ],
    };
    const md = formatRoadmapToMarkdown(roadmap, allNodes);
    expect(md).toContain("## Roadmap de Implementación (Propuesta)");
    expect(md).toContain("### Fase 1 (2-3 semanas)");
    expect(md).toContain("**Épicas Clave:**");
    expect(md).toContain("- Onboarding");
    expect(md).toContain("- Pagos");
    expect(md).toContain("**Roles Requeridos:**");
    expect(md).toContain("Backend, QA");
    expect(md).toContain("**Elementos Vinculadas:**");
    // resolved task node name (not camel-split here)
    expect(md).toContain("- RegistrarCliente");
    // unresolved task id falls back to the id
    expect(md).toContain("- missing_task");
  });

  it("omits roles and tasks sections when absent or empty", () => {
    const roadmap: RoadmapOutput = {
      phases: [
        {
          phaseName: "Fase Min",
          duration: "1 semana",
          epics: ["Solo epica"],
          requiredRoles: [],
          taskIds: [],
        },
      ],
    };
    const md = formatRoadmapToMarkdown(roadmap, allNodes);
    expect(md).toContain("### Fase Min (1 semana)");
    expect(md).not.toContain("**Roles Requeridos:**");
    expect(md).not.toContain("**Elementos Vinculadas:**");
  });

  it("handles phases where optional roles/tasks are undefined", () => {
    const roadmap: RoadmapOutput = {
      phases: [{ phaseName: "Fase X", duration: "1d", epics: ["e"] }],
    };
    const md = formatRoadmapToMarkdown(roadmap, allNodes);
    expect(md).toContain("### Fase X (1d)");
    expect(md).not.toContain("**Roles Requeridos:**");
    expect(md).not.toContain("**Elementos Vinculadas:**");
  });
});

// -----------------------------------------------------------------------------
// formatProposalToMarkdown
// -----------------------------------------------------------------------------
const makeProposal = (over: Partial<TechnicalElementsOutput> = {}): TechnicalElementsOutput => ({
  baseDeDatos: [],
  backend: [],
  infraestructura: [],
  herramientas: [],
  restricciones: [],
  observaciones: "",
  diagrama: { nodes: [], edges: [] },
  ...over,
});

describe("formatProposalToMarkdown", () => {
  it("returns empty string for null/undefined proposal", () => {
    expect(formatProposalToMarkdown(null as unknown as TechnicalElementsOutput)).toBe("");
    expect(formatProposalToMarkdown(undefined as unknown as TechnicalElementsOutput)).toBe("");
  });

  it("renders heading, observaciones and all populated sections", () => {
    const proposal = makeProposal({
      observaciones: "Una observación importante.",
      baseDeDatos: ["PostgreSQL"],
      backend: ["Node.js", "NestJS"],
      infraestructura: ["GCP"],
      herramientas: ["Docker"],
      restricciones: ["Sin cloud público"],
      diagrama: {
        nodes: [
          { id: "a", label: "Servicio A" },
          { id: "b", label: "Servicio B" },
        ],
        edges: [{ from: "a", to: "b", label: "llama" }],
      },
    });
    const md = formatProposalToMarkdown(proposal);
    expect(md).toContain("## Propuesta de Implementación");
    expect(md).toContain("Una observación importante.");
    expect(md).toContain("### Base de datos");
    expect(md).toContain("- PostgreSQL");
    expect(md).toContain("### Backend");
    expect(md).toContain("- Node.js");
    expect(md).toContain("- NestJS");
    expect(md).toContain("### Infraestructura");
    expect(md).toContain("- GCP");
    expect(md).toContain("### Herramientas");
    expect(md).toContain("- Docker");
    expect(md).toContain("### Consideraciones");
    expect(md).toContain("- Sin cloud público");
    expect(md).toContain("### Planteamiento de la solución");
    expect(md).toContain("```mermaid");
    // diagram body comes from diagramTechnicalElements
    expect(md).toContain("graph TD;");
    expect(md).toContain("a[Servicio A]");
  });

  it("omits empty sections and the observaciones block when blank", () => {
    const proposal = makeProposal(); // everything empty
    const md = formatProposalToMarkdown(proposal);
    expect(md).toContain("## Propuesta de Implementación");
    expect(md).not.toContain("### Base de datos");
    expect(md).not.toContain("### Backend");
    expect(md).not.toContain("### Consideraciones");
    // Sin nodos en el diagrama no se emite el bloque mermaid (evita un fence vacío).
    expect(md).not.toContain("```mermaid");
  });

  it("omits the solution heading and mermaid block when the diagram has no nodes", () => {
    // diagrama = {nodes:[],edges:[]}: sin nodos no hay nada que dibujar.
    const md = formatProposalToMarkdown(makeProposal());
    expect(md).not.toContain("### Planteamiento de la solución");
    expect(md).not.toContain("```mermaid");
  });
});

// -----------------------------------------------------------------------------
// formatNodeTreeToMarkdown
// -----------------------------------------------------------------------------
const makeGraph = (over: Partial<GraphData> = {}): GraphData => ({
  nombre_proyecto: "Proyecto",
  version: "1.0",
  fecha_analisis: "2026-01-01",
  big_picture: {
    descripcion: "Descripción del big picture.",
    hotspots: [],
    nodos: [],
    aristas: [],
  },
  agregados: [],
  read_models: [],
  responsables: [],
  notas: "",
  transcript: "",
  ...over,
});

describe("formatNodeTreeToMarkdown", () => {
  it("returns empty string when there are no aggregates", () => {
    expect(formatNodeTreeToMarkdown(makeGraph({ agregados: [] }))).toBe("");
  });

  it("renders domain model heading, aggregate names, node lines and mermaid blocks", () => {
    const graph = makeGraph({
      big_picture: {
        descripcion: "Big picture detallado.",
        hotspots: ["Zona confusa A", "Zona confusa B"],
        nodos: [
          makeNode({ id: "n_actor", nombre: "Cliente", tipo_elemento: "Actor" }),
          makeNode({ id: "n_cmd", nombre: "RegistrarPedido", tipo_elemento: "Comando" }),
        ],
        aristas: [
          {
            fuente: "n_actor",
            destino: "n_cmd",
            descripcion: "habilita",
          } as GraphData["big_picture"]["aristas"][number],
        ],
      },
      agregados: [
        {
          nombre_agregado: "GestionPedidos",
          entidad_raiz: "Pedido",
          descripcion: "Agg de pedidos",
          nodos: [
            makeNode({ id: "x1", nombre: "Pedido", tipo_elemento: "Raíz de Agregado", descripcion: "La raíz" }),
          ],
          aristas: [],
        },
      ],
      read_models: [
        {
          nombre: "VistaPedidos",
          descripcion: "Lista de pedidos.",
          proyecta: ["PedidoCreadoEvento"],
          ui_policies: ["MostrarEnGrid"],
          tecnologias: ["Elasticsearch"],
        },
      ],
    });
    const md = formatNodeTreeToMarkdown(graph);
    expect(md).toContain(TITULO_MODELO);
    expect(md).toContain("Big picture detallado.");
    // hotspots block
    expect(md).toContain("Áreas poco claras del modelo");
    expect(md).toContain("***Zona confusa A***");
    expect(md).toContain("***Zona confusa B***");
    // context mermaid
    expect(md).toContain("### Contexto");
    expect(md).toContain("```mermaid");
    expect(md).toContain("flowchart LR");
    // aggregate analysis
    // DDD → el contenedor se llama "Agregado" (viene de la notación).
    expect(md).toContain("## Análisis por Agregado ##");
    expect(md).toContain("### Gestion Pedidos"); // camel-split aggregate name
    expect(md).toContain("[Raíz de Agregado] Pedido:");
    expect(md).toContain("La raíz");
    // big picture diagram
    expect(md).toContain("### Big Picture");
    // data view / read models
    expect(md).toContain("## Vista de Datos ##");
    expect(md).toContain("### Modelo de lectura: VistaPedidos");
    expect(md).toContain("Lista de pedidos.");
    expect(md).toContain("#### Proyecta");
    expect(md).toContain("#### Tecnologías Involucrar");
    expect(md).toContain("***Elasticsearch***");
    expect(md).toContain("#### Diagrama del Read Model");
  });

  it("omits hotspots block when there are no hotspots, and data view stays empty without read models", () => {
    const graph = makeGraph({
      big_picture: {
        descripcion: "Sin hotspots.",
        hotspots: [],
        nodos: [],
        aristas: [],
      },
      agregados: [
        {
          nombre_agregado: "Solo",
          entidad_raiz: "E",
          descripcion: "d",
          nodos: [],
          aristas: [],
        },
      ],
      read_models: [],
    });
    const md = formatNodeTreeToMarkdown(graph);
    expect(md).toContain(TITULO_MODELO);
    expect(md).not.toContain("Área poco clara o confusa");
    expect(md).toContain("## Vista de Datos ##");
    expect(md).not.toContain("### Modelo de lectura:");
  });
});

// -----------------------------------------------------------------------------
// formatTaskListToMarkdown (async, useAI=false keeps it deterministic)
// -----------------------------------------------------------------------------
describe("formatTaskListToMarkdown", () => {
  it("returns empty string when both lists are empty", async () => {
    const md = await formatTaskListToMarkdown({ new: [], modified: [] }, undefined, false);
    expect(md).toBe("");
  });

  it("renders heading, new and modified sections with counts and node names", async () => {
    const tasks = {
      new: [
        makeNode({ id: "t1", nombre: "Crear API", tipo_elemento: "Comando", estado_comparativo: "nuevo" }),
        makeNode({ id: "t2", nombre: "Nuevo Evento", tipo_elemento: "Evento", estado_comparativo: "nuevo" }),
      ],
      modified: [
        makeNode({ id: "m1", nombre: "Ajustar Vista", tipo_elemento: "Vista", estado_comparativo: "modificado" }),
      ],
    };
    const md = await formatTaskListToMarkdown(tasks, undefined, false);
    expect(md).toContain("## Elementos Principales (Nuevos/Modificados)");
    expect(md).toContain("### Cambios nuevos (2)");
    expect(md).toContain("**[Comando]** Crear API");
    expect(md).toContain("**[Evento]** Nuevo Evento");
    expect(md).toContain("### Modificados (1)");
    expect(md).toContain("**[Vista]** Ajustar Vista");
  });

  it("includes the optional nota when provided", async () => {
    const tasks = {
      new: [makeNode({ id: "t1", nombre: "X", estado_comparativo: "nuevo" })],
      modified: [],
    };
    const md = await formatTaskListToMarkdown(tasks, "Esta es una nota.", false);
    expect(md).toContain("Esta es una nota.");
    expect(md).toContain("### Cambios nuevos (1)");
    expect(md).not.toContain("### Modificados");
  });

  it("omits the new section when only modified entries exist", async () => {
    const tasks = {
      new: [],
      modified: [makeNode({ id: "m1", nombre: "Solo Mod", estado_comparativo: "modificado" })],
    };
    const md = await formatTaskListToMarkdown(tasks, undefined, false);
    expect(md).not.toContain("### Cambios nuevos");
    expect(md).toContain("### Modificados (1)");
    expect(md).toContain("Solo Mod");
  });

  it("renders the deleted section when there are nodes marked eliminado", async () => {
    const tasks = {
      new: [],
      modified: [],
      deleted: [
        makeNode({ id: "d1", nombre: "Servicio Obsoleto", tipo_elemento: "Comando", estado_comparativo: "eliminado" }),
      ],
    };
    const md = await formatTaskListToMarkdown(tasks, undefined, false);
    expect(md).toContain("### Eliminados (1)");
    expect(md).toContain("**[Comando]** Servicio Obsoleto");
    expect(md).not.toContain("### Cambios nuevos");
    expect(md).not.toContain("### Modificados");
  });

  it("keeps working without the deleted list (retrocompatibilidad)", async () => {
    const md = await formatTaskListToMarkdown(
      { new: [makeNode({ id: "t1", nombre: "X", estado_comparativo: "nuevo" })], modified: [] },
      undefined,
      false
    );
    expect(md).toContain("### Cambios nuevos (1)");
    expect(md).not.toContain("### Eliminados");
  });

  it("uses node.nombre verbatim (no AI) and does not call any AI when useAI=false", async () => {
    // In the node test environment window is undefined, so even useAI=true would be inert,
    // but we explicitly pass false to keep it pure/deterministic.
    const md = await formatTaskListToMarkdown(
      { new: [makeNode({ id: "t1", nombre: "Literal Nombre", estado_comparativo: "nuevo" })], modified: [] },
      undefined,
      false
    );
    expect(md).toContain("Literal Nombre");
  });
});
