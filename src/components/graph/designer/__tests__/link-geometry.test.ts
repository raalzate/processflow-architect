/**
 * Geometría de las conexiones: dónde nace y dónde muere la línea.
 *
 * El caso que motivó estas pruebas: con enrutado ortogonal el extremo se
 * recortaba mirando al CENTRO del otro nodo (correcto en línea recta), pero el
 * primer tramo del corredor es axial. Resultado: la línea salía por el borde
 * derecho y bajaba en vertical, visiblemente despegada de la caja.
 */
import { describe, it, expect } from "vitest";
import { linkGeometry, linkEndpoints } from "../link-geom";
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
