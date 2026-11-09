import { describe, expect, it } from "vitest";
import { addContainer, addEdge, addNode, emptyDiagram, type DiagramModel } from "@/lib/mcp/diagram-builder";
import { typesWithRole, type ElementRole, type NotationId } from "@/lib/notations";
import { PREGUNTAS_COMPETENCIA, preguntaCompetencia } from "../competency";
import { conocimientoDeModelo, construirConocimiento } from "../conocimiento";
import { iriElemento, iriPredicado, valorLiteral } from "../iri";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const iri = (vista: string, nodo: string) => iriElemento(PROYECTO_PEDIDOS, vista, nodo);
const es = (n: string) => iri("v-es", n);
const c4 = (n: string) => iri("v-c4", n);
const proyecto = () => construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });
const pc = (id: string) => preguntaCompetencia(id)!;
const tipo = (n: NotationId, rol: ElementRole) => typesWithRole(n, rol)[0];
const suelto = (n: string) => iriElemento("actual", "grafo", n);

// T23 · FR-031, SC-001.
describe("preguntas de competencia", () => {
  it("están las diez, con id único", () => {
    const ids = PREGUNTAS_COMPETENCIA.map((p) => p.id);
    expect(ids).toEqual(["PC-01", "PC-02", "PC-03", "PC-04", "PC-05", "PC-06", "PC-07", "PC-08", "PC-09", "PC-10"]);
    expect(preguntaCompetencia("pc-01")?.id).toBe("PC-01");
  });

  // Q4: el camino pasa por FacturarPedido, que es comando: la respuesta son los eventos.
  it("Q4 · PC-01 con Pagar: PagoRealizado y FacturaEmitida, cada uno con su camino", () => {
    const r = pc("PC-01").ejecutar(proyecto(), { comando: "Pagar" });
    expect(r.filas.map((f) => f.evento).sort()).toEqual([es("factura-emitida"), es("pago-realizado")].sort());
    const largo = r.caminos.find((c) => c.pasos.at(-1)!.o === es("factura-emitida"))!;
    expect(largo.pasos.map((p) => p.o)).toEqual([
      es("pago-realizado"),
      es("facturar"),
      es("facturar-pedido"),
      es("factura-emitida"),
    ]);
    expect(r.caminos).toHaveLength(2);
  });

  it("PC-01 sin comando o con uno que no existe: nota, sin filas", () => {
    expect(pc("PC-01").ejecutar(proyecto()).nota).toMatch(/Falta el parámetro/);
    expect(pc("PC-01").ejecutar(proyecto(), { comando: "Inventario" })).toMatchObject({ filas: [], nota: expect.stringContaining("no es un elemento") });
  });

  it("PC-02: el Cliente inicia Pagar dentro del contexto Pagos", () => {
    expect(pc("PC-02").ejecutar(proyecto()).filas).toEqual([{ actor: es("cliente"), inicia: es("pagar"), contexto: es("agg-Pagos") }]);
  });

  it("PC-03: sin vínculos entre vistas, vacío (los vínculos llegan con US6)", () => {
    expect(pc("PC-03").ejecutar(proyecto()).filas).toEqual([]);
  });

  it("PC-03: una equivalencia dibujada se lista una sola vez", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "c4" });
    m = addNode(m, { id: "a", nombre: "Pagos", tipo_elemento: tipo("c4", "system") }).model;
    m = addNode(m, { id: "b", nombre: "Cobros", tipo_elemento: tipo("c4", "system") }).model;
    m = addEdge(m, { fuente: "a", destino: "b", descripcion: "es el mismo que" });
    expect(pc("PC-03").ejecutar(conocimientoDeModelo(m)).filas).toEqual([{ a: suelto("a"), b: suelto("b") }]);
  });

  it("PC-04: Pagos escribe en PagosDB; filtrado por almacén", () => {
    const k = proyecto();
    const fila = { elemento: c4("pagos"), accion: iriPredicado("escribe_en"), almacen: c4("pagos-db") };
    expect(pc("PC-04").ejecutar(k).filas).toEqual([fila]);
    expect(pc("PC-04").ejecutar(k, { almacen: "PagosDB" }).filas).toEqual([fila]);
    expect(pc("PC-04").ejecutar(k, { almacen: "Otra" }).nota).toBeDefined();
  });

  it("PC-05: en Pedidos todo vive en Pagos; una política que emite hacia otro contexto cruza", () => {
    expect(pc("PC-05").ejecutar(proyecto()).filas).toEqual([]);
    const m = armarDDD();
    expect(pc("PC-05").ejecutar(conocimientoDeModelo(m)).filas).toEqual([
      { politica: suelto("pol"), via: suelto("enviar"), hacia: suelto("ctx-envios") },
    ]);
  });

  it("PC-06: el Sistema Pagos no declara repositorio ni responsable; la base sólo responsable", () => {
    const filas = pc("PC-06").ejecutar(proyecto()).filas.map((f) => [f.elemento, valorLiteral(f.falta)]);
    expect(filas).toEqual(expect.arrayContaining([[c4("pagos"), "repo, owner"], [c4("pagos-db"), "owner"]]));
    // Un sistema externo no es nuestro: no se le piden.
    expect(filas.map((f) => f[0])).not.toContain(c4("pasarela"));
  });

  it("PC-06: un alias de la clave cuenta como declarada", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "c4" });
    m = addNode(m, {
      id: "s",
      nombre: "Pagos",
      tipo_elemento: tipo("c4", "system"),
      metadata: [
        { clave: "repositorio", valor: "https://git/pagos" },
        { clave: "responsable", valor: "Equipo cobros" },
      ],
    }).model;
    expect(pc("PC-06").ejecutar(conocimientoDeModelo(m)).filas).toEqual([]);
  });

  // Q8 pide además el Contexto y el Pool vía ≡: los vínculos entre vistas son US6 (F4).
  it("Q8 · PC-07 sobre Pasarela: Pagos y, por transitiva, el Cliente; con camino", () => {
    const r = pc("PC-07").ejecutar(proyecto(), { sistema: "Pasarela" });
    expect(r.filas.map((f) => f.elemento).sort()).toEqual([c4("cliente"), c4("pagos")].sort());
    const delCliente = r.caminos.find((c) => c.pasos[0].s === c4("cliente"))!;
    expect(delCliente.pasos.map((p) => p.o)).toEqual([c4("pagos"), c4("pasarela")]);
  });

  it("PC-08: entidad suelta vs entidad guardada en un almacén", () => {
    expect(pc("PC-08").ejecutar(proyecto()).filas).toEqual([]);
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "mer" });
    m = addNode(m, { id: "e1", nombre: "Cliente", tipo_elemento: tipo("mer", "entity") }).model;
    m = addNode(m, { id: "e2", nombre: "Pedido", tipo_elemento: tipo("mer", "entity") }).model;
    expect(pc("PC-08").ejecutar(conocimientoDeModelo(m)).filas.map((f) => f.entidad)).toEqual([suelto("e1"), suelto("e2")]);
  });

  it("PC-09: explica «Pagar provoca FacturaEmitida» hasta lo dibujado", () => {
    const r = pc("PC-09").ejecutar(proyecto(), { sujeto: "Pagar", predicado: "provoca", objeto: "FacturaEmitida" });
    expect(r.explicacion).toMatchObject({ origen: "deducido" });
    expect(pc("PC-09").ejecutar(proyecto(), { sujeto: "Cancelar", predicado: "provoca", objeto: "FacturaEmitida" }).nota).toMatch(
      /mundo abierto/
    );
  });

  it("PC-10: sin la versión anterior avisa; quitar PagoRealizado pierde la cadena", () => {
    expect(pc("PC-10").ejecutar(proyecto()).nota).toBeDefined();
    const antes = conocimientoDeModelo(modeloES());
    const m = modeloES();
    m.nodes = m.nodes.filter((n) => n.id !== "pago-realizado");
    m.edges = m.edges.filter((e) => e.fuente !== "pago-realizado" && e.destino !== "pago-realizado");
    const filas = pc("PC-10").ejecutar(conocimientoDeModelo(m), {}, { antes }).filas;
    const de = (c: string) => filas.filter((f) => valorLiteral(f.cambio) === c);
    expect(de("quitado").length).toBeGreaterThan(0);
    expect(de("deduccion perdida")).toContainEqual(
      expect.objectContaining({ s: suelto("pagar"), p: iriPredicado("provoca"), o: suelto("factura-emitida") })
    );
    expect(de("agregado")).toEqual([]);
  });

  it("todas responden sin error sobre un proyecto vacío", () => {
    const k = conocimientoDeModelo(emptyDiagram({ nombre_proyecto: "V", notation: "ddd" }));
    for (const p of PREGUNTAS_COMPETENCIA) expect(p.ejecutar(k, {}).filas).toEqual([]);
  });
});

/** Dos contextos: la política de Pagos ordena un comando que vive en Envíos. */
function armarDDD(): DiagramModel {
  let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
  m = addContainer(m, { id: "ctx-pagos", nombre: "Pagos", tipo_elemento: tipo("ddd", "context") }).model;
  m = addContainer(m, { id: "ctx-envios", nombre: "Envíos", tipo_elemento: tipo("ddd", "context") }).model;
  m = addNode(m, { id: "pagado", nombre: "Pagado", tipo_elemento: tipo("ddd", "event"), container: "Pagos" }).model;
  m = addNode(m, { id: "pol", nombre: "Despachar", tipo_elemento: tipo("ddd", "policy"), container: "Pagos" }).model;
  m = addNode(m, { id: "enviar", nombre: "Enviar", tipo_elemento: tipo("ddd", "command"), container: "Envíos" }).model;
  m = addEdge(m, { fuente: "pagado", destino: "pol", descripcion: "activa" });
  m = addEdge(m, { fuente: "pol", destino: "enviar", descripcion: "emite" });
  return m;
}
