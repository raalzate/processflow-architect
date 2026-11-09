import { describe, expect, it } from "vitest";
import { addEdge, addNode, emptyDiagram } from "@/lib/mcp/diagram-builder";
import { typesWithRole } from "@/lib/notations";
import { conocimientoDeModelo, construirConocimiento } from "../conocimiento";
import { RDFS_LABEL, RDF_TYPE, iriElemento, iriPredicado, iriRol, valorLiteral } from "../iri";
import { MAX_COMBINACIONES, camino, consultar, consultarPorNombre, resolver, resolverPatrones } from "../query";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const es = (nodo: string) => iriElemento(PROYECTO_PEDIDOS, "v-es", nodo);
const proyecto = () => construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });

// T22 · FR-027, FR-028, edge case de nombres duplicados.
describe("consultar por patrón", () => {
  it("join de 2 patrones por la variable compartida", () => {
    const k = proyecto();
    // ¿Qué eventos dispara un comando, y cómo se llaman?
    const filas = consultar(k, {
      patrones: [
        ["?c", iriPredicado("dispara"), "?e"],
        ["?e", RDFS_LABEL, "?nombre"],
      ],
    });
    expect(filas.map((f) => [f.c, valorLiteral(f.nombre)]).sort()).toEqual([
      [es("facturar-pedido"), "FacturaEmitida"],
      [es("pagar"), "PagoRealizado"],
    ]);
  });

  it("el orden de los patrones no cambia la respuesta", () => {
    const k = proyecto();
    const a = consultar(k, { patrones: [["?e", RDF_TYPE, iriRol("event")], ["?c", iriPredicado("dispara"), "?e"]] });
    const b = consultar(k, { patrones: [["?c", iriPredicado("dispara"), "?e"], ["?e", RDF_TYPE, iriRol("event")]] });
    expect(a.map((f) => f.e).sort()).toEqual(b.map((f) => f.e).sort());
    expect(a).toHaveLength(2);
  });

  it("filtra por origen: lo deducido no aparece al pedir sólo lo explícito", () => {
    const k = proyecto();
    const q = (origen: "todos" | ("explicito" | "deducido")[]) =>
      consultar(k, { patrones: [[es("pagar"), iriPredicado("provoca"), "?x"]], origen }).map((f) => f.x);
    expect(q(["explicito"])).toEqual([]);
    expect(q(["deducido"])).toContain(es("factura-emitida"));
    expect(q("todos")).toEqual(q(["deducido"]));
  });

  it("la misma variable dos veces en un patrón debe valer lo mismo", () => {
    const k = proyecto();
    expect(consultar(k, { patrones: [["?x", iriPredicado("provoca"), "?x"]] })).toEqual([]);
  });

  it("respeta el límite", () => {
    expect(consultar(proyecto(), { patrones: [["?s", RDF_TYPE, "?c"]], limite: 3 })).toHaveLength(3);
  });

  it("proyecto vacío: vacío, sin error", () => {
    const k = conocimientoDeModelo(emptyDiagram({ nombre_proyecto: "V", notation: "ddd" }));
    expect(consultar(k, { patrones: [["?s", "?p", "?o"]] })).toEqual([]);
    expect(consultar(k, { patrones: [] })).toEqual([]);
    expect(camino(k, es("pagar"))).toEqual([]);
  });
});

describe("camino", () => {
  it("Pagar → FacturaEmitida cuenta la cadena, no el atajo deducido", () => {
    const k = proyecto();
    const [c] = camino(k, es("pagar"), { hasta: es("factura-emitida"), predicado: "provoca" });
    expect(c.pasos.map((p) => [p.s, p.p, p.o])).toEqual([
      [es("pagar"), iriPredicado("dispara"), es("pago-realizado")],
      [es("pago-realizado"), iriPredicado("activa"), es("facturar")],
      [es("facturar"), iriPredicado("emite"), es("facturar-pedido")],
      [es("facturar-pedido"), iriPredicado("dispara"), es("factura-emitida")],
    ]);
    // «activa» no está dibujada: es la inversa de «Facturar reacciona a PagoRealizado».
    expect(c.pasos[1].origen).toBe("deducido");
    expect(c.pasos[0].origen).toBe("explicito");
  });

  it("un ciclo no cuelga el recorrido: cada elemento se visita una vez", () => {
    const cmd = typesWithRole("ddd", "command")[0];
    const evt = typesWithRole("ddd", "event")[0];
    const pol = typesWithRole("ddd", "policy")[0];
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addNode(m, { id: "c", nombre: "Reintentar", tipo_elemento: cmd }).model;
    m = addNode(m, { id: "e", nombre: "Falló", tipo_elemento: evt }).model;
    m = addNode(m, { id: "p", nombre: "Insistir", tipo_elemento: pol }).model;
    m = addEdge(m, { fuente: "c", destino: "e", descripcion: "dispara" });
    m = addEdge(m, { fuente: "e", destino: "p", descripcion: "activa" });
    m = addEdge(m, { fuente: "p", destino: "c", descripcion: "emite" });
    const k = conocimientoDeModelo(m);
    const c = (n: string) => iriElemento("actual", "grafo", n);
    expect(camino(k, c("c"), { predicado: "provoca" }).map((x) => x.pasos.at(-1)!.o).sort()).toEqual([c("e"), c("p")].sort());
  });

  it("maxSaltos corta: a 2 saltos FacturaEmitida no se alcanza", () => {
    const k = proyecto();
    expect(camino(k, es("pagar"), { hasta: es("factura-emitida"), maxSaltos: 2 })).toEqual([]);
  });

  it("sin destino, un camino por cada elemento alcanzable", () => {
    const k = proyecto();
    const destinos = camino(k, es("pagar"), { predicado: "provoca" }).map((c) => c.pasos.at(-1)!.o);
    expect(destinos.sort()).toEqual(
      [es("pago-realizado"), es("facturar"), es("facturar-pedido"), es("factura-emitida")].sort()
    );
  });

  it("con predicado, sólo recorre ese y sus subpredicados", () => {
    const k = proyecto();
    // pertenece_a no es una forma de provocar.
    const destinos = camino(k, es("pagar"), { predicado: "provoca" }).map((c) => c.pasos.at(-1)!.o);
    expect(destinos).not.toContain(es("agg-Pagos"));
    expect(camino(k, es("pagar"), { predicado: "pertenece_a" }).map((c) => c.pasos.at(-1)!.o)).toEqual([es("agg-Pagos")]);
  });
});

describe("resolver nombres", () => {
  it("un nombre repetido en dos vistas devuelve las dos coincidencias, con su vista", () => {
    const r = resolver(proyecto(), "cliente").filter((c) => c.tipo === "elemento");
    expect(r.map((c) => c.vista).sort()).toEqual(["v-c4", "v-es"]);
  });

  it("dos elementos con el mismo nombre en la MISMA vista: los dos", () => {
    const tipo = typesWithRole("ddd", "command")[0];
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addNode(m, { id: "a", nombre: "Pagar", tipo_elemento: tipo }).model;
    m = addNode(m, { id: "b", nombre: "Pagar", tipo_elemento: tipo }).model;
    expect(resolver(conocimientoDeModelo(m), "Pagar").map((c) => c.termino)).toHaveLength(2);
  });

  it("predicados por id, etiqueta o sinónimo; el id manda sobre el sinónimo", () => {
    const k = proyecto();
    expect(resolver(k, "dispara").map((c) => c.termino)).toEqual([iriPredicado("dispara")]);
    expect(resolver(k, "reacciona a").map((c) => c.termino)).toEqual([iriPredicado("reacciona_a")]);
    expect(resolver(k, "escucha").map((c) => c.termino)).toEqual([iriPredicado("reacciona_a")]);
    expect(resolver(k, "es").map((c) => c.termino)).toEqual([RDF_TYPE]);
  });

  it("IRIs pasan tal cual y lo desconocido no resuelve", () => {
    const k = proyecto();
    expect(resolver(k, es("pagar"))).toEqual([expect.objectContaining({ termino: es("pagar"), tipo: "iri" })]);
    expect(resolver(k, "Inventario")).toEqual([]);
    expect(resolverPatrones(k, [["Inventario", "dispara", "?x"]]).sinResolver).toEqual(["Inventario"]);
  });

  it("demasiadas combinaciones de nombres repetidos: avisa que truncó", () => {
    const tipo = typesWithRole("ddd", "command")[0];
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    for (let i = 0; i < 5; i++) m = addNode(m, { id: `a${i}`, nombre: "Pagar", tipo_elemento: tipo }).model;
    const k = conocimientoDeModelo(m);
    const tres: [string, string, string][] = [["Pagar", "es", "?a"], ["Pagar", "es", "?b"], ["Pagar", "es", "?c"]];
    const r = resolverPatrones(k, tres);
    expect(r.truncado).toBe(true);
    expect(r.patrones).toHaveLength(MAX_COMBINACIONES);
    expect(consultarPorNombre(k, tres).truncado).toBe(true);
    expect(resolverPatrones(k, [["Pagar", "es", "?a"]]).truncado).toBe(false);
  });

  it("consultarPorNombre: la unión de todas las lecturas", () => {
    const k = proyecto();
    const { filas } = consultarPorNombre(k, [["Pagar", "provoca", "?x"], ["?x", "es", "?c"]]);
    expect(filas.some((f) => f.x === es("factura-emitida"))).toBe(true);
    // Sólo hay un Pagar: el Cliente de C4 no aparece en la respuesta.
    expect(filas.every((f) => f.x.startsWith("kb:pedidos/v-es/"))).toBe(true);
  });

  it("modelo suelto: resuelve sobre su propia notación", () => {
    const k = conocimientoDeModelo(modeloES());
    expect(resolver(k, "Pagar")).toHaveLength(1);
  });
});
