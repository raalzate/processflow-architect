/**
 * Reapuntar una relación arrastrando su punta (issue #129). El valor de la
 * operación es justamente lo que NO se pierde: borrar y recrear la arista se
 * llevaba etiqueta, color, trazo, tipo de relación, quiebres y etiqueta corrida.
 */
import { describe, expect, it } from "vitest";
import { nodeAtPoint, reconnectLink } from "../link-reconnect";
import type { DesignerLink, DesignerNode } from "../serialize";
import { isNotationContainer, notationTypes, sizeOfType, typesWithRole } from "@/lib/notations";

const ACTOR = typesWithRole("c4", "actor")[0];
const SISTEMA = typesWithRole("c4", "system")[0];
// El tipo contenedor sale del registro (P6), no de un literal C4.
const CONTENEDOR = notationTypes("c4", { includeContainers: true }).find(isNotationContainer)!;

const nodo = (id: string, tipo: string, x: number, y: number, extra: Partial<DesignerNode> = {}): DesignerNode => ({
  id,
  nombre: id,
  tipo_elemento: tipo,
  estado_comparativo: "nuevo",
  descripcion: "",
  x,
  y,
  ...extra,
});

const arista: DesignerLink = {
  id: "e1",
  sourceId: "a",
  targetId: "b",
  descripcion: "consulta",
  color: "#ff0000",
  dashed: true,
  routing: "orthogonal",
  arrow: "both",
  relation: "dependencia",
  sourceAnchor: { x: 1, y: 0.5 },
  targetAnchor: { x: 0, y: 0.5 },
  midpoints: [{ x: 300, y: 40 }],
  labelOffset: { x: 0, y: -14 },
};

describe("reconnectLink", () => {
  it("cambia sólo el extremo: todo lo demás sobrevive", () => {
    const next = reconnectLink(arista, "source", "c")!;
    expect(next.sourceId).toBe("c");
    expect(next.id).toBe(arista.id);
    // El ancla del nodo ABANDONADO no viaja: era una fracción de otra caja.
    expect(next.sourceAnchor).toBeUndefined();
    // El resto queda igual, incluido el ancla del extremo que no se movió.
    expect({ ...next, sourceId: "a", sourceAnchor: arista.sourceAnchor }).toEqual(arista);
  });

  it("reapuntar el destino no toca el ancla del origen", () => {
    const next = reconnectLink(arista, "target", "c")!;
    expect(next.targetId).toBe("c");
    expect(next.targetAnchor).toBeUndefined();
    expect(next.sourceAnchor).toEqual(arista.sourceAnchor);
    expect(next.midpoints).toEqual(arista.midpoints);
  });

  it("el self-loop se rechaza (no se dibuja)", () => {
    expect(reconnectLink(arista, "source", "b")).toBeNull();
    expect(reconnectLink(arista, "target", "a")).toBeNull();
  });

  it("soltar sobre el mismo nodo devuelve la MISMA arista (nada que guardar)", () => {
    expect(reconnectLink(arista, "source", "a")).toBe(arista);
    expect(reconnectLink(arista, "target", "b")).toBe(arista);
  });
});

describe("nodeAtPoint", () => {
  const { w, h } = sizeOfType(ACTOR, "c4");

  it("devuelve el nodo bajo el punto y null en el vacío", () => {
    const a = nodo("a", ACTOR, 0, 0);
    const nodes = new Map([[a.id, a]]);
    expect(nodeAtPoint(nodes, { x: w / 2, y: h / 2 }, "c4")?.id).toBe("a");
    expect(nodeAtPoint(nodes, { x: -20, y: -20 }, "c4")).toBeNull();
  });

  it("con cajas anidadas gana el hijo, no el contenedor", () => {
    // El contenedor es el fondo: soltar sobre una caja de adentro apunta a ella.
    const cont = nodo("cont", CONTENEDOR, 0, 0, { width: 600, height: 400 });
    const hijo = nodo("hijo", SISTEMA, 100, 100);
    const nodes = new Map([[cont.id, cont], [hijo.id, hijo]]);
    const dentro = { x: 100 + sizeOfType(SISTEMA, "c4").w / 2, y: 100 + sizeOfType(SISTEMA, "c4").h / 2 };
    expect(nodeAtPoint(nodes, dentro, "c4")?.id).toBe("hijo");
    // Fuera del hijo pero dentro del contenedor: el contenedor es destino válido.
    expect(nodeAtPoint(nodes, { x: 560, y: 380 }, "c4")?.id).toBe("cont");
  });
});
