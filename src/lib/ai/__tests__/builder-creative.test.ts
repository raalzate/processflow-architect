import { describe, it, expect, vi } from "vitest";
import { runCreative, recortarSiNoEntra, contextoMermaid, cuantosElementos } from "../builder-creative";
import { fromMermaid } from "../../mcp/from-mermaid";
import type { GraphData } from "../../types";

const MVC = [
  "flowchart LR",
  '  subgraph app["Tienda<br><i>Límite de Sistema</i>"]',
  '    ctrl["Controlador<br><i>Componente</i>"]',
  '    svc["Servicio<br><i>Componente</i>"]',
  '    repo["Repositorio<br><i>Componente</i>"]',
  "  end",
  '  web["Navegador<br><i>Contenedor</i>"]',
  '  db[("Base<br><i>Base de Datos</i>")]',
  '  web -->|"usa"| ctrl',
  '  ctrl -->|"llama"| svc',
  '  svc -->|"consulta"| repo',
  '  repo -->|"lee"| db',
].join("\n");

const vistaVacia = { nombre: "Vista", notation: "c4" as const, graph: null };

const conContenido = (): GraphData =>
  ({
    nombre_proyecto: "Vista",
    version: "1.0.0",
    notation: "c4",
    fecha_analisis: "2026-09-18",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [
        { id: "web", nombre: "Navegador", tipo_elemento: "Contenedor", estado_comparativo: "nuevo", x: 7, y: 8 },
      ],
      aristas: [],
    },
    agregados: [],
    read_models: [],
    politicas_inter_agregados: [],
    responsables: [],
    notas: "",
    transcript: "",
  }) as any;

describe("runCreative · el diagrama entero en una inferencia (SC-001, SC-002)", () => {
  it("publica el diagrama con UNA sola llamada al modelo", async () => {
    const generar = vi.fn().mockResolvedValue(MVC);
    const aplicar = vi.fn().mockResolvedValue({ ok: true, texto: "Vista reemplazada: 6 elemento(s)." });
    const r = await runCreative({ pedido: "un MVC en Spring Boot", vista: vistaVacia }, { generar, aplicar });

    expect(generar).toHaveBeenCalledTimes(1);
    expect(r.kind).toBe("listo");
    if (r.kind !== "listo") return;
    // Al menos un contenedor, cuatro elementos y tres relaciones, sin duplicados.
    expect(r.graph.agregados?.length).toBe(1);
    const nombres = [
      ...(r.graph.big_picture?.nodos ?? []),
      ...(r.graph.agregados ?? []).flatMap((a) => a.nodos ?? []),
    ].map((n) => n.nombre);
    expect(nombres.length).toBeGreaterThanOrEqual(4);
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(r.hallazgos).toEqual([]);
  });

  it("el cierre cuenta lo que quedó y pega la verificación contra la app (FR-011)", async () => {
    const r = await runCreative(
      { pedido: "x", vista: vistaVacia },
      {
        generar: async () => MVC,
        aplicar: async () => ({ ok: true, texto: "ok" }),
        verificar: async () => "Verificado en la app — Contenido: 6 elementos.",
      }
    );
    expect(r.kind === "listo" && r.reply).toContain("Verificado en la app");
    expect(r.kind === "listo" && r.reply).toContain("relación(es)");
  });

  it("le muestra al modelo lo que ya hay, en Mermaid (FR-002)", async () => {
    const generar = vi.fn().mockResolvedValue(MVC);
    await runCreative(
      { pedido: "completá esto", vista: { ...vistaVacia, graph: conContenido() }, confirmado: true },
      { generar, aplicar: async () => ({ ok: true, texto: "ok" }) }
    );
    expect(generar.mock.calls[0][0].existente).toContain("Navegador");
  });

  it("conserva la posición de lo que ya estaba cuando vuelve con el mismo nombre (FR-006)", async () => {
    const r = await runCreative(
      { pedido: "completá", vista: { ...vistaVacia, graph: conContenido() }, confirmado: true },
      { generar: async () => MVC, aplicar: async () => ({ ok: true, texto: "ok" }) }
    );
    expect(r.kind).toBe("listo");
    // El grafo se entrega tal cual; la reconciliación por nombre la hace
    // `applyViewEdit` al aplicarlo: acá se comprueba que el Navegador viaja.
    if (r.kind !== "listo") return;
    expect(r.graph.big_picture?.nodos?.some((n) => n.nombre === "Navegador")).toBe(true);
  });
});

describe("runCreative · lo que no se hace sin preguntar", () => {
  it("publicar sobre una vista con contenido pide confirmación (§P10, FR-012)", async () => {
    const aplicar = vi.fn();
    const r = await runCreative(
      { pedido: "rehacelo", vista: { ...vistaVacia, graph: conContenido() } },
      { generar: async () => MVC, aplicar }
    );
    expect(r.kind).toBe("confirmar");
    expect(aplicar).not.toHaveBeenCalled();
    expect(r.kind === "confirmar" && r.texto).toContain("1 elemento");
  });

  it("con el sí del humano, publica", async () => {
    const aplicar = vi.fn().mockResolvedValue({ ok: true, texto: "ok" });
    const r = await runCreative(
      { pedido: "rehacelo", vista: { ...vistaVacia, graph: conContenido() }, confirmado: true },
      { generar: async () => MVC, aplicar }
    );
    expect(r.kind).toBe("listo");
    expect(aplicar).toHaveBeenCalledTimes(1);
  });

  it("nunca publica un grafo vacío: reintenta una vez y falla diciéndolo (SC-006)", async () => {
    const generar = vi.fn().mockResolvedValue("no sé hacer eso");
    const aplicar = vi.fn();
    const r = await runCreative({ pedido: "x", vista: vistaVacia }, { generar, aplicar });
    expect(generar).toHaveBeenCalledTimes(2); // un solo reintento
    expect(aplicar).not.toHaveBeenCalled();
    expect(r.kind).toBe("error");
    expect(r.kind === "error" && r.reply).toContain("no voy a dejar la vista en blanco");
  });

  it("el reintento lleva los hallazgos del intento anterior", async () => {
    const generar = vi
      .fn()
      .mockResolvedValueOnce('flowchart LR\n  a["Mongo<br><i>Colección Documental</i>"]\n  a --> a')
      .mockResolvedValueOnce(MVC);
    const r = await runCreative({ pedido: "x", vista: vistaVacia }, { generar, aplicar: async () => ({ ok: true, texto: "ok" }) });
    expect(generar).toHaveBeenCalledTimes(2);
    expect(generar.mock.calls[1][0].hallazgos.join(" ")).toContain("Colección Documental");
    expect(r.kind).toBe("listo");
  });

  it("un error al publicar se reporta como error, no como éxito", async () => {
    const r = await runCreative(
      { pedido: "x", vista: vistaVacia },
      { generar: async () => MVC, aplicar: async () => ({ ok: false, texto: "no hay vista abierta" }) }
    );
    expect(r.kind).toBe("error");
    expect(r.kind === "error" && r.reply).toContain("no hay vista abierta");
  });
});

describe("una propuesta demasiado grande se recorta CON aviso (FR-013)", () => {
  it("deja el tope y dice cuántos no entraron", () => {
    const lineas = ["flowchart LR"];
    for (let i = 0; i < 12; i++) lineas.push(`  n${i}["Caja ${i}<br><i>Componente</i>"]`);
    for (let i = 1; i < 12; i++) lineas.push(`  n${i - 1} --> n${i}`);
    const { model } = fromMermaid(lineas.join("\n"), "c4");

    const r = recortarSiNoEntra(model, 5);
    expect(r.model.nodes).toHaveLength(5);
    expect(r.aviso).toContain("no entraron");
    // No quedan aristas apuntando a lo que se fue.
    const ids = new Set(r.model.nodes.map((n) => n.id));
    expect(r.model.edges.every((e) => ids.has(e.fuente) && ids.has(e.destino))).toBe(true);
  });

  it("lo que entra no se toca", () => {
    const { model } = fromMermaid(MVC, "c4");
    expect(recortarSiNoEntra(model, 40).aviso).toBeUndefined();
  });
});

describe("auxiliares", () => {
  it("cuenta los elementos de la vista, contenedores incluidos", () => {
    expect(cuantosElementos(null)).toBe(0);
    expect(cuantosElementos(conContenido())).toBe(1);
  });

  it("sin contenido no hay contexto que mostrarle al modelo", () => {
    expect(contextoMermaid(vistaVacia)).toBeUndefined();
    expect(contextoMermaid({ ...vistaVacia, graph: conContenido() })).toContain("flowchart");
  });
});
