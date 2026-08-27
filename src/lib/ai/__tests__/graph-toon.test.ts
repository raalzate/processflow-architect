import { describe, it, expect } from "vitest";
import {
  pruneNoise,
  pruneEmpty,
  specToContext,
  encodeToon,
  graphToToon,
  safeGraphToToon,
  TOON_LEGEND,
  TRANSCRIPT_BUDGET,
} from "../graph-toon";

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

describe("metadatos en el contexto de la IA", () => {
  it("las referencias de una caja NO son ruido: viajan al contexto", () => {
    // Para que el agente pueda responder «¿qué cajas no tienen repo?» sin abrir
    // la app. Si alguien las agrega a NOISE_KEYS, esto se pone rojo.
    const toon = graphToToon({
      nodos: [
        {
          id: "cmd",
          nombre: "Pagar",
          tipo_elemento: "Comando",
          x: 10,
          y: 20,
          metadata: [{ clave: "repo", valor: "acme/pagos-svc", url: "https://github.com/acme/pagos-svc" }],
        },
      ],
    });
    expect(toon).toContain("repo");
    expect(toon).toContain("acme/pagos-svc");
    // La geometría sigue siendo ruido.
    expect(toon).not.toMatch(/\bx\b/);
  });
});

// -----------------------------------------------------------------------------
// Limpieza de lo vacío y spec compacta (#190)
// -----------------------------------------------------------------------------

describe("pruneEmpty: lo vacío no gasta contexto", () => {
  it("cae el string vacío, el null, la lista vacía y el objeto vacío", () => {
    expect(pruneEmpty({ a: "", b: null, c: [], d: {}, e: "sirve" })).toEqual({ e: "sirve" });
  });

  it("el 0 y el false SOBREVIVEN: son datos, no ausencias", () => {
    expect(pruneEmpty({ puerto: 0, critico: false })).toEqual({ puerto: 0, critico: false });
  });

  it("limpia en profundidad y descarta el objeto que queda vacío", () => {
    expect(pruneEmpty({ nodo: { nombre: "Pagar", descripcion: "", tags: [] } })).toEqual({
      nodo: { nombre: "Pagar" },
    });
    expect(pruneEmpty({ nodo: { descripcion: "" } })).toEqual({});
  });

  it("una propiedad sin valor no viaja, y con valor sí", () => {
    const metadata = [
      { clave: "repo", valor: "https://github.com/acme/x", tipo: "url" },
      { clave: "owner", valor: "   " },
      { clave: "", valor: "sin clave" },
    ];
    expect(pruneEmpty({ metadata })).toEqual({
      metadata: [{ clave: "repo", valor: "https://github.com/acme/x", tipo: "url" }],
    });
  });

  it("no muta la entrada", () => {
    const entrada = { a: "", b: "x" };
    pruneEmpty(entrada);
    expect(entrada).toEqual({ a: "", b: "x" });
  });
});

describe("la spec viaja compacta al contexto", () => {
  const spec = {
    featureName: "Alta de póliza",
    createdAt: "2026-08-27",
    status: "borrador",
    input: "que el asesor dé de alta sin soporte",
    stories: [
      {
        id: "st-1",
        titulo: "Dar de alta",
        prioridad: "P1",
        porQue: "es el único camino",
        pruebaIndependiente: "con un asesor",
        escenarios: [{ id: "sc-1", given: "asesor con sesión", when: "envía el alta", then: "queda vigente" }],
      },
      { id: "st-2", titulo: "", prioridad: "P2", porQue: "", pruebaIndependiente: "", escenarios: [] },
    ],
    edgeCases: ["sin saldo", "  "],
    requirements: [{ id: "fr-1", texto: "MUST registrar el alta", needsClarification: true }],
    entities: [{ id: "en-1", nombre: "Póliza", descripcion: "lo que se da de alta" }],
    criteria: [{ id: "cr-1", texto: "99 % en un intento" }],
  };

  it("lleva la feature, las historias con su prioridad y los escenarios en una línea", () => {
    const ctx = specToContext(spec as never)!;
    const texto = JSON.stringify(ctx);
    expect(texto).toContain("Alta de póliza");
    expect(texto).toContain("P1");
    expect(texto).toContain("Dar de alta");
    expect(texto).toMatch(/asesor con sesión.*envía el alta.*queda vigente/);
  });

  it("no arrastra los ids internos: al agente no le dicen nada", () => {
    expect(JSON.stringify(specToContext(spec as never))).not.toContain("st-1");
  });

  it("descarta las historias y los ítems vacíos", () => {
    const ctx = specToContext(spec as never) as Record<string, unknown>;
    expect((ctx.historias as unknown[]).length).toBe(1);
    expect(ctx.casosLimite).toEqual(["sin saldo"]);
  });

  it("marca lo que necesita aclaración: es lo que el agente tiene que preguntar", () => {
    expect(JSON.stringify(specToContext(spec as never))).toMatch(/aclarar|CLARIFICATION/i);
  });

  it("una spec vacía no aporta nada al contexto", () => {
    expect(specToContext({ featureName: "", status: "borrador", input: "", stories: [], edgeCases: [], requirements: [], entities: [], criteria: [] } as never)).toBeUndefined();
    expect(specToContext(undefined)).toBeUndefined();
  });
});

describe("el grafo con specs y propiedades entra al contexto sin ruido", () => {
  const grafo = {
    nombre_proyecto: "Pólizas",
    notas: "",
    big_picture: {
      descripcion: "",
      hotspots: [],
      nodos: [
        {
          id: "api",
          nombre: "Enrollment API",
          tipo_elemento: "Contenedor",
          descripcion: "la frontera del asistente",
          estado_comparativo: "nuevo",
          tags_tecnologia: [],
          x: 10,
          y: 20,
          color: "#fff",
          metadata: [
            { clave: "repo", valor: "https://github.com/acme/enroll", tipo: "url" },
            { clave: "owner", valor: "" },
          ],
          spec: {
            featureName: "Alta de póliza",
            status: "borrador",
            input: "",
            stories: [{ id: "s1", titulo: "Dar de alta", prioridad: "P1", porQue: "", pruebaIndependiente: "", escenarios: [] }],
            edgeCases: [],
            requirements: [{ id: "r1", texto: "MUST registrar el alta" }],
            entities: [],
            criteria: [],
          },
        },
      ],
      aristas: [],
    },
    agregados: [],
  };

  it("la spec y las propiedades viajan", () => {
    const toon = safeGraphToToon(grafo);
    expect(toon).toContain("Alta de póliza");
    expect(toon).toContain("MUST registrar el alta");
    expect(toon).toContain("repo");
    expect(toon).toContain("https://github.com/acme/enroll");
  });

  it("no viaja la geometría, ni el color, ni las claves vacías", () => {
    const toon = safeGraphToToon(grafo);
    for (const ruido of ["#fff", "tags_tecnologia", "hotspots", "notas"]) {
      expect(toon, `no debería viajar: ${ruido}`).not.toContain(ruido);
    }
    // La propiedad `owner` estaba sin valor: no aparece.
    expect(toon).not.toContain("owner");
  });

  it("cuesta menos que el mismo grafo en JSON", () => {
    expect(safeGraphToToon(grafo).length).toBeLessThan(JSON.stringify(grafo).length);
  });
});
