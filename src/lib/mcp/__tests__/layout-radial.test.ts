/**
 * Layout RADIAL: el mapa de conceptos de DDD (concepto central + anillos).
 *
 * Lo que se prueba no es "quedó bonito" sino las garantías del algoritmo: quién
 * manda al centro, que la distancia al centro crezca con los saltos de relación,
 * que nada se encime, que nada quede en negativo y que sea determinista.
 */
import { describe, it, expect } from "vitest";
import { emptyDiagram, addNode, addEdge, addContainer, layout, relayout, NODE_W } from "../diagram-builder";
import { defaultStrategyFor, resolveStrategy, LAYOUT_STRATEGIES } from "../layout-presets";
import { getNotation, isBlobContainer, typesWithRole } from "../../notations";

const tipo = (role: Parameters<typeof typesWithRole>[1]) => typesWithRole("ddd", role)[0];

/** Estrella: un concepto central con `n` satélites, y un satélite con nieto. */
function estrella(n = 6) {
  let m = emptyDiagram({ nombre_proyecto: "Dominio", notation: "ddd" as const });
  const clase = tipo("event");
  m = addNode(m, { id: "centro", nombre: "Modelo", tipo_elemento: clase }).model;
  for (let i = 0; i < n; i++) {
    m = addNode(m, { id: `s${i}`, nombre: `Satélite ${i}`, tipo_elemento: clase }).model;
    m = addEdge(m, { fuente: "centro", destino: `s${i}`, descripcion: "se relaciona con" });
  }
  m = addNode(m, { id: "nieto", nombre: "Nieto", tipo_elemento: clase }).model;
  m = addEdge(m, { fuente: "s0", destino: "nieto", descripcion: "encapsula" });
  return m;
}

const pos = (m: ReturnType<typeof estrella>, id: string) => {
  const n = m.nodes.find((x) => x.id === id)!;
  return { x: n.x!, y: n.y! };
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("estrategia radial", () => {
  it("DDD se dibuja radial por defecto y la estrategia existe en el menú", () => {
    expect(defaultStrategyFor("ddd")).toBe("radial");
    expect(resolveStrategy("radial", "ddd")).toBe("radial");
    expect(LAYOUT_STRATEGIES.radial.id).toBe("radial");
  });

  it("BPMN sigue siendo flujo: la notación declara su disposición, no el algoritmo", () => {
    expect(defaultStrategyFor("bpmn")).toBe("flujo");
    expect(defaultStrategyFor("c4")).toBe("capas");
  });

  it("el nodo más conectado queda en el centro del anillo", () => {
    const out = layout(estrella(), { strategy: "radial" });
    const centro = pos(out, "centro");
    // TODOS los satélites: el baricentro de un anillo parcial no es el centro.
    const satelites = ["s0", "s1", "s2", "s3", "s4", "s5"].map((id) => pos(out, id));
    // El centro está más cerca del baricentro de sus satélites que cualquiera
    // de ellos: eso es "estar en el medio" sin depender de números mágicos.
    const gx = satelites.reduce((a, p) => a + p.x, 0) / satelites.length;
    const gy = satelites.reduce((a, p) => a + p.y, 0) / satelites.length;
    for (const s of satelites) {
      expect(dist(centro, { x: gx, y: gy })).toBeLessThan(dist(s, { x: gx, y: gy }));
    }
  });

  it("cada salto de relación aleja del centro", () => {
    const out = layout(estrella(), { strategy: "radial" });
    const centro = pos(out, "centro");
    expect(dist(pos(out, "nieto"), centro)).toBeGreaterThan(dist(pos(out, "s0"), centro));
  });

  it("los nodos del mismo anillo no se enciman", () => {
    const out = layout(estrella(10), { strategy: "radial" });
    const anillo = out.nodes.filter((n) => n.id.startsWith("s")).map((n) => ({ x: n.x!, y: n.y! }));
    for (let i = 0; i < anillo.length; i++) {
      for (let j = i + 1; j < anillo.length; j++) {
        expect(dist(anillo[i], anillo[j])).toBeGreaterThanOrEqual(NODE_W);
      }
    }
  });

  it("no genera coordenadas negativas (el lienzo no las dibuja)", () => {
    const out = layout(estrella(8), { strategy: "radial" });
    for (const n of out.nodes) {
      expect(n.x!).toBeGreaterThanOrEqual(0);
      expect(n.y!).toBeGreaterThanOrEqual(0);
    }
  });

  it("es determinista: mismo modelo, misma disposición", () => {
    const a = layout(estrella(7), { strategy: "radial" });
    const b = layout(estrella(7), { strategy: "radial" });
    expect(b.nodes.map((n) => [n.id, n.x, n.y])).toEqual(a.nodes.map((n) => [n.id, n.x, n.y]));
  });

  it("un contenedor envuelve a sus hijos", () => {
    let m = estrella(4);
    const ctx = tipo("context");
    m = addContainer(m, { nombre: "Ventas", tipo_elemento: ctx }).model;
    m = addNode(m, { id: "dentro", nombre: "Pedido", tipo_elemento: tipo("event"), container: "Ventas" }).model;
    m = addEdge(m, { fuente: "centro", destino: "dentro", descripcion: "contiene" });

    const out = relayout(m, { strategy: "radial" });
    const caja = out.nodes.find((n) => n.nombre === "Ventas")!;
    const hijo = out.nodes.find((n) => n.id === "dentro")!;
    expect(hijo.x!).toBeGreaterThanOrEqual(caja.x!);
    expect(hijo.y!).toBeGreaterThanOrEqual(caja.y!);
    expect(hijo.x! + NODE_W).toBeLessThanOrEqual(caja.x! + caja.width!);
    expect(hijo.y!).toBeLessThanOrEqual(caja.y! + caja.height!);
  });

  it("la ELIPSE del contenedor cubre a sus hijos, no sólo su caja", () => {
    let m = estrella(4);
    const ctx = tipo("context");
    expect(isBlobContainer(ctx)).toBe(true);
    m = addContainer(m, { nombre: "Ventas", tipo_elemento: ctx }).model;
    for (let i = 0; i < 3; i++) {
      m = addNode(m, {
        id: `v${i}`,
        nombre: `Pedido ${i}`,
        tipo_elemento: tipo("event"),
        container: "Ventas",
      }).model;
      m = addEdge(m, { fuente: "centro", destino: `v${i}`, descripcion: "contiene" });
    }

    const out = relayout(m, { strategy: "radial" });
    const caja = out.nodes.find((n) => n.nombre === "Ventas")!;
    const cx = caja.x! + caja.width! / 2;
    const cy = caja.y! + caja.height! / 2;
    const rx = caja.width! / 2;
    const ry = caja.height! / 2;
    // Las CUATRO esquinas de cada hijo caen dentro de la elipse: (dx/rx)²+(dy/ry)² ≤ 1.
    for (const hijo of out.nodes.filter((n) => n.container === "Ventas")) {
      for (const [ex, ey] of [
        [hijo.x!, hijo.y!],
        [hijo.x! + NODE_W, hijo.y!],
        [hijo.x!, hijo.y! + 60],
        [hijo.x! + NODE_W, hijo.y! + 60],
      ]) {
        const dentro = ((ex - cx) / rx) ** 2 + ((ey - cy) / ry) ** 2;
        expect(dentro).toBeLessThanOrEqual(1);
      }
    }
  });

  it("los conceptos DDD se dibujan como óvalos", () => {
    const ddd = getNotation("ddd");
    for (const e of ddd.elements.filter((x) => !x.container && !x.shape)) {
      // Ningún elemento suelto puede quedarse sin forma declarada: el default
      // es el rectángulo redondeado y rompería el mapa de conceptos.
      expect.unreachable(`"${e.type}" no declara forma`);
    }
    for (const tipoDdd of ["Comando", "Evento", "Entidad", "Raíz de Agregado"]) {
      expect(ddd.elements.find((e) => e.type === tipoDdd)?.shape).toBe("ellipse");
    }
  });

  it("con DOS contenedores en el anillo, los hijos de cada uno quedan juntos", () => {
    // Contigüidad ANGULAR: es lo que el algoritmo garantiza. No garantiza cajas
    // disjuntas —el blob se infla ×√2 alrededor de su centro y dos sectores
    // opuestos pueden tocarse—, pero sí que los hijos de un contenedor no
    // aparezcan intercalados con los del vecino, que es lo que hacía que una
    // elipse se tragara nodos ajenos.
    let m = emptyDiagram({ nombre_proyecto: "Dominio", notation: "ddd" as const });
    const ctx = tipo("context");
    m = addNode(m, { id: "centro", nombre: "Modelo", tipo_elemento: tipo("event") }).model;
    for (const banda of ["Ventas", "Compras"]) {
      m = addContainer(m, { nombre: banda, tipo_elemento: ctx }).model;
      for (let i = 0; i < 3; i++) {
        m = addNode(m, {
          id: `${banda}-${i}`,
          nombre: `${banda} ${i}`,
          tipo_elemento: tipo("event"),
          container: banda,
        }).model;
        m = addEdge(m, { fuente: "centro", destino: `${banda}-${i}`, descripcion: "contiene" });
      }
    }

    const out = relayout(m, { strategy: "radial" });
    const centro = pos(out, "centro");
    // Ángulo de cada hijo alrededor del centro, ordenados por ángulo: los tres
    // de un contenedor tienen que salir seguidos, sin ninguno del otro en medio.
    const porAngulo = out.nodes
      .filter((n) => n.container === "Ventas" || n.container === "Compras")
      .map((n) => ({
        banda: n.container!,
        a: Math.atan2(pos(out, n.id).y - centro.y, pos(out, n.id).x - centro.x),
      }))
      .sort((x, y) => x.a - y.a)
      .map((x) => x.banda);

    // El recorrido es CIRCULAR: contar en línea sobreestima, porque el corte del
    // arco parte un grupo en dos. Dos grupos contiguos dan exactamente dos
    // cambios de banda al dar la vuelta entera; si se intercalaran, serían más.
    const cambios = porAngulo.filter(
      (b, i) => b !== porAngulo[(i + porAngulo.length - 1) % porAngulo.length]
    ).length;
    expect(cambios).toBe(2);
  });

  it("islas sin relación con el centro caen en el anillo exterior, no encima", () => {
    let m = estrella(5);
    m = addNode(m, { id: "isla", nombre: "Isla", tipo_elemento: tipo("event") }).model;
    const out = layout(m, { strategy: "radial" });
    const centro = pos(out, "centro");
    expect(dist(pos(out, "isla"), centro)).toBeGreaterThan(dist(pos(out, "s0"), centro));
  });
});
