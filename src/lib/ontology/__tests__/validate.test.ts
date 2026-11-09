import { describe, expect, it } from "vitest";
import { addContainer, addEdge, addNode, emptyDiagram } from "@/lib/mcp/diagram-builder";
import { typesWithRole, type FormaDecl } from "@/lib/notations";
import { conocimientoDeModelo, construirConocimiento } from "../conocimiento";
import { validar } from "../validate";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const tipo = (n: string, rol: Parameters<typeof typesWithRole>[1]) => typesWithRole(n, rol)[0];

// T19 · FR-022, FR-024, FR-025.
describe("validar con las formas del registro", () => {
  it("Q6: CADENA sobre Cancelar y nada sobre Pagar", () => {
    const k = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });
    const cadena = validar(k).filter((h) => h.forma === "CADENA");
    expect(cadena.map((h) => h.nodo)).toEqual(["cancelar"]);
    expect(cadena[0]).toMatchObject({
      severidad: "aviso",
      vista: "v-es",
      esperado: 1,
      encontrado: 0,
      mensaje: expect.stringContaining('"Cancelar" no produce ningún hecho'),
    });
  });

  // POLITICA cuenta lo deducido: «Facturar reacciona a PagoRealizado» está
  // dibujada AL EVENTO, y por la inversa el evento activa a la política.
  it("POLITICA: la flecha dibujada al revés («reacciona a») cuenta por la inversa", () => {
    const k = conocimientoDeModelo(modeloES());
    expect(validar(k).filter((h) => h.forma === "POLITICA")).toEqual([]);
  });

  it("POLITICA: escuchar sin emitir sigue avisando, con el motivo correcto", () => {
    const m = modeloES();
    m.edges = m.edges.filter((e) => !(e.fuente === "facturar" && e.destino === "facturar-pedido"));
    const politica = validar(conocimientoDeModelo(m)).filter((h) => h.forma === "POLITICA");
    expect(politica).toEqual([expect.objectContaining({ nodo: "facturar", mensaje: expect.stringContaining("le falta el comando que dispara") })]);
  });

  it("filtra por vista", () => {
    const k = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });
    const soloBpmn = validar(k, { vista: "v-bpmn" });
    expect(soloBpmn.every((h) => h.vista === "v-bpmn")).toBe(true);
    expect(soloBpmn.some((h) => h.forma === "CADENA")).toBe(false);
  });

  it("cada hallazgo trae forma, severidad, elemento y mensaje sin marcadores sin resolver", () => {
    const k = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });
    for (const h of validar(k)) {
      expect(h.forma).toMatch(/^[A-Z-]+$/);
      expect(["error", "aviso", "sugerencia"]).toContain(h.severidad);
      expect(h.mensaje).not.toMatch(/\{[a-z0-9:]+\}/);
    }
  });
});

describe("validar con formas a medida", () => {
  const forma = (f: Partial<FormaDecl> & Pick<FormaDecl, "restriccion">): FormaDecl => ({
    id: "PRUEBA",
    objetivo: "pool",
    severidad: "error",
    mensaje: "{nombre}: esperaba {esperado}, encontré {encontrado}",
    ...f,
  });

  // US4-AC3: cardinalidad con esperado/encontrado.
  it("cardinalidad: «un Pool tiene al menos 2 elementos» dice cuántos esperaba y cuántos encontró", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "bpmn" });
    m = addContainer(m, { id: "pool", nombre: "Cobros", tipo_elemento: tipo("bpmn", "pool") }).model;
    m = addNode(m, { id: "t", nombre: "Cobrar", tipo_elemento: tipo("bpmn", "task"), container: "Cobros" }).model;
    const f = forma({
      restriccion: { tipo: "minCount", predicado: "pertenece_a", direccion: "entra", n: 2 },
      sugerencia: "Agregá un carril o una tarea",
    });
    expect(validar(conocimientoDeModelo(m), { formas: [f] })).toEqual([
      expect.objectContaining({
        forma: "PRUEBA",
        nodo: "pool",
        esperado: 2,
        encontrado: 1,
        mensaje: "Cobros: esperaba 2, encontré 1",
        sugerencia: "Agregá un carril o una tarea",
      }),
    ]);
  });

  // US4-AC4: la validación corre sobre lo ya deducido.
  it("un evento que llega por cadena transitiva cuenta", () => {
    const f = forma({
      objetivo: "command",
      restriccion: { tipo: "minCount", predicado: "provoca", direccion: "sale", n: 2, claseObjeto: ["event"] },
    });
    const k = conocimientoDeModelo(modeloES());
    // Pagar no tiene dos eventos dibujados: el segundo (FacturaEmitida) llega por provoca transitiva.
    const nodos = validar(k, { formas: [f] }).map((h) => h.nodo);
    expect(nodos).not.toContain("pagar");
    expect(nodos).toEqual(expect.arrayContaining(["cancelar", "facturar-pedido"]));
  });

  it("maxCount, atributo requerido, patrón y prohibido", () => {
    let m = emptyDiagram({ nombre_proyecto: "P", notation: "ddd" });
    m = addNode(m, { id: "a", nombre: "Cliente", tipo_elemento: tipo("ddd", "actor") }).model;
    m = addNode(m, { id: "c", nombre: "pagar", tipo_elemento: tipo("ddd", "command"), descripcion: "x" }).model;
    m = addNode(m, { id: "c2", nombre: "Cobrar", tipo_elemento: tipo("ddd", "command") }).model;
    m = addEdge(m, { fuente: "a", destino: "c" });
    m = addEdge(m, { fuente: "a", destino: "c2" });
    const k = conocimientoDeModelo(m);
    const formas: FormaDecl[] = [
      forma({ id: "MAX", objetivo: "actor", restriccion: { tipo: "maxCount", predicado: "invoca", direccion: "sale", n: 1 }, mensaje: "{nombre} invoca {lista}" }),
      forma({ id: "REQ", objetivo: "command", restriccion: { tipo: "atributoRequerido", atributo: "descripcion" }, mensaje: "{nombre} sin descripción" }),
      forma({ id: "PAT", objetivo: "command", restriccion: { tipo: "patron", atributo: "nombre", regex: "^[A-Z]" }, mensaje: "{nombre} en minúscula" }),
      forma({ id: "NO", objetivo: "actor", restriccion: { tipo: "prohibido", predicado: "invoca", claseObjeto: ["command"] }, mensaje: "{nombre} no invoca" }),
    ];
    const r = validar(k, { formas });
    expect(r.map((h) => [h.forma, h.mensaje])).toEqual([
      ["MAX", "Cliente invoca pagar, Cobrar"],
      ["REQ", "Cobrar sin descripción"],
      ["PAT", "pagar en minúscula"],
      ["NO", "Cliente no invoca"],
    ]);
  });

  it("una forma sobre un rol que la notación no declara no aplica", () => {
    const f = forma({ objetivo: "diagrama", aplicaSi: { declara: "pool" }, restriccion: { tipo: "existe", rol: "pool" } });
    expect(validar(conocimientoDeModelo(modeloES()), { formas: [f] })).toEqual([]);
  });

  it("sin modelo, sin hallazgos", () => {
    expect(validar(conocimientoDeModelo(emptyDiagram({ nombre_proyecto: "V", notation: "bpmn" })))).toEqual([]);
  });
});
