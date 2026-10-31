/**
 * Sustituir al soltar (#670): un elemento de la paleta soltado ENCIMA de una caja
 * del lienzo ofrece cambiarle la forma y el tipo, conservando todo lo demás.
 */
import { describe, it, expect } from "vitest";
import { cajaBajoPunto, sustituirTipo, type CajaEnLienzo } from "../replace-on-drop";

const caja = (id: string, x: number, y: number, w: number, h: number, contenedor = false): CajaEnLienzo => ({
  id,
  x,
  y,
  w,
  h,
  contenedor,
});

describe("cajaBajoPunto", () => {
  it("encuentra la caja que contiene el punto", () => {
    expect(cajaBajoPunto({ x: 50, y: 30 }, [caja("a", 0, 0, 100, 60), caja("b", 200, 0, 100, 60)])).toBe("a");
  });

  it("fuera de toda caja no hay objetivo", () => {
    expect(cajaBajoPunto({ x: 150, y: 30 }, [caja("a", 0, 0, 100, 60)])).toBeNull();
  });

  it("un contenedor no es objetivo: soltar ahí sigue siendo meter adentro", () => {
    expect(cajaBajoPunto({ x: 10, y: 10 }, [caja("agg", 0, 0, 500, 400, true)])).toBeNull();
  });

  it("con cajas superpuestas gana la más chica (la que se ve encima)", () => {
    const cajas = [caja("grande", 0, 0, 300, 300), caja("chica", 40, 40, 50, 50)];
    expect(cajaBajoPunto({ x: 60, y: 60 }, cajas)).toBe("chica");
  });

  it("el borde cuenta como adentro", () => {
    expect(cajaBajoPunto({ x: 100, y: 60 }, [caja("a", 0, 0, 100, 60)])).toBe("a");
  });
});

describe("sustituirTipo", () => {
  const nodo = {
    id: "n1",
    nombre: "Pagar pedido",
    tipo_elemento: "Comando",
    descripcion: "Cobra",
    agregado: "Pedidos",
    x: 100,
    y: 100,
    color: "#f00",
    borderColor: "#0f0",
    icono: "credit-card",
    spec: { featureName: "Cobro" },
    metadata: [{ clave: "repo", valor: "acme" }],
  };

  it("cambia el tipo y conserva id, nombre, descripción, agregado, spec y metadatos", () => {
    const r = sustituirTipo(nodo, "Evento", { w: 120, h: 60 }, { w: 120, h: 60 });
    expect(r).toMatchObject({
      id: "n1",
      nombre: "Pagar pedido",
      tipo_elemento: "Evento",
      descripcion: "Cobra",
      agregado: "Pedidos",
      spec: { featureName: "Cobro" },
      metadata: [{ clave: "repo", valor: "acme" }],
    });
  });

  it("mantiene el centro aunque el tipo nuevo tenga otro tamaño", () => {
    const r = sustituirTipo(nodo, "Actor", { w: 60, h: 80 }, { w: 120, h: 60 });
    expect(r.x + 60 / 2).toBe(nodo.x + 120 / 2);
    expect(r.y + 80 / 2).toBe(nodo.y + 60 / 2);
  });

  it("suelta el color, el borde y el icono del tipo viejo: la forma nueva se ve como la de la paleta", () => {
    const r = sustituirTipo(nodo, "Evento", { w: 120, h: 60 }, { w: 120, h: 60 });
    expect(r).not.toHaveProperty("color");
    expect(r).not.toHaveProperty("borderColor");
    expect(r).not.toHaveProperty("icono");
  });

  it("un tamaño a mano del tipo viejo no se arrastra al nuevo", () => {
    const r = sustituirTipo({ ...nodo, width: 300, height: 200 }, "Evento", { w: 120, h: 60 }, { w: 300, h: 200 });
    expect(r).not.toHaveProperty("width");
    expect(r).not.toHaveProperty("height");
    expect(r.x + 60).toBe(100 + 150);
  });

  it("no muta el nodo original", () => {
    const copia = structuredClone(nodo);
    sustituirTipo(nodo, "Evento", { w: 120, h: 60 }, { w: 120, h: 60 });
    expect(nodo).toEqual(copia);
  });
});
