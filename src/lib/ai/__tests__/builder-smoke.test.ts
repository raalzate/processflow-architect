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
import { describe, it, expect, vi } from "vitest";
import { runBuilderAgent, answerBuilderAgent, resumeBuilderAgent } from "@/lib/ai/builder-agent";
import { applyViewEdit } from "@/lib/mcp/view-edit";
import { cuantosElementos } from "@/lib/ai/builder-creative";
import type { GraphData } from "@/lib/types";
import type { ToolSpec } from "@/lib/ai/builder-tools";
import { MAX_BUILDER_STEPS } from "@/lib/ai/builder-run";
import { NOTATION_IDS } from "@/lib/notations";

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
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        // El registro real publica el enum: es lo que deja corregir "C4" antes
        // de gastar un turno contra el -32602 del servidor (#331).
        notation: { type: "string", enum: NOTATION_IDS },
      },
      required: ["name"],
    },
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
    // El MCP real declara `viewName`, y opcional: sin nombre, la vista toma el
    // del diagrama (#331).
    inputSchema: { type: "object", properties: { viewName: { type: "string" } } },
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
  const NOTACIONES: string[] = NOTATION_IDS;

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
      case "export_as_view": {
        if (!estado.diagrama) return { ok: false, texto: "No hay diagrama en curso." };
        // El MCP nombra la pestaña con `viewName` y, sin él, con el nombre del
        // diagrama (#331).
        const vista = String(args.viewName ?? args.name ?? estado.diagrama);
        // Publicar es lo ÚNICO que mueve trabajo del workspace al lienzo.
        estado.contenedores.push(...estado.workspaceContenedores);
        estado.nodos.push(...estado.workspaceNodos);
        estado.vistas.push(vista);
        return { ok: true, texto: `Vista "${vista}" creada en el proyecto activo.` };
      }
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
    // El segundo freno cambia de redacción a propósito (la orden concreta de
    // #331), así que se buscan los dos textos.
    const bloqueos = r.steps.filter((s) =>
      /Ya leíste|no te va a decir nada nuevo/.test(s.content)
    );
    expect(bloqueos.length).toBeGreaterThan(1);
    // Ninguno cita a otro bloqueo: el texto no se anida ni crece en cada vuelta.
    for (const b of bloqueos) {
      expect(b.content.match(/Ya leíste/g)?.length ?? 0).toBeLessThanOrEqual(1);
      expect(b.content.length).toBeLessThan(600);
    }
  });
});

/**
 * La traza COMPLETA de #331, tal como quedó en la app: 11 pasos y el lienzo en
 * cero. Cuatro de esos turnos los gastó el arnés en cosas que podía resolver
 * solo —el enum en mayúsculas, un error ya corregido citado como vigente, y el
 * mismo freno repetido tres veces hasta matar la corrida—.
 */
describe("humo: la corrida de #331 termina construyendo", () => {
  it("normaliza el enum, no cita el error superado y escala el freno", async () => {
    const mcp = mcpSimulado();
    const guion = [
      '{"tool":"get_app_state","args":{}}',
      // Tal cual la traza: el modelo escribe la notación en mayúsculas.
      '{"tool":"create_diagram","args":{"name":"MVC Spring Boot Example","notation":"C4"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      // Y acá se quedaba: relee lo mismo, dos veces.
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      '{"tool":"add_container","args":{"name":"Aplicación MVC","type":"Límite de Sistema"}}',
      '{"tool":"add_node","args":{"name":"Controlador de Producto","type":"Componente"}}',
      '{"tool":"export_as_view","args":{"viewName":"MVC Producto C4"}}',
      '{"final":"Vista C4 del MVC publicada."}',
    ];
    let i = 0;
    const prompts: string[] = [];
    const r = await runBuilderAgent({
      ...base,
      // La vista abierta es DDD y el diagrama es C4: el tipo lo manda el diagrama.
      notation: "ddd",
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async (p: string) => {
          prompts.push(p);
          return guion[Math.min(i++, guion.length - 1)];
        },
      },
    });

    const contexto = prompts.join("\n");
    // El -32602 nunca llegó al MCP: un solo create_diagram, y salió bien.
    expect(mcp.llamadas.filter((l) => l === "create_diagram")).toHaveLength(1);
    expect(contexto).not.toMatch(/-32602/);
    // El segundo freno da la orden concreta, no el mismo texto de la primera vez.
    expect(contexto).toMatch(/DEBE ser una escritura/);
    expect(contexto).toMatch(/Límite de Sistema/);
    // Y la corrida llegó al lienzo con el nombre que pidió el modelo.
    expect(mcp.estado.vistas).toEqual(["MVC Producto C4"]);
    expect(mcp.estado.contenedores).toEqual(["Aplicación MVC"]);
    expect(mcp.estado.nodos).toEqual(["Controlador de Producto"]);
    expect(r.reply).toMatch(/Vista "MVC Producto C4" publicada/);
    expect(r.reply).not.toMatch(/Insistí/);
  });
});

/**
 * La OTRA mitad de la traza de #331: el modelo pidió «Container» (inglés), el
 * arnés lo rechazó tres veces sin sugerir nada, y entre rechazo y rechazo el
 * freno de relectura repetía su texto porque `bloqueos` se le reseteaba. La
 * corrida murió con «4 intentos seguidos sin una acción válida».
 */
describe("humo: el tipo en otro idioma no mata la corrida (#331)", () => {
  it("sugiere el tipo del registro y escala el freno aunque haya rechazos entre medio", async () => {
    const mcp = mcpSimulado();
    const guion = [
      '{"tool":"create_diagram","args":{"name":"Spring Boot MVC","notation":"c4"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      // El modelo insiste en inglés, con una relectura entre medio: es la
      // alternancia que reseteaba el contador de la escalada.
      '{"tool":"add_node","args":{"name":"App","type":"Container"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      '{"tool":"add_node","args":{"name":"App","type":"Container"}}',
      '{"tool":"describe_notation","args":{"notation":"c4"}}',
      // Con la sugerencia en la mano, la escribe bien.
      '{"tool":"add_node","args":{"name":"App","type":"Contenedor"}}',
      '{"tool":"export_as_view","args":{"viewName":"MVC C4"}}',
      '{"final":"Publicada."}',
    ];
    let i = 0;
    const prompts: string[] = [];
    const r = await runBuilderAgent({
      ...base,
      notation: "c4",
      deps: {
        listTools: async () => TOOLS,
        callTool: mcp.callTool,
        generate: async (p: string) => {
          prompts.push(p);
          return guion[Math.min(i++, guion.length - 1)];
        },
      },
    });
    const contexto = prompts.join("\n");
    expect(contexto).toMatch(/¿Querías "Contenedor"\?/);
    // El segundo freno escala aunque entre los dos hubo un rechazo.
    expect(contexto).toMatch(/DEBE ser una escritura/);
    expect(mcp.estado.vistas).toEqual(["MVC C4"]);
    expect(r.reply).not.toMatch(/Me trabé/);
  });
});

/**
 * HUMO del constructor en DOS MODOS (015, #339).
 *
 * El MCP simulado de arriba separa workspace y lienzo, que es el mundo del modo
 * ReAct. Acá el mundo es otro: las herramientas `*_view_*` escriben DIRECTO en
 * el grafo de la vista abierta, así que el simulador aplica `applyViewEdit` de
 * verdad. Lo que se fija es lo que la spec pide medir: una inferencia para un
 * diagrama entero (SC-001), un turno para agregar un elemento a la vista abierta
 * (SC-003) y una sola escritura, sin lecturas exploratorias, para invertir una
 * flecha (SC-004).
 */
describe("humo: constructor en dos modos (015)", () => {
  const TOOLS_VISTA: ToolSpec[] = [
    { name: "get_app_state", description: "Estado de la app.", inputSchema: { type: "object", properties: {} } },
    {
      name: "add_view_element",
      description: "Agrega un elemento a la vista abierta.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" }, type: { type: "string" }, view: { type: "string" } },
        required: ["name", "type"],
      },
    },
    {
      name: "update_view_edge",
      description: "Corrige una relación de la vista.",
      inputSchema: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" }, invert: { type: "boolean" }, view: { type: "string" } },
        required: ["from", "to"],
      },
    },
    {
      name: "set_view_graph",
      description: "Reemplaza el grafo de la vista.",
      inputSchema: {
        type: "object",
        properties: { graph: { type: "string" }, view: { type: "string" } },
        required: ["graph"],
      },
    },
  ];

  const MERMAID_MVC = [
    "```mermaid",
    "flowchart LR",
    '  subgraph app["Aplicación Spring Boot<br><i>Límite de Sistema</i>"]',
    '    ctrl["Controlador<br><i>Componente</i>"]',
    '    svc["Servicio<br><i>Componente</i>"]',
    '    repo["Repositorio<br><i>Componente</i>"]',
    "  end",
    '  web["Navegador<br><i>Contenedor</i>"]',
    '  db[("Base de Datos<br><i>Base de Datos</i>")]',
    '  web -->|"usa"| ctrl',
    '  ctrl -->|"llama"| svc',
    '  svc -->|"consulta"| repo',
    '  repo -->|"lee"| db',
    "```",
  ].join("\n");

  const nodo = (id: string, nombre: string, tipo: string) =>
    ({ id, nombre, tipo_elemento: tipo, estado_comparativo: "nuevo", x: 1, y: 2 }) as any;

  const vistaConMvc = (): GraphData =>
    ({
      nombre_proyecto: "Modelo",
      version: "1.0.0",
      notation: "c4",
      fecha_analisis: "2026-09-18",
      big_picture: {
        descripcion: "",
        hotspots: [],
        nodos: [nodo("ctrl", "Controlador", "Componente"), nodo("svc", "Servicio", "Componente")],
        aristas: [{ fuente: "ctrl", destino: "svc", descripcion: "llama" }],
      },
      agregados: [],
      read_models: [],
      politicas_inter_agregados: [],
      responsables: [],
      notas: "",
      transcript: "",
    }) as any;

  /** MCP simulado que escribe en el grafo de la vista, como la app de verdad. */
  function mcpDeVista(inicial: GraphData | null) {
    const estado = { graph: inicial };
    const llamadas: string[] = [];
    const callTool = async (name: string, args: Record<string, unknown>) => {
      llamadas.push(name);
      if (name === "get_app_state") {
        const n = cuantosElementos(estado.graph);
        return { ok: true, texto: `Proyecto activo: "Demo" (notación c4). Contenido: ${n} elemento(s). Sin vistas custom (cupo 50).` };
      }
      const base = estado.graph ?? ({
        nombre_proyecto: "Modelo",
        version: "1.0.0",
        notation: "c4",
        fecha_analisis: "2026-09-18",
        big_picture: { descripcion: "", hotspots: [], nodos: [], aristas: [] },
        agregados: [],
        read_models: [],
        politicas_inter_agregados: [],
        responsables: [],
        notas: "",
        transcript: "",
      } as any);
      const edit =
        name === "set_view_graph"
          ? ({ kind: "set-graph", graph: JSON.parse(String(args.graph)) } as const)
          : name === "add_view_element"
            ? ({ kind: "add-element", name: String(args.name), type: String(args.type) } as const)
            : name === "update_view_edge"
              ? ({ kind: "update-edge", from: String(args.from), to: String(args.to), invert: Boolean(args.invert) } as const)
              : null;
      if (!edit) return { ok: false, texto: `Herramienta desconocida: ${name}` };
      const r = applyViewEdit(base, edit, "c4");
      if (!r.ok) return { ok: false, texto: r.error };
      estado.graph = r.graph;
      return { ok: true, texto: `✅ ${r.message}` };
    };
    return { estado, llamadas, callTool };
  }

  const baseVista = {
    vistas: [{ id: "design", name: "Modelo", builtin: true }],
    allow: TOOLS_VISTA.map((t) => t.name),
    mode: "local" as const,
    maxTokens: 4096,
  };

  it("SC-001 · «crear un MVC de Spring Boot en C4» termina en el lienzo con UNA inferencia", async () => {
    const mcp = mcpDeVista(null);
    const generarDiagrama = vi.fn().mockResolvedValue(MERMAID_MVC);
    const generate = vi.fn().mockResolvedValue('{"final":"no debería hacer falta"}');

    const r = await runBuilderAgent({
      ...baseVista,
      message: "crear un ejemplo MVC de un producto en Spring Boot",
      vista: { nombre: "Modelo", notation: "c4", graph: null },
      deps: { listTools: async () => TOOLS_VISTA, callTool: mcp.callTool, generate, generarDiagrama },
    });

    expect(generarDiagrama).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled(); // ni un turno del bucle ReAct
    // SC-002: un contenedor, cuatro elementos o más, tres relaciones o más, sin duplicados.
    const g = mcp.estado.graph!;
    expect(g.agregados?.length).toBe(1);
    const nombres = [
      ...(g.big_picture?.nodos ?? []),
      ...(g.agregados ?? []).flatMap((a) => a.nodos ?? []),
    ].map((n) => n.nombre);
    expect(nombres.length).toBeGreaterThanOrEqual(4);
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(r.reply).toContain("relación(es)");
    // El modo elegido queda en la traza (FR-001).
    expect(r.steps.some((s) => s.type === "decision" && s.content.includes("creativo"))).toBe(true);
  });

  it("SC-003 · «agregá un elemento Persona llamado Cliente» cambia la vista abierta en un turno", async () => {
    const mcp = mcpDeVista(vistaConMvc());
    const generate = vi.fn();
    const generarDiagrama = vi.fn();

    const r = await runBuilderAgent({
      ...baseVista,
      message: "agregá un elemento Persona llamado Cliente",
      vista: { nombre: "Modelo", notation: "c4", graph: mcp.estado.graph },
      deps: { listTools: async () => TOOLS_VISTA, callTool: mcp.callTool, generate, generarDiagrama },
    });

    // Ni una inferencia: la llamada la resolvieron las consultas (FR-008).
    expect(generate).not.toHaveBeenCalled();
    expect(generarDiagrama).not.toHaveBeenCalled();
    expect(mcp.llamadas.filter((l) => l === "add_view_element")).toHaveLength(1);
    const nombres = (mcp.estado.graph?.big_picture?.nodos ?? []).map((n) => n.nombre);
    expect(nombres).toContain("Cliente");
    expect(r.state.cambios.some((c) => c.lienzo)).toBe(true);
  });

  it("SC-004 · «invertí la flecha entre Controlador y Servicio»: una escritura, ninguna lectura exploratoria", async () => {
    const mcp = mcpDeVista(vistaConMvc());
    const r = await runBuilderAgent({
      ...baseVista,
      message: "invertí la flecha entre Controlador y Servicio",
      vista: { nombre: "Modelo", notation: "c4", graph: mcp.estado.graph },
      deps: {
        listTools: async () => TOOLS_VISTA,
        callTool: mcp.callTool,
        generate: vi.fn(),
        generarDiagrama: vi.fn(),
      },
    });

    expect(mcp.llamadas.filter((l) => l === "update_view_edge")).toHaveLength(1);
    // La única otra llamada admisible es la verificación del cierre, que hace el arnés.
    expect(mcp.llamadas.filter((l) => l !== "update_view_edge" && l !== "get_app_state")).toEqual([]);
    expect(mcp.estado.graph?.big_picture?.aristas?.[0]).toMatchObject({ fuente: "svc", destino: "ctrl" });
    expect(r.reply).toContain("invertida");
  });

  it("la misma caja no se agrega dos veces, aunque el pedido cambie un detalle", async () => {
    const mcp = mcpDeVista(vistaConMvc());
    const primera = await runBuilderAgent({
      ...baseVista,
      message: "agregá un elemento Persona llamado Cliente",
      vista: { nombre: "Modelo", notation: "c4", graph: mcp.estado.graph },
      deps: { listTools: async () => TOOLS_VISTA, callTool: mcp.callTool, generate: vi.fn(), generarDiagrama: vi.fn() },
    });
    expect(primera.state.cambios).toHaveLength(1);

    // El mismo pedido con la vista YA actualizada: no se vuelve a agregar.
    const generate = vi.fn().mockResolvedValue('{"final":"ya estaba"}');
    await runBuilderAgent({
      ...baseVista,
      message: "agregá un elemento Persona llamado Cliente",
      vista: { nombre: "Modelo", notation: "c4", graph: mcp.estado.graph },
      deps: { listTools: async () => TOOLS_VISTA, callTool: mcp.callTool, generate, generarDiagrama: vi.fn() },
    });
    expect(mcp.llamadas.filter((l) => l === "add_view_element")).toHaveLength(1);
    const clientes = (mcp.estado.graph?.big_picture?.nodos ?? []).filter((n) => n.nombre === "Cliente");
    expect(clientes).toHaveLength(1);
  });

  it("un pedido ambiguo pregunta con opciones en vez de suponer (FR-010)", async () => {
    const mcp = mcpDeVista(vistaConMvc());
    const r = await runBuilderAgent({
      ...baseVista,
      message: "el checkout",
      vista: { nombre: "Modelo", notation: "c4", graph: mcp.estado.graph },
      deps: { listTools: async () => TOOLS_VISTA, callTool: mcp.callTool, generate: vi.fn(), generarDiagrama: vi.fn() },
    });
    expect(r.state.pregunta?.opciones.map((o) => o.id)).toEqual(["creativo", "editor"]);
    expect(mcp.llamadas).toEqual([]);
  });

  it("publicar sobre una vista con contenido pide confirmación y, con el sí, publica (FR-012)", async () => {
    const mcp = mcpDeVista(vistaConMvc());
    const deps = {
      listTools: async () => TOOLS_VISTA,
      callTool: mcp.callTool,
      generate: vi.fn(),
      generarDiagrama: vi.fn().mockResolvedValue(MERMAID_MVC),
    };
    const input = {
      ...baseVista,
      message: "hacéme un diagrama C4 completo del MVC",
      vista: { nombre: "Modelo", notation: "c4" as const, graph: mcp.estado.graph },
      deps,
    };

    const pausa = await runBuilderAgent(input);
    expect(pausa.pendiente?.call.tool).toBe("set_view_graph");
    expect(mcp.llamadas.filter((l) => l === "set_view_graph")).toEqual([]);

    const seguido = await resumeBuilderAgent(input, pausa.state, true);
    expect(mcp.llamadas.filter((l) => l === "set_view_graph")).toHaveLength(1);
    // Publicó sin volver a pedirle el diagrama al modelo.
    expect(deps.generarDiagrama).toHaveBeenCalledTimes(1);
    expect(seguido.state.cambios.some((c) => c.lienzo)).toBe(true);
  });
});
