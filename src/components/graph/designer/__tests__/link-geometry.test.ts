/**
 * Geometría de las conexiones: dónde nace y dónde muere la línea.
 *
 * El caso que motivó estas pruebas: con enrutado ortogonal el extremo se
 * recortaba mirando al CENTRO del otro nodo (correcto en línea recta), pero el
 * primer tramo del corredor es axial. Resultado: la línea salía por el borde
 * derecho y bajaba en vertical, visiblemente despegada de la caja.
 */
import { describe, it, expect } from "vitest";
import {
  linkGeometry,
  linkEndpoints,
  defaultCurveApex,
  mirrorCurveApex,
  flipCurveApex,
  polylineMidpoint,
} from "../link-geom";
import type { DesignerNode, DesignerLink } from "../serialize";
import { sizeOfType, typesWithRole } from "@/lib/notations";

// Igual que en los demás tests nuevos: los tipos se derivan del registro, no se
// cablean (P6). `actor` y `system` existen en C4 por declaración de roles.
const ACTOR = typesWithRole("c4", "actor")[0];
const SISTEMA = typesWithRole("c4", "system")[0];

const nodo = (id: string, tipo: string, x: number, y: number): DesignerNode =>
  ({
    id,
    nombre: id,
    tipo_elemento: tipo,
    agregado: "",
    estado_comparativo: "nuevo",
    descripcion: "",
    x,
    y,
  }) as DesignerNode;

const arista = (extra: Partial<DesignerLink> = {}): DesignerLink =>
  ({
    id: "l1",
    sourceId: "a",
    targetId: "b",
    descripcion: "interactúa",
    ...extra,
  }) as DesignerLink;

const mapa = (...ns: DesignerNode[]) => new Map(ns.map((n) => [n.id, n]));

describe("linkGeometry · enrutado ortogonal", () => {
  it("con destino ABAJO, la línea sale por el borde inferior y entra por el superior", () => {
    // Persona arriba, Contenedor abajo y a la derecha: el eje dominante es
    // vertical, así que ambos extremos son verticales.
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 320, 400);
    const { w: aw, h: ah } = sizeOfType(ACTOR, "c4");
    const { w: bw } = sizeOfType(SISTEMA, "c4");

    const geo = linkGeometry(arista({ routing: "orthogonal" }), mapa(a, b), "c4")!;
    // Sale por el CENTRO del borde inferior de la caja de origen.
    expect(geo.start.x).toBeCloseTo(a.x + aw / 2, 5);
    expect(geo.start.y).toBeCloseTo(a.y + ah, 5);
    // Entra por el CENTRO del borde superior de la caja de destino.
    expect(geo.end.x).toBeCloseTo(b.x + bw / 2, 5);
    expect(geo.end.y).toBeCloseTo(b.y, 5);
  });

  it("con destino a la DERECHA, sale por el costado y entra por el costado", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 700, 20);
    const { w: aw, h: ah } = sizeOfType(ACTOR, "c4");
    const { h: bh } = sizeOfType(SISTEMA, "c4");

    const geo = linkGeometry(arista({ routing: "orthogonal" }), mapa(a, b), "c4")!;
    expect(geo.start.x).toBeCloseTo(a.x + aw, 5);
    expect(geo.start.y).toBeCloseTo(a.y + ah / 2, 5);
    expect(geo.end.x).toBeCloseTo(b.x, 5);
    expect(geo.end.y).toBeCloseTo(b.y + bh / 2, 5);
  });

  it("con un punto de quiebre, cada extremo mira a su quiebre vecino", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 700, 20);
    const { w: aw, h: ah } = sizeOfType(ACTOR, "c4");
    // Quiebre justo debajo del origen → la salida deja de ser lateral.
    const geo = linkGeometry(
      arista({ routing: "orthogonal", midpoints: [{ x: aw / 2, y: 600 }] }),
      mapa(a, b),
      "c4"
    )!;
    expect(geo.start.x).toBeCloseTo(a.x + aw / 2, 5);
    expect(geo.start.y).toBeCloseTo(a.y + ah, 5);
  });

  it("el ancla puesta a mano manda sobre el corredor", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 320, 400);
    const { w: aw, h: ah } = sizeOfType(ACTOR, "c4");
    const geo = linkGeometry(
      arista({ routing: "orthogonal", sourceAnchor: { x: 1, y: 0 } }),
      mapa(a, b),
      "c4"
    )!;
    expect(geo.start).toEqual({ x: a.x + aw, y: a.y });
    expect(ah).toBeGreaterThan(0);
  });
});

describe("linkEndpoints · tamaño por notación", () => {
  it("recorta contra la caja REAL del tipo, no contra una medida fija", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 800, 0);
    const { w: aw, h: ah } = sizeOfType(ACTOR, "c4");
    const ep = linkEndpoints(arista(), mapa(a, b), "c4")!;
    // Misma altura → sale por el borde derecho, a media altura de la ficha.
    expect(ep.start.x).toBeCloseTo(aw, 5);
    expect(ep.start.y).toBeCloseTo(ah / 2, 5);
  });
});

/**
 * Incidente: la curva siempre se combaba al MISMO lado (la perpendicular tenía
 * un solo signo), así que dos nodos vecinos no podían separar sus líneas ni el
 * humano invertir un arco que le tapaba un nodo. El arco ahora tiene vértice
 * (`apex`) editable y se puede espejar.
 */
describe("linkGeometry · enrutado curvo", () => {
  it("sin vértice guardado usa el arco por defecto y ofrece manija de curva", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 0, 400);
    const geo = linkGeometry(arista({ routing: "curved" }), mapa(a, b), "c4")!;
    const apex = defaultCurveApex(geo.start, geo.end);
    expect(geo.bend).toEqual(apex);
    expect(geo.bendKind).toBe("curve");
    // La etiqueta viaja con el vértice del arco, no con la cuerda.
    expect(geo.labelX).toBeCloseTo(apex.x, 5);
    expect(geo.labelY).toBeCloseTo(apex.y, 5);
  });

  it("el vértice guardado manda: la curva pasa por él (y puede combar al otro lado)", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 0, 400);
    const recto = linkGeometry(arista({ routing: "curved" }), mapa(a, b), "c4")!;
    const invertido = mirrorCurveApex(recto.start, recto.end, defaultCurveApex(recto.start, recto.end));
    const geo = linkGeometry(
      arista({ routing: "curved", midpoints: [invertido] }),
      mapa(a, b),
      "c4"
    )!;
    expect(geo.bend!.x).toBeCloseTo(invertido.x, 5);
    expect(geo.bend!.y).toBeCloseTo(invertido.y, 5);
    // El arco por defecto y el invertido caen a lados OPUESTOS de la cuerda.
    const cuerdaX = (geo.start.x + geo.end.x) / 2;
    const porDefecto = defaultCurveApex(geo.start, geo.end);
    expect(Math.sign(porDefecto.x - cuerdaX)).toBe(-Math.sign(invertido.x - cuerdaX));
    // Y el trazo es una cuadrática que pasa por el vértice en t=0.5.
    const [, cx, cy] = geo.path.match(/Q([-\d.]+),([-\d.]+)/)!.map(Number);
    expect(0.25 * geo.start.x + 0.5 * cx + 0.25 * geo.end.x).toBeCloseTo(invertido.x, 4);
    expect(0.25 * geo.start.y + 0.5 * cy + 0.25 * geo.end.y).toBeCloseTo(invertido.y, 4);
  });

  it("espejar dos veces devuelve el vértice original", () => {
    const s = { x: 10, y: 20 };
    const e = { x: 210, y: 120 };
    const apex = { x: 90, y: 200 };
    const ida = mirrorCurveApex(s, e, apex);
    const vuelta = mirrorCurveApex(s, e, ida);
    expect(vuelta.x).toBeCloseTo(apex.x, 5);
    expect(vuelta.y).toBeCloseTo(apex.y, 5);
  });

  it("flipCurveApex invierte el arco por defecto cuando el enlace no tiene vértice", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 0, 400);
    const link = arista({ routing: "curved" });
    const nodos = mapa(a, b);
    const antes = linkGeometry(link, nodos, "c4")!;
    const apex = flipCurveApex(link, nodos, "c4")!;
    const despues = linkGeometry(arista({ routing: "curved", midpoints: [apex] }), nodos, "c4")!;
    const cuerdaX = (antes.start.x + antes.end.x) / 2;
    expect(Math.sign(despues.bend!.x - cuerdaX)).toBe(-Math.sign(antes.bend!.x - cuerdaX));
  });

  it("el doblez escalonado sigue siendo esquina, no curva", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 320, 400);
    const geo = linkGeometry(arista({ routing: "orthogonal" }), mapa(a, b), "c4")!;
    expect(geo.bendKind).toBe("corner");
  });
});

/**
 * Incidente: en enrutado escalonado la etiqueta se colocaba en la mitad de la
 * CUERDA (recta imaginaria entre extremos), que en una L cae en el vacío: se
 * leía lejos de la línea. Y no había forma de moverla si tapaba algo.
 */
describe("linkGeometry · etiqueta", () => {
  it("en escalonada la etiqueta cae SOBRE el trazo, no en la mitad de la cuerda", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 600, 500);
    const geo = linkGeometry(arista({ routing: "orthogonal" }), mapa(a, b), "c4")!;
    // Distancia de la etiqueta al trazo (poli-línea del corredor) ≈ 0.
    const pts = geo.path
      .replace("M", "")
      .split(" L")
      .map((s) => s.split(",").map(Number) as [number, number]);
    const distSeg = (p: { x: number; y: number }, u: [number, number], v: [number, number]) => {
      const vx = v[0] - u[0], vy = v[1] - u[1];
      const len2 = vx * vx + vy * vy || 1;
      let t = ((p.x - u[0]) * vx + (p.y - u[1]) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(u[0] + t * vx - p.x, u[1] + t * vy - p.y);
    };
    const d = Math.min(
      ...pts.slice(0, -1).map((u, i) => distSeg({ x: geo.labelX, y: geo.labelY }, u, pts[i + 1]))
    );
    expect(d).toBeLessThan(0.01);

    // Con un quiebre puesto a mano (la L del incidente) la mitad de la cuerda
    // queda claramente FUERA del trazo, y la etiqueta ya no va ahí.
    const enL = linkGeometry(
      arista({ routing: "orthogonal", midpoints: [{ x: 40, y: 480 }] }),
      mapa(a, b),
      "c4"
    )!;
    const ptsL = enL.path
      .replace("M", "")
      .split(" L")
      .map((s) => s.split(",").map(Number) as [number, number]);
    const dEtiqueta = Math.min(
      ...ptsL.slice(0, -1).map((u, i) => distSeg({ x: enL.labelX, y: enL.labelY }, u, ptsL[i + 1]))
    );
    const cuerda = { x: (enL.start.x + enL.end.x) / 2, y: (enL.start.y + enL.end.y) / 2 };
    const dCuerda = Math.min(
      ...ptsL.slice(0, -1).map((u, i) => distSeg(cuerda, u, ptsL[i + 1]))
    );
    expect(dEtiqueta).toBeLessThan(0.01);
    expect(dCuerda).toBeGreaterThan(10);
  });

  it("el desplazamiento del humano mueve la etiqueta y `labelAnchor` guarda su sitio", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 600, 500);
    const base = linkGeometry(arista({ routing: "orthogonal" }), mapa(a, b), "c4")!;
    const geo = linkGeometry(
      arista({ routing: "orthogonal", labelOffset: { x: 40, y: -25 } }),
      mapa(a, b),
      "c4"
    )!;
    expect(geo.labelX).toBeCloseTo(base.labelX + 40, 5);
    expect(geo.labelY).toBeCloseTo(base.labelY - 25, 5);
    // El ancla NO incluye el desplazamiento: es contra ella que se mide al arrastrar.
    expect(geo.labelAnchor.x).toBeCloseTo(base.labelX, 5);
    expect(geo.labelAnchor.y).toBeCloseTo(base.labelY, 5);
  });

  it("el desplazamiento también aplica en recta y en curva", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const b = nodo("b", SISTEMA, 600, 0);
    for (const routing of ["straight", "curved"] as const) {
      const base = linkGeometry(arista({ routing }), mapa(a, b), "c4")!;
      const geo = linkGeometry(arista({ routing, labelOffset: { x: 0, y: 30 } }), mapa(a, b), "c4")!;
      expect(geo.labelY).toBeCloseTo(base.labelY + 30, 5);
    }
  });

  it("polylineMidpoint devuelve el punto a mitad de RECORRIDO", () => {
    // L de 100 + 100: la mitad del recorrido es el final del primer tramo.
    expect(polylineMidpoint([[0, 0], [100, 0], [100, 100]])).toEqual({ x: 100, y: 0 });
    expect(polylineMidpoint([[0, 0], [40, 0]])).toEqual({ x: 20, y: 0 });
  });
});
