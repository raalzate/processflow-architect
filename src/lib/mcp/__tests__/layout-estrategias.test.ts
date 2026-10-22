/**
 * Estrategias de layout: las garantías que comparten todas y lo que distingue a
 * cada una de las nuevas (jerárquica, línea de tiempo, mosaico por grupos).
 *
 * No se prueba "quedó bonito": se prueba lo que un humano notaría roto —cajas
 * encimadas, hijos fuera de su grupo, coordenadas negativas, una disposición
 * que cambia entre dos clics— y la regla que define a cada estrategia.
 */
import { describe, it, expect } from "vitest";
import {
  emptyDiagram,
  addNode,
  addEdge,
  addContainer,
  relayout,
  type BuilderNode,
  type DiagramModel,
} from "../diagram-builder";
import { LAYOUT_STRATEGIES, STRATEGY_ORDER, resolveStrategy, type LayoutStrategy } from "../layout-presets";
import { isNotationContainer, typesWithRole, type ElementRole, type NotationId } from "../../notations";
import { FIXTURES } from "../../layout/__tests__/fixtures";

const RELOJ = () => 0;
const tipo = (notation: NotationId, role: ElementRole) => typesWithRole(notation, role)[0];

const disponer = (m: DiagramModel, strategy: LayoutStrategy) => relayout(m, { strategy, ahora: RELOJ });
const nodo = (m: DiagramModel, id: string) => m.nodes.find((n) => n.id === id)!;
const caja = (m: DiagramModel, nombre: string) =>
  m.nodes.find((n) => n.nombre === nombre && isNotationContainer(n.tipo_elemento))!;
const centroX = (n: BuilderNode) => n.x! + n.width! / 2;

const seEnciman = (a: BuilderNode, b: BuilderNode) =>
  a.x! < b.x! + b.width! - 1 &&
  b.x! < a.x! + a.width! - 1 &&
  a.y! < b.y! + b.height! - 1 &&
  b.y! < a.y! + a.height! - 1;

const contiene = (c: BuilderNode, n: BuilderNode) =>
  n.x! >= c.x! - 1 &&
  n.y! >= c.y! - 1 &&
  n.x! + n.width! <= c.x! + c.width! + 1 &&
  n.y! + n.height! <= c.y! + c.height! + 1;

/** Dos contextos de dominio con una historia que pasa del primero al segundo. */
function historiaEntreContextos() {
  const ev = tipo("ddd", "event");
  const ctx = tipo("ddd", "context");
  let m = emptyDiagram({ nombre_proyecto: "Historia", notation: "ddd" });
  m = addContainer(m, { nombre: "Ventas", tipo_elemento: ctx }).model;
  m = addContainer(m, { nombre: "Cobro", tipo_elemento: ctx }).model;
  m = addNode(m, { id: "a1", nombre: "Pedido creado", tipo_elemento: ev, container: "Ventas" }).model;
  m = addNode(m, { id: "a2", nombre: "Pedido confirmado", tipo_elemento: ev, container: "Ventas" }).model;
  m = addNode(m, { id: "b1", nombre: "Factura emitida", tipo_elemento: ev, container: "Cobro" }).model;
  m = addNode(m, { id: "b2", nombre: "Pago recibido", tipo_elemento: ev, container: "Cobro" }).model;
  m = addEdge(m, { fuente: "a1", destino: "a2" });
  m = addEdge(m, { fuente: "a2", destino: "b1" });
  m = addEdge(m, { fuente: "b1", destino: "b2" });
  return m;
}

/** `n` contextos con `k` elementos cada uno y sin relaciones entre ellos. */
function contextosSueltos(n: number, k = 3) {
  const ctx = tipo("ddd", "context");
  const cmd = tipo("ddd", "command");
  let m = emptyDiagram({ nombre_proyecto: "Mapa", notation: "ddd" });
  for (let i = 0; i < n; i++) {
    m = addContainer(m, { nombre: `C${i}`, tipo_elemento: ctx }).model;
    for (let j = 0; j < k; j++)
      m = addNode(m, { id: `c${i}-${j}`, nombre: `Paso ${i}.${j}`, tipo_elemento: cmd, container: `C${i}` }).model;
  }
  return m;
}

/** Un árbol de sistemas C4: raíz, tres hijos y un nieto. */
function arbolDeSistemas() {
  const sys = tipo("c4", "system");
  let m = emptyDiagram({ nombre_proyecto: "Árbol", notation: "c4" });
  for (const id of ["raiz", "h1", "h2", "h3", "nieto"])
    m = addNode(m, { id, nombre: id, tipo_elemento: sys }).model;
  for (const h of ["h1", "h2", "h3"]) m = addEdge(m, { fuente: "raiz", destino: h });
  m = addEdge(m, { fuente: "h2", destino: "nieto" });
  return m;
}

const CASOS: Array<{ id: string; modelo: () => DiagramModel }> = [
  ...FIXTURES.map((f) => ({ id: f.id, modelo: f.modelo })),
  { id: "historia-entre-contextos", modelo: historiaEntreContextos },
  { id: "contextos-sueltos", modelo: () => contextosSueltos(7) },
  { id: "arbol-de-sistemas", modelo: arbolDeSistemas },
];

describe("registro de estrategias", () => {
  it("el menú ofrece todas, una sola vez y en un orden fijo", () => {
    expect([...STRATEGY_ORDER].sort()).toEqual(Object.keys(LAYOUT_STRATEGIES).sort());
    expect(new Set(STRATEGY_ORDER).size).toBe(STRATEGY_ORDER.length);
    for (const id of STRATEGY_ORDER) {
      expect(LAYOUT_STRATEGIES[id].id).toBe(id);
      expect(LAYOUT_STRATEGIES[id].label.length).toBeGreaterThan(0);
      expect(LAYOUT_STRATEGIES[id].hint.length).toBeGreaterThan(0);
    }
  });

  it("las nuevas se pueden pedir por id y lo desconocido cae a la natural", () => {
    for (const id of ["jerarquia", "linea_tiempo", "grupos"] as const)
      expect(resolveStrategy(id, "ddd")).toBe(id);
    expect(resolveStrategy("diagonal", "bpmn")).toBe("flujo");
  });
});

// Las garantías que nadie debería poder romper, en TODAS las estrategias y sobre
// los diagramas reales de referencia más tres sintéticos.
describe.each(STRATEGY_ORDER)("garantías de «%s»", (strategy) => {
  it.each(CASOS)("$id: nada se encima, nada queda en negativo", ({ modelo }) => {
    const out = disponer(modelo(), strategy);
    const sueltos = out.nodes.filter((n) => !isNotationContainer(n.tipo_elemento));
    for (const n of out.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
    }
    for (let i = 0; i < sueltos.length; i++)
      for (let j = i + 1; j < sueltos.length; j++)
        expect(seEnciman(sueltos[i], sueltos[j]), `${sueltos[i].id} pisa a ${sueltos[j].id}`).toBe(false);
  });

  it.each(CASOS)("$id: cada elemento queda dentro de su grupo", ({ modelo }) => {
    const out = disponer(modelo(), strategy);
    for (const n of out.nodes) {
      if (isNotationContainer(n.tipo_elemento) || !n.container) continue;
      const c = caja(out, n.container);
      if (c) expect(contiene(c, n), `${n.id} fuera de ${c.nombre}`).toBe(true);
    }
  });

  it.each(CASOS)("$id: es determinista y recuerda la estrategia", ({ modelo }) => {
    const a = disponer(modelo(), strategy);
    const b = disponer(modelo(), strategy);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.edges).toEqual(b.edges);
    expect(a.meta.layout?.strategy).toBe(strategy);
  });
});

// El radial deja que dos elipses se rocen (ver su comentario); las demás no.
describe.each(STRATEGY_ORDER.filter((s) => s !== "radial"))("«%s»: los grupos no se pisan", (strategy) => {
  it.each(CASOS)("$id", ({ modelo }) => {
    const out = disponer(modelo(), strategy);
    const cajas = out.nodes.filter((n) => isNotationContainer(n.tipo_elemento));
    for (let i = 0; i < cajas.length; i++)
      for (let j = i + 1; j < cajas.length; j++)
        expect(seEnciman(cajas[i], cajas[j]), `${cajas[i].nombre} pisa a ${cajas[j].nombre}`).toBe(false);
  });
});

describe("jerárquico", () => {
  it("cada nivel va debajo del anterior", () => {
    const out = disponer(arbolDeSistemas(), "jerarquia");
    for (const h of ["h1", "h2", "h3"]) expect(nodo(out, h).y!).toBeGreaterThan(nodo(out, "raiz").y!);
    expect(nodo(out, "nieto").y!).toBeGreaterThan(nodo(out, "h2").y!);
    // Hermanos en el mismo nivel.
    expect(new Set(["h1", "h2", "h3"].map((h) => nodo(out, h).y)).size).toBe(1);
  });

  it("el padre queda centrado sobre sus hijos y el nieto bajo su padre", () => {
    const out = disponer(arbolDeSistemas(), "jerarquia");
    const media = ["h1", "h2", "h3"].reduce((t, h) => t + centroX(nodo(out, h)), 0) / 3;
    expect(Math.abs(centroX(nodo(out, "raiz")) - media)).toBeLessThanOrEqual(1);
    expect(Math.abs(centroX(nodo(out, "nieto")) - centroX(nodo(out, "h2")))).toBeLessThanOrEqual(1);
  });

  it("la herencia apunta al padre, y el padre va ARRIBA", () => {
    const clase = tipo("uml", "task");
    let m = emptyDiagram({ nombre_proyecto: "Clases", notation: "uml" });
    for (const id of ["Base", "Hija", "Nieta"]) m = addNode(m, { id, nombre: id, tipo_elemento: clase }).model;
    m = addEdge(m, { fuente: "Hija", destino: "Base", relation: "herencia" });
    m = addEdge(m, { fuente: "Nieta", destino: "Hija", relation: "herencia" });
    const out = disponer(m, "jerarquia");
    expect(nodo(out, "Base").y!).toBeLessThan(nodo(out, "Hija").y!);
    expect(nodo(out, "Hija").y!).toBeLessThan(nodo(out, "Nieta").y!);
  });

  it("los grupos son ramas lado a lado y del mismo alto", () => {
    const out = disponer(historiaEntreContextos(), "jerarquia");
    const ventas = caja(out, "Ventas");
    const cobro = caja(out, "Cobro");
    expect(ventas.x! + ventas.width!).toBeLessThan(cobro.x!);
    expect(ventas.y).toBe(cobro.y);
    expect(ventas.height).toBe(cobro.height);
  });
});

describe("línea de tiempo", () => {
  it("lo posterior queda a la derecha aunque cambie de grupo", () => {
    const out = disponer(historiaEntreContextos(), "linea_tiempo");
    const x = (id: string) => nodo(out, id).x!;
    expect(x("a1")).toBeLessThan(x("a2"));
    expect(x("a2")).toBeLessThan(x("b1"));
    expect(x("b1")).toBeLessThan(x("b2"));
  });

  it("el flujo por carril, en cambio, reinicia el avance en cada banda", () => {
    // Es la razón de ser de la estrategia: si esto dejara de ser cierto, la
    // línea de tiempo sería un duplicado del flujo.
    const out = disponer(historiaEntreContextos(), "flujo");
    expect(nodo(out, "b1").x).toBe(nodo(out, "a1").x);
  });

  it("las bandas comparten eje: mismo x y mismo ancho, una debajo de otra", () => {
    const out = disponer(historiaEntreContextos(), "linea_tiempo");
    const ventas = caja(out, "Ventas");
    const cobro = caja(out, "Cobro");
    expect(ventas.x).toBe(cobro.x);
    expect(ventas.width).toBe(cobro.width);
    expect(cobro.y!).toBeGreaterThan(ventas.y! + ventas.height!);
  });

  it("lo que no se relaciona con nada va al pie, no engorda la primera columna", () => {
    const ev = tipo("ddd", "event");
    let m = emptyDiagram({ nombre_proyecto: "Islas", notation: "ddd" });
    for (const id of ["e1", "e2", "e3"]) m = addNode(m, { id, nombre: id, tipo_elemento: ev }).model;
    m = addEdge(m, { fuente: "e1", destino: "e2" });
    m = addEdge(m, { fuente: "e2", destino: "e3" });
    for (const id of ["s1", "s2", "s3"]) m = addNode(m, { id, nombre: id, tipo_elemento: ev }).model;
    const out = disponer(m, "linea_tiempo");
    const pie = ["s1", "s2", "s3"].map((id) => nodo(out, id));
    // Una sola fila debajo del eje, repartida en columnas distintas.
    expect(new Set(pie.map((n) => n.y)).size).toBe(1);
    expect(pie[0].y!).toBeGreaterThan(nodo(out, "e1").y!);
    expect(new Set(pie.map((n) => n.x)).size).toBe(3);
  });

  it("quien sólo dispara va justo antes de lo que provoca, no en la columna 0", () => {
    let m = historiaEntreContextos();
    m = addNode(m, { id: "cliente", nombre: "Cliente", tipo_elemento: tipo("ddd", "actor") }).model;
    m = addEdge(m, { fuente: "cliente", destino: "b1" });
    const out = disponer(m, "linea_tiempo");
    const x = (id: string) => nodo(out, id).x!;
    // b1 es el tercer momento: el actor queda en el segundo, a la altura de a2.
    expect(x("cliente")).toBe(x("a2"));
    expect(x("cliente")).toBeLessThan(x("b1"));
  });

  it("en una misma columna se lee por rol: el comando antes que la política", () => {
    const ev = tipo("ddd", "event");
    let m = emptyDiagram({ nombre_proyecto: "Columna", notation: "ddd" });
    m = addNode(m, { id: "hecho", nombre: "Hecho", tipo_elemento: ev }).model;
    // La política se declara primero: si el orden saliera de la declaración, iría arriba.
    m = addNode(m, { id: "pol", nombre: "Reacción", tipo_elemento: tipo("ddd", "policy") }).model;
    m = addNode(m, { id: "cmd", nombre: "Pedir", tipo_elemento: tipo("ddd", "command") }).model;
    m = addEdge(m, { fuente: "hecho", destino: "pol" });
    m = addEdge(m, { fuente: "hecho", destino: "cmd" });
    const out = disponer(m, "linea_tiempo");
    expect(nodo(out, "cmd").x).toBe(nodo(out, "pol").x);
    expect(nodo(out, "cmd").y!).toBeLessThan(nodo(out, "pol").y!);
  });
});

describe("por grupos (mosaico)", () => {
  it("siete grupos forman un mapa y no una torre", () => {
    const mosaico = disponer(contextosSueltos(7), "grupos");
    const cajas = mosaico.nodes.filter((n) => isNotationContainer(n.tipo_elemento));
    expect(new Set(cajas.map((c) => c.x)).size).toBeGreaterThan(1);
    expect(new Set(cajas.map((c) => c.y)).size).toBeGreaterThan(1);
    // La promesa es ENTRAR en pantalla: la proporción del mosaico queda más cerca
    // de la de un monitor (16:10) que la de las bandas apiladas, y es más bajo.
    const medidas = (m: DiagramModel) => ({
      w: Math.max(...m.nodes.map((n) => n.x! + n.width!)),
      h: Math.max(...m.nodes.map((n) => n.y! + n.height!)),
    });
    const lejosDePantalla = ({ w, h }: { w: number; h: number }) => Math.abs(Math.log(w / h / 1.6));
    const apilado = medidas(disponer(contextosSueltos(7), "capas"));
    expect(lejosDePantalla(medidas(mosaico))).toBeLessThan(lejosDePantalla(apilado));
    expect(medidas(mosaico).h).toBeLessThan(apilado.h);
  });

  it("las celdas se alinean como tabla: misma columna, mismo x y mismo ancho", () => {
    const out = disponer(contextosSueltos(6), "grupos");
    const cajas = out.nodes.filter((n) => isNotationContainer(n.tipo_elemento));
    const porX = new Map<number, Set<number>>();
    for (const c of cajas) (porX.get(c.x!) ?? porX.set(c.x!, new Set()).get(c.x!)!).add(c.width!);
    for (const anchos of porX.values()) expect(anchos.size).toBe(1);
    const porY = new Map<number, Set<number>>();
    for (const c of cajas) (porY.get(c.y!) ?? porY.set(c.y!, new Set()).get(c.y!)!).add(c.height!);
    for (const altos of porY.values()) expect(altos.size).toBe(1);
  });

  it("los grupos que más se hablan quedan pegados", () => {
    let m = contextosSueltos(4);
    // C0 y C3 se relacionan mucho; por declaración quedarían en esquinas opuestas.
    for (let j = 0; j < 3; j++) m = addEdge(m, { fuente: `c0-${j}`, destino: `c3-${j}` });
    const out = disponer(m, "grupos");
    const c0 = caja(out, "C0");
    const c3 = caja(out, "C3");
    // Rejilla de 2×2: C3 va a la celda contigua a C0, en su misma fila.
    expect(c3.y).toBe(c0.y);
    expect(c3.x!).toBeGreaterThan(c0.x!);
    const entre = out.nodes.filter(
      (n) => isNotationContainer(n.tipo_elemento) && n.y === c0.y && n.x! > c0.x! && n.x! < c3.x!
    );
    expect(entre).toHaveLength(0);
  });
});
