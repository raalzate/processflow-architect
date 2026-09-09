/**
 * Perfiles del panel de agentes (014, #308).
 *
 * El selector no puede quedar en manos de la UI: si el perfil que escribe y el
 * repertorio de herramientas viven en un componente, cualquiera agrega un agente
 * con permiso de borrado sin que un test lo mire. Acá se fija lo verificable:
 * hay dos perfiles, sólo uno escribe, y el repertorio del que escribe es una
 * lista de ids limpia (sin vacíos, sin repetidos) — que esos ids EXISTAN en el
 * registro del MCP lo prueba `builder-tools-registry.test.ts` (T6).
 */
import { describe, it, expect } from "vitest";
import {
  AGENT_PROFILES,
  DEFAULT_AGENT_ID,
  getAgentProfile,
  isAgentId,
  readAgentId,
  saveAgentId,
  pideEscritura,
  avisoAgenteEquivocado,
  type AgentId,
} from "@/lib/ai/agent-profiles";

/** localStorage de mentira: lo que la app usa, sin jsdom de por medio. */
function memoria(inicial: Record<string, string> = {}) {
  const datos = { ...inicial };
  return {
    getItem: (k: string) => (k in datos ? datos[k] : null),
    setItem: (k: string, v: string) => {
      datos[k] = v;
    },
    datos,
  };
}

describe("perfiles de agente", () => {
  it("declara analista y constructor, y sólo el constructor escribe", () => {
    const ids = AGENT_PROFILES.map((p) => p.id);
    expect(ids).toContain("analista");
    expect(ids).toContain("constructor");
    expect(getAgentProfile("analista").escribe).toBe(false);
    expect(getAgentProfile("constructor").escribe).toBe(true);
  });

  it("el default es el analista: el poder de escritura se elige, no se hereda", () => {
    expect(DEFAULT_AGENT_ID).toBe("analista");
  });

  it("cada perfil tiene nombre y una descripción de una línea para el selector", () => {
    for (const p of AGENT_PROFILES) {
      expect(p.nombre.trim().length).toBeGreaterThan(0);
      expect(p.descripcion.trim().length).toBeGreaterThan(0);
      expect(p.descripcion).not.toContain("\n");
    }
  });

  it("el analista no lleva herramientas de escritura", () => {
    expect(getAgentProfile("analista").tools).toEqual([]);
  });

  it("el repertorio del constructor no está vacío ni repite ids", () => {
    const tools = getAgentProfile("constructor").tools;
    expect(tools.length).toBeGreaterThan(0);
    expect(new Set(tools).size).toBe(tools.length);
    for (const t of tools) expect(t.trim()).toBe(t);
  });

  it("reconoce los ids válidos y rechaza los inventados", () => {
    expect(isAgentId("constructor")).toBe(true);
    expect(isAgentId("borrador")).toBe(false);
  });

  it("recuerda el agente elegido por proyecto", () => {
    const s = memoria();
    saveAgentId(s, "p1", "constructor");
    expect(readAgentId(s, "p1")).toBe("constructor");
    // Otro proyecto no hereda la elección: el poder de escritura no viaja solo.
    expect(readAgentId(s, "p2")).toBe(DEFAULT_AGENT_ID);
  });

  it("un valor guardado inválido cae al default en vez de romper el panel", () => {
    const s = memoria({ "agent_profile:p1": "borrador" });
    expect(readAgentId(s, "p1")).toBe(DEFAULT_AGENT_ID);
  });

  it("no explota si el storage no está disponible", () => {
    const roto = {
      getItem: () => {
        throw new Error("sin storage");
      },
      setItem: () => {
        throw new Error("sin storage");
      },
    };
    expect(readAgentId(roto, "p1")).toBe(DEFAULT_AGENT_ID);
    expect(() => saveAgentId(roto, "p1", "constructor" as AgentId)).not.toThrow();
  });
});

describe("el analista no escribe", () => {
  it("reconoce un pedido de construcción", () => {
    expect(pideEscritura("creá una vista de Pagos")).toBe(true);
    expect(pideEscritura("borrá la vista Checkout")).toBe(true);
    expect(pideEscritura("agregá un elemento Orden")).toBe(true);
    expect(pideEscritura("conectá los nodos A y B")).toBe(true);
  });

  it("no confunde una pregunta con un pedido de cambio", () => {
    expect(pideEscritura("¿qué vistas tiene el proyecto?")).toBe(false);
    expect(pideEscritura("resumime el modelo")).toBe(false);
    expect(pideEscritura("generá un ADR sobre la mensajería")).toBe(false);
  });

  it("el aviso manda al agente correcto, no sólo dice que no", () => {
    expect(avisoAgenteEquivocado()).toMatch(/Constructor/);
  });
});

describe("bienvenida del perfil", () => {
  it("cada perfil trae su título, su invitación y sus ejemplos", () => {
    for (const p of AGENT_PROFILES) {
      expect(p.bienvenida.titulo.trim().length).toBeGreaterThan(0);
      expect(p.bienvenida.invitacion.trim().length).toBeGreaterThan(0);
      expect(p.bienvenida.ejemplos.length).toBeGreaterThan(2);
      for (const e of p.bienvenida.ejemplos) expect(e.trim()).toBe(e);
    }
  });

  it("el analista conserva su tarjeta de siempre: esto no es un rediseño", () => {
    const b = getAgentProfile("analista").bienvenida;
    expect(b.titulo).toBe("Agente de Arquitectura");
    expect(b.ejemplos).toContain("Extrae los drivers de arquitectura");
    expect(b.ejemplos).toContain("Redacta un ADR para la persistencia");
  });

  it("el constructor invita a construir, no a redactar", () => {
    const b = getAgentProfile("constructor").bienvenida;
    expect(b.titulo).toMatch(/Constructor/i);
    // Los ejemplos del constructor tienen que ser pedidos que ÉL puede cumplir:
    // un chip que dispara «redactá un ADR» con el constructor activo sólo enseña
    // a usarlo mal.
    for (const e of b.ejemplos) expect(pideEscritura(e)).toBe(true);
    // Y el humano tiene que saber, antes de escribir, que lo destructivo se pregunta.
    expect(b.invitacion).toMatch(/confirm/i);
  });

  it("sólo el que escribe ofrece artefactos: el constructor no produce documentos", () => {
    expect(getAgentProfile("analista").artefactos).toBe(true);
    expect(getAgentProfile("constructor").artefactos).toBe(false);
  });
});
