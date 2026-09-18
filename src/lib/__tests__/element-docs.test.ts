/**
 * Adjuntos de una caja (feature 016, issue #361). Lo que se prueba acá es la
 * política: qué se guarda, qué se recorta y qué se avisa. El contenido nunca se
 * inyecta a nadie: eso lo prueban el MCP y el agente.
 */
import { describe, it, expect } from "vitest";
import {
  attachElementDoc,
  detectarTipoDoc,
  formatDocsIndex,
  binarioUsado,
  MAX_BINARIO_BYTES,
  MAX_BINARIO_PROYECTO,
  MAX_DOCS_POR_CAJA,
  MAX_TEXTO_DOC,
  readElementDocRange,
  removeElementDoc,
  sanitizeElementDocs,
  searchElementDocs,
  type ElementDoc,
} from "../element-docs";

const doc = (p: Partial<ElementDoc> & { nombre: string; texto: string }): ElementDoc => ({
  tipo: "texto",
  bytes: p.texto.length,
  addedAt: "2026-09-18T00:00:00.000Z",
  ...p,
});

describe("detectarTipoDoc — el tipo sale del CONTENIDO, no sólo de la extensión", () => {
  it("un .txt con 'swagger: 2.0' es openapi", () => {
    expect(detectarTipoDoc("contrato.txt", "swagger: '2.0'\npaths: {}")).toBe("openapi");
  });

  it("un .yaml con 'openapi: 3.0.0' es openapi", () => {
    expect(detectarTipoDoc("pagos.yaml", "openapi: 3.0.0\ninfo:\n  title: Pagos")).toBe("openapi");
  });

  it("un .json que NO es contrato sigue siendo json", () => {
    expect(detectarTipoDoc("ejemplo.json", '{"pedido": 1}')).toBe("json");
  });

  it("las extensiones conocidas caen donde deben", () => {
    expect(detectarTipoDoc("decision.md", "# ADR")).toBe("markdown");
    expect(detectarTipoDoc("proveedor.pdf", "texto extraído")).toBe("pdf");
    expect(detectarTipoDoc("pantalla.png", "")).toBe("imagen");
    expect(detectarTipoDoc("notas", "lo que sea")).toBe("texto");
  });
});

describe("attachElementDoc — adjuntar, reemplazar y los topes", () => {
  it("un adjunto normalizado conserva nombre, tipo detectado, bytes y fecha", () => {
    const [a] = attachElementDoc([], { nombre: "openapi-pagos.yaml", texto: "openapi: 3.0.0\npaths: {}" });
    expect(a.nombre).toBe("openapi-pagos.yaml");
    expect(a.tipo).toBe("openapi");
    expect(a.bytes).toBe("openapi: 3.0.0\npaths: {}".length);
    expect(Date.parse(a.addedAt)).not.toBeNaN();
    expect(a.truncado).toBeUndefined();
  });

  it("el tipo explícito gana sobre la detección (lo sabe quien adjunta)", () => {
    const [a] = attachElementDoc([], { nombre: "x.txt", texto: "hola", tipo: "markdown" });
    expect(a.tipo).toBe("markdown");
  });

  it("pasado el tope de texto RECORTA y marca, nunca rechaza", () => {
    const largo = "a".repeat(MAX_TEXTO_DOC + 20_000);
    const [a] = attachElementDoc([], { nombre: "gordo.md", texto: largo });
    expect(a.texto).toHaveLength(MAX_TEXTO_DOC);
    expect(a.truncado).toBe(true);
    // El tamaño ORIGINAL no se pierde: es lo que le dice al humano cuánto falta.
    expect(a.bytes).toBe(largo.length);
  });

  it("pasado el tope de binario queda el texto y la REFERENCIA al original", () => {
    const [a] = attachElementDoc([], {
      nombre: "proveedor.pdf",
      texto: "texto extraído del PDF",
      binario: "x".repeat(10),
      bytes: MAX_BINARIO_BYTES + 1,
      origenRuta: "/home/ana/proveedor.pdf",
    });
    expect(a.binario).toBeUndefined();
    expect(a.origenRuta).toBe("/home/ana/proveedor.pdf");
    expect(a.texto).toBe("texto extraído del PDF");
  });

  it("el binario que entra en el tope se guarda", () => {
    const [a] = attachElementDoc([], {
      nombre: "pantalla.png",
      texto: "",
      binario: "data",
      bytes: 1_000,
    });
    expect(a.binario).toBe("data");
  });

  it("un adjunto con el mismo nombre REEMPLAZA en vez de duplicar", () => {
    const antes = attachElementDoc([], { nombre: "contrato.yaml", texto: "v1" });
    const despues = attachElementDoc(antes, { nombre: "contrato.yaml", texto: "v2" });
    expect(despues).toHaveLength(1);
    expect(despues[0].texto).toBe("v2");
  });

  it("el adjunto número 11 no entra en silencio: falla nombrando el tope", () => {
    let docs: ElementDoc[] = [];
    for (let i = 0; i < MAX_DOCS_POR_CAJA; i++)
      docs = attachElementDoc(docs, { nombre: `d${i}.md`, texto: "x" });
    expect(() => attachElementDoc(docs, { nombre: "uno-mas.md", texto: "x" })).toThrow(
      new RegExp(String(MAX_DOCS_POR_CAJA))
    );
  });

  it("un adjunto sin nombre o sin nada que leer no es un adjunto", () => {
    expect(() => attachElementDoc([], { nombre: "  ", texto: "x" })).toThrow();
    expect(() => attachElementDoc([], { nombre: "vacio.md", texto: "   " })).toThrow();
  });

  it("una imagen sin texto SÍ es un adjunto: su contenido es el binario", () => {
    const [a] = attachElementDoc([], { nombre: "pantalla.png", texto: "", binario: "b64", bytes: 10 });
    expect(a.tipo).toBe("imagen");
    expect(a.texto).toBe("");
  });
});

describe("sanitizeElementDocs — lo que llega de un archivo guardado o del MCP", () => {
  it("descarta ruido y deja la forma canónica", () => {
    const out = sanitizeElementDocs([
      { nombre: "ok.md", texto: "hola", tipo: "markdown", bytes: 4, addedAt: "2026-01-01T00:00:00.000Z" },
      { nombre: "", texto: "sin nombre" },
      { texto: "sin nombre tampoco" },
      "no soy un objeto",
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].nombre).toBe("ok.md");
  });

  it("no acepta dos adjuntos con el mismo nombre (sin distinguir mayúsculas)", () => {
    const out = sanitizeElementDocs([
      { nombre: "Contrato.yaml", texto: "a" },
      { nombre: "contrato.yaml", texto: "b" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("recorta al tope lo que venga pasado y marca truncado", () => {
    const out = sanitizeElementDocs([{ nombre: "g.md", texto: "a".repeat(MAX_TEXTO_DOC + 1) }]);
    expect(out[0].texto).toHaveLength(MAX_TEXTO_DOC);
    expect(out[0].truncado).toBe(true);
  });

  it("corta en el tope de adjuntos por caja", () => {
    const muchos = Array.from({ length: MAX_DOCS_POR_CAJA + 5 }, (_, i) => ({ nombre: `d${i}.md`, texto: "x" }));
    expect(sanitizeElementDocs(muchos)).toHaveLength(MAX_DOCS_POR_CAJA);
  });

  it("lo que no es un array no es nada", () => {
    expect(sanitizeElementDocs(undefined)).toEqual([]);
    expect(sanitizeElementDocs({ nombre: "x" })).toEqual([]);
  });
});

describe("readElementDocRange — leer un trozo con el tope de fragmento", () => {
  const docs = [doc({ nombre: "contrato.yaml", texto: Array.from({ length: 500 }, (_, i) => `linea ${i + 1}`).join("\n") })];

  it("devuelve el rango pedido y nada más", () => {
    const r = readElementDocRange(docs, "contrato.yaml", 10, 12);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toContain("linea 10");
      expect(r.texto).toContain("linea 12");
      expect(r.texto).not.toContain("linea 13");
    }
  });

  it("un rango fuera del documento no rompe: lo dice", () => {
    const r = readElementDocRange(docs, "contrato.yaml", 9_000, 9_100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toMatch(/no hay texto/i);
  });

  it("un adjunto que no existe devuelve error con los que hay", () => {
    const r = readElementDocRange(docs, "inventado.yaml");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.disponibles).toEqual(["contrato.yaml"]);
  });

  it("recorta al tope de fragmento y lo marca", () => {
    const grande = [doc({ nombre: "g.md", texto: "x".repeat(5_000) })];
    const r = readElementDocRange(grande, "g.md");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.truncado).toBe(true);
      expect(r.texto).toMatch(/recortado/);
    }
  });
});

describe("searchElementDocs — en qué caja, en qué adjunto y en qué línea", () => {
  const elementos = [
    {
      id: "pagos",
      nombre: "Servicio de Pagos",
      adjuntos: [doc({ nombre: "pagos.yaml", texto: "linea uno\nhabla de idempotencia\nfin" })],
    },
    {
      id: "pedidos",
      nombre: "Servicio de Pedidos",
      adjuntos: [doc({ nombre: "pedidos.md", texto: "nada\nIdempotencia en mayúscula\n" })],
    },
    { id: "ui", nombre: "HTML/JS" },
  ];

  it("encuentra el término en las dos cajas, con su línea", () => {
    const hits = searchElementDocs(elementos, "idempotencia");
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ elemento: "Servicio de Pagos", doc: "pagos.yaml", linea: 2 });
    expect(hits[1]).toMatchObject({ elemento: "Servicio de Pedidos", linea: 2 });
  });

  it("un término que no está no inventa nada", () => {
    expect(searchElementDocs(elementos, "blockchain")).toEqual([]);
    expect(searchElementDocs(elementos, "   ")).toEqual([]);
  });
});

describe("formatDocsIndex — el índice es lo que permite decidir qué pedir", () => {
  it("nombra tipo, tamaño y el recorte, y NUNCA el contenido", () => {
    const texto = "secreto que no debe salir\n".repeat(100);
    const idx = formatDocsIndex([doc({ nombre: "c.yaml", texto, tipo: "openapi", truncado: true })]);
    expect(idx).toContain("c.yaml");
    expect(idx).toContain("openapi");
    expect(idx).toMatch(/recortado/i);
    expect(idx).not.toContain("secreto que no debe salir");
  });

  it("sin adjuntos no dice nada", () => {
    expect(formatDocsIndex([])).toBe("");
  });
});

describe("removeElementDoc y el presupuesto de binario del proyecto", () => {
  it("quitar por nombre no distingue mayúsculas", () => {
    const docs = [doc({ nombre: "Contrato.yaml", texto: "a" })];
    expect(removeElementDoc(docs, "contrato.yaml")).toHaveLength(0);
  });

  it("binarioUsado suma sólo lo que de verdad viaja", () => {
    const docs = [
      doc({ nombre: "a.png", texto: "", binario: "x".repeat(100), bytes: 100 }),
      doc({ nombre: "b.pdf", texto: "t", bytes: 5_000_000 }), // sin binario: no viaja
    ];
    expect(binarioUsado(docs)).toBe(100);
    expect(MAX_BINARIO_PROYECTO).toBeGreaterThan(MAX_BINARIO_BYTES);
  });
});
