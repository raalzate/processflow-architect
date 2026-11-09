import { describe, expect, it } from "vitest";
import { addNode, fromGraphData, type DiagramModel } from "@/lib/mcp/diagram-builder";
import { hechosDeGraphData, hechosDeModelo, hechosDeVistas } from "../abox";
import { ELEMENTO, RDF_TYPE, iriElemento, literal } from "../iri";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const ctx = { proyecto: PROYECTO_PEDIDOS, vista: "v-es" };
const el = (id: string) => iriElemento(PROYECTO_PEDIDOS, "v-es", id);

// T11 · FR-008: el diagrama expresado como hechos.
describe("hechosDeModelo", () => {
  const { hechos, hallazgos } = hechosDeModelo(modeloES(), ctx);
  const con = (p: string) => hechos.filter((h) => h.p === p);

  it("un rdf:type por caja, con la clase del tipo en SU notación", () => {
    expect(con(RDF_TYPE)).toHaveLength(8);
    expect(hechos).toContainEqual(expect.objectContaining({ s: el("pagar"), p: RDF_TYPE, o: "pf:ddd/comando" }));
    expect(hechos).toContainEqual(expect.objectContaining({ s: el("pagar"), p: "rdfs:label", o: literal("Pagar") }));
    expect(hallazgos).toEqual([]);
  });

  it("contenedor ⇒ «pertenece_a» (composición), nunca subclase", () => {
    expect(con("pf:pertenece_a")).toHaveLength(7);
    expect(hechos).toContainEqual(expect.objectContaining({ s: el("pagar"), p: "pf:pertenece_a", o: el("agg-Pagos") }));
    expect(hechos.some((h) => h.p === "rdfs:subClassOf")).toBe(false);
  });

  it("cada arista con su predicado (propuesto en memoria y marcado como tal)", () => {
    const dispara = hechos.find((h) => h.s === el("pagar") && h.o === el("pago-realizado"))!;
    expect(dispara.p).toBe("pf:dispara");
    expect(dispara.sugerido).toBe(true);
    expect(dispara.origen).toBe("explicito");
    expect(dispara.vista).toBe("v-es");
    expect(con("pf:reacciona_a")).toHaveLength(1);
  });

  it("el predicado confirmado manda y no queda como sugerido", () => {
    const m = modeloES();
    m.edges = m.edges.map((e) => (e.fuente === "cliente" ? { ...e, predicado: "relacionado_con" } : e));
    const h = hechosDeModelo(m, ctx).hechos.find((x) => x.s === el("cliente") && x.o === el("pagar"))!;
    expect(h.p).toBe("pf:relacionado_con");
    expect(h.sugerido).toBeUndefined();
  });

  it("tipo desconocido ⇒ clase raíz + hallazgo, la caja no se descarta", () => {
    const m: DiagramModel = modeloES();
    m.nodes.push({ id: "raro", nombre: "Raro", tipo_elemento: "Tipo Borrado" });
    const r = hechosDeModelo(m, ctx);
    expect(r.hechos).toContainEqual(expect.objectContaining({ s: el("raro"), p: RDF_TYPE, o: ELEMENTO }));
    expect(r.hallazgos).toEqual([expect.objectContaining({ forma: "TIPO-DESCONOCIDO", nodo: "raro", vista: "v-es" })]);
  });

  it("atributos: descripción, tecnología, metadatos y fuente como literales", () => {
    const m = addNode(modeloES(), {
      id: "svc",
      nombre: "Servicio",
      tipo_elemento: "Sistema Externo",
      descripcion: "cobra con tarjeta",
      tags_tecnologia: ["Node 20"],
      metadata: [{ clave: "repo", valor: "acme/pagos" }],
      source: "doc.md#L3",
    }).model;
    const hs = hechosDeModelo(m, ctx).hechos.filter((h) => h.s === el("svc"));
    expect(hs).toContainEqual(expect.objectContaining({ p: "pf:descripcion", o: literal("cobra con tarjeta") }));
    expect(hs).toContainEqual(expect.objectContaining({ p: "pf:tecnologia", o: literal("Node 20") }));
    expect(hs).toContainEqual(expect.objectContaining({ p: "pf:atributo/repo", o: literal("acme/pagos") }));
    expect(hs).toContainEqual(expect.objectContaining({ p: "pf:fuente", o: literal("doc.md#L3") }));
  });
});

describe("hechosDeVistas / hechosDeGraphData", () => {
  it("cada vista aporta sus hechos con su IRI y su vista de origen", () => {
    const { hechos } = hechosDeVistas(vistasPedidos(), PROYECTO_PEDIDOS);
    const porVista = (v: string) => hechos.filter((h) => h.vista === v && h.p === RDF_TYPE).length;
    expect(porVista("v-es")).toBe(8);
    expect(porVista("v-bpmn")).toBe(7);
    expect(porVista("v-c4")).toBe(4);
    // «Cliente» existe en dos vistas: son dos individuos distintos hasta que alguien los vincule.
    expect(hechos.filter((h) => h.p === "rdfs:label" && h.o === literal("Cliente"))).toHaveLength(2);
    expect(hechos.filter((h) => h.p === "pf:flujo_a")).toHaveLength(6);
  });

  it("GraphData sin notación se lee con la de por defecto y respeta la declarada", () => {
    const g = vistasPedidos()[2].graph!;
    const r = hechosDeGraphData(g, { proyecto: "p", vista: "v" });
    expect(r.hechos.some((h) => h.p === "pf:usa")).toBe(true);
    expect(fromGraphData(g, "c4").nodes).toHaveLength(4);
    const vacio = hechosDeVistas([{ id: "m", name: "Mermaid", kind: "mermaid", createdAt: "" }], "p");
    expect(vacio.hechos).toEqual([]);
  });
});
