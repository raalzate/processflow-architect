import { describe, it, expect } from "vitest";
import { pruneNoise, encodeToon, graphToToon, safeGraphToToon, TOON_LEGEND, TRANSCRIPT_BUDGET } from "../graph-toon";

describe("pruneNoise", () => {
  it("elimina claves de geometría/presentación en cualquier nivel", () => {
    const input = {
      nombre: "n1",
      x: 10,
      y: 20,
      width: 100,
      color: "#fff",
      borderColor: "#000",
      isGroup: true,
      hijo: { nombre: "sub", vx: 1, fy: 2, midpoints: [{ x: 1, y: 2 }] },
    };
    expect(pruneNoise(input)).toEqual({ nombre: "n1", hijo: { nombre: "sub" } });
  });

  it("descarta source/target (refs circulares) pero conserva fuente/destino", () => {
    const node: any = { id: "a", nombre: "A" };
    const link: any = { fuente: "a", destino: "b", tipo: "flujo" };
    link.source = node; // referencia circular potencial
    link.target = node;
    const pruned = pruneNoise(link) as Record<string, unknown>;
    expect(pruned).toEqual({ fuente: "a", destino: "b", tipo: "flujo" });
  });

  it("no muta la entrada original", () => {
    const input = { nombre: "n", x: 5 };
    pruneNoise(input);
    expect(input).toEqual({ nombre: "n", x: 5 });
  });
});

describe("encodeToon", () => {
  it("codifica escalares como clave: valor", () => {
    expect(encodeToon({ a: 1, b: "hola", c: true, d: null })).toBe(
      "a: 1\nb: hola\nc: true\nd: "
    );
  });

  it("array de objetos uniformes → tabla TOON", () => {
    const out = encodeToon({
      nodos: [
        { id: "1", nombre: "Crear pedido", tipo: "comando" },
        { id: "2", nombre: "Pedido creado", tipo: "evento" },
      ],
    });
    expect(out).toBe(
      [
        "nodos[2]{id,nombre,tipo}:",
        "  1,Crear pedido,comando",
        "  2,Pedido creado,evento",
      ].join("\n")
    );
  });

  it("array de escalares → en línea", () => {
    expect(encodeToon({ tags: ["a", "b", "c"] })).toBe("tags[3]: a,b,c");
  });

  it("entrecomilla valores con coma o dos puntos", () => {
    const out = encodeToon({ items: [{ k: "a,b" }, { k: "c:d" }] });
    expect(out).toBe(['items[2]{k}:', '  "a,b"', '  "c:d"'].join("\n"));
  });

  it("array vacío conserva el conteo", () => {
    expect(encodeToon({ xs: [] })).toBe("xs[0]:");
  });

  it("array no uniforme cae a lista con marcador", () => {
    const out = encodeToon({
      agregados: [{ nombre: "Ag", nodos: [{ id: "1" }] }],
    });
    expect(out).toContain("agregados[1]:");
    expect(out).toContain("-");
    expect(out).toContain("nodos[1]{id}:");
  });

  it("escalar en la raíz se codifica directo", () => {
    expect(encodeToon(42)).toBe("42");
    expect(encodeToon("hola")).toBe("hola");
    expect(encodeToon(null)).toBe("");
  });

  it("array de arrays anidados usa marcador por elemento", () => {
    const out = encodeToon([
      [1, 2],
      [3],
    ]);
    expect(out).toContain("root[2]:");
    expect(out).toContain("[2]: 1,2");
  });

  it("objeto anidado y claves undefined se omiten", () => {
    const out = encodeToon({ meta: { a: 1 }, saltar: undefined });
    expect(out).toContain("meta:");
    expect(out).toContain("a: 1");
    expect(out).not.toContain("saltar");
  });
});

describe("graphToToon", () => {
  it("poda geometría y produce TOON tabular más corto que el JSON", () => {
    const graph = {
      nombre_proyecto: "Demo",
      version: "1",
      big_picture: {
        descripcion: "bp",
        hotspots: ["riesgo A"],
        nodos: [
          { id: "1", nombre: "Cmd", tipo_elemento: "comando", x: 5, y: 9, color: "#abc" },
          { id: "2", nombre: "Evt", tipo_elemento: "evento", x: 50, y: 90, color: "#def" },
        ],
      },
    };
    const toon = graphToToon(graph);
    // No filtra geometría al contexto.
    expect(toon).not.toContain("color");
    expect(toon).not.toMatch(/\bx\b:/);
    // Codifica los nodos como tabla.
    expect(toon).toContain("nodos[2]{id,nombre,tipo_elemento}:");
    // Ahorra tokens frente al JSON crudo.
    expect(toon.length).toBeLessThan(JSON.stringify(graph).length);
  });

  it("devuelve cadena vacía sin datos", () => {
    expect(graphToToon(null)).toBe("");
    expect(graphToToon(undefined)).toBe("");
  });

  it("acota el transcript largo al presupuesto para no ahogar la estructura", () => {
    const graph = { nombre_proyecto: "P", transcript: "x".repeat(5000) };
    const toon = graphToToon(graph);
    const line = toon.split("\n").find((l) => l.startsWith("transcript: "))!;
    const value = line.slice("transcript: ".length);
    expect(value.length).toBe(TRANSCRIPT_BUDGET + 1); // +1 por el "…"
    expect(value.endsWith("…")).toBe(true);
  });

  it("no toca un transcript corto", () => {
    const graph = { transcript: "resumen breve" };
    expect(graphToToon(graph)).toContain("transcript: resumen breve");
  });

  it("no revienta con grafo post-simulación d3 (source/target circulares)", () => {
    // Tras la simulación, cada arista referencia el objeto-nodo (ciclo) y los
    // nodos traen vx/vy/index. graphToToon debe podar todo eso sin lanzar.
    const nA: any = { id: "a", nombre: "A", tipo_elemento: "evento", vx: 0.1, index: 0 };
    const nB: any = { id: "b", nombre: "B", tipo_elemento: "comando", vx: -0.2, index: 1 };
    const link: any = { fuente: "a", destino: "b", tipo: "flujo" };
    link.source = nA; // referencias circulares reales de d3
    link.target = nB;
    const graph = { big_picture: { nodos: [nA, nB], aristas: [link] } };
    expect(() => graphToToon(graph)).not.toThrow();
    const toon = graphToToon(graph);
    expect(toon).not.toContain("vx");
    expect(toon).not.toContain("index");
    expect(toon).toContain("a,A,evento");
  });
});

describe("safeGraphToToon", () => {
  it("degrada a JSON en vez de lanzar ante un valor problemático", () => {
    // Objeto con getter que lanza: graphToToon podría fallar; safe no debe.
    const bomb: any = {};
    Object.defineProperty(bomb, "x", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(() => safeGraphToToon(bomb)).not.toThrow();
  });

  it("produce el mismo TOON que graphToToon en el camino feliz", () => {
    const g = { big_picture: { nodos: [{ id: "1", nombre: "X" }] } };
    expect(safeGraphToToon(g)).toBe(graphToToon(g));
  });

  it("la leyenda menciona el formato tabular campo[N]{...}", () => {
    expect(TOON_LEGEND).toContain("campo[N]");
  });
});
