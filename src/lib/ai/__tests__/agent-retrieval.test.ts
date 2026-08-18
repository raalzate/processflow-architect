/**
 * Herramientas de lectura del agente (spec 005, escenarios E1–E12 de testify).
 *
 * Lo que estas pruebas protegen: que el agente pueda descubrir el dominio SIN
 * que el humano pinee vistas a mano, sin gastar presupuesto en vistas vacías o
 * ya leídas, y con errores que se puedan corregir en el turno siguiente.
 */
import { describe, it, expect } from "vitest";
import {
  listViews,
  formatInventory,
  readView,
  searchModel,
  resolveViewName,
  normalizeName,
  VIEW_READ_MAX,
  type Catalog,
  type ViewEntry,
} from "../agent-retrieval";
import type { GraphData } from "@/lib/types";

const nodo = (nombre: string, tipo = "Evento", descripcion = "") => ({
  id: nombre.toLowerCase().replace(/\s+/g, "-"),
  nombre,
  tipo_elemento: tipo,
  descripcion,
  estado_comparativo: "nuevo" as const,
});

const grafo = (nodos: ReturnType<typeof nodo>[], contenedores: string[] = []): GraphData =>
  ({
    nombre_proyecto: "P",
    version: "1.0.0",
    fecha_analisis: "2026-08-18",
    big_picture: { descripcion: "d", hotspots: [], nodos, aristas: [] },
    agregados: contenedores.map((nombre) => ({
      nombre_agregado: nombre,
      entidad_raiz: nombre,
      descripcion: "",
      nodos: [],
      aristas: [],
    })),
  }) as unknown as GraphData;

const vista = (over: Partial<ViewEntry> & { name: string }): ViewEntry => ({
  notation: "ddd",
  kind: "graph",
  ...over,
});

const catalogo = (...views: ViewEntry[]): Catalog => ({ views });

describe("listViews · inventario sin contenido", () => {
  it("devuelve conteos y notación, sin el grafo", () => {
    const cat = catalogo(
      vista({ name: "Modelo", kind: "design", graph: grafo([nodo("A"), nodo("B")], ["Agg"]) }),
      vista({ name: "Pagos", notation: "bpmn", graph: grafo([nodo("Cobrar")]) })
    );
    const inv = listViews(cat);
    expect(inv).toEqual([
      { name: "Modelo", notation: "ddd", kind: "design", nodes: 2, edges: 0, empty: false, pinned: false },
      { name: "Pagos", notation: "bpmn", kind: "graph", nodes: 1, edges: 0, empty: false, pinned: false },
    ]);
    // El inventario NO puede filtrar el contenido: es lo que lo hace barato.
    expect(JSON.stringify(inv)).not.toContain("Cobrar");
  });

  it("marca las vistas vacías", () => {
    const inv = listViews(catalogo(vista({ name: "Nueva", graph: grafo([]) }), vista({ name: "Sin grafo" })));
    expect(inv.every((i) => i.empty)).toBe(true);
  });

  it("marca las vistas ya inyectadas a mano", () => {
    const inv = listViews(catalogo(vista({ name: "Pagos", pinned: true, graph: grafo([nodo("X")]) })));
    expect(inv[0].pinned).toBe(true);
  });

  it("una vista mermaid con código no está vacía", () => {
    const inv = listViews(catalogo(vista({ name: "Flujo", kind: "mermaid", mermaidCode: "graph TD\nA-->B" })));
    expect(inv[0].empty).toBe(false);
  });

  it("el inventario en texto nombra vacías y pineadas", () => {
    const txt = formatInventory(
      listViews(
        catalogo(
          vista({ name: "Vacía", graph: grafo([]) }),
          vista({ name: "Pagos", pinned: true, graph: grafo([nodo("X")]) })
        )
      )
    );
    expect(txt).toContain('"Vacía"');
    expect(txt).toContain("vacía");
    expect(txt).toContain("ya en contexto");
  });

  it("sin vistas lo dice en vez de devolver vacío mudo", () => {
    expect(formatInventory([])).toMatch(/No hay vistas/);
  });
});

describe("resolveViewName · el modelo escribe los nombres de memoria", () => {
  it("tolera acentos, mayúsculas y espacios", () => {
    const cat = catalogo(vista({ name: "Cotización · Póliza" }));
    expect(resolveViewName(cat, "cotizacion   poliza")).toEqual({ name: "Cotización · Póliza" });
    expect(normalizeName("Cotización · Póliza")).toBe("cotizacion poliza");
  });

  it("resuelve una abreviatura cuando es inequívoca", () => {
    const cat = catalogo(vista({ name: "Pagos · Cobro" }), vista({ name: "Pedidos" }));
    expect(resolveViewName(cat, "pagos")).toEqual({ name: "Pagos · Cobro" });
  });

  it("con varias candidatas devuelve las opciones en vez de elegir", () => {
    const cat = catalogo(vista({ name: "Pagos entrada" }), vista({ name: "Pagos salida" }));
    const r = resolveViewName(cat, "pagos");
    expect(r).toEqual({ suggestions: ["Pagos entrada", "Pagos salida"] });
  });

  it("una letra sobrante igual resuelve (el nombre contiene al real)", () => {
    const cat = catalogo(vista({ name: "Pagos" }), vista({ name: "Pedidos" }));
    expect(resolveViewName(cat, "Pagoss")).toEqual({ name: "Pagos" });
  });

  it("sin coincidencia devuelve sugerencias por cercanía", () => {
    const cat = catalogo(vista({ name: "Pagos" }), vista({ name: "Pedidos" }));
    const r = resolveViewName(cat, "Pagoz") as { suggestions: string[] };
    expect(r.suggestions).toContain("Pagos");
    expect(r.suggestions[0]).toBe("Pagos"); // el más cercano primero
  });

  it("un nombre vacío devuelve el listado completo como sugerencia", () => {
    const cat = catalogo(vista({ name: "Pagos" }), vista({ name: "Pedidos" }));
    expect(resolveViewName(cat, "")).toEqual({ suggestions: ["Pagos", "Pedidos"] });
  });
});

describe("readView · leer una vista", () => {
  const cat = catalogo(
    vista({ name: "Pagos", graph: grafo([nodo("Cobrar prima", "Comando"), nodo("Prima cobrada")], ["Cobro"]) }),
    vista({ name: "Flujo", kind: "mermaid", mermaidCode: "graph TD\nA-->B" })
  );

  it("devuelve TOON, nota atribuida y costo", () => {
    const r = readView(cat, "Pagos", 10_000);
    if (!r.ok) throw new Error("debía leer");
    expect(r.text).toContain("Cobrar prima");
    expect(r.cost).toBe(r.text.length);
    expect(r.note.source).toEqual({ type: "view", name: "Pagos" });
    expect(r.note.nodes).toEqual(["Cobrar prima", "Prima cobrada"]);
    expect(r.note.facts[0]).toMatch(/2 nodos/);
    expect(r.note.facts.join(" ")).toContain("Cobro"); // contenedores
  });

  it("sin presupuesto devuelve error accionable", () => {
    const r = readView(cat, "Pagos", 0);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/presupuesto/i);
    expect(r.error).toMatch(/consolid/i); // dice qué hacer, no sólo que no puede
  });

  it("recorta al presupuesto y lo declara", () => {
    const r = readView(cat, "Pagos", 40);
    if (!r.ok) throw new Error("debía leer");
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(40 + "\n…(recortado por presupuesto)".length);
    expect(r.note.facts.join(" ")).toMatch(/RECORTADA/);
  });

  it("nunca pasa de VIEW_READ_MAX aunque el presupuesto sea enorme", () => {
    const grande = grafo(Array.from({ length: 400 }, (_, i) => nodo(`Nodo ${i}`)));
    const r = readView(catalogo(vista({ name: "Grande", graph: grande })), "Grande", 1_000_000);
    if (!r.ok) throw new Error("debía leer");
    expect(r.text.length).toBeLessThanOrEqual(VIEW_READ_MAX + 40);
    expect(r.truncated).toBe(true);
  });

  it("vista mermaid entrega el código y no promete nodos", () => {
    const r = readView(cat, "Flujo", 10_000);
    if (!r.ok) throw new Error("debía leer");
    expect(r.text).toContain("A-->B");
    expect(r.note.nodes).toEqual([]);
  });

  it("vista inexistente falla con sugerencias", () => {
    const r = readView(cat, "Ventas", 10_000);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.suggestions?.length).toBeGreaterThan(0);
  });
});

describe("searchModel · encontrar sin leer todo", () => {
  const cat = catalogo(
    vista({ name: "Pagos", graph: grafo([nodo("Cobrar prima", "Comando"), nodo("Cobro confirmado")]) }),
    vista({
      name: "Contabilidad",
      graph: grafo([nodo("Asiento", "Evento", "registra el cobro en el libro"), nodo("Cobro", "Evento")]),
    })
  );

  it("cada resultado trae la vista donde vive", () => {
    const r = searchModel(cat, "cobro");
    if (!r.ok) throw new Error("debía buscar");
    expect(r.text).toContain('en la vista "Pagos"');
    expect(r.text).toContain('en la vista "Contabilidad"');
    expect(r.note.facts[0]).toMatch(/2 vista/);
  });

  it("orden determinista por tipo de coincidencia", () => {
    const r1 = searchModel(cat, "cobro");
    const r2 = searchModel(cat, "cobro");
    if (!r1.ok || !r2.ok) throw new Error("debía buscar");
    expect(r1.text).toBe(r2.text);
    // exacto («Cobro») antes que substring («Cobro confirmado») y que descripción.
    const orden = ["Cobro", "Cobro confirmado", "Asiento"].map((n) => r1.text.indexOf(`"${n}"`));
    expect(orden[0]).toBeLessThan(orden[1]);
    expect(orden[1]).toBeLessThan(orden[2]);
  });

  it("respeta el tope y dice cuántas quedaron", () => {
    const muchos = grafo(Array.from({ length: 30 }, (_, i) => nodo(`Cobro ${i}`)));
    const r = searchModel(catalogo(vista({ name: "V", graph: muchos })), "cobro", 5);
    if (!r.ok) throw new Error("debía buscar");
    expect(r.text.split("\n- ").length - 1).toBe(4); // 5 líneas: la 1ª sin separador
    expect(r.text).toMatch(/25 más/);
  });

  it("sin coincidencias responde vacío, no error", () => {
    const r = searchModel(cat, "kubernetes");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toMatch(/Sin coincidencias/);
    expect(r.note.facts[0]).toMatch(/no aparece/);
  });

  it("sin término es un error, no una búsqueda vacía", () => {
    const r = searchModel(cat, "   ");
    expect(r.ok).toBe(false);
  });

  it("encuentra por tipo de elemento", () => {
    const r = searchModel(cat, "comando");
    if (!r.ok) throw new Error("debía buscar");
    expect(r.text).toContain("Cobrar prima");
  });
});
