/**
 * Contrato entre el perfil «Constructor» y el registro real del MCP (014, #308).
 *
 * El repertorio del agente es una allowlist de IDS (`agent-profiles.ts`), no una
 * copia de las herramientas: eso evita una lista paralela con descripciones
 * viejas, pero abre otro agujero — un id que ya no existe. Sin este test, la
 * herramienta renombrada se descubre en la corrida del usuario, con el modelo
 * pidiendo algo que el servidor no tiene. Acá se descubre en el gate.
 */
import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerProcessflowTools } from "../mcp-tools";
import { getAgentProfile, BUILDER_TOOLS } from "../../../src/lib/ai/agent-profiles";
import { NOTATION_IDS } from "../../../src/lib/notations";

/** Server MCP falso: sólo interesa QUÉ nombres se registran. */
function nombresRegistrados(modoApp: boolean): Set<string> {
  const nombres = new Set<string>();
  const server = {
    registerTool: (name: string) => {
      nombres.add(name);
    },
  } as any;
  registerProcessflowTools(
    server,
    modoApp
      ? {
          workspace: "/tmp/pf-test",
          // En modo app se registran además las herramientas que tocan la app
          // (export_as_view, delete_view, …), que son las que usa el constructor.
          exportToApp: async () => true,
          exportViewToApp: async () => true,
          getAppState: () => null,
          readApp: async () => ({ ok: false, error: "test" }) as any,
          actOnApp: async () => ({ ok: false, error: "test" }) as any,
        }
      : { workspace: "/tmp/pf-test" }
  );
  return nombres;
}

describe("repertorio del constructor vs. registro MCP", () => {
  const registradas = nombresRegistrados(true);

  it("cada herramienta de la allowlist existe en el registro del modo app", () => {
    const faltan = getAgentProfile("constructor").tools.filter((t) => !registradas.has(t));
    expect(faltan).toEqual([]);
  });

  it("el constructor puede orientarse, construir, limpiar y cerrar", () => {
    // Si alguna fase quedara vacía, el agente perdería una capacidad entera sin
    // que ningún test lo note.
    for (const [fase, ids] of Object.entries(BUILDER_TOOLS)) {
      expect(ids.length, `la fase ${fase} quedó sin herramientas`).toBeGreaterThan(0);
    }
  });

  it("las herramientas que editan la vista abierta existen en modo app (015, #336)", () => {
    // Son la puerta al lienzo del humano: sin ellas el agente vuelve a escribir
    // sólo en el workspace del MCP, que es el defecto que abrió la feature.
    for (const t of [
      "add_view_element",
      "update_view_element",
      "remove_view_element",
      "add_view_edge",
      "update_view_edge",
      "remove_view_edge",
      "set_view_graph",
    ]) {
      expect(registradas.has(t), `falta ${t}`).toBe(true);
    }
  });

  it("fuera del modo app esas herramientas no existen (no hay lienzo que tocar)", () => {
    expect(nombresRegistrados(false).has("add_view_element")).toBe(false);
  });

  it("el analista no lleva ninguna herramienta de escritura", () => {
    expect(getAgentProfile("analista").tools).toEqual([]);
  });
});

/**
 * El SCHEMA que el arnés recibe de verdad, no el que escriben los fixtures.
 *
 * Dos arreglos de #331 dependen de lo que publica el registro: `normalizarEnums`
 * necesita `properties.notation.enum` para corregir «C4» antes de gastar un turno
 * contra el `-32602`, y `nombreDeVista` lee `viewName` porque es el argumento que
 * el servidor tiene. Los dos se vuelven un no-op SILENCIOSO si el SDK cambia la
 * serialización de zod (`anyOf`, `$ref`) o si alguien renombra el argumento: los
 * tests del arnés seguirían verdes contra fixtures escritos a mano. Acá se mira
 * el JSON Schema real, por el mismo camino que usa `mcpPlaygroundListTools`.
 */
describe("el schema publicado sostiene los arreglos del arnés (#331)", () => {
  async function schemasPublicados(): Promise<Record<string, any>> {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerProcessflowTools(server as any, {
      workspace: "/tmp/pf-test",
      exportToApp: async () => true,
      exportViewToApp: async () => true,
      getAppState: () => null,
      readApp: async () => ({ ok: false, error: "test" }) as any,
      actOnApp: async () => ({ ok: false, error: "test" }) as any,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([server.connect(b), client.connect(a)]);
    const { tools } = await client.listTools();
    await client.close();
    return Object.fromEntries(tools.map((t) => [t.name, t.inputSchema as any]));
  }

  it("create_diagram publica la notación como enum, con todas las notaciones", async () => {
    const schemas = await schemasPublicados();
    const notation = schemas.create_diagram?.properties?.notation;
    expect(notation?.enum).toEqual(NOTATION_IDS);
  });

  it("export_as_view nombra la pestaña con viewName, no con name", async () => {
    const schemas = await schemasPublicados();
    const props = schemas.export_as_view?.properties ?? {};
    expect(Object.keys(props)).toContain("viewName");
    expect(Object.keys(props)).not.toContain("name");
  });
});
