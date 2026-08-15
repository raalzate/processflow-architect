import { describe, it, expect } from "vitest";
import {
  makeFinalStreamer,
  hasGenerationIntent,
  sanitizeMermaid,
  buildReasoningFrame,
  resolveNotations,
  buildContext,
} from "../litert-agent";

describe("resolveNotations", () => {
  it("vistas pineadas mandan", () => {
    expect(
      resolveNotations({ injected: ["bpmn"], activeNotation: "c4", graphNotation: "ddd" })
    ).toEqual(["bpmn"]);
  });

  it("sin pineadas cae a la vista activa (no a DDD)", () => {
    expect(resolveNotations({ injected: [], activeNotation: "c4", graphNotation: "ddd" })).toEqual([
      "c4",
    ]);
  });

  it("sin vista activa cae a la notación del documento", () => {
    expect(resolveNotations({ graphNotation: "uml" })).toEqual(["uml"]);
  });

  it("sin nada → vacío (el marco decide el default)", () => {
    expect(resolveNotations({ injected: ["", undefined as any] })).toEqual([]);
  });
});

describe("buildContext", () => {
  const graph = { nodes: [{ id: "n1", type: "Contenedor", name: "API" }], edges: [] };

  it("encabeza el grafo con el modelo/notación activa, sin vocabulario DDD", () => {
    const ctx = buildContext({ modelFile: "m", message: "hola", graphData: graph, notations: ["c4"] });
    expect(ctx).toMatch(/notación C4/);
    expect(ctx).not.toMatch(/dominio/i);
    expect(ctx).not.toContain("Agregado");
  });

  it("toma la notación del documento si no hay notaciones del turno", () => {
    const ctx = buildContext({
      modelFile: "m",
      message: "hola",
      graphData: { ...graph, notation: "bpmn" },
    });
    expect(ctx).toMatch(/notación BPMN/);
    expect(ctx).not.toContain("Agregado");
  });

  it("sin notación alguna → DDD (default) con su vocabulario", () => {
    const ctx = buildContext({ modelFile: "m", message: "hola", graphData: graph });
    expect(ctx).toContain("Agregado");
  });
});

describe("buildReasoningFrame", () => {
  it("sin notaciones → asume DDD y aplica el addendum DDD", () => {
    const f = buildReasoningFrame({ hasGraph: true });
    expect(f.dddActive).toBe(true);
    expect(f.persona).toMatch(/DDD|Lenguaje Ubicuo/i);
    expect(f.vocabRule).toContain("Agregado");
    expect(f.vocabRule).toContain("Bounded Context");
  });

  it("notación BPMN → guía BPMN en la persona, SIN addendum DDD", () => {
    const f = buildReasoningFrame({ notations: ["bpmn"], hasGraph: true });
    expect(f.dddActive).toBe(false);
    expect(f.persona).toMatch(/BPMN/);
    // Regla genérica presente, pero no la cláusula DDD (que desinformaría).
    expect(f.vocabRule).toContain("tipo_contenedor");
    expect(f.vocabRule).not.toContain("Bounded Context");
  });

  it("mezcla ddd+c4 → ambas guías y DDD activo", () => {
    const f = buildReasoningFrame({ notations: ["ddd", "c4"], hasGraph: true });
    expect(f.dddActive).toBe(true);
    expect(f.persona).toMatch(/C4/);
    expect(f.persona).toMatch(/DDD|Ubicuo/i);
  });

  it("sin grafo → sin regla de vocabulario", () => {
    expect(buildReasoningFrame({ hasGraph: false }).vocabRule).toBe("");
  });

  it("respeta el systemPrompt del usuario como base de la persona", () => {
    const f = buildReasoningFrame({ hasGraph: false, systemPrompt: "Sos un mentor paciente." });
    expect(f.persona).toMatch(/^Sos un mentor paciente\./);
  });
});

describe("hasGenerationIntent", () => {
  it("NO dispara con mensajes conversacionales", () => {
    for (const m of [
      "hablame del sistema",
      "cuéntame qué hace la app",
      "explica el flujo de login",
      "describe los agregados",
      "resume el dominio",
      "analiza el modelo actual",
      "¿qué es el agregado Backend?",
    ]) {
      expect(hasGenerationIntent(m), m).toBe(false);
    }
  });

  it("dispara cuando se pide un artefacto por nombre o verbo de dibujo", () => {
    for (const m of [
      "genera un diagrama de secuencia",
      "hazme el documento de drivers",
      "créame el ADR de persistencia",
      "quiero el roadmap del proyecto",
      "dibuja el flujo de autenticación",
      "modela el dominio en C4",
      "exporta un mermaid del backend",
      "arma el mapa de contexto",
    ]) {
      expect(hasGenerationIntent(m), m).toBe(true);
    }
  });

  it("no confunde 'modelo' (sustantivo) con 'modela' (verbo)", () => {
    expect(hasGenerationIntent("hablame del modelo de dominio")).toBe(false);
  });
});

describe("sanitizeMermaid", () => {
  it("reescribe subgraph con espacios/paréntesis a la forma válida", () => {
    const out = sanitizeMermaid("flowchart LR\n    subgraph Canal Web (Supporting)\n    end");
    expect(out).toContain('subgraph CanalWebSupporting["Canal Web (Supporting)"]');
  });

  it("deja intactos los subgraph ya válidos (id + corchetes)", () => {
    const code = 'flowchart LR\n    subgraph cw["Canal Web"]\n    end';
    expect(sanitizeMermaid(code)).toBe(code);
  });

  it("deja intacto un subgraph con id simple (un solo token)", () => {
    const code = "flowchart LR\n    subgraph Backend\n    end";
    expect(sanitizeMermaid(code)).toBe(code);
  });

  it("preserva la indentación y el resto del código", () => {
    const out = sanitizeMermaid("        subgraph Base de datos externo (Generic)");
    expect(out).toBe('        subgraph BasededatosexternoGeneric["Base de datos externo (Generic)"]');
  });
});

/**
 * Solo cubrimos `makeFinalStreamer` (lógica pura). El resto de `litert-agent`
 * depende de LiteRT-LM/WebGPU y no es testeable en Node.
 */
describe("makeFinalStreamer", () => {
  // Alimenta el stream fragmento a fragmento y devuelve lo emitido concatenado.
  function run(chunks: string[]): string {
    let out = "";
    const feed = makeFinalStreamer((c) => (out += c));
    for (const c of chunks) feed(c);
    return out;
  }

  it("emite el valor de `final` a medida que llega, sin el envoltorio JSON", () => {
    expect(run([`{"final":"Hola`, ` mundo"}`])).toBe("Hola mundo");
  });

  it("emite incrementalmente token a token (solo lo nuevo)", () => {
    const emitted: string[] = [];
    const feed = makeFinalStreamer((c) => emitted.push(c));
    feed(`{"thought":"x","final":"a`);
    feed(`b`);
    feed(`c"}`);
    // Cada chunk aporta solo el delta, nunca reemite lo ya mostrado.
    expect(emitted.join("")).toBe("abc");
    expect(emitted.every((e) => e.length > 0)).toBe(true);
  });

  it("no emite nada si el turno es una acción (sin `final`)", () => {
    expect(run([`{"thought":"uso tool","action":"generate_diagram","args":{}}`])).toBe("");
  });

  it("desescapa saltos de línea y comillas", () => {
    expect(run([`{"final":"línea1\\nlínea2 \\"cita\\""}`])).toBe('línea1\nlínea2 "cita"');
  });

  it("se detiene en la comilla de cierre (ignora JSON posterior)", () => {
    expect(run([`{"final":"listo","extra":"nope"}`])).toBe("listo");
  });

  it("espera al próximo chunk si un escape queda partido en el borde", () => {
    const emitted: string[] = [];
    const feed = makeFinalStreamer((c) => emitted.push(c));
    feed(`{"final":"a\\`); // termina en backslash suelto → JSON.parse fallaría
    expect(emitted.join("")).toBe(""); // no emite parcial roto: espera
    feed(`n b"}`); // completa el \n
    expect(emitted.join("")).toBe("a\n b"); // recupera al completarse
  });

  it("tolera `final` con espacios alrededor de los dos puntos", () => {
    expect(run([`{"final"  :  "ok"}`])).toBe("ok");
  });
});
