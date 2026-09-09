/**
 * Repertorio y veredicto del agente constructor (014, #308).
 *
 * El constructor ESCRIBE, así que lo peligroso no es que el modelo se equivoque:
 * es que se equivoque y la app le crea. Todo lo que decide si una llamada se
 * ejecuta, se confirma o se rechaza vive acá, puro y probado, y el renderer sólo
 * obedece el veredicto.
 */
import { describe, it, expect } from "vitest";
import {
  buildToolMenu,
  parseBuilderAction,
  judgeCall,
  describeScope,
  DESTRUCTIVE_TOOLS,
  type ToolSpec,
} from "@/lib/ai/builder-tools";

const TOOLS: ToolSpec[] = [
  {
    name: "add_node",
    description: "Agrega un elemento al diagrama en curso.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, type: { type: "string" }, container: { type: "string" } },
      required: ["name", "type"],
    },
  },
  {
    name: "list_views",
    description: "Lista las vistas del proyecto.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "delete_view",
    description: "Elimina una vista del proyecto.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
  {
    name: "export_as_view",
    description: "Exporta el diagrama en curso como vista.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, replace: { type: "boolean" } },
      required: ["name"],
    },
  },
  { name: "get_app_state", description: "Estado de la app.", inputSchema: { type: "object", properties: {} } },
];

const ALLOW = ["add_node", "list_views", "delete_view", "export_as_view"];
const VISTAS = [
  { id: "v1", name: "Pagos" },
  { id: "v2", name: "Big Picture", builtin: true },
];
const ctx = { tools: TOOLS, vistas: VISTAS };

describe("menú de herramientas", () => {
  it("sólo muestra las de la allowlist, con nombre y descripción del registro", () => {
    const menu = buildToolMenu(TOOLS, ALLOW);
    expect(menu).toContain("add_node");
    expect(menu).toContain("Agrega un elemento al diagrama en curso.");
    // `get_app_state` existe en el registro pero no está permitida en esta corrida.
    expect(menu).not.toContain("get_app_state");
  });

  it("nombra los argumentos obligatorios: el modelo local no adivina schemas", () => {
    const menu = buildToolMenu(TOOLS, ALLOW);
    expect(menu).toMatch(/add_node[\s\S]*name/);
    expect(menu).toMatch(/add_node[\s\S]*type/);
  });

  it("una herramienta de la allowlist que el registro no tiene no se inventa", () => {
    const menu = buildToolMenu(TOOLS, [...ALLOW, "no_existe"]);
    expect(menu).not.toContain("no_existe");
  });
});

describe("parseo de la acción del modelo", () => {
  it("acepta el contrato { tool, args }", () => {
    const r = parseBuilderAction('{"tool":"list_views","args":{}}', ALLOW);
    expect(r).toEqual({ call: { tool: "list_views", args: {} } });
  });

  it("tolera prosa alrededor del JSON, como escribe el modelo local", () => {
    const r = parseBuilderAction('Voy a listar.\n{"tool":"list_views","args":{}}\nListo.', ALLOW);
    expect("call" in r && r.call.tool).toBe("list_views");
  });

  it("args ausente equivale a sin argumentos", () => {
    const r = parseBuilderAction('{"tool":"list_views"}', ALLOW);
    expect("call" in r && r.call.args).toEqual({});
  });

  it("una herramienta fuera del repertorio se rechaza nombrándola", () => {
    const r = parseBuilderAction('{"tool":"borrar_todo","args":{}}', ALLOW);
    expect("error" in r && r.error).toMatch(/borrar_todo/);
  });

  it("una respuesta que no es acción se rechaza sin romper", () => {
    expect("error" in parseBuilderAction("no sé qué hacer", ALLOW)).toBe(true);
  });
});

describe("veredicto de una llamada", () => {
  it("una lectura permitida se ejecuta", () => {
    expect(judgeCall({ tool: "list_views", args: {} }, ctx)).toEqual({
      kind: "ejecutar",
      call: { tool: "list_views", args: {} },
    });
  });

  it("faltan argumentos obligatorios → rechazo corregible que los nombra", () => {
    const v = judgeCall({ tool: "add_node", args: { name: "Orden" } }, ctx);
    expect(v.kind).toBe("rechazar");
    expect(v.kind === "rechazar" && v.motivo).toMatch(/type/);
  });

  it("un argumento del tipo equivocado se rechaza", () => {
    const v = judgeCall({ tool: "add_node", args: { name: "Orden", type: 42 } }, ctx);
    expect(v.kind).toBe("rechazar");
    expect(v.kind === "rechazar" && v.motivo).toMatch(/type/);
  });

  it("un tipo que la notación de la vista no tiene se rechaza listando los válidos", () => {
    const v = judgeCall(
      { tool: "add_node", args: { name: "Pagar", type: "Agregado" } },
      { ...ctx, notation: "bpmn" }
    );
    expect(v.kind).toBe("rechazar");
    // El mensaje trae tipos REALES de la notación, no una lista cableada.
    expect(v.kind === "rechazar" && v.motivo).toMatch(/Tarea/);
  });

  it("un tipo válido de la notación pasa", () => {
    const v = judgeCall(
      { tool: "add_node", args: { name: "Orden", type: "Comando" } },
      { ...ctx, notation: "ddd" }
    );
    expect(v.kind).toBe("ejecutar");
  });

  it("borrar una vista pide confirmación con el alcance, no se ejecuta", () => {
    const v = judgeCall({ tool: "delete_view", args: { name: "Pagos" } }, ctx);
    expect(v.kind).toBe("confirmar");
    expect(v.kind === "confirmar" && v.alcance).toMatch(/Pagos/);
  });

  it("una vista del sistema no se borra ni se pregunta", () => {
    const v = judgeCall({ tool: "delete_view", args: { name: "Big Picture" } }, ctx);
    expect(v.kind).toBe("rechazar");
  });

  it("una vista inexistente se rechaza con las opciones, sin confirmar", () => {
    const v = judgeCall({ tool: "delete_view", args: { name: "Fantasma" } }, ctx);
    expect(v.kind).toBe("rechazar");
  });

  it("exportar reemplazando una vista existente también confirma", () => {
    const v = judgeCall({ tool: "export_as_view", args: { name: "Pagos", replace: true } }, ctx);
    expect(v.kind).toBe("confirmar");
  });

  it("exportar a un nombre nuevo no molesta al humano", () => {
    const v = judgeCall({ tool: "export_as_view", args: { name: "Envíos" } }, ctx);
    expect(v.kind).toBe("ejecutar");
  });

  it("las herramientas que quitan trabajo están declaradas como destructivas", () => {
    expect(DESTRUCTIVE_TOOLS).toContain("delete_view");
    expect(DESTRUCTIVE_TOOLS).toContain("remove_element");
    expect(DESTRUCTIVE_TOOLS).toContain("remove_edge");
  });
});

describe("alcance en palabras", () => {
  it("dice qué se borra, nombrando la vista", () => {
    expect(describeScope({ tool: "delete_view", args: { name: "Pagos" } }, VISTAS)).toMatch(/Pagos/);
  });

  it("dice qué se sobrescribe al reemplazar", () => {
    const texto = describeScope({ tool: "export_as_view", args: { name: "Pagos", replace: true } }, VISTAS);
    expect(texto).toMatch(/Pagos/);
    expect(texto.length).toBeGreaterThan(0);
  });
});

describe("el menú entra en la ventana del modelo local", () => {
  const largo: ToolSpec[] = [
    {
      name: "add_node",
      description:
        "Agrega un elemento al diagrama en curso. " +
        "Usá el tipo exacto de la notación de la vista; si no existe, la llamada se rechaza. ".repeat(6),
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  ];

  it("recorta la descripción a la primera frase: el registro escribe para humanos, no para una ventana de 4k", () => {
    const menu = buildToolMenu(largo, ["add_node"]);
    expect(menu).toContain("Agrega un elemento al diagrama en curso.");
    expect(menu.length).toBeLessThan(220);
  });

  it("en modo compacto quedan el nombre y los argumentos obligatorios, nada más", () => {
    const menu = buildToolMenu(largo, ["add_node"], { compacto: true });
    expect(menu).toContain("add_node");
    expect(menu).toContain("name");
    expect(menu).not.toContain("Agrega un elemento");
  });

  it("veinte herramientas entran en el presupuesto del motor local", () => {
    const veinte: ToolSpec[] = Array.from({ length: 20 }, (_, i) => ({
      name: `tool_${i}`,
      description: "Hace algo muy explicado. ".repeat(30),
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    }));
    const ids = veinte.map((t) => t.name);
    // 5018 caracteres es el presupuesto real con la ventana por defecto (4096).
    expect(buildToolMenu(veinte, ids, { compacto: true }).length).toBeLessThan(2500);
  });
});
