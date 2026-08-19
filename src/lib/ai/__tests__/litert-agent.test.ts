import { describe, it, expect } from "vitest";
import {
  makeFinalStreamer,
  salvageReply,
  repairProtocolJson,
  looksLikeProtocol,
  esDesbordeDeVentana,
  systemBudget,
  looksDegenerate,
  hasGenerationIntent,
  sanitizeMermaid,
  buildReasoningFrame,
  resolveNotations,
  buildContext,
  escapeStrayQuotes,
} from "../litert-agent";
import { budgetFromWindow } from "../agent-run";

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

/**
 * Incidente: el modelo local cerraba con `{"response":"…"}` en vez de
 * `{"final":"…"}`. El turno caía al crudo y el chat mostraba el JSON envuelto
 * —una caja de código con `{ "response": … }`— seguido de la mitad de la
 * explicación. La respuesta estaba ahí; el agente no la sabía leer.
 */
describe("salvageReply · turnos que ignoran el contrato", () => {
  it("desenvuelve `response` en vez de mostrar el JSON", () => {
    const raw = '{\n  "response": "El resultado de la solicitud de arquitectura."\n}';
    expect(salvageReply(raw, JSON.parse(raw))).toBe("El resultado de la solicitud de arquitectura.");
  });

  it("acepta las otras claves con las que el modelo nombra su respuesta", () => {
    for (const clave of ["respuesta", "answer", "reply", "message", "text", "content", "output"]) {
      const raw = `{"${clave}":"hola"}`;
      expect(salvageReply(raw, JSON.parse(raw))).toBe("hola");
    }
  });

  it("suma la prosa que quedó FUERA del JSON (el caso del incidente)", () => {
    const raw = [
      '{ "response": "Los drivers salen del documento." }',
      "",
      "**Nota:** «restricción» acá significa límite técnico.",
    ].join("\n");
    const out = salvageReply(raw, JSON.parse('{ "response": "Los drivers salen del documento." }'));
    expect(out).toContain("Los drivers salen del documento.");
    expect(out).toContain("**Nota:**");
    // Y NADA del envoltorio: ni la llave ni el nombre del campo.
    expect(out).not.toContain('"response"');
    expect(out).not.toContain("{");
  });

  it("ignora el fence que envolvía el JSON", () => {
    const raw = '```json\n{"response":"ok"}\n```\n\nY un cierre en prosa.';
    const out = salvageReply(raw, JSON.parse('{"response":"ok"}'));
    expect(out).toBe("ok\n\nY un cierre en prosa.");
  });

  it("prefiere `final` cuando el objeto trae varias claves", () => {
    const raw = '{"response":"borrador","final":"definitiva"}';
    expect(salvageReply(raw, JSON.parse(raw))).toBe("definitiva");
  });

  it("sin nada rescatable devuelve el crudo (mejor que vacío)", () => {
    const raw = '{"total":3}';
    expect(salvageReply(raw, JSON.parse(raw))).toBe(raw);
  });
});

describe("makeFinalStreamer · claves off-contract", () => {
  const run = (chunks: string[]) => {
    const out: string[] = [];
    const feed = makeFinalStreamer((c) => out.push(c));
    chunks.forEach(feed);
    return out.join("");
  };

  it("streamea `response` como si fuera `final`", () => {
    expect(run(['{"response":"en vivo"}'])).toBe("en vivo");
  });

  it("no streamea claves genéricas (podrían ser argumentos de una herramienta)", () => {
    expect(run(['{"action":"generate_document","args":{"instructions":"x","content":"y"}}'])).toBe("");
  });
});

/**
 * Incidente (captura del usuario): el chat mostró el JSON del protocolo —
 * `{"thought":"He leído el 'Modelo' (c4)… (ej. "Publica productos nuevos", …)",
 * "action":"read_view","args":{"name":"DDD · Dominio Producto"}}` — y la corrida
 * se cortó ahí. Causa: comillas SIN ESCAPAR dentro del `thought` ⇒ `JSON.parse`
 * falla ⇒ el fallback imprimía el crudo. Dos reglas nuevas: un turno de protocolo
 * roto se rescata, y si no se puede, NUNCA se le muestra al usuario.
 */
const ROTO = `{"thought":"He leído el 'Modelo' (c4) y he identificado los actores (Admin, Comprador). Los requisitos se desprenden de las interacciones (ej. "Publica productos nuevos", "Busca productos", "valida precio"). Necesito leer el modelo de dominio.","action":"read_view","args":{"name":"DDD · Dominio Producto"}}`;

describe("repairProtocolJson · turnos de protocolo con JSON roto", () => {
  it("rescata la acción y sus argumentos del caso real", () => {
    const r = repairProtocolJson(ROTO)!;
    expect(r.action).toBe("read_view");
    expect(r.args).toEqual({ name: "DDD · Dominio Producto" });
    expect(String(r.thought)).toContain("He leído el 'Modelo'");
    // El thought corta en la clave siguiente, no en la primera comilla suelta.
    expect(String(r.thought)).toContain("valida precio");
  });

  it("el JSON roto NO parsea (si parseara, este test no tendría sentido)", () => {
    expect(() => JSON.parse(ROTO)).toThrow();
  });

  it("rescata un `final` con comillas sueltas alrededor", () => {
    const raw = `{"thought":"listo","final":"El resultado es claro."}`;
    expect(repairProtocolJson(raw)!.final).toBe("El resultado es claro.");
  });

  it("rescata args aunque tengan comillas sueltas", () => {
    const raw = `{"action":"search_model","args":{"term":"cobro "de" prima"}}`;
    const r = repairProtocolJson(raw)!;
    expect(r.action).toBe("search_model");
    expect((r.args as { term: string }).term).toContain("cobro");
  });

  it("prosa sin claves del protocolo no se toca", () => {
    expect(repairProtocolJson("Hola, esto es una explicación.")).toBeNull();
    expect(looksLikeProtocol("Hola, esto es una explicación.")).toBe(false);
  });

  it("un objeto con sólo `thought` no alcanza para seguir", () => {
    expect(repairProtocolJson('{"thought":"pensando"}')).toBeNull();
  });

  it("reconoce las cuatro claves del protocolo", () => {
    for (const clave of ["action", "plan", "question", "final"]) {
      expect(looksLikeProtocol(`{"${clave}": "x"}`)).toBe(true);
    }
  });
});

describe("esDesbordeDeVentana · el motor local no lanza errores tipados", () => {
  it("reconoce las dos formas reales de LiteRT", () => {
    expect(esDesbordeDeVentana(new Error("Too many tokens requested."))).toBe(true);
    expect(
      esDesbordeDeVentana(
        new Error("Cannot rewind to time_step 0 from 4376. Ringbuffer size is 4096 with sliding window of 512")
      )
    ).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(esDesbordeDeVentana(new Error("WebGPU no disponible"))).toBe(false);
    expect(esDesbordeDeVentana(undefined)).toBe(false);
  });
});

describe("presupuestos derivados de la ventana", () => {
  it("el system y la lectura se reparten la ventana real", () => {
    // 4 096 tokens (default de Ajustes) ≈ 14 336 caracteres.
    expect(systemBudget(4096)).toBe(6451);
    expect(budgetFromWindow(4096)).toBe(5018);
    // Juntos no pasan la ventana: queda aire para observaciones y respuesta.
    expect(systemBudget(4096) + budgetFromWindow(4096)).toBeLessThan(4096 * 3.5);
  });

  it("una ventana grande da más margen, una chica no baja de un piso usable", () => {
    expect(budgetFromWindow(16384)).toBeGreaterThan(budgetFromWindow(4096));
    expect(budgetFromWindow(512)).toBeGreaterThanOrEqual(1500);
    expect(systemBudget(undefined)).toBe(systemBudget(4096));
  });
});

/**
 * Incidente (la app): el artefacto se generó bien y el turno de CIERRE salió como
 * `{"description":"…","status":"تم","details":"…"}` — JSON ajeno al protocolo, en
 * árabe. Se imprimió tal cual. Un modelo chico degenera; lo que no puede pasar es
 * que su descarte sea lo que el humano lee.
 */
describe("looksDegenerate · cuándo el cierre no sirve", () => {
  it("un JSON que no habla el protocolo no es una respuesta", () => {
    expect(looksDegenerate('{"description":"algo","status":"ok"}')).toBe(true);
    // …pero uno del protocolo sí se entiende (lo desenvuelve `salvageReply`).
    expect(looksDegenerate('{"final":"listo"}')).toBe(false);
  });

  it("detecta el cambio de alfabeto", () => {
    expect(looksDegenerate("استخلاص المتطلبات الأساسية للمنظومة، هذا يعني تحديد المتطلبات")).toBe(true);
  });

  it("el español con acentos, ñ y comillas NO es degeneración", () => {
    expect(
      looksDegenerate("Listo: «Drivers de arquitectura» está en el lienzo, leyendo C4 y BPMN.")
    ).toBe(false);
    expect(looksDegenerate("Añadí la sección de cumplimiento (PCI-DSS) al análisis.")).toBe(false);
  });

  it("una respuesta vacía cuenta como degenerada", () => {
    expect(looksDegenerate("")).toBe(true);
    expect(looksDegenerate("   ")).toBe(true);
  });

  it("un texto corto con algún símbolo raro no se descarta por poco", () => {
    expect(looksDegenerate("Listo ✓")).toBe(false);
  });
});

describe("looksDegenerate · rescates vacíos", () => {
  it("un texto sin letras (puntos suspensivos, símbolos) no es una respuesta", () => {
    expect(looksDegenerate("…")).toBe(true);
    expect(looksDegenerate("...")).toBe(true);
    expect(looksDegenerate("— — —")).toBe(true);
  });

  it("pero una respuesta cortísima con palabras sí lo es", () => {
    expect(looksDegenerate("Listo.")).toBe(false);
  });
});

/**
 * Comillas sueltas dentro de un string: el fallo más repetido del modelo local.
 * Sanearlas rescata CUALQUIER forma de turno (plan, question, args), no sólo las
 * que el rescate por clave sabía reconstruir.
 */
describe("escapeStrayQuotes", () => {
  it("escapa las comillas internas y deja parseable el turno", () => {
    const roto = '{"thought":"la vista "Pagos" no aplica","action":"read_view","args":{"name":"Pedidos"}}';
    const obj = JSON.parse(escapeStrayQuotes(roto));
    expect(obj.thought).toBe('la vista "Pagos" no aplica');
    expect(obj.action).toBe("read_view");
    expect(obj.args.name).toBe("Pedidos");
  });

  it("no toca un JSON que ya era válido", () => {
    const ok = '{"a":"b","c":["d","e"],"f":{"g":1}}';
    expect(escapeStrayQuotes(ok)).toBe(ok);
  });

  it("respeta los escapes que ya venían y convierte saltos crudos", () => {
    const conSalto = '{"final":"línea uno\nlínea dos","x":"ya \"escapado\""}';
    const obj = JSON.parse(escapeStrayQuotes(conSalto));
    expect(obj.final).toContain("línea dos");
    expect(obj.x).toBe('ya "escapado"');
  });

  it("un salto de línea literal dentro del string no rompe el parseo", () => {
    const crudo = '{"final":"uno\ndos"}'.replace("\\n", "\n");
    expect(() => JSON.parse(escapeStrayQuotes(crudo))).not.toThrow();
  });
});
