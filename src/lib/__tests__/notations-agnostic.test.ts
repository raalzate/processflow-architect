import { describe, it, expect } from "vitest";
import {
  ALL_NODE_TYPES,
  NOTATION_LIST,
  getNotation,
  isSwimlaneContainer,
  notationTypes,
  notationRoles,
  typesWithRole,
  roleOfType,
  hasRole,
} from "@/lib/notations";
import { elementHint } from "@/lib/template-prompt";
import { diagramContext } from "@/lib/mermaid-diagram";
import { formatNodeTreeToMarkdown } from "@/lib/markdown-utils";
import type { BigPicture, GraphData } from "@/lib/types";

// Estas pruebas son la red que evita que la app vuelva a asumir DDD: cada
// notación debe traer su propio marco (rol, flujo, nombres, tipo por defecto) y
// los helpers deben devolver SIEMPRE los tipos de la notación pedida.

describe("marco por notación", () => {
  it("toda notación declara rol, flujo, regla de nombres y tipo por defecto", () => {
    for (const n of NOTATION_LIST) {
      expect(n.analystRole.length).toBeGreaterThan(3);
      expect(n.flowRules).toContain("→");
      expect(n.namingRule.length).toBeGreaterThan(3);
      expect(n.defaultType.length).toBeGreaterThan(0);
    }
  });

  it("el tipo por defecto existe en SU notación y no es contenedor", () => {
    for (const n of NOTATION_LIST) {
      const el = n.elements.find((e) => e.type === n.defaultType);
      expect(el, `${n.id}: defaultType desconocido`).toBeTruthy();
      expect(el!.container).toBeFalsy();
    }
  });

  it("cada notación tiene un rol distinto (nada cae al de DDD)", () => {
    const roles = new Set(NOTATION_LIST.map((n) => n.analystRole));
    expect(roles.size).toBe(NOTATION_LIST.length);
  });
});

// Los roles semánticos son lo que deja escribir reglas de calidad agnósticas
// (¿hay inicio? ¿las ramas están etiquetadas?). Si la tabla se desincroniza del
// registro, las reglas dejan de ver elementos en silencio: eso lo caza esto.
describe("roles semánticos", () => {
  it("todo tipo con rol existe en SU notación", () => {
    for (const n of NOTATION_LIST) {
      const known = new Set(n.elements.map((e) => e.type));
      for (const [role, types] of Object.entries(notationRoles(n.id))) {
        for (const t of types ?? []) {
          expect(known.has(t), `${n.id}: el rol ${role} declara "${t}", que no existe`).toBe(true);
        }
      }
    }
  });

  it("un tipo no juega dos roles en la misma notación", () => {
    for (const n of NOTATION_LIST) {
      const seen = new Set<string>();
      for (const types of Object.values(notationRoles(n.id))) {
        for (const t of types ?? []) {
          expect(seen.has(t), `${n.id}: "${t}" tiene más de un rol`).toBe(false);
          seen.add(t);
        }
      }
    }
  });

  it("toda notación de flujo declara inicio y fin, o comando y evento", () => {
    for (const n of NOTATION_LIST) {
      const tieneFlujo = typesWithRole(n.id, "start").length > 0 && typesWithRole(n.id, "end").length > 0;
      const tieneDominio =
        typesWithRole(n.id, "command").length > 0 || typesWithRole(n.id, "system").length > 0;
      expect(tieneFlujo || tieneDominio, `${n.id}: sin roles de flujo ni de dominio`).toBe(true);
    }
  });

  it("roleOfType y hasRole coinciden con la tabla", () => {
    const gateways = typesWithRole("bpmn", "gateway");
    expect(gateways.length).toBeGreaterThan(0);
    expect(roleOfType("bpmn", gateways[0])).toBe("gateway");
    expect(hasRole("bpmn", gateways[0], "gateway", "task")).toBe(true);
    expect(hasRole("bpmn", "Tipo Inventado", "gateway")).toBe(false);
    // Notación desconocida cae a DDD (coherente con getNotation).
    expect(typesWithRole("inexistente", "command")).toEqual(typesWithRole("ddd", "command"));
  });
});

describe("simbología de contenedores", () => {
  it("Pool y Carril de BPMN son swimlanes (línea continua + banda rotada)", () => {
    expect(isSwimlaneContainer("Pool")).toBe(true);
    expect(isSwimlaneContainer("Carril")).toBe(true);
  });

  it("las fronteras lógicas NO son swimlanes (siguen punteadas)", () => {
    for (const t of ["Contexto Delimitado", "Subdominio", "Agregado", "Límite de Sistema", "Paquete"]) {
      expect(isSwimlaneContainer(t), t).toBe(false);
    }
  });

  it("un tipo suelto (no contenedor) nunca es swimlane", () => {
    expect(isSwimlaneContainer("Tarea")).toBe(false);
    expect(isSwimlaneContainer("Chachareo")).toBe(false);
  });
});

describe("notationTypes", () => {
  it("excluye contenedores por defecto y los incluye si se piden", () => {
    const sinPools = notationTypes("bpmn");
    expect(sinPools).toContain("Tarea");
    expect(sinPools).not.toContain("Pool");
    expect(notationTypes("bpmn", { includeContainers: true })).toContain("Pool");
  });

  it("no filtra tipos de otras notaciones", () => {
    expect(notationTypes("c4")).toContain("Contenedor");
    expect(notationTypes("c4")).not.toContain("Comando");
    expect(notationTypes("uml")).toContain("Clase");
    expect(notationTypes("uml")).not.toContain("Tarea");
  });

  it("sin notación cae a la de por defecto (misma que getNotation)", () => {
    expect(notationTypes(undefined)).toEqual(
      getNotation(undefined).elements.filter((e) => !e.container).map((e) => e.type)
    );
  });
});

describe("ALL_NODE_TYPES", () => {
  it("cubre las cuatro notaciones (semilla de filtros del visor)", () => {
    for (const t of ["Comando", "Tarea", "Contenedor", "Clase"]) {
      expect(ALL_NODE_TYPES).toContain(t);
    }
  });
});

describe("elementHint", () => {
  it("da pista para tipos de cualquier notación, no solo DDD", () => {
    expect(elementHint("Compuerta Exclusiva")).toMatch(/XOR|decisión/i);
    expect(elementHint("Contenedor")).toMatch(/aplicación|almacén/i);
    expect(elementHint("Caso de Uso")).toMatch(/funcionalidad|servicio/i);
  });

  it("es una sola frase (sin punto final) para no inflar el prompt", () => {
    const hint = elementHint("Tarea");
    expect(hint.endsWith(".")).toBe(false);
    expect(hint.split(". ").length).toBe(1);
  });

  it("cae a una pista genérica para un tipo desconocido", () => {
    expect(elementHint("Chachareo")).toBe("un elemento del modelo");
  });
});

// -----------------------------------------------------------------------------
// Exportaciones: el recorte y los rótulos siguen a la notación del documento.
// -----------------------------------------------------------------------------

const bpmnPicture: BigPicture = {
  descripcion: "Proceso de compra.",
  hotspots: [],
  nodos: [
    { id: "e1", nombre: "Pedido recibido", tipo_elemento: "Evento de Inicio", estado_comparativo: "existente" },
    { id: "t1", nombre: "Validar pago", tipo_elemento: "Tarea", estado_comparativo: "existente" },
    { id: "g1", nombre: "¿Pago aprobado?", tipo_elemento: "Compuerta Exclusiva", estado_comparativo: "existente" },
  ],
  aristas: [
    { fuente: "e1", destino: "t1" } as BigPicture["aristas"][number],
    { fuente: "t1", destino: "g1" } as BigPicture["aristas"][number],
  ],
};

describe("diagramContext", () => {
  it("en BPMN no recorta a los tipos del Event Storming", () => {
    const out = diagramContext(bpmnPicture, "bpmn");
    expect(out).toContain("Validar pago");
    expect(out).toContain("Pedido recibido");
    // La compuerta sale en rombo, la forma que declara su notación.
    expect(out).toMatch(/g1\{"¿Pago aprobado\?"\}/);
  });

  it("en DDD conserva el recorte de contexto (oculta el interior del flujo)", () => {
    const ddd: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [
        { id: "a1", nombre: "Cliente", tipo_elemento: "Actor", estado_comparativo: "existente" },
        { id: "c1", nombre: "Registrar Pedido", tipo_elemento: "Comando", estado_comparativo: "existente" },
        { id: "v1", nombre: "Pedido Registrado", tipo_elemento: "Evento", estado_comparativo: "existente" },
      ],
      aristas: [{ fuente: "c1", destino: "v1" } as BigPicture["aristas"][number]],
    };
    const out = diagramContext(ddd, "ddd");
    expect(out).toContain("Cliente");
    expect(out).not.toContain("Pedido Registrado"); // Evento: interior del flujo
  });

  it("si el recorte deja el diagrama vacío, muestra todos los nodos", () => {
    const soloEventos: BigPicture = {
      descripcion: "",
      hotspots: [],
      nodos: [{ id: "v1", nombre: "Pedido Registrado", tipo_elemento: "Evento", estado_comparativo: "existente" }],
      aristas: [],
    };
    expect(diagramContext(soloEventos, "ddd")).toContain("Pedido Registrado");
  });
});

describe("formatNodeTreeToMarkdown", () => {
  const graph = (notation?: GraphData["notation"]): GraphData => ({
    nombre_proyecto: "P",
    version: "1.0.0",
    notation,
    fecha_analisis: "2026-08-05",
    big_picture: bpmnPicture,
    agregados: [
      {
        nombre_agregado: "Compras",
        entidad_raiz: "",
        descripcion: "Pool de compras",
        nodos: [
          { id: "t1", nombre: "Validar pago", tipo_elemento: "Tarea", estado_comparativo: "existente" },
        ],
        aristas: [],
      },
    ],
    read_models: [],
    responsables: [],
    notas: "",
    transcript: "",
  });

  it("rotula el modelo y sus grupos según la notación", () => {
    const bpmn = formatNodeTreeToMarkdown(graph("bpmn"));
    expect(bpmn).toContain("## Modelo de Procesos");
    expect(bpmn).toContain("## Análisis por Pool ##");
    expect(bpmn).not.toContain("Modelo de Dominio");

    const c4 = formatNodeTreeToMarkdown(graph("c4"));
    expect(c4).toContain("## Modelo de Arquitectura");
    expect(c4).toContain("## Análisis por Límite de Sistema ##");
  });

  it("sin notación mantiene el comportamiento DDD (compatibilidad)", () => {
    const md = formatNodeTreeToMarkdown(graph(undefined));
    expect(md).toContain("## Modelo de Dominio");
    expect(md).toContain("## Análisis por Agregado ##");
  });
});
