/**
 * PRUEBA DE HUMO del agente constructor (014 · #328).
 *
 * Los tests de unidad prueban cada freno por separado; ninguno prueba que una
 * corrida ENTERA llegue del pedido al lienzo. Esta sí: un MCP simulado que
 * contesta con los mensajes REALES del servidor (los de las trazas que rompieron
 * #325, #326, #327 y #328) y un modelo guionado que comete los errores típicos
 * del motor local. La corrida tiene que recuperarse sola y terminar publicando.
 *
 * No sustituye probar en la app —el modelo de verdad es impredecible— pero fija
 * que los frenos COOPERAN: cada uno se probó solo y, juntos, se mataban entre sí.
 */
import { describe, it, expect } from "vitest";
import { runBuilderAgent, answerBuilderAgent } from "@/lib/ai/builder-agent";
import type { ToolSpec } from "@/lib/ai/builder-tools";
import { MAX_BUILDER_STEPS } from "@/lib/ai/builder-run";

/** Respuestas textuales del MCP real (copiadas de las trazas de la app). */
const RESPUESTAS = {
  appState:
    'Proyecto activo: "Demo" (notación c4). Contenido: 0 contenedor(es) · 0 elemento(s) · 0 relación(es). ' +
    "⚠️ `export_to_app` REEMPLAZA el proyecto activo. Sin vistas custom (cupo 50). " +
    "Estado publicado: 2026-09-09T23:13:33.506Z.",
  notacion:
    "# C4 (Arquitectura)\nModelo C4: Contexto, Contenedores, Componentes.\n" +
    "### Actores y sistemas\n- Persona (rounded)\n- Sistema (rounded)\n" +
    "### Límites\n- Límite de Sistema [contenedor] (rounded)",
  tipoMal:
    '"Persona" no es un tipo contenedor. Contenedores válidos: Agregado, Pool, Carril, Límite de Sistema.',
};

const TOOLS: ToolSpec[] = [
  { name: "get_app_state", description: "Estado de la app.", inputSchema: { type: "object", properties: {} } },
  {
    name: "create_diagram",
    description: "Crea un diagrama.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, notation: { type: "string" } }, required: ["name"] },
  },
  {
    name: "describe_notation",
    description: "Tipos de una notación.",
    inputSchema: { type: "object", properties: { notation: { type: "string" } }, required: ["notation"] },
  },
  {
    name: "add_container",
    description: "Agrega un contenedor.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string" } }, required: ["name", "type"] },
  },
  {
    name: "add_node",
    description: "Agrega un elemento.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, container: { type: "string" } }, required: ["name", "type"] },
  },
  {
    name: "export_as_view",
    description: "Publica el diagrama como vista.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
];
const ALLOW = TOOLS.map((t) => t.name);

/**
 * MCP simulado: aplica las reglas que de verdad importan —tipos, enums, workspace
 * vs lienzo— y contesta con los textos del servidor real. Separa los dos mundos
 * como el MCP: lo que se agrega vive en el WORKSPACE y sólo aparece en el
 * proyecto de la app cuando se publica con export_as_view (#327, #329).
 */
function mcpSimulado() {
  const estado = {
    diagrama: "",
    workspaceContenedores: [] as string[],
    workspaceNodos: [] as string[],
    // Lo que el humano ve en su lienzo.
    contenedores: [] as string[],
    nodos: [] as string[],
    vistas: [] as string[],
  };
  const llamadas: string[] = [];
  const NOTACIONES = ["ddd", "bpmn", "c4", "uml", "mer", "general"];

  const callTool = async (name: string, args: Record<string, unknown>) => {
    llamadas.push(name);
    const nombre = String(args.name ?? "");
    switch (name) {
      case "get_app_state":
        // Refleja el estado REAL del simulador: es lo que hace VERIFICABLE el
        // reporte del agente en vez de creerle su propio log (#329).
        return {
          ok: true,
          texto:
            `Proyecto activo: "Demo" (notación c4). Contenido: ${estado.contenedores.length} contenedor(es) · ` +
            `${estado.nodos.length} elemento(s) · 0 relación(es). ` +
            (estado.vistas.length
              ? `Vistas custom: ${estado.vistas.join(", ")}.`
              : "Sin vistas custom (cupo 50).") +
            " Estado publicado: 2026-09-09T23:13:33.506Z.",
        };
      case "describe_notation":
        return { ok: true, texto: RESPUESTAS.notacion };
      case "create_diagram": {
        const notacion = String(args.notation ?? "");
        // El error real de la traza: "C4" no pasa el enum del servidor (#330).
        if (notacion && !NOTACIONES.includes(notacion)) {
          return {
            ok: false,
            texto:
              "MCP error -32602: Input validation error: Invalid arguments for tool create_diagram: " +
              `[{"received":"${notacion}","code":"invalid_enum_value","options":["ddd","bpmn","c4","uml","mer","general"],"path":["notation"]}]`,
          };
        }
        estado.diagrama = nombre;
        return {
          ok: true,
          texto: `Diagrama creado y FIJADO. diagramId="${nombre.toLowerCase().replace(/\s+/g, "-")}", notación=c4.`,
        };
      }
      case "add_container":
        if (!estado.diagrama) return { ok: false, texto: "No hay diagrama en curso." };
        // La regla que rompió la corrida real: Persona NO es contenedor.
        if (args.type === "Persona") return { ok: false, texto: RESPUESTAS.tipoMal };
        estado.workspaceContenedores.push(nombre);
        return { ok: true, texto: `Contenedor "${nombre}" añadido (id=${nombre.toLowerCase()}).` };
      case "add_node":
        if (!estado.diagrama) return { ok: false, texto: "No hay diagrama en curso." };
        estado.workspaceNodos.push(nombre);
        return { ok: true, texto: `Elemento "${nombre}" añadido.` };
      case "export_as_view":
        if (!estado.diagrama) return { ok: false, texto: "No hay diagrama en curso." };
        // Publicar es lo ÚNICO que mueve trabajo del workspace al lienzo.
        estado.contenedores.push(...estado.workspaceContenedores);
        estado.nodos.push(...estado.workspaceNodos);
        estado.vistas.push(nombre);
        return { ok: true, texto: `Vista "${nombre}" creada en el proyecto activo.` };
      default:
        return { ok: false, texto: `Herramienta desconocida: ${name}` };
    }
  };
  return { estado, llamadas, callTool };
}

const base = {
  message: "creá una vista C4 del ejemplo MVC con Spring Boot",
  vistas: [{ id: "v1", name: "Modelo", builtin: true }],
  allow: ALLOW,
  mode: "local" as const,
  maxTokens: 4096,
};

describe("humo: del pedido al lienzo", () => {
  it("una corrida sana orienta, construye, publica y cierra", async () => {
    const mcp = mcpSimulado();
    const guion = [
      '{"tool":"get_app_state","args":{}}',
      '{"tool":"create_diagram","args":{"name":"MVC Spring Boot","notation":"c4"}}',
      '{"tool":"add_container","args":{"name":"Aplicación","type":"Límite de Sistema"}}',
      '{"tool":"add_node","args":{"name":"Cliente","type":"Persona"}}',
      '{"tool":"export_as_view","args":{"name":"MVC Spring Boot"}}',
      '{"final":"Vista creada con el cliente y la aplicación."}',
    ];
    let i = 0;
    const r = await runBuilderAgent({
      ...base,
      deps: { listTools: async () => TOOLS, callTool: mcp.callTool, generate: async () => guion[i++] },
    });

    expect(mcp.estado.vistas).toEqual(["MVC Spring Boot"]);
    expect(mcp.estado.contenedores).toEqual(["Aplicación"]);
    expect(mcp.estado.nodos).toEqual(["Cliente"]);
    expect(r.state.cambios.length).toBe(4);
    // Publicado ⇒ el cierre NO puede seguir diciendo que quedó en el workspace.
    expect(r.reply).not.toMatch(/no est[áa] en el lienzo/i);
    expect(r.state.pregunta).toBeUndefined();
  });

  it("se recupera del error de tipo que mataba la corrida real (#328)", async () => {
    const mcp = mcpSimulado();
    // La traza real: pide Persona como CONTENEDOR, el MCP lo rechaza y el modelo
    // vuelve a leer la notación buscando el dato. Con el freno de #326 a secas,
    // cada relectura era un fallo y la corrida moría con «me trabé» sin haber
    // construido nada. Ahora el bloqueo le devuelve el error traducido y se
    // corrige.
    const guion = [
      '{"tool":"create_diagram","args":{"name":"MVC Spring Boot","notation":"c4"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      '{"tool":"add_container","args":{"name":"Cliente","type":"Persona"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      '{"tool":"add_node","args":{"name":"Cliente","type":"Persona"}}',
      '{"tool":"export_as_view","args":{"name":"MVC Spring Boot"}}',
      '{"final":"Listo, el Cliente entró como elemento."}',
    ];
    let i = 0;
    const prompts: string[] = [];
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async (p: string) => {
          prompts.push(p);
          return guion[Math.min(i++, guion.length - 1)];
        },
      },
    });

    // La corrida termina publicando, no trabada.
    expect(r.reply).not.toMatch(/me trab/i);
    expect(mcp.estado.nodos).toEqual(["Cliente"]);
    expect(mcp.estado.vistas).toEqual(["MVC Spring Boot"]);
    // El rechazo del MCP le llegó traducido a la acción concreta, que es lo que
    // le faltaba para corregirse sin adivinar.
    expect(prompts.join("\n")).toMatch(/add_node/);
  });

  it("si insiste con lo mismo, cierra diciendo eso y no «me trabé»", async () => {
    const mcp = mcpSimulado();
    let i = 0;
    const guion = [
      '{"tool":"create_diagram","args":{"name":"MVC","notation":"c4"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
    ];
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        // A partir del tercer turno relee lo mismo para siempre.
        generate: async () => guion[Math.min(i++, guion.length - 1)],
      },
    });
    expect(r.reply).toMatch(/insist/i);
    expect(r.reply).not.toMatch(/me trab/i);
    // Y el diagnóstico llega con el estado real: creado, sin publicar.
    expect(r.reply).toMatch(/export_as_view/);
  });

  it("no crea dos diagramas aunque el modelo insista (#327)", async () => {
    const mcp = mcpSimulado();
    const guion = [
      '{"tool":"create_diagram","args":{"name":"MVC","notation":"c4"}}',
      '{"tool":"add_container","args":{"name":"App","type":"Límite de Sistema"}}',
      '{"tool":"get_app_state","args":{}}',
      '{"tool":"create_diagram","args":{"name":"MVC v2","notation":"c4"}}',
      '{"tool":"export_as_view","args":{"name":"MVC"}}',
      '{"final":"Listo."}',
    ];
    let i = 0;
    await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async () => guion[Math.min(i++, guion.length - 1)],
      },
    });
    expect(mcp.llamadas.filter((l) => l === "create_diagram")).toHaveLength(1);
    expect(mcp.estado.vistas).toEqual(["MVC"]);
  });

  it("un modelo que sólo lee termina con diagnóstico, sin gastar el presupuesto (#326)", async () => {
    const mcp = mcpSimulado();
    let i = 0;
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        // Lecturas distintas cada vez: ni idempotencia ni relectura las frenan.
        generate: async () => (i++ % 2 ? '{"tool":"get_app_state","args":{}}' : `{"tool":"describe_notation","args":{"notation":"c${i}"}}`),
      },
    });
    expect(r.reply).toMatch(/leyendo sin construir/i);
    expect(mcp.estado.vistas).toEqual([]);
    expect(r.state.restantes).toBeGreaterThan(0); // no se gastó en leer
  });

  it("lo destructivo espera al humano y su respuesta no se pierde (#321, #324)", async () => {
    const mcp = mcpSimulado();
    const toolsConBorrado: ToolSpec[] = [
      ...TOOLS,
      { name: "delete_view", description: "Elimina una vista.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
    ];
    const entrada = {
      ...base,
      allow: [...ALLOW, "delete_view"],
      vistas: [{ id: "v1", name: "Modelo", builtin: true }, { id: "v2", name: "Vieja" }],
    };
    const primera = await runBuilderAgent({
      ...entrada,
      deps: {
        listTools: async () => toolsConBorrado,
        callTool: mcp.callTool,
        generate: async () => '{"tool":"delete_view","args":{"name":"Vieja"}}',
      },
    });
    expect(primera.state.pregunta?.opciones.map((o) => o.id)).toEqual(["si", "no"]);
    expect(mcp.llamadas).not.toContain("delete_view");

    // El humano dice que no: nada se borra y la corrida sigue con esa memoria.
    const r = await answerBuilderAgent(
      {
        ...entrada,
        deps: {
          listTools: async () => toolsConBorrado,
          callTool: mcp.callTool,
          generate: async () => '{"final":"Ok, no la borro."}',
        },
      },
      primera.state,
      "no"
    );
    expect(mcp.llamadas).not.toContain("delete_view");
    expect(r.reply).toMatch(/no se hizo|rechaz/i);
  });

  it("el tope de pasos ofrece seguir y seguir construye de verdad (#322)", async () => {
    const mcp = mcpSimulado();
    let n = 0;
    const deps = {
      listTools: async () => TOOLS,
      callTool: async (name: string, args: Record<string, unknown>) => {
        n++;
        return mcp.callTool(name, args);
      },
      generate: async () =>
        n === 0
          ? `{"tool":"create_diagram","args":{"name":"MVC","notation":"c4"}}`
          : `{"tool":"add_node","args":{"name":"Elemento ${n}","type":"Persona"}}`,
    };
    const primera = await runBuilderAgent({ ...base, deps });
    expect(primera.state.restantes).toBe(0);
    expect(primera.state.pregunta?.opciones.map((o) => o.id)).toEqual(["seguir", "terminar"]);
    // Doce pasos de trabajo: el create_diagram del primer turno y once elementos.
    // Todavía en el workspace: sin export, el lienzo del humano sigue vacío.
    expect(mcp.estado.workspaceNodos).toHaveLength(MAX_BUILDER_STEPS - 1);
    expect(mcp.estado.nodos).toEqual([]);

    const segunda = await answerBuilderAgent({ ...base, deps }, primera.state, "seguir");
    expect(mcp.estado.workspaceNodos.length).toBeGreaterThan(MAX_BUILDER_STEPS - 1);
    expect(segunda.state.cambios.length).toBeGreaterThan(MAX_BUILDER_STEPS);
  });
});

/**
 * Honestidad del reporte (#329). El agente decía «Cambios aplicados» por trabajo
 * que quedó en el workspace, con el lienzo del humano vacío. Acá se fija que el
 * cierre diga la verdad y que además la VERIFIQUE contra el estado real de la app.
 */
describe("humo: el reporte dice la verdad", () => {
  it("construir sin exportar no es un cambio del lienzo, y se verifica", async () => {
    const mcp = mcpSimulado();
    const guion = [
      '{"tool":"create_diagram","args":{"name":"MVC","notation":"c4"}}',
      '{"tool":"add_container","args":{"name":"App","type":"Límite de Sistema"}}',
      '{"final":"Ya está el marco."}',
    ];
    let i = 0;
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async () => guion[Math.min(i++, guion.length - 1)],
      },
    });

    expect(r.reply).toMatch(/Tu lienzo sigue igual/i);
    expect(r.reply).toMatch(/workspace/i);
    // Y el cierre trae la comprobación contra la app, no la palabra del agente.
    expect(r.reply).toMatch(/Verificado en la app/i);
    expect(r.reply).toMatch(/0 contenedor/);
    expect(mcp.llamadas.filter((l) => l === "get_app_state").length).toBeGreaterThan(0);
  });

  it("al exportar, el reporte lo dice y la verificación lo confirma", async () => {
    const mcp = mcpSimulado();
    const guion = [
      '{"tool":"create_diagram","args":{"name":"MVC","notation":"c4"}}',
      '{"tool":"add_node","args":{"name":"Cliente","type":"Persona"}}',
      '{"tool":"export_as_view","args":{"name":"MVC"}}',
      '{"final":"Publicado."}',
    ];
    let i = 0;
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async () => guion[Math.min(i++, guion.length - 1)],
      },
    });

    expect(r.reply).toMatch(/En tu lienzo/i);
    expect(r.reply).toMatch(/Verificado en la app/i);
    expect(mcp.estado.vistas).toEqual(["MVC"]);
  });

  it("el enum en mayúsculas se corrige y la corrida sigue (#330)", async () => {
    const mcp = mcpSimulado();
    const guion = [
      '{"tool":"create_diagram","args":{"name":"MVC","notation":"C4"}}',
      '{"tool":"create_diagram","args":{"name":"MVC","notation":"c4"}}',
      '{"tool":"add_node","args":{"name":"Cliente","type":"Persona"}}',
      '{"tool":"export_as_view","args":{"name":"MVC"}}',
      '{"final":"Listo."}',
    ];
    let i = 0;
    const prompts: string[] = [];
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async (p: string) => {
          prompts.push(p);
          return guion[Math.min(i++, guion.length - 1)];
        },
      },
    });
    // La pista con el valor exacto llegó al modelo…
    expect(prompts.join("\n")).toMatch(/"c4"/);
    // …y la corrida terminó publicando.
    expect(mcp.estado.vistas).toEqual(["MVC"]);
    expect(r.reply).toMatch(/En tu lienzo/i);
  });

  it("el mensaje de bloqueo no se cita a sí mismo ni crece (#330)", async () => {
    const mcp = mcpSimulado();
    let i = 0;
    const guion = [
      '{"tool":"create_diagram","args":{"name":"MVC","notation":"c4"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
    ];
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async () => guion[Math.min(i++, guion.length - 1)],
      },
    });
    const bloqueos = r.steps.filter((s) => /Ya leíste/.test(s.content));
    expect(bloqueos.length).toBeGreaterThan(1);
    // Ninguno cita a otro bloqueo: el texto no se anida.
    for (const b of bloqueos) {
      expect(b.content.match(/Ya leíste/g)).toHaveLength(1);
    }
  });
});
