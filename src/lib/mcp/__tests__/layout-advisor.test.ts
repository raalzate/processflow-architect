/**
 * Asesor de layout: qué estrategia conviene a un diagrama y por qué.
 *
 * Cada regla se prueba con el diagrama mínimo que la dispara, en el orden en
 * que el asesor las evalúa. Después, la elección MEDIDA (`elegirEstrategia`):
 * nunca recomienda algo que se lea peor que sus alternativas, y es determinista.
 */
import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addNode,
  addEdge,
  addContainer,
  addMessage,
  elegirEstrategia,
  relayout,
  relayoutConMedida,
  toGraphData,
  ELEMENTOS_PARA_MEDIR,
  type DiagramModel,
} from "../diagram-builder";
import { analizarDiagrama, recomendarEstrategia } from "../layout-advisor";
import { defaultStrategyFor, type LayoutStrategy } from "../layout-presets";
import { recommendArrangement } from "../arrange";
import { typesWithRole, type ElementRole, type NotationId } from "../../notations";
import { FIXTURES } from "../../layout/__tests__/fixtures";

const tipo = (notation: NotationId, role: ElementRole) => typesWithRole(notation, role)[0];
const vacio = (notation: NotationId) => emptyDiagram({ nombre_proyecto: "P", notation });

function conNodos(notation: NotationId, nodos: Array<[string, ElementRole, string?]>) {
  let m = vacio(notation);
  for (const [id, rol, container] of nodos)
    m = addNode(m, { id, nombre: id, tipo_elemento: tipo(notation, rol), ...(container ? { container } : {}) }).model;
  return m;
}
const unir = (m: DiagramModel, pares: Array<[string, string]>) =>
  pares.reduce((acc, [fuente, destino]) => addEdge(acc, { fuente, destino }), m);

/** Proceso BPMN de inicio a fin; con `participantes` = 2 se reparte en dos pools. */
function proceso(participantes: 1 | 2) {
  let m = vacio("bpmn");
  m = addContainer(m, { nombre: "Cliente", tipo_elemento: tipo("bpmn", "pool") }).model;
  if (participantes === 2) m = addContainer(m, { nombre: "Banco", tipo_elemento: tipo("bpmn", "pool") }).model;
  const otro = participantes === 2 ? "Banco" : "Cliente";
  const pasos: Array<[string, ElementRole, string]> = [
    ["ini", "start", "Cliente"],
    ["t1", "task", "Cliente"],
    ["t2", "task", otro],
    ["t3", "task", otro],
    ["fin", "end", "Cliente"],
  ];
  for (const [id, rol, c] of pasos)
    m = addNode(m, { id, nombre: id, tipo_elemento: tipo("bpmn", rol), container: c }).model;
  return unir(m, [
    ["ini", "t1"],
    ["t1", "t2"],
    ["t2", "t3"],
    ["t3", "fin"],
  ]);
}

describe("señales", () => {
  it("mide profundidad, árbol, ciclos y concentración", () => {
    const m = unir(conNodos("c4", [["r", "system"], ["a", "system"], ["b", "system"], ["c", "system"]]), [
      ["r", "a"],
      ["r", "b"],
      ["a", "c"],
    ]);
    const s = analizarDiagrama(m);
    expect(s).toMatchObject({ elementos: 4, relaciones: 3, profundidad: 3, aciclico: true, arbol: true });
    expect(s.centro).toBe("r");
    expect(s.concentracion).toBeCloseTo(2 / 3);

    const conCiclo = analizarDiagrama(addEdge(m, { fuente: "c", destino: "r" }));
    expect(conCiclo.aciclico).toBe(false);
    expect(conCiclo.arbol).toBe(false);
  });

  it("dos padres rompen el árbol aunque no haya ciclo", () => {
    const m = unir(conNodos("c4", [["a", "system"], ["b", "system"], ["c", "system"]]), [
      ["a", "c"],
      ["b", "c"],
    ]);
    expect(analizarDiagrama(m)).toMatchObject({ aciclico: true, arbol: false });
  });

  it("cuenta qué parte de las relaciones cruza de un grupo a otro", () => {
    const s = analizarDiagrama(proceso(2));
    expect(s.grupos).toBe(2);
    // t1→t2 y t3→fin cruzan; ini→t1 y t2→t3 no.
    expect(s.entreGrupos).toBeCloseTo(0.5);
    expect(s.conInicioYFin).toBe(true);
  });

  it("la herencia se mide hacia abajo: un padre con dos hijas es un árbol", () => {
    let m = conNodos("uml", [["Base", "task"], ["A", "task"], ["B", "task"]]);
    m = addEdge(m, { fuente: "A", destino: "Base", relation: "herencia" });
    m = addEdge(m, { fuente: "B", destino: "Base", relation: "herencia" });
    expect(analizarDiagrama(m)).toMatchObject({ arbol: true, jerarquicas: 1, centro: "Base" });
  });
});

describe("reglas", () => {
  it("vacío → la natural de la notación", () => {
    for (const n of ["ddd", "bpmn", "c4"] as const) expect(recomendarEstrategia(vacio(n)).strategy).toBe(defaultStrategyFor(n));
  });

  it("sin relaciones: mosaico si hay grupos, capas si no", () => {
    let m = vacio("ddd");
    for (const c of ["A", "B"]) m = addContainer(m, { nombre: c, tipo_elemento: tipo("ddd", "context") }).model;
    m = addNode(m, { id: "x", nombre: "x", tipo_elemento: tipo("ddd", "command"), container: "A" }).model;
    m = addNode(m, { id: "y", nombre: "y", tipo_elemento: tipo("ddd", "command"), container: "B" }).model;
    expect(recomendarEstrategia(m).strategy).toBe("grupos");
    expect(recomendarEstrategia(conNodos("ddd", [["x", "command"], ["y", "event"]])).strategy).toBe("capas");
  });

  it("proceso en un participante → flujo", () => {
    const r = recomendarEstrategia(proceso(1));
    expect(r.strategy).toBe("flujo");
    expect(r.alternativas).toContain("linea_tiempo");
  });

  it("proceso que pasa entre participantes → línea de tiempo", () => {
    const r = recomendarEstrategia(proceso(2));
    expect(r.strategy).toBe("linea_tiempo");
    expect(r.motivo).toMatch(/50 %/);
  });

  it("cadena de eventos (Event Storming) → flujo; si cruza contextos, línea de tiempo", () => {
    const sola = unir(conNodos("ddd", [["e1", "event"], ["e2", "event"], ["e3", "event"]]), [
      ["e1", "e2"],
      ["e2", "e3"],
    ]);
    expect(recomendarEstrategia(sola).strategy).toBe("flujo");

    let m = vacio("ddd");
    for (const c of ["Ventas", "Cobro"]) m = addContainer(m, { nombre: c, tipo_elemento: tipo("ddd", "context") }).model;
    for (const [id, c] of [["e1", "Ventas"], ["e2", "Ventas"], ["e3", "Cobro"], ["e4", "Cobro"]])
      m = addNode(m, { id, nombre: id, tipo_elemento: tipo("ddd", "event"), container: c }).model;
    m = unir(m, [["e1", "e2"], ["e2", "e3"], ["e3", "e4"]]);
    const r = recomendarEstrategia(m);
    expect(r.strategy).toBe("linea_tiempo");
    expect(r.motivo).toMatch(/4 eventos/);
  });

  it("herencia o un árbol puro → jerárquico", () => {
    let clases = conNodos("uml", [["Base", "task"], ["A", "task"], ["B", "task"]]);
    clases = addEdge(clases, { fuente: "A", destino: "Base", relation: "herencia" });
    clases = addEdge(clases, { fuente: "B", destino: "Base", relation: "herencia" });
    expect(recomendarEstrategia(clases).strategy).toBe("jerarquia");

    const arbol = unir(
      conNodos("c4", [["r", "system"], ["a", "system"], ["b", "system"], ["c", "system"], ["d", "system"]]),
      [["r", "a"], ["r", "b"], ["a", "c"], ["a", "d"]]
    );
    const r = recomendarEstrategia(arbol);
    expect(r.strategy).toBe("jerarquia");
    expect(r.motivo).toMatch(/cuelga de uno solo/);
  });

  it("un concepto que toca a la mitad del resto → radial", () => {
    const hub = conNodos("ddd", [["centro", "rule"], ...[0, 1, 2, 3, 4].map((i): [string, ElementRole] => [`s${i}`, "rule"])]);
    let m = unir(hub, [0, 1, 2, 3, 4].map((i): [string, string] => [`s${i}`, "centro"]));
    // Un ciclo entre satélites: deja de ser árbol, sigue siendo un centro claro.
    m = addEdge(m, { fuente: "s0", destino: "s1" });
    m = addEdge(m, { fuente: "s1", destino: "s0" });
    const r = recomendarEstrategia(m);
    expect(r.strategy).toBe("radial");
    expect(r.motivo).toContain("«centro»");
  });

  it("actores y sistemas → capas", () => {
    const m = unir(
      conNodos("c4", [["u", "actor"], ["s", "system"], ["db", "datastore"], ["x", "external"]]),
      [["u", "s"], ["s", "db"], ["s", "x"], ["x", "s"]]
    );
    expect(recomendarEstrategia(m).strategy).toBe("capas");
  });

  it("muchos grupos casi independientes → mosaico", () => {
    let m = vacio("ddd");
    for (let i = 0; i < 4; i++) {
      m = addContainer(m, { nombre: `C${i}`, tipo_elemento: tipo("ddd", "context") }).model;
      m = addNode(m, { id: `a${i}`, nombre: `a${i}`, tipo_elemento: tipo("ddd", "command"), container: `C${i}` }).model;
      m = addNode(m, { id: `b${i}`, nombre: `b${i}`, tipo_elemento: tipo("ddd", "command"), container: `C${i}` }).model;
      m = addEdge(m, { fuente: `a${i}`, destino: `b${i}` });
    }
    const r = recomendarEstrategia(m);
    expect(r.strategy).toBe("grupos");
    expect(r.motivo).toMatch(/4 grupos/);
  });

  it("una secuencia no se discute: la ordena el tiempo", () => {
    let m = vacio("uml");
    for (const n of ["A", "B"]) m = addContainer(m, { nombre: n, tipo_elemento: tipo("uml", "pool") }).model;
    const idA = m.nodes[0].id;
    const idB = m.nodes[1].id;
    m = addMessage(m, { fuente: idA, destino: idB, descripcion: "hola" });
    const r = recomendarEstrategia(m);
    expect(r.senales.secuencia).toBe(true);
    expect(r.motivo).toMatch(/secuencia/);
  });

  it("las alternativas no repiten la elegida e incluyen la natural", () => {
    for (const m of [proceso(1), proceso(2), ...FIXTURES.map((f) => f.modelo())]) {
      const r = recomendarEstrategia(m);
      expect(r.alternativas).not.toContain(r.strategy);
      expect(new Set(r.alternativas).size).toBe(r.alternativas.length);
      const natural = defaultStrategyFor(m.meta.notation);
      if (natural !== r.strategy) expect(r.alternativas).toContain(natural);
    }
  });
});

describe("elección medida", () => {
  const coste = (m: DiagramModel, strategy: LayoutStrategy) => {
    const l = relayoutConMedida(m, { strategy, ahora: () => 0 }).legibilidad.despues;
    return 3 * l.cruces + 2 * l.sobreCaja + l.solape;
  };

  it.each(FIXTURES)("$id: la elegida no se lee peor que ninguna candidata", (f) => {
    const elegida = elegirEstrategia(f.modelo());
    for (const otra of elegida.alternativas)
      expect(coste(f.modelo(), elegida.strategy)).toBeLessThanOrEqual(coste(f.modelo(), otra));
  });

  it("si la medida contradice a la regla, el motivo lo dice con números", () => {
    // Proceso con inicio y fin que casi no cruza pools: la regla dice flujo, pero
    // en este diagrama el eje común deja un cruce menos.
    const f = FIXTURES.find((x) => x.id === "geiser-enrollment-y-emision-en-amigos")!;
    const regla = recomendarEstrategia(f.modelo());
    const elegida = elegirEstrategia(f.modelo());
    expect(regla.strategy).toBe("flujo");
    expect(elegida.strategy).toBe("linea_tiempo");
    expect(elegida.motivo).toMatch(/^Medido en este diagrama: línea de tiempo deja \d+ cruces/);
    expect(elegida.alternativas).toContain("flujo");
  });

  it("si la regla acierta, se queda con su motivo", () => {
    const bp = FIXTURES.find((x) => x.id === "geiser-big-picture-del-dominio")!;
    const elegida = elegirEstrategia(bp.modelo());
    expect(elegida.strategy).toBe("linea_tiempo");
    expect(elegida.motivo).toMatch(/eventos encadenados/);
  });

  it("es determinista: el mismo diagrama, la misma respuesta", () => {
    for (const f of FIXTURES) expect(elegirEstrategia(f.modelo())).toEqual(elegirEstrategia(f.modelo()));
  });

  it("un diagrama grande no se mide: manda la regla", () => {
    let m = vacio("c4");
    const n = ELEMENTOS_PARA_MEDIR + 1;
    for (let i = 0; i < n; i++) m = addNode(m, { id: `n${i}`, nombre: `n${i}`, tipo_elemento: tipo("c4", "system") }).model;
    for (let i = 1; i < n; i++) m = addEdge(m, { fuente: `n${i - 1}`, destino: `n${i}` });
    expect(elegirEstrategia(m)).toEqual(recomendarEstrategia(m));
  });

  it("`auto` dispone con la elegida y la recuerda por su nombre, no como auto", () => {
    const m = proceso(2);
    const out = relayout(m, { strategy: "auto", ahora: () => 0 });
    const elegida = elegirEstrategia(m);
    expect(out.meta.layout?.strategy).toBe(elegida.strategy);
    expect(out.nodes).toEqual(relayout(m, { strategy: elegida.strategy, ahora: () => 0 }).nodes);
  });

  it("el lienzo recibe la misma recomendación por GraphData", () => {
    const m = proceso(2);
    const r = recommendArrangement(toGraphData(m), "bpmn");
    expect(r.strategy).toBe(elegirEstrategia(m).strategy);
  });
});
