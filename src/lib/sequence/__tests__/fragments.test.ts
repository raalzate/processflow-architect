import { describe, expect, it } from "vitest";
import {
  FRAGMENT_OPS,
  FRAGMENT_OPS_LIST,
  contieneOrden,
  esOperador,
  estaAnidado,
  normalizarOperandos,
  operandoDe,
  rangoDe,
  rangoPorGeometria,
  repartirOperandos,
  type FragmentPart,
} from "@/lib/sequence/fragments";

const p = (guarda: string, desde: number, hasta: number): FragmentPart => ({ guarda, desde, hasta });

describe("operadores de fragmento (T7 · #270)", () => {
  it("cubre los cuatro que pide el spec", () => {
    expect([...FRAGMENT_OPS_LIST].sort()).toEqual(["alt", "loop", "opt", "par"]);
  });

  it("todos declaran etiqueta, nombre y ayuda", () => {
    for (const op of FRAGMENT_OPS_LIST) {
      expect(FRAGMENT_OPS[op].etiqueta.length).toBeGreaterThan(0);
      expect(FRAGMENT_OPS[op].label.length).toBeGreaterThan(0);
      expect(FRAGMENT_OPS[op].hint.length).toBeGreaterThan(0);
    }
  });

  it("sólo alt y par admiten varios casos", () => {
    // Un `opt` con dos «si no» no significa nada.
    expect(FRAGMENT_OPS.alt.variosOperandos).toBe(true);
    expect(FRAGMENT_OPS.par.variosOperandos).toBe(true);
    expect(FRAGMENT_OPS.loop.variosOperandos).toBe(false);
    expect(FRAGMENT_OPS.opt.variosOperandos).toBe(false);
  });

  it("lo desconocido no pasa por operador, ni siquiera del prototipo", () => {
    // Mismo agujero que #282: `in` habría dejado pasar «toString».
    expect(esOperador("loop")).toBe(true);
    expect(esOperador("bucle")).toBe(false);
    expect(esOperador("toString")).toBe(false);
    expect(esOperador(undefined)).toBe(false);
  });
});

describe("operandos: el fragmento encierra un RANGO, no una caja", () => {
  it("un alt admite dos casos con rangos que no se solapan (H3.2)", () => {
    const out = normalizarOperandos([p("ok", 1, 2), p("si no", 3, 4)], "alt", 6);
    expect(out).toHaveLength(2);
    expect(out.map((x) => [x.desde, x.hasta])).toEqual([[1, 2], [3, 4]]);
  });

  it("un rango INVERTIDO se da vuelta en vez de vaciar la vista (SC-008)", () => {
    expect(normalizarOperandos([p("x", 5, 2)], "loop", 6)[0]).toMatchObject({ desde: 2, hasta: 5 });
  });

  it("los rangos se recortan a la secuencia real", () => {
    // Un fragmento no puede abarcar mensajes que no existen.
    const out = normalizarOperandos([p("x", 0, 99)], "loop", 4);
    expect(out[0]).toMatchObject({ desde: 1, hasta: 4 });
  });

  it("dos operandos que se solapan no reclaman el mismo mensaje", () => {
    // Dos partes sobre el mismo mensaje no se pueden dibujar; cede la anterior.
    const out = normalizarOperandos([p("a", 1, 3), p("b", 2, 5)], "alt", 6);
    expect(out.map((x) => [x.desde, x.hasta])).toEqual([[1, 3], [4, 5]]);
  });

  it("un operando comido entero por el solape desaparece, no queda invertido", () => {
    const out = normalizarOperandos([p("a", 1, 5), p("b", 2, 3)], "alt", 6);
    expect(out).toHaveLength(1);
  });

  it("un operador de un solo caso se queda con el primero", () => {
    expect(normalizarOperandos([p("a", 1, 2), p("b", 3, 4)], "opt", 6)).toHaveLength(1);
  });

  it("valores rotos no rompen ni vacían", () => {
    const out = normalizarOperandos(
      [{ guarda: "x", desde: Number.NaN, hasta: Number.POSITIVE_INFINITY }],
      "loop",
      3
    );
    expect(out).toHaveLength(1);
    expect(out[0].desde).toBeGreaterThanOrEqual(1);
    expect(out[0].hasta).toBeLessThanOrEqual(3);
  });

  it("un fragmento sin operandos, o sobre una secuencia vacía, no explota", () => {
    expect(normalizarOperandos(undefined, "loop", 5)).toEqual([]);
    expect(normalizarOperandos([p("x", 1, 2)], "loop", 0)).toEqual([]);
  });

  it("normalizar dos veces da lo mismo", () => {
    const una = normalizarOperandos([p("a", 3, 1), p("b", 2, 5)], "alt", 6);
    expect(normalizarOperandos(una, "alt", 6)).toEqual(una);
  });
});

describe("contención por orden (FR-010, H3.3)", () => {
  const partes = [p("a", 2, 4)];

  it("un mensaje dentro del rango está contenido", () => {
    expect(contieneOrden(partes, 2)).toBe(true);
    expect(contieneOrden(partes, 4)).toBe(true);
  });

  it("un mensaje movido FUERA del rango deja de estar contenido", () => {
    // Sacarlo del fragmento es reordenarlo: no hay geometría de por medio.
    expect(contieneOrden(partes, 1)).toBe(false);
    expect(contieneOrden(partes, 5)).toBe(false);
  });

  it("dice en QUÉ operando cae, para pintar su guarda", () => {
    const alt = [p("ok", 1, 2), p("si no", 3, 4)];
    expect(operandoDe(alt, 1)!.guarda).toBe("ok");
    expect(operandoDe(alt, 4)!.guarda).toBe("si no");
    expect(operandoDe(alt, 9)).toBeNull();
  });

  it("el tramo completo del fragmento va del primer al último operando", () => {
    expect(rangoDe([p("a", 2, 3), p("b", 4, 7)])).toEqual({ desde: 2, hasta: 7 });
    expect(rangoDe([])).toBeNull();
  });
});

describe("fragmentos anidados", () => {
  it("el interior queda dentro del exterior", () => {
    expect(estaAnidado([p("i", 3, 4)], [p("e", 1, 6)])).toBe(true);
  });

  it("uno que se desborda NO está anidado", () => {
    expect(estaAnidado([p("i", 3, 8)], [p("e", 1, 6)])).toBe(false);
  });

  it("un fragmento vacío no está anidado en nada", () => {
    expect(estaAnidado([], [p("e", 1, 6)])).toBe(false);
  });
});

describe("el rango sale de la GEOMETRÍA del fragmento (T21 · #290)", () => {
  // Tres mensajes a 100, 200 y 300.
  const mensajes = [
    { orden: 1, y: 100 },
    { orden: 2, y: 200 },
    { orden: 3, y: 300 },
  ];

  it("abarca los mensajes que quedan dentro del marco", () => {
    expect(rangoPorGeometria({ y: 90, height: 220 }, mensajes)).toEqual({ desde: 1, hasta: 3 });
    expect(rangoPorGeometria({ y: 150, height: 100 }, mensajes)).toEqual({ desde: 2, hasta: 2 });
  });

  it("achicar el marco DEJA FUERA al de abajo (H3.3)", () => {
    // Sacar un mensaje del fragmento es moverlo o achicar el marco: no hay
    // formulario de por medio.
    expect(rangoPorGeometria({ y: 90, height: 220 }, mensajes)!.hasta).toBe(3);
    expect(rangoPorGeometria({ y: 90, height: 120 }, mensajes)!.hasta).toBe(2);
  });

  it("un marco que no toca ningún mensaje devuelve null, no vacía la vista", () => {
    // Es válido mientras se está colocando.
    expect(rangoPorGeometria({ y: 900, height: 50 }, mensajes)).toBeNull();
    expect(rangoPorGeometria({ y: 0, height: 10 }, mensajes)).toBeNull();
  });

  it("una altura negativa se interpreta igual: el marco es el marco", () => {
    expect(rangoPorGeometria({ y: 90, height: -220 }, mensajes)).toEqual({ desde: 1, hasta: 3 });
  });

  it("geometría rota no rompe", () => {
    expect(rangoPorGeometria({ y: Number.NaN, height: 100 }, mensajes)).toBeNull();
    expect(rangoPorGeometria({ y: 90, height: 220 }, [{ orden: 1, y: Number.NaN }])).toBeNull();
  });

  it("sin mensajes no abarca nada", () => {
    expect(rangoPorGeometria({ y: 0, height: 1000 }, [])).toBeNull();
  });
});

describe("repartir el tramo entre operandos (T22 · #291)", () => {
  it("un solo caso se queda con todo el tramo", () => {
    expect(repartirOperandos({ desde: 1, hasta: 4 }, 1, ["ok"])).toEqual([
      { guarda: "ok", desde: 1, hasta: 4 },
    ]);
  });

  it("dos casos parten el tramo, sin solaparse ni dejar huecos", () => {
    const out = repartirOperandos({ desde: 1, hasta: 4 }, 2, ["ok", "si no"]);
    expect(out.map((p) => [p.desde, p.hasta])).toEqual([[1, 2], [3, 4]]);
  });

  it("con un tramo impar, las PRIMERAS partes se quedan lo que sobra", () => {
    // Dejar el resto al final haría el último caso más grande, y eso se lee
    // como si importara más.
    const out = repartirOperandos({ desde: 1, hasta: 5 }, 2);
    expect(out.map((p) => [p.desde, p.hasta])).toEqual([[1, 3], [4, 5]]);
  });

  it("no se pueden pedir más casos que mensajes", () => {
    expect(repartirOperandos({ desde: 1, hasta: 2 }, 9)).toHaveLength(2);
  });

  it("las guardas que ya había se conservan por posición", () => {
    const out = repartirOperandos({ desde: 1, hasta: 4 }, 2, ["primera"]);
    expect(out[0].guarda).toBe("primera");
    expect(out[1].guarda).toBe("");
  });

  it("el reparto cubre el tramo entero", () => {
    const out = repartirOperandos({ desde: 3, hasta: 9 }, 3);
    expect(out[0].desde).toBe(3);
    expect(out[out.length - 1].hasta).toBe(9);
    for (let i = 1; i < out.length; i++) expect(out[i].desde).toBe(out[i - 1].hasta + 1);
  });
});
