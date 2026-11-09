import { describe, expect, it } from "vitest";
import {
  askCompetency,
  conocimientoDeDiagramas,
  explainFact,
  findPath,
  leerVinculos,
  linkElements,
  queryKnowledge,
  setEdgePredicate,
  vinculosRel,
} from "@/lib/mcp/ontology-tools";
import { modeloBPMN, modeloC4, modeloES } from "@/lib/ontology/__tests__/fixtures/pedidos";
import { preguntaCompetencia } from "@/lib/ontology/competency";
import { caminoLegible } from "@/lib/ontology/ficha";
import { iriElemento } from "@/lib/ontology/iri";
import { camino, consultarPorNombre } from "@/lib/ontology/query";

// Spec 027 · T13: el agente externo fija el significado de una flecha, y el
// reglamento no le deja fijar uno que no corresponde (FR-012).
describe("setEdgePredicate", () => {
  it("fija un predicado compatible y lo persiste en la arista", () => {
    const r = setEdgePredicate(modeloES(), "pagar", "pago-realizado", "dispara");
    expect(r.model.edges.find((e) => e.fuente === "pagar")?.predicado).toBe("dispara");
  });

  it("rechaza dominio/rango incumplido nombrando los compatibles", () => {
    expect(() => setEdgePredicate(modeloES(), "cliente", "pagar", "dispara")).toThrow(/invoca/);
    expect(() => setEdgePredicate(modeloES(), "cliente", "pagar", "volar")).toThrow(/no es un predicado/);
  });

  it("null quita el predicado (vuelve a proponerse en memoria)", () => {
    const con = setEdgePredicate(modeloES(), "pagar", "pago-realizado", "dispara").model;
    const sin = setEdgePredicate(con, "pagar", "pago-realizado", null).model;
    expect("predicado" in sin.edges.find((e) => e.fuente === "pagar")!).toBe(false);
  });

  it("la relación inexistente falla como en update_edge", () => {
    expect(() => setEdgePredicate(modeloES(), "pagar", "cancelar", "dispara")).toThrow(/No existe una relación/);
  });

  it("resuelve los extremos con el id como se dibuja en Mermaid", () => {
    const r = setEdgePredicate(modeloES(), "facturar_pedido", "factura_emitida", "dispara");
    expect(r.model.edges.find((e) => e.fuente === "facturar-pedido")?.predicado).toBe("dispara");
  });
});

describe("quitar actúa sobre la misma arista que update_edge", () => {
  it("con aristas paralelas sólo quita la primera, como fijar sólo fija la primera", () => {
    let m = modeloES();
    m = { ...m, edges: [...m.edges, { fuente: "pagar", destino: "pago-realizado", descripcion: "otra" }] };
    m = { ...m, edges: m.edges.map((e) => (e.fuente === "pagar" ? { ...e, predicado: "dispara" } : e)) };
    const r = setEdgePredicate(m, "pagar", "pago-realizado", null).model;
    const paralelas = r.edges.filter((e) => e.fuente === "pagar");
    expect(paralelas.map((e) => e.predicado)).toEqual([undefined, "dispara"]);
  });
});

// T25 · FR-030, FR-014: las tools responden lo mismo que la API pura.
describe("consultas por MCP", () => {
  const diagramas = () => [
    { id: "es", model: modeloES() },
    { id: "bpmn", model: modeloBPMN() },
    { id: "c4", model: modeloC4() },
  ];
  const org = () => conocimientoDeDiagramas(diagramas(), "mi-org");
  const iri = (d: string, n: string) => iriElemento("mi-org", d, n);

  it("cada diagrama es una vista: el IRI lleva su id", () => {
    const k = org();
    expect(k.elementos.some((e) => e.iri === iri("es", "pagar"))).toBe(true);
    expect(k.vistas.map((v) => v.vista)).toEqual(["es", "bpmn", "c4"]);
  });

  it("query_knowledge: las mismas filas que consultarPorNombre, con nombres", () => {
    const k = org();
    const pat: [string, string, string][] = [["Pagar", "provoca", "?x"]];
    const puras = consultarPorNombre(k, pat).filas;
    const t = queryKnowledge(k, pat);
    expect(t).toContain(`${puras.length} fila(s)`);
    expect(t).toContain("| x |");
    expect(t).toContain("| FacturaEmitida |");
    // Todas salen del razonador: nada dibujado dice «provoca».
    expect(t).toContain(`${puras.length} gracias a hechos deducidos`);
  });

  it("query_knowledge: lo dibujado y lo deducido por separado", () => {
    const k = org();
    expect(queryKnowledge(k, [["Pagar", "provoca", "?x"]], "explicit")).toMatch(/^Sin filas/);
    expect(queryKnowledge(k, [["Pagar", "dispara", "?x"]], "explicit")).toContain("| PagoRealizado |");
  });

  it("un nombre repetido entre diagramas se muestra con su vista", () => {
    const t = queryKnowledge(org(), [["?a", "invoca", "?c"]]);
    expect(t).toContain("| Cliente [es] | Pagar |");
  });

  it("lo que no existe: desconocido, no un error", () => {
    expect(queryKnowledge(org(), [["Inventario", "dispara", "?x"]])).toMatch(/^Desconocido en el modelo: «Inventario»/);
    expect(findPath(org(), "Inventario")).toMatch(/^Desconocido/);
  });

  it("find_path: el mismo camino que la API pura, legible", () => {
    const k = org();
    const puro = camino(k, iri("es", "pagar"), { hasta: iri("es", "factura-emitida"), predicado: "pf:provoca" });
    const t = findPath(k, "Pagar", { to: "FacturaEmitida", predicate: "provoca" });
    expect(t).toBe(`1 camino(s):\n- ${caminoLegible(k, puro[0])}`);
    expect(t).toContain("Pagar —dispara→ PagoRealizado —activa (deducido)→ Facturar");
    expect(findPath(k, "Pagar", { to: "FacturaEmitida", maxHops: 2 })).toMatch(/^No hay camino/);
  });

  it("explain_fact: el árbol hasta lo dibujado", () => {
    const t = explainFact(org(), "Pagar", "provoca", "FacturaEmitida");
    expect(t.split("\n")[0]).toMatch(/^- Pagar — provoca → FacturaEmitida · por transitiva/);
    expect(t).toContain("· dibujado");
    expect(explainFact(org(), "Cancelar", "provoca", "FacturaEmitida")).toMatch(/no afirma/);
  });

  it("ask_competency: la pregunta y su respuesta, con caminos", () => {
    const k = org();
    const t = askCompetency(k, "PC-07", { sistema: "Pasarela" });
    const pura = preguntaCompetencia("PC-07")!.ejecutar(k, { sistema: "Pasarela" });
    expect(t).toMatch(/^\*\*PC-07\*\*/);
    expect(t).toContain("Caminos:");
    expect(t.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(pura.caminos.length);
    expect(askCompetency(k, "PC-99")).toMatch(/^No existe la pregunta/);
    expect(askCompetency(k, "PC-09", { sujeto: "Pagar", predicado: "provoca", objeto: "FacturaEmitida" })).toContain("· dibujado");
  });
});

// T30 · FR-037, FR-039: vincular por MCP, validado contra el reglamento.
describe("linkElements", () => {
  const diagramas = () => [
    { id: "es", model: modeloES() },
    { id: "c4", model: modeloC4() },
  ];
  const k = () => conocimientoDeDiagramas(diagramas(), "org");

  it("por id o por nombre; el Sistema realiza el Contexto", () => {
    const r = linkElements(k(), [], "org", { a: { diagram: "c4", element: "Pagos" }, b: { diagram: "es", element: "agg-Pagos" }, kind: "realizes" }, "2026-11-09");
    expect(r.vinculo).toMatchObject({ tipo: "realiza", a: { vista: "c4", nodo: "pagos" }, b: { vista: "es", nodo: "agg-Pagos" }, estado: "aceptado" });
    expect(r.vinculo.procedencia).toEqual({ por: "mcp", fecha: "2026-11-09" });
    expect(r.vinculos).toHaveLength(1);
  });

  it("same_as entre un Sistema y un Contexto se rechaza y sugiere realizes", () => {
    expect(() =>
      linkElements(k(), [], "org", { a: { diagram: "c4", element: "pagos" }, b: { diagram: "es", element: "Pagos" }, kind: "same_as" })
    ).toThrow(/disjuntas.*realiza/);
  });

  it("una caja inexistente es un error accionable; el mismo par se reemplaza", () => {
    expect(() =>
      linkElements(k(), [], "org", { a: { diagram: "c4", element: "Nada" }, b: { diagram: "es", element: "Pagos" }, kind: "realizes" })
    ).toThrow(/No existe «Nada»/);
    const uno = linkElements(k(), [], "org", { a: { diagram: "es", element: "Cliente" }, b: { diagram: "c4", element: "Cliente" }, kind: "same_as" });
    const dos = linkElements(k(), uno.vinculos, "org", { a: { diagram: "c4", element: "Cliente" }, b: { diagram: "es", element: "Cliente" }, kind: "same_as" });
    expect(dos.vinculos).toHaveLength(1);
  });

  it("el archivo de vínculos vive fuera de diagrams/ y se lee tolerante", () => {
    expect(vinculosRel("acme")).toBe("orgs/acme/vinculos.json");
    expect(vinculosRel(null)).toBe("vinculos.json");
    expect(leerVinculos(undefined)).toEqual([]);
    expect(leerVinculos("{roto")).toEqual([]);
  });
});
