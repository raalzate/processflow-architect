/**
 * Secuencia UML construida POR HERRAMIENTAS (#616), con paridad con
 * `from-mermaid-sequence.test.ts`: líneas de vida en columnas, mensajes con su
 * orden hasta el lienzo y un `alt` que encierra sus mensajes.
 *
 * El ejemplo es el del issue: el agente no tenía `add_message`, el layout
 * apilaba las líneas de vida y el fragmento quedaba suelto debajo de todo.
 */
import { describe, it, expect } from "vitest";
import {
  addContainer,
  addEdge,
  addFragment,
  addMessage,
  emptyDiagram,
  fromGraphData,
  relayout,
  reorderMessage,
  toGraphData,
  validate,
  type DiagramModel,
} from "../diagram-builder";
import { getNotation, isFragmentContainer, isLifelineContainer } from "../../notations";
import { alturaDeMensaje } from "../../sequence/layout";
import { rangoPorGeometria } from "../../sequence/fragments";

const tipos = getNotation("uml").elements.map((e) => e.type);
const LINEA = tipos.find(isLifelineContainer)!;
const FRAGMENTO = tipos.find(isFragmentContainer)!;

function bupa(): { model: DiagramModel; ids: string[] } {
  let model = emptyDiagram({ nombre_proyecto: "Enrolamiento", notation: "uml" });
  const ids: string[] = [];
  for (const nombre of ["Motor de cotización", "Enrollment API (BFF)", "Preregistro de agentes", "UserAPI (securitymngt)"]) {
    const r = addContainer(model, { nombre, tipo_elemento: LINEA });
    model = r.model;
    ids.push(r.id);
  }
  const [motor, bff, prereg, user] = ids;
  model = addMessage(model, { fuente: motor, destino: bff, descripcion: "iniciarEnrolamiento(token)" });
  model = addMessage(model, { fuente: bff, destino: bff, descripcion: "leer bandera del token" });
  model = addMessage(model, { fuente: bff, destino: prereg, descripcion: "consultarAgente()" });
  model = addMessage(model, { fuente: bff, destino: user, descripcion: "buscarPersona()" });
  model = addMessage(model, { fuente: bff, destino: user, descripcion: "crearPersona()" });
  model = addMessage(model, { fuente: bff, destino: motor, descripcion: "200 OK", messageKind: "return" });
  model = addFragment(model, {
    nombre: "bandera del token = agente / persona que ya existe en Bupa / persona nueva",
    tipo_elemento: FRAGMENTO,
    op: "alt",
    desde: 3,
    hasta: 5,
  }).model;
  return { model, ids };
}

describe("secuencia por herramientas (#616)", () => {
  it("la notación UML declara línea de vida y fragmento", () => {
    expect(LINEA).toBeTruthy();
    expect(FRAGMENTO).toBeTruthy();
  });

  it("valida sin errores ni avisos de secuencia", () => {
    const v = validate(bupa().model);
    expect(v.errors).toEqual([]);
    expect(v.warnings.filter((w) => /secuencia|mensaje|fragmento/i.test(w))).toEqual([]);
  });

  it("las líneas de vida quedan en columnas lado a lado, no apiladas", () => {
    const { model, ids } = bupa();
    const data = toGraphData(model);
    const cajas = ids.map((id) => data.agregados.find((a) => `agg-${a.nombre_agregado}` === id || a.nombre_agregado === model.nodes.find((n) => n.id === id)!.nombre)!);
    const ys = new Set(cajas.map((c) => c.y));
    expect(ys.size).toBe(1);
    const xs = cajas.map((c) => c.x!);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    for (let i = 1; i < cajas.length; i++) expect(cajas[i].x!).toBeGreaterThanOrEqual(cajas[i - 1].x! + cajas[i - 1].width!);
  });

  it("los mensajes llegan al lienzo con su orden y su clase", () => {
    const data = toGraphData(bupa().model);
    const aristas = [
      ...data.big_picture.aristas,
      ...(data.politicas_inter_agregados ?? []),
      ...data.agregados.flatMap((a) => a.aristas),
    ];
    expect(aristas.map((a) => a.orden).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const ok = aristas.find((a) => a.descripcion === "200 OK")!;
    expect(ok.orden).toBe(6);
    expect(ok.messageKind).toBe("return");
  });

  it("el alt llega con operador y encierra sus mensajes por geometría", () => {
    const data = toGraphData(bupa().model);
    const alt = data.agregados.find((a) => a.tipo_contenedor === FRAGMENTO)!;
    expect(alt.fragmentOp).toBe("alt");
    expect(alt.fragmentParts?.[0]).toMatchObject({ desde: 3, hasta: 5 });
    const lineas = data.agregados.filter((a) => a.tipo_contenedor === LINEA);
    const y0 = lineas[0].y!;
    const colocados = [1, 2, 3, 4, 5, 6].map((orden) => ({ orden, y: y0 + alturaDeMensaje(orden) }));
    expect(rangoPorGeometria({ y: alt.y!, height: alt.height! }, colocados)).toEqual({ desde: 3, hasta: 5 });
  });

  it("relayout y la ida y vuelta por GraphData conservan todo", () => {
    const vuelta = fromGraphData(toGraphData(bupa().model), "uml");
    // El orden vive en la arista, no en la posición de la lista: el auto-mensaje
    // viaja dentro de su línea de vida y vuelve primero.
    expect(vuelta.edges.map((e) => e.orden).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const alt = vuelta.nodes.find((n) => isFragmentContainer(n.tipo_elemento))!;
    expect(alt.fragmentOp).toBe("alt");
    const re = relayout(vuelta);
    const lineas = re.nodes.filter((n) => isLifelineContainer(n.tipo_elemento));
    expect(new Set(lineas.map((n) => n.y)).size).toBe(1);
  });

  it("move_message renumera sin huecos", () => {
    const movido = reorderMessage(bupa().model, 6, 1);
    expect(movido.edges.map((e) => e.orden).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(movido.edges.find((e) => e.descripcion === "200 OK")!.orden).toBe(1);
  });
});

describe("validate_diagram en secuencia (#616)", () => {
  function dosLineas() {
    let model = emptyDiagram({ nombre_proyecto: "x", notation: "uml" });
    const a = addContainer(model, { nombre: "A", tipo_elemento: LINEA });
    const b = addContainer(a.model, { nombre: "B", tipo_elemento: LINEA });
    return { model: b.model, a: a.id, b: b.id };
  }

  it("una secuencia sin mensajes avisa", () => {
    const v = validate(dosLineas().model);
    expect(v.warnings.some((w) => /no tiene mensajes/.test(w))).toBe(true);
  });

  it("un mensaje creado con add_edge (sin orden) es error", () => {
    const { model, a, b } = dosLineas();
    const v = validate(addEdge(model, { fuente: a, destino: b }));
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /sin orden/.test(e))).toBe(true);
  });

  it("huecos o duplicados en el orden avisan", () => {
    const { model, a, b } = dosLineas();
    const roto = { ...model, edges: [{ fuente: a, destino: b, orden: 1 }, { fuente: b, destino: a, orden: 3 }] };
    expect(validate(roto).warnings.some((w) => /huecos o duplicados/.test(w))).toBe(true);
  });

  it("un fragmento que no abarca nada avisa; fuera de la secuencia es error", () => {
    const { model, a, b } = dosLineas();
    const conMsg = addMessage(model, { fuente: a, destino: b });
    const vacio = addFragment(model, { nombre: "x", tipo_elemento: FRAGMENTO, op: "opt", desde: 1, hasta: 1 }).model;
    expect(validate(vacio).warnings.some((w) => /no abarca ningún mensaje/.test(w))).toBe(true);
    const fuera = {
      ...conMsg,
      nodes: [...conMsg.nodes, { id: "f", nombre: "f", tipo_elemento: FRAGMENTO, container: "", fragmentOp: "loop" as const, fragmentParts: [{ guarda: "", desde: 1, hasta: 4 }] }],
    };
    expect(validate(fuera).errors.some((e) => /la secuencia tiene 1/.test(e))).toBe(true);
  });
});
