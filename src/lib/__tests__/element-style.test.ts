import { describe, expect, it } from "vitest";
import {
  FUENTES,
  estiloHeredado,
  xSegunAlineacion,
  TAMANO_MAX,
  TAMANO_MIN,
  clampTamano,
  estiloBloque,
  estiloParaGuardar,
  estiloSilueta,
  estiloTextoHtml,
  estiloTextoSvg,
  estiloVacio,
  normalizarEstilo,
  type ElementStyle,
} from "@/lib/element-style";

describe("tamaño de letra", () => {
  it("recorta a los límites en vez de dejar una caja ilegible o desbordada", () => {
    expect(clampTamano(2)).toBe(TAMANO_MIN);
    expect(clampTamano(500)).toBe(TAMANO_MAX);
    expect(clampTamano(12)).toBe(12);
  });

  it("acepta el texto del input numérico y redondea", () => {
    expect(clampTamano("14")).toBe(14);
    expect(clampTamano(13.6)).toBe(14);
  });

  it("lo que no es un número no viaja (la caja conserva el tamaño de su tipo)", () => {
    expect(clampTamano("")).toBeUndefined();
    expect(clampTamano("grande")).toBeUndefined();
    expect(clampTamano(undefined)).toBeUndefined();
    expect(clampTamano(NaN)).toBeUndefined();
  });
});

describe("qué se persiste", () => {
  it("un estilo sin nada es vacío y no se guarda", () => {
    expect(estiloVacio(undefined)).toBe(true);
    expect(estiloVacio({})).toBe(true);
    expect(estiloVacio({ fuente: "", colorTexto: undefined })).toBe(true);
    expect(estiloParaGuardar({ fuente: "" })).toBeUndefined();
  });

  it("quitar la negrita SÍ se guarda: la silueta pinta el nombre en negrita sola", () => {
    expect(estiloVacio({ negrita: false })).toBe(false);
    expect(estiloParaGuardar({ negrita: false })).toEqual({ negrita: false });
    expect(estiloParaGuardar({ tamano: 12, negrita: false })).toEqual({ tamano: 12, negrita: false });
  });

  it("la cursiva y el subrayado apagados son la ausencia: ninguna silueta los pone", () => {
    expect(estiloParaGuardar({ tamano: 12, cursiva: false, subrayado: false })).toEqual({
      tamano: 12,
    });
  });

  it("guarda el tamaño ya recortado", () => {
    expect(estiloParaGuardar({ tamano: 999 })?.tamano).toBe(TAMANO_MAX);
  });
});

describe("lo que llega de fuera se normaliza", () => {
  it("descarta alineaciones que no son del vocabulario", () => {
    expect(normalizarEstilo({ alineacion: "middle" })).toBeUndefined();
    expect(normalizarEstilo({ alineacion: "derecha" })).toEqual({ alineacion: "derecha" });
  });

  it("no revienta con basura", () => {
    expect(normalizarEstilo(null)).toBeUndefined();
    expect(normalizarEstilo("negrita")).toBeUndefined();
    expect(normalizarEstilo({ negrita: "sí" })).toBeUndefined();
  });

  it("conserva el `false` de la negrita, que es una decisión del usuario", () => {
    expect(normalizarEstilo({ negrita: false })).toEqual({ negrita: false });
  });

  it("conserva lo válido y recorta el tamaño en texto", () => {
    expect(normalizarEstilo({ tamano: "18", negrita: true, colorTexto: "#fff" })).toEqual({
      tamano: 18,
      negrita: true,
      colorTexto: "#fff",
    });
  });
});

describe("traducción a propiedades de dibujo", () => {
  const completo: ElementStyle = {
    fuente: "Georgia, serif",
    tamano: 20,
    negrita: true,
    cursiva: true,
    subrayado: true,
    alineacion: "derecha",
    alineacionVertical: "abajo",
    colorTexto: "#112233",
  };

  it("un elemento sin estilo no aporta ninguna clave (manda la notación)", () => {
    expect(estiloTextoHtml(undefined)).toEqual({});
    expect(estiloBloque(undefined)).toEqual({});
    expect(estiloTextoHtml({})).toEqual({});
  });

  it("sólo viajan las claves que el usuario tocó", () => {
    expect(estiloTextoHtml({ tamano: 10 })).toEqual({ fontSize: 10 });
    expect(Object.keys(estiloTextoHtml({ tamano: 10 }))).toEqual(["fontSize"]);
  });

  it("en HTML el color del texto es `color`", () => {
    expect(estiloTextoHtml(completo)).toEqual({
      fontFamily: "Georgia, serif",
      fontSize: 20,
      fontWeight: 700,
      fontStyle: "italic",
      textDecoration: "underline",
      color: "#112233",
      textAlign: "right",
    });
  });

  it("en SVG el color del texto es `fill` (con `color` el texto caía a negro)", () => {
    const svg = estiloTextoSvg(completo);
    expect(svg.fill).toBe("#112233");
    expect(svg.color).toBeUndefined();
    expect(svg.fontSize).toBe(20);
  });

  it("en SVG la alineación es el ANCLA: con `text-align` no pasaba nada", () => {
    expect(estiloTextoSvg(completo).textAnchor).toBe("end");
    expect(estiloTextoSvg(completo).textAlign).toBeUndefined();
    expect(estiloTextoSvg({ alineacion: "izquierda" }).textAnchor).toBe("start");
    expect(estiloTextoSvg({ tamano: 10 }).textAnchor).toBeUndefined();
  });

  it("el ancla sola no alcanza: la `x` también se mueve al borde que toca", () => {
    expect(xSegunAlineacion({ alineacion: "izquierda" }, 200)).toBe(12);
    expect(xSegunAlineacion({ alineacion: "derecha" }, 200)).toBe(188);
    expect(xSegunAlineacion({ alineacion: "centro" }, 200)).toBe(100);
    // Sin alineación elegida, el centro de siempre.
    expect(xSegunAlineacion(undefined, 200)).toBe(100);
  });

  it("las líneas secundarias heredan familia y color, pero NO el tamaño", () => {
    expect(estiloHeredado(completo)).toEqual({
      fontFamily: "Georgia, serif",
      color: "#112233",
    });
    expect(estiloHeredado({ tamano: 40 })).toEqual({});
    expect(estiloHeredado(undefined)).toEqual({});
  });

  it("quitar la negrita la pisa explícitamente: la clase de la silueta traía `font-bold`", () => {
    expect(estiloTextoHtml({ negrita: false }).fontWeight).toBe(400);
    expect(estiloTextoHtml({ negrita: true }).fontWeight).toBe(700);
  });

  it("en un bloque en columna, lo vertical es `justifyContent` y lo horizontal `alignItems`", () => {
    expect(estiloBloque(completo)).toEqual({
      fontFamily: "Georgia, serif",
      color: "#112233",
      justifyContent: "flex-end",
      alignItems: "flex-end",
      textAlign: "right",
    });
    expect(estiloBloque({ alineacionVertical: "arriba", alineacion: "izquierda" })).toEqual({
      justifyContent: "flex-start",
      alignItems: "flex-start",
      textAlign: "left",
    });
  });
});

describe("silueta", () => {
  it("un proyecto guardado antes del estilo sigue usando `color`/`borderColor`", () => {
    expect(estiloSilueta(undefined, { color: "#eee", borderColor: "#333" }, { conBorde: true })).toEqual({
      fill: "#eee",
      stroke: "#333",
    });
  });

  it("el estilo manda sobre los campos sueltos", () => {
    expect(
      estiloSilueta({ fondo: "#abc", borde: "#def" }, { color: "#eee", borderColor: "#333" }, { conBorde: true })
    ).toEqual({ fill: "#abc", stroke: "#def" });
  });

  it("seleccionada, el contorno no se aplica: manda el azul de selección", () => {
    expect(estiloSilueta({ fondo: "#abc", borde: "#def" }, {}, { conBorde: false })).toEqual({
      fill: "#abc",
    });
  });

  it("sin nada que aplicar devuelve un objeto sin claves", () => {
    expect(estiloSilueta(undefined, {}, { conBorde: true })).toEqual({});
  });
});

describe("familias ofrecidas", () => {
  it("la primera es «no tocar» y las demás traen pila de respaldo (el SVG se abre en otra máquina)", () => {
    expect(FUENTES[0].css).toBe("");
    for (const f of FUENTES.slice(1)) expect(f.css).toContain(",");
  });

  it("los ids no se repiten", () => {
    expect(new Set(FUENTES.map((f) => f.id)).size).toBe(FUENTES.length);
  });
});
