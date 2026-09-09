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
import { registerProcessflowTools } from "../mcp-tools";
import { getAgentProfile, BUILDER_TOOLS } from "../../../src/lib/ai/agent-profiles";

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

  it("el analista no lleva ninguna herramienta de escritura", () => {
    expect(getAgentProfile("analista").tools).toEqual([]);
  });
});
