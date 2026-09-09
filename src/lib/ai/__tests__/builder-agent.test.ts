/**
 * Bucle del agente constructor (014, #308).
 *
 * El modelo y el MCP entran por `deps`, así que el bucle entero se prueba sin GPU
 * ni Electron: se le dicta al "modelo" qué contestar en cada turno y se mira qué
 * herramientas llamó de verdad. Es la única forma de fijar lo que importa —que
 * un borrado NO se ejecute sin el sí del humano— sin depender de la app corriendo.
 */
import { describe, it, expect, vi } from "vitest";
import {
  runBuilderAgent,
  resumeBuilderAgent,
  answerBuilderAgent,
  type BuilderDeps,
} from "@/lib/ai/builder-agent";
import { MAX_BUILDER_STEPS } from "@/lib/ai/builder-run";
import type { ToolSpec } from "@/lib/ai/builder-tools";

const TOOLS: ToolSpec[] = [
  { name: "list_views", description: "Lista vistas.", inputSchema: { type: "object", properties: {} } },
  {
    name: "add_node",
    description: "Agrega elemento.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string" } }, required: ["name", "type"] },
  },
  {
    name: "delete_view",
    description: "Elimina vista.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
];
const ALLOW = ["list_views", "add_node", "delete_view"];
const VISTAS = [{ id: "v1", name: "Pagos" }];

/** Modelo de guion: contesta la lista de turnos, en orden. */
function guion(turnos: string[]): { deps: Partial<BuilderDeps>; llamadas: string[] } {
  const llamadas: string[] = [];
  let i = 0;
  return {
    llamadas,
    deps: {
      listTools: async () => TOOLS,
      callTool: async (name, args) => {
        llamadas.push(`${name}:${JSON.stringify(args)}`);
        return { ok: true, texto: "hecho" };
      },
      generate: async () => turnos[Math.min(i++, turnos.length - 1)],
    },
  };
}

const base = { message: "construí algo", vistas: VISTAS, allow: ALLOW, mode: "local" as const };

describe("bucle del constructor", () => {
  it("ejecuta la herramienta que pide el modelo y cierra con el resumen", async () => {
    const { deps, llamadas } = guion([
      '{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}',
      '{"final":"Listo, agregué Orden."}',
    ]);
    const r = await runBuilderAgent({ ...base, deps });
    expect(llamadas).toEqual(['add_node:{"name":"Orden","type":"Comando"}']);
    expect(r.reply).toMatch(/Orden/);
    expect(r.state.cambios).toHaveLength(1);
  });

  it("un borrado NO se ejecuta: la corrida se detiene esperando al humano", async () => {
    const { deps, llamadas } = guion(['{"tool":"delete_view","args":{"name":"Pagos"}}']);
    const r = await runBuilderAgent({ ...base, deps });
    expect(llamadas).toEqual([]);
    expect(r.pendiente?.call.tool).toBe("delete_view");
    expect(r.reply).toMatch(/Pagos/);
  });

  it("con el sí del humano, la acción destructiva se ejecuta", async () => {
    const { deps, llamadas } = guion(['{"tool":"delete_view","args":{"name":"Pagos"}}']);
    const primera = await runBuilderAgent({ ...base, deps });
    const segundoGuion = guion(['{"final":"Borrada."}']);
    const seguir = await resumeBuilderAgent(
      { ...base, deps: { ...segundoGuion.deps, callTool: deps.callTool } },
      primera.state,
      true
    );
    expect(llamadas).toEqual(['delete_view:{"name":"Pagos"}']);
    expect(seguir.state.cambios.join(" ")).toMatch(/Pagos/);
  });

  it("con el no, no se toca nada y queda dicho", async () => {
    const { deps, llamadas } = guion(['{"tool":"delete_view","args":{"name":"Pagos"}}']);
    const primera = await runBuilderAgent({ ...base, deps });
    const segundo = guion(['{"final":"Ok, no borro nada."}']);
    const seguir = await resumeBuilderAgent(
      { ...base, deps: { ...segundo.deps, callTool: deps.callTool } },
      primera.state,
      false
    );
    expect(llamadas).toEqual([]);
    expect(seguir.state.cambios).toEqual([]);
    expect(seguir.reply).toMatch(/rechaz|no se hizo/i);
  });

  it("una herramienta inventada vuelve como observación corregible, sin ejecutar nada", async () => {
    const { deps, llamadas } = guion([
      '{"tool":"borrar_todo","args":{}}',
      '{"final":"Perdón, me equivoqué."}',
    ]);
    const r = await runBuilderAgent({ ...base, deps });
    expect(llamadas).toEqual([]);
    expect(r.state.pasos[0].ok).toBe(false);
  });

  it("el tope de pasos corta una corrida que no termina nunca", async () => {
    const { deps } = guion(['{"tool":"list_views","args":{}}']);
    const r = await runBuilderAgent({ ...base, deps });
    expect(r.state.restantes).toBe(0);
    expect(r.reply).toMatch(/tope de pasos/i);
  });

  it("sin MCP disponible lo dice con la causa, no falla en silencio", async () => {
    const r = await runBuilderAgent({
      ...base,
      deps: {
        listTools: async () => {
          throw new Error("El MCP sólo está disponible en la app de escritorio.");
        },
      },
    });
    expect(r.reply).toMatch(/MCP/);
    expect(r.state.pasos).toEqual([]);
  });

  it("en modo local, un pedido que desborda la ventana avisa antes de arrancar", async () => {
    const { deps, llamadas } = guion(['{"final":"nunca llega"}']);
    const r = await runBuilderAgent({
      ...base,
      message: "x".repeat(50_000),
      maxTokens: 1024,
      deps,
    });
    expect(llamadas).toEqual([]);
    expect(r.reply).toMatch(/nube|parti/i);
  });

  it("cada paso se emite en vivo para la traza del chat", async () => {
    const { deps } = guion([
      '{"tool":"list_views","args":{}}',
      '{"final":"listo"}',
    ]);
    const vistos: string[] = [];
    await runBuilderAgent({ ...base, deps, onStep: (s) => vistos.push(s.type) });
    expect(vistos).toContain("action");
    expect(vistos).toContain("observation");
  });
});

/**
 * El aviso de «no entra en la IA local» estaba MAL PUESTO: se evaluaba en cada
 * turno contra el prompt completo, que crece con el menú y las observaciones. En
 * la app el agente hizo diez pasos y cerró con el aviso, tirando el trabajo. Un
 * presupuesto ajustado tiene que RECORTAR el contexto, no matar la corrida; y si
 * de verdad no entra, el aviso llega antes de empezar y con lo hecho a la vista.
 */
describe("presupuesto del motor local durante la corrida", () => {
  it("con la ventana por defecto, una corrida normal termina sin avisos de tamaño", async () => {
    const { deps, llamadas } = guion([
      '{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}',
      '{"tool":"add_node","args":{"name":"Pago","type":"Comando"}}',
      '{"final":"Listo."}',
    ]);
    const r = await runBuilderAgent({ ...base, maxTokens: 4096, deps });
    expect(llamadas).toHaveLength(2);
    expect(r.reply).not.toMatch(/más grande de lo que sostiene/i);
  });

  it("las observaciones se recortan en vez de reventar el presupuesto", async () => {
    const gordo = {
      listTools: async () => TOOLS,
      callTool: async () => ({ ok: true, texto: "x".repeat(20_000) }),
      generate: async (prompt: string) => {
        // El prompt NUNCA puede pasarse del presupuesto del motor local.
        expect(prompt.length).toBeLessThan(5018);
        return '{"tool":"list_views","args":{}}';
      },
    };
    const r = await runBuilderAgent({ ...base, maxTokens: 4096, deps: gordo });
    expect(r.state.restantes).toBe(0);
    expect(r.reply).toMatch(/tope de pasos/i);
  });

  it("si aborta por tamaño, el resumen dice lo que sí quedó hecho", async () => {
    let turno = 0;
    const deps = {
      listTools: async () => TOOLS,
      callTool: async () => ({ ok: true, texto: "hecho" }),
      generate: async () => {
        turno++;
        return turno === 1
          ? '{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}'
          : '{"tool":"add_node","args":{"name":"Pago","type":"Comando"}}';
      },
    };
    // Pedido enorme y ventana chica: ni el menú compacto con cero observaciones entra.
    const r = await runBuilderAgent({
      ...base,
      message: "construí ".repeat(400),
      maxTokens: 512,
      deps,
    });
    expect(r.reply).toMatch(/nube|parti/i);
    expect(r.reply).toMatch(/Sin cambios|Cambios aplicados/);
  });
});

/**
 * El agente pregunta (#321). Un aviso sin salida obliga al humano a reescribir el
 * pedido o irse a Ajustes; una pregunta con opciones deja seguir desde donde la
 * corrida se detuvo.
 */
describe("preguntas con opciones", () => {
  it("el modelo puede preguntar en vez de actuar, y la corrida se detiene sin gastar paso", async () => {
    const { deps, llamadas } = guion([
      '{"pregunta":"¿Sobre qué vista trabajo?","opciones":["Pagos","Checkout"]}',
    ]);
    const r = await runBuilderAgent({ ...base, deps });
    expect(llamadas).toEqual([]);
    expect(r.state.pregunta?.texto).toMatch(/vista/i);
    expect(r.state.pregunta?.opciones.map((o) => o.label)).toEqual(["Pagos", "Checkout"]);
    expect(r.state.restantes).toBe(MAX_BUILDER_STEPS);
  });

  it("la elección del humano retoma la corrida", async () => {
    const { deps } = guion(['{"pregunta":"¿Cuál?","opciones":["Pagos","Checkout"]}']);
    const primera = await runBuilderAgent({ ...base, deps });
    const seguir = guion([
      '{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}',
      '{"final":"Hecho sobre Pagos."}',
    ]);
    const r = await answerBuilderAgent(
      { ...base, deps: seguir.deps },
      primera.state,
      primera.state.pregunta!.opciones[0].id
    );
    expect(seguir.llamadas).toHaveLength(1);
    expect(r.reply).toMatch(/Pagos/);
  });

  it("cuando el pedido no entra en la ventana local, ofrece opciones en vez de un párrafo", async () => {
    const { deps, llamadas } = guion(['{"final":"nunca llega"}']);
    const r = await runBuilderAgent({
      ...base,
      message: "construí ".repeat(400),
      maxTokens: 512,
      deps,
    });
    expect(llamadas).toEqual([]);
    const ids = r.state.pregunta?.opciones.map((o) => o.id) ?? [];
    expect(ids).toContain("partir");
    expect(ids).toContain("ajustes");
    expect(ids).toContain("cancelar");
    // Y la opción de la nube lleva su acción: el botón hace algo, no describe algo.
    expect(r.state.pregunta?.opciones.find((o) => o.id === "ajustes")?.accion).toBe("abrir-ajustes-ia");
  });

  it("la confirmación destructiva sigue siendo una pregunta de dos opciones", async () => {
    const { deps, llamadas } = guion(['{"tool":"delete_view","args":{"name":"Pagos"}}']);
    const r = await runBuilderAgent({ ...base, deps });
    expect(llamadas).toEqual([]);
    expect(r.state.pregunta?.opciones.map((o) => o.id)).toEqual(["si", "no"]);
    expect(r.pendiente?.call.tool).toBe("delete_view");
  });
});

describe("seguir cuando se agota el tope (#322)", () => {
  it("al agotarse pregunta en vez de cerrar, mostrando lo hecho", async () => {
    const { deps } = guion(['{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}']);
    const r = await runBuilderAgent({ ...base, deps });
    expect(r.state.restantes).toBe(0);
    expect(r.state.pregunta?.opciones.map((o) => o.id)).toEqual(["seguir", "terminar"]);
    expect(r.state.pregunta?.texto).toMatch(/Orden/);
  });

  it("«seguir» continúa la MISMA corrida, con sus cambios y su traza", async () => {
    const { deps } = guion(['{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}']);
    const primera = await runBuilderAgent({ ...base, deps });
    const cambiosAntes = primera.state.cambios.length;

    const seguir = guion(['{"final":"Ahora sí, terminé."}']);
    const r = await answerBuilderAgent({ ...base, deps: seguir.deps }, primera.state, "seguir");
    expect(r.state.cambios.length).toBeGreaterThanOrEqual(cambiosAntes);
    expect(r.state.pasos.length).toBeGreaterThanOrEqual(primera.state.pasos.length);
    expect(r.reply).toMatch(/terminé/i);
  });

  it("«terminar» cierra con el resumen y no vuelve a preguntar", async () => {
    const { deps } = guion(['{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}']);
    const primera = await runBuilderAgent({ ...base, deps });
    const r = await answerBuilderAgent({ ...base, deps }, primera.state, "terminar");
    expect(r.state.cancelada).toBe(true);
    expect(r.state.pregunta).toBeUndefined();
    expect(r.reply).toMatch(/Orden/);
  });
});

describe("trabarse no es lo mismo que quedarse sin pasos (#323)", () => {
  it("un modelo que nunca emite una acción válida corta rápido y lo explica", async () => {
    const { deps, llamadas } = guion(["esto no es JSON ni nada parecido"]);
    const r = await runBuilderAgent({ ...base, deps });
    expect(llamadas).toEqual([]);
    // No gastó presupuesto de trabajo: no hizo trabajo.
    expect(r.state.restantes).toBe(MAX_BUILDER_STEPS);
    expect(r.reply).toMatch(/trab/i);
    // Y no ofrece «seguir»: darle más cuerda al que no acierta no arregla nada.
    expect(r.state.pregunta).toBeUndefined();
  });

  it("los errores del modelo no le roban pasos a la construcción", async () => {
    const { deps, llamadas } = guion([
      '{"tool":"inventada","args":{}}',
      '{"tool":"add_node","args":{"name":"Orden","type":"Comando"}}',
      '{"final":"Listo."}',
    ]);
    const r = await runBuilderAgent({ ...base, deps });
    expect(llamadas).toEqual(['add_node:{"name":"Orden","type":"Comando"}']);
    expect(r.state.restantes).toBe(MAX_BUILDER_STEPS - 1);
  });
});
