/**
 * Bucle del agente constructor (014, #308).
 *
 * El modelo y el MCP entran por `deps`, así que el bucle entero se prueba sin GPU
 * ni Electron: se le dicta al "modelo" qué contestar en cada turno y se mira qué
 * herramientas llamó de verdad. Es la única forma de fijar lo que importa —que
 * un borrado NO se ejecute sin el sí del humano— sin depender de la app corriendo.
 */
import { describe, it, expect, vi } from "vitest";
import { runBuilderAgent, resumeBuilderAgent, type BuilderDeps } from "@/lib/ai/builder-agent";
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
