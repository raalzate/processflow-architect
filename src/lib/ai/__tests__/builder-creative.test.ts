import { describe, it, expect, vi } from "vitest";
import {
  runCreative,
  recortarSiNoEntra,
  contextoMermaid,
  cuantosElementos,
  quitarContenedoresVacios,
} from "../builder-creative";
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

const CON_VACIO = [
  "flowchart LR",
  '  subgraph vacio["Sistema Pedido<br><i>Límite de Sistema</i>"]',
  "  end",
  '  subgraph lleno["API Gateway<br><i>Límite de Sistema</i>"]',
  '    api["Servicio API<br><i>Componente</i>"]',
  "  end",
  '  db[("PostgreSQL<br><i>Base de Datos</i>")]',
  '  api -->|"guarda"| db',
].join("\n");

describe("quitarContenedoresVacios · fuera las bandas fantasma", () => {
  it("quita el contenedor sin hijos y conserva el que tiene elementos", () => {
    const { model } = fromMermaid(CON_VACIO, "c4");
    const r = quitarContenedoresVacios(model);
    expect(r.quitados).toContain("Sistema Pedido");
    expect(r.model.nodes.some((n) => n.nombre === "Sistema Pedido")).toBe(false);
    expect(r.model.nodes.some((n) => n.nombre === "API Gateway")).toBe(true);
    expect(r.model.nodes.some((n) => n.nombre === "Servicio API")).toBe(true);
  });

  it("no toca nada cuando todos los contenedores tienen hijos", () => {
    const { model } = fromMermaid(MVC, "c4");
    const r = quitarContenedoresVacios(model);
    expect(r.quitados).toHaveLength(0);
    expect(r.model).toBe(model);
  });
});

describe("el modo creativo NO publica en silencio (surface de avisos)", () => {
  it("avisa que quitó el contenedor vacío que dejó el modelo", async () => {
    const generar = vi.fn().mockResolvedValue(CON_VACIO);
    const aplicar = vi.fn().mockResolvedValue({ ok: true, texto: "Vista reemplazada." });
    const r = await runCreative({ pedido: "un sistema con API", vista: vistaVacia }, { generar, aplicar });
    expect(r.kind).toBe("listo");
    expect(r.kind === "listo" && r.reply).toMatch(/contenedor\(es\) vac[ií]o\(s\)/);
    expect(r.kind === "listo" && r.reply).toContain("Sistema Pedido");
    // Y no se publica el contenedor vacío.
    const graphPublicado = aplicar.mock.calls[0][0] as GraphData;
    const nombres = (graphPublicado.agregados ?? []).map((a: any) => a.nombre_agregado);
    expect(nombres).not.toContain("Sistema Pedido");
  });

  it("muestra el aviso de un nombre que se recortará en el lienzo", async () => {
    const largo = "Servicio de Procesamiento de Pedidos y Notificaciones al Cliente Final";
    const conNombreLargo = [
      "flowchart LR",
      `  a["${largo}<br><i>Componente</i>"]`,
      '  b["Base<br><i>Base de Datos</i>"]',
      '  a -->|"guarda"| b',
    ].join("\n");
    const generar = vi.fn().mockResolvedValue(conNombreLargo);
    const aplicar = vi.fn().mockResolvedValue({ ok: true, texto: "Vista reemplazada." });
    const r = await runCreative({ pedido: "algo", vista: vistaVacia }, { generar, aplicar });
    expect(r.kind === "listo" && r.reply).toContain("se recortará");
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

/**
 * El DESTINO (#431): «una nueva vista» publicaba sobre la activa y pedía permiso
 * para pisar «Modelo». Una pestaña nueva no pisa nada; otra vista nombrada sí.
 */
describe("runCreative · el destino del pedido (#431)", () => {
  const conModelo = { ...vistaVacia, nombre: "Modelo", graph: conContenido() };

  it("pestaña nueva: se crea SIN confirmar aunque la activa tenga contenido", async () => {
    const aplicar = vi.fn();
    const crear = vi.fn().mockResolvedValue({ ok: true, texto: "Vista creada." });
    const r = await runCreative(
      { pedido: "una nueva vista sobre hexagonal", vista: conModelo, destino: { kind: "nueva", nombre: "Hexagonal" } },
      { generar: async () => MVC, aplicar, crear }
    );
    expect(r.kind).toBe("listo");
    expect(aplicar).not.toHaveBeenCalled();
    expect(crear).toHaveBeenCalledTimes(1);
    expect(crear.mock.calls[0][0]).toBe("Hexagonal");
    expect(r.kind === "listo" && r.nueva && r.vista).toBe("Hexagonal");
    expect(r.kind === "listo" && r.reply).toContain('la pestaña nueva "Hexagonal"');
  });

  it("pestaña nueva: el contenido de la activa NO es contexto (no se extiende «Modelo»)", async () => {
    const generar = vi.fn().mockResolvedValue(MVC);
    await runCreative(
      { pedido: "x", vista: conModelo, destino: { kind: "nueva", nombre: "Otra" } },
      { generar, aplicar: vi.fn(), crear: async () => ({ ok: true, texto: "ok" }) }
    );
    expect(generar.mock.calls[0][0].existente).toBeUndefined();
  });

  it("pestaña nueva sin `crear`: error, y nada se publica en la activa", async () => {
    const aplicar = vi.fn();
    const generar = vi.fn();
    const r = await runCreative(
      { pedido: "x", vista: conModelo, destino: { kind: "nueva", nombre: "Otra" } },
      { generar, aplicar }
    );
    expect(r.kind).toBe("error");
    expect(generar).not.toHaveBeenCalled();
    expect(aplicar).not.toHaveBeenCalled();
  });

  it("otra vista nombrada: se confirma SIEMPRE, apuntando a esa vista", async () => {
    const aplicar = vi.fn();
    const r = await runCreative(
      { pedido: "x", vista: vistaVacia, destino: { kind: "vista", nombre: "Pagos" } },
      { generar: async () => MVC, aplicar }
    );
    expect(r.kind).toBe("confirmar");
    expect(r.kind === "confirmar" && r.vista).toBe("Pagos");
    expect(r.kind === "confirmar" && r.texto).toContain('"Pagos"');
    expect(aplicar).not.toHaveBeenCalled();
  });

  it("«en la vista Modelo» siendo Modelo la activa: como la activa", async () => {
    const aplicar = vi.fn().mockResolvedValue({ ok: true, texto: "ok" });
    const r = await runCreative(
      { pedido: "x", vista: { ...vistaVacia, nombre: "Modelo" }, destino: { kind: "vista", nombre: "modelo" } },
      { generar: async () => MVC, aplicar }
    );
    // Vacía: se publica sin preguntar, y en la vista de nombre «Modelo».
    expect(r.kind).toBe("listo");
    expect(aplicar.mock.calls[0][1]).toBe("modelo");
  });

  it("sin destino, `aplicar` recibe la vista activa", async () => {
    const aplicar = vi.fn().mockResolvedValue({ ok: true, texto: "ok" });
    await runCreative({ pedido: "x", vista: vistaVacia }, { generar: async () => MVC, aplicar });
    expect(aplicar.mock.calls[0][1]).toBe("Vista");
  });
});
