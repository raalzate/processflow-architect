import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del motor LiteRT (WebGPU) — no arranca en Node. Sustituimos la
// conversación y la generación one-shot por respuestas guionadas para ejercitar
// el bucle ReAct (runLitertAgent) y sus ramas (documento/diagrama/error/etc.).
vi.mock("../litert-engine", () => ({
  createLitertConversation: vi.fn(),
  litertGenerate: vi.fn(),
}));

import { runLitertAgent, resumeLitertAgent } from "../litert-agent";
import { createLitertConversation, litertGenerate } from "../litert-engine";

const mockConvo = vi.mocked(createLitertConversation);
const mockGen = vi.mocked(litertGenerate);

/** Convo falsa que devuelve una cola de respuestas por cada `send`. */
function scriptConvo(responses: string[]) {
  let i = 0;
  const send = vi.fn(async (_user: string, onToken?: (c: string) => void) => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    onToken?.(r); // alimenta el streamer (por si trae "final")
    return r;
  });
  // `close` la usa el agente al terminar el run: libera el contexto del engine.
  mockConvo.mockResolvedValue({ send, close: vi.fn(async () => {}) });
  return send;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGen.mockResolvedValue("contenido generado");
});

describe("runLitertAgent — ruta conversacional (sin intención de generar)", () => {
  it("conversa sin artefactos y respeta el streaming", async () => {
    const send = scriptConvo(["Hola, esto es una explicación."]);
    const tokens: string[] = [];
    const res = await runLitertAgent({
      modelFile: "m.litertlm",
      message: "explica el dominio",
      onReplyToken: (c) => tokens.push(c),
    });
    expect(res.reply).toBe("Hola, esto es una explicación.");
    expect(res.artifacts).toHaveLength(0);
    expect(res.steps).toHaveLength(0);
    expect(send).toHaveBeenCalledOnce();
    expect(tokens.join("")).toContain("explicación");
  });

  it("reply vacío cae a 'Listo.'", async () => {
    scriptConvo([""]);
    const res = await runLitertAgent({ modelFile: "m", message: "cuéntame algo" });
    expect(res.reply).toBe("Listo.");
  });

  it("inyecta contexto (grafo/vistas/artefactos/documentos) sin romper", async () => {
    scriptConvo(["ok"]);
    const res = await runLitertAgent({
      modelFile: "m",
      message: "resume el modelo",
      graphData: {
        containers: [{ id: "c1", label: "Pedido", type: "Agregado" }],
        nodes: [{ id: "n1", label: "Confirmar", type: "Comando", containerId: "c1" }],
        edges: [{ source: "n1", target: "n1" }],
      },
      views: [{ name: "V1", kind: "big-picture", notation: "ddd" }],
      contextArtifacts: [{ kind: "adr", title: "ADR-1", content: "decisión" }],
      documents: [{ name: "doc.txt", text: "requisitos del proyecto" }],
    });
    expect(res.reply).toBe("ok");
  });
});

describe("runLitertAgent — bucle ReAct (con intención de generar)", () => {
  it("final inmediato con JSON válido", async () => {
    scriptConvo([`{"thought":"pienso","final":"aquí está tu diagrama descrito"}`]);
    const res = await runLitertAgent({ modelFile: "m", message: "dibuja un diagrama" });
    expect(res.reply).toBe("aquí está tu diagrama descrito");
    expect(res.steps.some((s) => s.type === "thought")).toBe(true);
  });

  it("genera un DOCUMENTO y luego cierra", async () => {
    mockGen.mockResolvedValue("# Documento\ncontenido markdown");
    scriptConvo([
      `{"thought":"genero doc","action":"generate_document","args":{"kind":"drivers","title":"Drivers","instructions":"lista"}}`,
      `{"final":"documento listo"}`,
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "hazme el documento de drivers" });
    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0].render).toBe("markdown");
    expect(res.artifacts[0].title).toBe("Drivers");
    expect((res.artifacts[0].payload as any).markdown).toContain("markdown");
    expect(res.reply).toBe("documento listo");
    expect(res.steps.some((s) => s.type === "observation")).toBe(true);
  });

  it("genera un DIAGRAMA (sanea el mermaid) y cierra", async () => {
    mockGen.mockResolvedValue("```mermaid\nflowchart LR\nsubgraph Canal Web (X)\nend\n```");
    scriptConvo([
      `{"action":"generate_diagram","args":{"kind":"c4-context","title":"C4"}}`,
      `{"final":"diagrama listo"}`,
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "modela en C4" });
    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0].render).toBe("mermaid");
    const code = (res.artifacts[0].payload as any).code;
    expect(code).toContain('subgraph');
    expect(code).not.toContain("```");
  });

  it("acción inválida → observación de error, sigue hasta final", async () => {
    scriptConvo([
      `{"action":"borrar_todo","args":{}}`,
      `{"final":"no puedo hacer eso"}`,
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "genera un diagrama raro" });
    expect(res.reply).toBe("no puedo hacer eso");
    expect(res.artifacts).toHaveLength(0);
  });

  it("captura el error de una herramienta", async () => {
    mockGen.mockRejectedValueOnce(new Error("boom"));
    scriptConvo([
      `{"action":"generate_document","args":{"kind":"adr","title":"ADR"}}`,
      `{"final":"terminé con error"}`,
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "genera el documento adr" });
    expect(res.steps.some((s) => s.type === "observation" && /boom/.test(s.content))).toBe(true);
    expect(res.artifacts).toHaveLength(0);
  });

  it("JSON ilegible → rescata el campo final por regex", async () => {
    scriptConvo([`basura previa {"final":"rescatado",} cola`]);
    const res = await runLitertAgent({ modelFile: "m", message: "dibuja algo" });
    expect(res.reply).toBe("rescatado");
  });

  it("extractField devuelve el crudo cuando el escape del valor es inválido", async () => {
    // JSON no parseable + "final" con un escape inválido (\q) → JSON.parse del
    // valor capturado lanza y extractField cae al grupo crudo.
    scriptConvo([`{"final":"hola\\q"`]);
    const res = await runLitertAgent({ modelFile: "m", message: "dibuja algo" });
    expect(res.reply).toBe("hola\\q");
  });

  it("turno con `response` en vez de `final` → responde el texto, no el JSON", async () => {
    // El caso real: Gemma cerró con {"response": …} y el chat mostraba el JSON
    // envuelto seguido de la mitad de la explicación.
    scriptConvo([
      '{ "response": "Los drivers salen del documento." }\n\n**Nota:** «restricción» = límite técnico.',
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "genera un diagrama" });
    expect(res.reply).toContain("Los drivers salen del documento.");
    expect(res.reply).toContain("**Nota:**");
    expect(res.reply).not.toContain('"response"');
  });

  it("texto plano sin JSON → usa el texto crudo", async () => {
    scriptConvo(["solo prosa sin json"]);
    const res = await runLitertAgent({ modelFile: "m", message: "genera un diagrama" });
    expect(res.reply).toBe("solo prosa sin json");
  });

  it("captura el error de generate_diagram", async () => {
    mockGen.mockRejectedValueOnce(new Error("mermaid roto"));
    scriptConvo([
      `{"action":"generate_diagram","args":{"kind":"c4-context","title":"C4"}}`,
      `{"final":"cerré con error"}`,
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "modela en c4" });
    expect(res.steps.some((s) => s.type === "observation" && /mermaid roto/.test(s.content))).toBe(true);
    expect(res.artifacts).toHaveLength(0);
  });

  it("solo acciones inválidas hasta MAX_TURNS → 'Listo.' sin artefactos", async () => {
    scriptConvo([`{"action":"desconocida","args":{}}`]);
    const res = await runLitertAgent({ modelFile: "m", message: "genera un diagrama x" });
    expect(res.artifacts).toHaveLength(0);
    expect(res.reply).toBe("Listo.");
  });

  it("un pedido = UN artefacto: aunque insista, no salen cinco", async () => {
    // Siempre pide generar y nunca cierra con final: el segundo generate_* y los
    // que siguen se rechazan con observación (antes salían 5 documentos).
    const send = scriptConvo([`{"action":"generate_document","args":{"kind":"nota","title":"N"}}`]);
    const res = await runLitertAgent({ modelFile: "m", message: "genera documentos sin parar" });
    expect(res.artifacts).toHaveLength(1);
    expect(res.reply).toBe("Generé «N».");
    expect(send.mock.calls.some((c) => String(c[0]).includes("cubre UN artefacto"))).toBe(true);
  });
});

/**
 * Bucle con recuperación por partes y human-in-the-loop (spec 005, E29–E32).
 *
 * El caso que motivó esto: los artefactos se armaban con lo que el humano hubiera
 * pineado a mano (10 vistas de 50 posibles) y nadie se enteraba de qué quedó
 * afuera. Acá el agente lee lo que necesita y el humano decide antes de generar.
 */
describe("runLitertAgent — contexto por partes + human-in-the-loop", () => {
  const nodo = (nombre: string, tipo = "Evento") => ({
    id: nombre.toLowerCase().replace(/\s+/g, "-"),
    nombre,
    tipo_elemento: tipo,
    descripcion: "",
    estado_comparativo: "nuevo" as const,
  });
  const grafo = (nodos: ReturnType<typeof nodo>[]) =>
    ({
      nombre_proyecto: "P",
      version: "1.0.0",
      fecha_analisis: "2026-08-18",
      big_picture: { descripcion: "d", hotspots: [], nodos, aristas: [] },
      agregados: [],
    }) as any;
  const catalog = {
    views: [
      { name: "Pagos", notation: "ddd", kind: "graph" as const, graph: grafo([nodo("Cobrar prima", "Comando")]) },
      { name: "Pedidos", notation: "ddd", kind: "graph" as const, graph: grafo([nodo("Crear pedido", "Comando")]) },
    ],
  };
  const PLAN = JSON.stringify({
    thought: "ya leí lo necesario",
    plan: {
      title: "Drivers de arquitectura",
      artifactKind: "drivers",
      sections: [{ title: "Rendimiento", sources: ["Pagos"] }],
    },
  });

  it("explora las vistas y se detiene con el plan, sin generar nada", async () => {
    scriptConvo([
      '{"thought":"veo qué hay","action":"list_views","args":{}}',
      '{"thought":"leo pagos","action":"read_view","args":{"name":"Pagos"}}',
      '{"thought":"leo pedidos","action":"read_view","args":{"name":"Pedidos"}}',
      PLAN,
    ]);
    const res = await runLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog,
    });
    expect(res.artifacts).toHaveLength(0); // nada al lienzo sin aprobación
    expect(res.run?.pause?.kind).toBe("plan");
    expect(res.run?.read).toEqual(["Pagos", "Pedidos"]);
    // 3 pasos de lectura: el inventario y las dos vistas (se distinguen por `tool`).
    expect(res.steps.filter((s) => s.type === "read")).toHaveLength(3);
    expect(res.steps.filter((s) => s.tool === "read_view")).toHaveLength(2);
    expect(res.steps.find((s) => s.tool === "read_view")?.source).toBe("Pagos");
    expect(res.steps.some((s) => s.type === "plan")).toBe(true);
    expect(res.reply).toContain("Drivers de arquitectura");
  });

  it("no genera sin plan: la observación se lo exige", async () => {
    scriptConvo([
      '{"thought":"voy directo","action":"generate_document","args":{"kind":"drivers","title":"Drivers"}}',
      PLAN,
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    expect(res.artifacts).toHaveLength(0);
    expect(res.run?.pause?.kind).toBe("plan");
  });

  it("aprobar el plan genera el artefacto, con cobertura declarada", async () => {
    // 1) corrida hasta el plan
    scriptConvo([
      '{"thought":"leo","action":"read_view","args":{"name":"Pagos"}}',
      PLAN,
    ]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    expect(parada.run?.pause?.kind).toBe("plan");

    // 2) reanudación tras aprobar
    scriptConvo([
      '{"thought":"genero","action":"generate_document","args":{"kind":"drivers","title":"Drivers"}}',
      '{"final":"Listo, drivers en el lienzo."}',
    ]);
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog,
      run: parada.run!,
      resume: { kind: "approve" },
    });
    expect(res.artifacts).toHaveLength(1);
    const md = (res.artifacts[0].payload as { markdown: string }).markdown;
    expect(md).toContain("## Cobertura");
    expect(md).toContain("Revisado: Pagos");
    expect(md).toContain("Sin revisar: Pedidos");
    expect(res.steps.some((s) => s.type === "decision")).toBe(true);
    expect(res.steps.some((s) => s.type === "consolidate")).toBe(true);
    expect(res.run?.pause).toBeUndefined();
  });

  it("ajustar el plan no pierde lo leído", async () => {
    scriptConvo(['{"thought":"leo","action":"read_view","args":{"name":"Pagos"}}', PLAN]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });

    scriptConvo([PLAN]); // el modelo replantea y vuelve a pedir aprobación
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog,
      run: parada.run!,
      resume: { kind: "adjust", feedback: "faltan las restricciones" },
    });
    expect(res.run?.read).toEqual(["Pagos"]); // conserva la lectura
    expect(res.run?.notes).toHaveLength(1);
    expect(res.run?.pause?.kind).toBe("plan");
    expect(res.artifacts).toHaveLength(0);
  });

  it("cancelar no genera nada y deja el motivo", async () => {
    scriptConvo([PLAN]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog,
      run: parada.run!,
      resume: { kind: "cancel", reason: "me equivoqué de proyecto" },
    });
    expect(res.artifacts).toHaveLength(0);
    expect(res.run?.cancelledReason).toBe("me equivoqué de proyecto");
    expect(res.reply).toContain("me equivoqué de proyecto");
  });

  it("se detiene con una pregunta y la respuesta queda en la traza", async () => {
    scriptConvo([
      '{"thought":"dudo","question":{"id":"dup-cobro","text":"¿«Cobro» y «Pago» son lo mismo?","options":["Sí","No"]}}',
    ]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    expect(parada.run?.pause?.kind).toBe("question");
    expect(parada.reply).toContain("¿«Cobro»");

    scriptConvo([PLAN]);
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog,
      run: parada.run!,
      resume: { kind: "answer", answer: "No" },
    });
    expect(res.run?.decisions).toEqual([
      { questionId: "dup-cobro", question: "¿«Cobro» y «Pago» son lo mismo?", answer: "No" },
    ]);
    expect(res.steps.some((s) => s.type === "decision" && s.content.includes("No"))).toBe(true);
  });

  it("un plan que cita una vista inexistente se corrige sin molestar al humano", async () => {
    scriptConvo([
      JSON.stringify({
        plan: { title: "X", artifactKind: "drivers", sections: [{ title: "S", sources: ["Ventas"] }] },
      }),
      PLAN,
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    // El primer plan se rechazó; el humano recibe el SEGUNDO.
    expect((res.run?.pause as { title: string }).title).toBe("Drivers de arquitectura");
  });

  it("al agotar los turnos consolida en vez de cerrar con las manos vacías", async () => {
    // Sólo pide lecturas, para siempre: el bucle debe cortar y consolidar.
    scriptConvo(['{"thought":"otra vez","action":"read_view","args":{"name":"Pagos"}}']);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    expect(parada.artifacts).toHaveLength(0); // sin plan aprobado no se genera

    // Con el plan ya aprobado, el agotamiento SÍ consolida.
    scriptConvo(['{"thought":"leo y leo","action":"read_view","args":{"name":"Pedidos"}}']);
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog,
      run: { ...parada.run!, plan: { kind: "plan", title: "Drivers", artifactKind: "drivers", sections: [{ title: "S", sources: ["Pagos"] }] }, planApproved: true, pause: undefined },
      resume: { kind: "approve" },
    });
    expect(res.artifacts).toHaveLength(1);
    expect((res.artifacts[0].payload as { markdown: string }).markdown).toContain("## Cobertura");
  });

  const ROTO = `{"thought":"He leído el 'Modelo' (c4) y he identificado los actores (ej. "Publica productos", "Busca productos").","action":"read_view","args":{"name":"Pagos"}}`;

  it("un turno de protocolo con comillas sin escapar se rescata: lee y sigue", async () => {
    // El caso de la captura: JSON.parse falla, pero la acción se rescata.
    scriptConvo([ROTO, PLAN]);
    const res = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    expect(res.run?.read).toEqual(["Pagos"]);
    expect(res.run?.pause?.kind).toBe("plan");
    // Y sobre todo: el JSON del protocolo NO se le muestra al usuario.
    expect(res.reply).not.toContain('"action"');
    expect(res.reply).not.toContain("thought");
  });

  it("un turno irrecuperable se le pide de nuevo, no se imprime", async () => {
    // Ni parsea ni tiene acción rescatable, pero es protocolo (trae "action":).
    scriptConvo(['{"thought":"roto", "action":}']);
    const res = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    expect(res.reply).not.toContain("thought");
    expect(res.reply).toMatch(/formato inválido/);
  });

  it("prosa suelta sigue mostrándose tal cual (no es protocolo)", async () => {
    scriptConvo(["No hay suficiente información en el proyecto."]);
    const res = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    expect(res.reply).toBe("No hay suficiente información en el proyecto.");
  });

  it("una cita a una fuente que nunca se leyó no sobrevive", async () => {
    mockGen.mockResolvedValue("Latencia baja.\n  ↳ Ventas › Facturar");
    scriptConvo([PLAN]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog });
    scriptConvo([
      '{"action":"generate_document","args":{"kind":"drivers","title":"Drivers"}}',
      '{"final":"listo"}',
    ]);
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog,
      run: parada.run!,
      resume: { kind: "approve" },
    });
    const md = (res.artifacts[0].payload as { markdown: string }).markdown;
    expect(md).not.toContain("Ventas");
    expect(md).toContain("Latencia baja.");
  });
});

describe("runLitertAgent — lectura en lote (menos turnos)", () => {
  const nodo2 = (nombre: string) => ({
    id: nombre.toLowerCase().replace(/\s+/g, "-"),
    nombre,
    tipo_elemento: "Evento",
    descripcion: "",
    estado_comparativo: "nuevo" as const,
  });
  const grafo2 = (nombres: string[]) =>
    ({
      nombre_proyecto: "P",
      version: "1.0.0",
      fecha_analisis: "2026-08-18",
      big_picture: { descripcion: "", hotspots: [], nodos: nombres.map(nodo2), aristas: [] },
      agregados: [],
    }) as any;
  const cat3 = {
    views: [
      { name: "DDD · Dominio", notation: "ddd", kind: "graph" as const, graph: grafo2(["Producto creado"]) },
      { name: "C4 N2 · Contenedores", notation: "c4", kind: "graph" as const, graph: grafo2(["API"]) },
      { name: "BPMN · Gestión", notation: "bpmn", kind: "graph" as const, graph: grafo2(["Alta de producto"]) },
    ],
  };

  it("un solo turno cubre las tres vistas y habilita el plan", async () => {
    scriptConvo([
      '{"thought":"leo todo","action":"read_views","args":{"names":["DDD · Dominio","C4 N2 · Contenedores","BPMN · Gestión"]}}',
      JSON.stringify({
        thought: "listo",
        plan: {
          title: "Drivers",
          artifactKind: "drivers",
          sections: [
            { title: "Dominio", sources: ["DDD · Dominio"] },
            { title: "Arquitectura", sources: ["C4 N2 · Contenedores"] },
            { title: "Procesos", sources: ["BPMN · Gestión"] },
          ],
        },
      }),
    ]);
    const res = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog: cat3 });
    expect(res.run?.read).toEqual(["DDD · Dominio", "C4 N2 · Contenedores", "BPMN · Gestión"]);
    // Dos turnos: uno para leer las tres, otro para el plan.
    expect(res.steps.filter((s) => s.type === "read")).toHaveLength(1);
    expect(res.run?.pause?.kind).toBe("plan");
  });
});

describe("runLitertAgent — el cierre degenerado no llega al chat", () => {
  it("con el artefacto ya generado, el resumen lo escribe el código", async () => {
    const catalog2 = {
      views: [
        {
          name: "Pagos",
          notation: "ddd",
          kind: "graph" as const,
          graph: {
            nombre_proyecto: "P",
            version: "1.0.0",
            fecha_analisis: "2026-08-18",
            big_picture: { descripcion: "", hotspots: [], nodos: [{ id: "a", nombre: "Cobrar", tipo_elemento: "Comando", descripcion: "", estado_comparativo: "nuevo" }], aristas: [] },
            agregados: [],
          } as any,
        },
      ],
    };
    scriptConvo([
      '{"thought":"leo","action":"read_view","args":{"name":"Pagos"}}',
      JSON.stringify({ plan: { title: "Drivers", artifactKind: "drivers", sections: [{ title: "S", sources: ["Pagos"] }] } }),
    ]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog: catalog2 });

    scriptConvo([
      '{"action":"generate_document","args":{"kind":"drivers","title":"Drivers"}}',
      // Cierre degenerado, tal cual salió en la app.
      '{"description":"…","status":"تم","details":"تحديد المتطلبات الأساسية للمشروع"}',
    ]);
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog: catalog2,
      run: parada.run!,
      resume: { kind: "approve" },
    });
    expect(res.artifacts).toHaveLength(1);
    expect(res.reply).toContain("Drivers");
    expect(res.reply).toContain("Pagos"); // dice de dónde salió
    expect(res.reply).not.toContain("status");
    expect(res.reply).not.toMatch(/[؀-ۿ]/); // ni un carácter del descarte
  });
});

describe("runLitertAgent — el artefacto declara si no es auditable", () => {
  const cat4 = {
    views: [
      {
        name: "Pagos",
        notation: "ddd",
        kind: "graph" as const,
        graph: {
          nombre_proyecto: "P",
          version: "1.0.0",
          fecha_analisis: "2026-08-18",
          big_picture: {
            descripcion: "",
            hotspots: [],
            nodos: [{ id: "a", nombre: "Cobrar prima", tipo_elemento: "Comando", descripcion: "", estado_comparativo: "nuevo" }],
            aristas: [],
          },
          agregados: [],
        } as any,
      },
    ],
  };
  const PLAN4 = JSON.stringify({
    plan: { title: "Drivers", artifactKind: "drivers", sections: [{ title: "S", sources: ["Pagos"] }] },
  });

  const generar = async (markdown: string) => {
    scriptConvo(['{"action":"read_view","args":{"name":"Pagos"}}', PLAN4]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog: cat4 });
    mockGen.mockResolvedValue(markdown);
    scriptConvo(['{"action":"generate_document","args":{"kind":"drivers","title":"Drivers"}}', '{"final":"listo"}']);
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog: cat4,
      run: parada.run!,
      resume: { kind: "approve" },
    });
    return (res.artifacts[0].payload as { markdown: string }).markdown;
  };

  it("sin citas, la cobertura lo advierte en vez de disimularlo", async () => {
    const md = await generar("## Drivers\n- El sistema debe ser escalable.");
    expect(md).toContain("## Cobertura");
    expect(md).toMatch(/no citó el origen/);
  });

  it("con citas válidas no hay advertencia", async () => {
    const md = await generar("## Drivers\n- Cobro en línea.\n  ↳ Pagos › Cobrar prima");
    expect(md).toContain("↳ Pagos › Cobrar prima");
    expect(md).not.toMatch(/no citó el origen/);
  });
});

/**
 * Pedido EXPLÍCITO del menú «+» del chat. Nació de un caso real: «Identifica
 * riesgos y restricciones» no tiene verbo de generación, así que el gate de
 * intención mandaba la corrida a la ruta conversacional y nunca había artefacto.
 */
describe("runLitertAgent — artefacto pedido con el «+»", () => {
  const catalog = {
    views: [
      {
        name: "Pagos",
        notation: "ddd",
        kind: "graph" as const,
        graph: {
          nombre_proyecto: "P",
          version: "1.0.0",
          fecha_analisis: "2026-08-18",
          big_picture: {
            descripcion: "d",
            hotspots: [],
            nodos: [
              {
                id: "cobrar",
                nombre: "Cobrar prima",
                tipo_elemento: "Comando",
                descripcion: "",
                estado_comparativo: "nuevo" as const,
              },
            ],
            aristas: [],
          },
          agregados: [],
        } as any,
      },
    ],
  };

  it("con requestedKind entra al bucle ReAct aunque la frase no pida generar", async () => {
    const send = scriptConvo([
      '{"thought":"leo pagos","action":"read_view","args":{"name":"Pagos"}}',
      JSON.stringify({
        thought: "listo",
        plan: {
          title: "Riesgos y Restricciones",
          artifactKind: "constraints",
          sections: [{ title: "Riesgos", sources: ["Pagos"] }],
        },
      }),
    ]);
    const res = await runLitertAgent({
      modelFile: "m",
      message: "Identifica riesgos y restricciones",
      requestedKind: "constraints",
      catalog,
    });
    // No conversó: exploró y se detuvo en el plan (el checkpoint del humano).
    expect(res.run?.pause?.kind).toBe("plan");
    // La orden viaja en el primer mensaje, con kind y herramienta exactos.
    const primerEnvio = send.mock.calls[0][0] as string;
    expect(primerEnvio).toContain('"kind":"constraints"');
    expect(primerEnvio).toContain("generate_document");
    expect(primerEnvio).toContain("Identifica riesgos y restricciones");
  });

  it("sin requestedKind, la misma frase sólo conversa", async () => {
    scriptConvo(["Los riesgos principales son…"]);
    const res = await runLitertAgent({
      modelFile: "m",
      message: "Identifica riesgos y restricciones",
      catalog,
    });
    expect(res.run).toBeUndefined(); // no hubo corrida: fue charla
    expect(res.artifacts).toHaveLength(0);
  });

  it("el pedido de un diagrama usa la herramienta de diagramas", async () => {
    const send = scriptConvo(['{"thought":"leo","action":"read_view","args":{"name":"Pagos"}}']);
    await runLitertAgent({
      modelFile: "m",
      message: "",
      requestedKind: "c4-container",
      catalog,
    });
    expect(send.mock.calls[0][0] as string).toContain("generate_diagram");
  });
});

/**
 * Turnos con comillas sueltas dentro de los textos: el fallo repetido del modelo
 * local. Antes moría en «formato inválido tres veces» con cualquier forma que el
 * rescate por clave no supiera reconstruir (el plan, sobre todo).
 */
describe("runLitertAgent — JSON con comillas sueltas y plan de rescate", () => {
  const catalog = {
    views: [
      {
        name: "Pagos",
        notation: "ddd",
        kind: "graph" as const,
        graph: {
          nombre_proyecto: "P",
          version: "1.0.0",
          fecha_analisis: "2026-08-18",
          big_picture: {
            descripcion: "d",
            hotspots: [],
            nodos: [
              {
                id: "cobrar",
                nombre: "Cobrar prima",
                tipo_elemento: "Comando",
                descripcion: "",
                estado_comparativo: "nuevo" as const,
              },
            ],
            aristas: [],
          },
          agregados: [],
        } as any,
      },
    ],
  };

  it("un plan con comillas sin escapar se sanea y vale como plan", async () => {
    scriptConvo([
      '{"thought":"leo","action":"read_view","args":{"name":"Pagos"}}',
      // El modelo cita la vista con comillas dobles dentro del string:
      '{"thought":"la vista "Pagos" alcanza","plan":{"title":"Propuesta tecnica","artifactKind":"proposal","sections":[{"title":"Contexto","sources":["Pagos"]}]}}',
    ]);
    const res = await runLitertAgent({
      modelFile: "m",
      message: "generá la propuesta técnica",
      catalog,
    });
    expect(res.run?.pause?.kind).toBe("plan");
    expect(res.run?.plan?.title).toBe("Propuesta tecnica");
  });

  it("tres turnos irrecuperables ⇒ propone un plan armado con lo leído", async () => {
    // 1ª: lee. 2ª-4ª: protocolo roto de forma no saneable (llave sin cerrar).
    const roto = '{"thought":"pienso","plan":{"title":"X","sections":[{"title":"A","sources":[';
    scriptConvo([
      '{"thought":"leo","action":"read_view","args":{"name":"Pagos"}}',
      roto,
      roto,
      roto,
    ]);
    const res = await runLitertAgent({
      modelFile: "m",
      message: "generá la propuesta técnica",
      catalog,
    });
    // No es calle sin salida: hay plan para aprobar, con la vista realmente leída.
    expect(res.run?.pause?.kind).toBe("plan");
    expect(res.run?.plan?.sections.flatMap((s) => s.sources)).toEqual(["Pagos"]);
    expect(res.reply).toContain("Pagos");
  });

  it("si no leyó nada, avisa en vez de inventar un plan", async () => {
    const roto = '{"thought":"pienso","plan":{"title":"X","sections":[{"title":"A","sources":[';
    scriptConvo([roto, roto, roto]);
    const res = await runLitertAgent({
      modelFile: "m",
      message: "generá la propuesta técnica",
      catalog,
    });
    expect(res.run?.pause).toBeUndefined();
    expect(res.reply).toContain("no había leído nada");
  });
});

describe("runLitertAgent — un plan aprobado autoriza UN artefacto", () => {
  const cat5 = {
    views: [
      {
        name: "Modelo",
        notation: "c4",
        kind: "graph" as const,
        graph: {
          nombre_proyecto: "P",
          version: "1.0.0",
          fecha_analisis: "2026-08-18",
          big_picture: {
            descripcion: "",
            hotspots: [],
            nodos: [{ id: "a", nombre: "Cobrar", tipo_elemento: "Comando", descripcion: "", estado_comparativo: "nuevo" }],
            aristas: [],
          },
          agregados: [],
        } as any,
      },
    ],
  };
  const PLAN5 = JSON.stringify({
    plan: { title: "Drivers", artifactKind: "drivers", sections: [{ title: "S", sources: ["Modelo"] }] },
  });

  it("la segunda generación se rechaza con observación, no sale un segundo artefacto", async () => {
    scriptConvo(['{"action":"read_view","args":{"name":"Modelo"}}', PLAN5]);
    const parada = await runLitertAgent({ modelFile: "m", message: "generá los drivers", catalog: cat5 });
    mockGen.mockResolvedValue("# Doc");
    const send = scriptConvo([
      '{"action":"generate_document","args":{"kind":"drivers","title":"Drivers"}}',
      '{"action":"generate_document","args":{"kind":"nfr","title":"NFRs"}}',
      '{"final":"listo"}',
    ]);
    const res = await resumeLitertAgent({
      modelFile: "m",
      message: "generá los drivers",
      catalog: cat5,
      run: parada.run!,
      resume: { kind: "approve" },
    });
    expect(res.artifacts).toHaveLength(1);
    expect(res.artifacts[0].title).toBe("Drivers");
    // El rechazo llega como observación y empuja al cierre: no corta la corrida.
    const enviados = send.mock.calls.map((c) => String(c[0]));
    expect(enviados.some((o) => o.includes("cubre UN artefacto"))).toBe(true);
    expect(res.reply).toBe("listo");
  });
});
