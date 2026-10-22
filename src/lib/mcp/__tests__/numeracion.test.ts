/**
 * Numeración de pasos en diagramas de flujo (#618). Los tipos se piden por ROL
 * al registro, como lo hacen las reglas (P6).
 */
import { describe, it, expect } from "vitest";
import {
  addContainer,
  addEdge,
  addMessage,
  addNode,
  emptyDiagram,
  removeNode,
  type DiagramModel,
} from "../diagram-builder";
import { typesWithRole, getNotation, isLifelineContainer } from "../../notations";
import {
  conNumero,
  esDiagramaDeFlujo,
  numeroDe,
  numerarPasos,
  problemasDeNumeracion,
  sinNumero,
} from "../numeracion";

const tipo = (notation: string, role: Parameters<typeof typesWithRole>[1]) => typesWithRole(notation, role)[0];

/** Construye un flujo: `pasos` = [id, rol], `aristas` = [de, a]. */
function flujo(notation: string, pasos: [string, any][], aristas: [string, string][]): DiagramModel {
  let m = emptyDiagram({ nombre_proyecto: "P", notation: notation as any });
  for (const [id, rol] of pasos) m = addNode(m, { id, nombre: id, tipo_elemento: tipo(notation, rol) }).model;
  for (const [a, b] of aristas) m = addEdge(m, { fuente: a, destino: b });
  return m;
}
const nombres = (m: DiagramModel) => Object.fromEntries(m.nodes.map((n) => [n.id, n.nombre]));

describe("prefijo en el nombre", () => {
  it("reemplaza, nunca apila", () => {
    expect(conNumero("Validar cliente", "1")).toBe("1. Validar cliente");
    expect(conNumero("1. Validar cliente", "2")).toBe("2. Validar cliente");
    expect(conNumero("1. 1. Validar", "3.1")).toBe("3.1. Validar");
    expect(sinNumero("3.1.2. Pagar")).toBe("Pagar");
    expect(numeroDe("3.1. Pagar")).toBe("3.1");
    expect(numeroDe("Pagar 2.0")).toBeUndefined();
  });
});

describe("BPMN lineal", () => {
  const m = () =>
    flujo(
      "bpmn",
      [["Inicio", "start"], ["Validar", "task"], ["Ofrecer", "task"], ["Fin", "end"]],
      [["Inicio", "Validar"], ["Validar", "Ofrecer"], ["Ofrecer", "Fin"]]
    );

  it("numera las tareas en orden de flujo; inicio y fin sin número", () => {
    expect(nombres(numerarPasos(m()))).toEqual({
      Inicio: "Inicio",
      Validar: "1. Validar",
      Ofrecer: "2. Ofrecer",
      Fin: "Fin",
    });
  });

  it("es idempotente y queda sin avisos", () => {
    const una = numerarPasos(m());
    expect(numerarPasos(una)).toBe(una);
    expect(problemasDeNumeracion(una)).toEqual([]);
  });

  it("borrar un paso renumera sin huecos", () => {
    let x = numerarPasos(m());
    x = removeNode(x, "Validar");
    x = addEdge(x, { fuente: "Inicio", destino: "Ofrecer" });
    expect(nombres(numerarPasos(x)).Ofrecer).toBe("1. Ofrecer");
  });

  it("un evento con número puesto a mano lo pierde", () => {
    const x = m();
    x.nodes[0] = { ...x.nodes[0], nombre: "1. Inicio" };
    expect(nombres(numerarPasos(x)).Inicio).toBe("Inicio");
  });
});

describe("ramas", () => {
  it("una compuerta da sub-números y el flujo reunido sigue con el siguiente", () => {
    const m = flujo(
      "bpmn",
      [["I", "start"], ["A", "task"], ["G", "gateway"], ["B", "task"], ["C", "task"], ["J", "gateway"], ["D", "task"], ["F", "end"]],
      [["I", "A"], ["A", "G"], ["G", "B"], ["G", "C"], ["B", "J"], ["C", "J"], ["J", "D"], ["D", "F"]]
    );
    const n = nombres(numerarPasos(m));
    expect([n.A, n.B, n.C, n.D, n.G]).toEqual(["1. A", "2.1. B", "2.2. C", "3. D", "G"]);
  });

  it("una rama con varios pasos los numera dentro de su rama", () => {
    const m = flujo(
      "bpmn",
      [["I", "start"], ["G", "gateway"], ["B1", "task"], ["B2", "task"], ["C", "task"], ["D", "task"]],
      [["I", "G"], ["G", "B1"], ["B1", "B2"], ["G", "C"], ["B2", "D"], ["C", "D"]]
    );
    const n = nombres(numerarPasos(m));
    expect([n.B1, n.B2, n.C, n.D]).toEqual(["1.1.1. B1", "1.1.2. B2", "1.2. C", "2. D"]);
  });

  it("ramas anidadas: 1.1.1 / 1.1.2 dentro de la rama 1.1", () => {
    const m = flujo(
      "bpmn",
      [["I", "start"], ["G", "gateway"], ["X", "task"], ["G2", "gateway"], ["Y", "task"], ["Z", "task"], ["W", "task"], ["E", "task"]],
      [["I", "G"], ["G", "X"], ["X", "G2"], ["G2", "Y"], ["G2", "Z"], ["G", "W"], ["Y", "E"], ["Z", "E"], ["W", "E"]]
    );
    const n = nombres(numerarPasos(m));
    expect(n.X).toBe("1.1.1. X");
    expect([n.Y, n.Z]).toEqual(["1.1.2.1. Y", "1.1.2.2. Z"]);
    expect(n.W).toBe("1.2. W");
    expect(n.E).toBe("2. E");
  });

  it("un ciclo no cuelga ni numera dos veces", () => {
    const m = flujo(
      "bpmn",
      [["I", "start"], ["A", "task"], ["B", "task"], ["G", "gateway"], ["F", "end"]],
      [["I", "A"], ["A", "B"], ["B", "G"], ["G", "A"], ["G", "F"]]
    );
    const n = nombres(numerarPasos(m));
    expect([n.A, n.B]).toEqual(["1. A", "2. B"]);
    expect(problemasDeNumeracion(numerarPasos(m))).toEqual([]);
  });
});

describe("UML: máquina de estados y secuencia", () => {
  it("los estados se numeran desde el inicial", () => {
    const m = flujo(
      "uml",
      [["Ini", "start"], ["Pendiente", "task"], ["Pagado", "task"], ["Fin", "end"]],
      [["Ini", "Pendiente"], ["Pendiente", "Pagado"], ["Pagado", "Fin"]]
    );
    expect(nombres(numerarPasos(m))).toMatchObject({ Pendiente: "1. Pendiente", Pagado: "2. Pagado", Ini: "Ini" });
  });

  it("los mensajes de una secuencia llevan su orden; mover renumera", () => {
    const linea = getNotation("uml").elements.find((e) => isLifelineContainer(e.type))!.type;
    let m = emptyDiagram({ nombre_proyecto: "S", notation: "uml" });
    const a = addContainer(m, { nombre: "A", tipo_elemento: linea });
    const b = addContainer(a.model, { nombre: "B", tipo_elemento: linea });
    m = addMessage(b.model, { fuente: a.id, destino: b.id, descripcion: "pedir" });
    m = addMessage(m, { fuente: b.id, destino: a.id, descripcion: "responder" });
    m = numerarPasos(m);
    expect(m.edges.map((e) => e.descripcion)).toEqual(["1. pedir", "2. responder"]);
    m = addMessage(m, { fuente: a.id, destino: b.id, descripcion: "saludar", posicion: 1 });
    m = numerarPasos(m);
    const porOrden = [...m.edges].sort((x, y) => x.orden! - y.orden!).map((e) => e.descripcion);
    expect(porOrden).toEqual(["1. saludar", "2. pedir", "3. responder"]);
  });
});

describe("lo que no es flujo no se numera", () => {
  it.each(["ddd", "c4", "mer"])("%s queda igual", (notation) => {
    const tipos = getNotation(notation).elements.filter((e) => !e.container).map((e) => e.type);
    let m = emptyDiagram({ nombre_proyecto: "X", notation: notation as any });
    m = addNode(m, { id: "a", nombre: "a", tipo_elemento: tipos[0] }).model;
    m = addNode(m, { id: "b", nombre: "b", tipo_elemento: tipos[1] ?? tipos[0] }).model;
    m = addEdge(m, { fuente: "a", destino: "b" });
    expect(esDiagramaDeFlujo(m)).toBe(false);
    expect(numerarPasos(m)).toBe(m);
  });
});

describe("avisos de numeración", () => {
  it("avisa pasos sin número, fuera de orden y duplicados", () => {
    const m = flujo(
      "bpmn",
      [["I", "start"], ["A", "task"], ["B", "task"], ["C", "task"]],
      [["I", "A"], ["A", "B"], ["B", "C"]]
    );
    m.nodes = m.nodes.map((n) =>
      n.id === "A" ? { ...n, nombre: "2. A" } : n.id === "B" ? { ...n, nombre: "2. B" } : n
    );
    const p = problemasDeNumeracion(m).join(" | ");
    expect(p).toMatch(/«C» no está numerado/);
    expect(p).toMatch(/repetido/);
    expect(p).toMatch(/le toca el 1/);
  });
});
