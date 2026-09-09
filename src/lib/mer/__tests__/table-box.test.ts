/**
 * Caja de tabla del MER físico: lo que decide qué se ve y cuánto mide.
 *
 * Dos cosas se prueban con filo acá. Una, que los compartimentos se DERIVEN de
 * las columnas: si «FK» pudiera declararse aparte, el diagrama terminaría
 * diciendo una cosa y las columnas otra. Dos, que el alto salga de las filas: es
 * la medida que usan el lienzo, el minimapa y el recorte de las aristas, y
 * cuando cada uno la calculaba por su cuenta la línea nacía en el aire.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_COLUMNAS_POR_TABLA,
  agregarColumna,
  nuevaColumna,
  TABLE_BOX,
  compartimentos,
  filaColumna,
  marcaColumna,
  moverColumna,
  nombreFk,
  nombreIndice,
  nombrePk,
  normalizarColumnas,
  tableBoxLayout,
  tableBoxSize,
  validarColumna,
  validarColumnas,
  type TableColumn,
} from "@/lib/mer/table-box";

const RESERVA: TableColumn[] = [
  { nombre: "id", tipo: "integer", pk: true },
  { nombre: "fecha_inicio", tipo: "date" },
  { nombre: "valor", tipo: "money", nulo: true },
  { nombre: "servicio_id", tipo: "integer", fk: true, referencia: "servicio.id" },
];

describe("fila de la columna", () => {
  it("el `*` dice OBLIGATORIA y la marca dice qué clave es", () => {
    expect(filaColumna(RESERVA[0])).toBe("* PK id: integer");
    expect(filaColumna(RESERVA[1])).toBe("* fecha_inicio: date");
    // Admite nulos: sin asterisco.
    expect(filaColumna(RESERVA[2]).startsWith("*")).toBe(false);
    expect(filaColumna(RESERVA[3])).toContain("FK servicio_id");
  });

  it("una columna que es PK y FK a la vez se marca PFK", () => {
    expect(marcaColumna({ nombre: "x", pk: true, fk: true })).toBe("PFK");
    expect(marcaColumna({ nombre: "x" })).toBe("");
  });

  it("sin tipo declarado la fila no inventa uno", () => {
    expect(filaColumna({ nombre: "id" })).toBe("* id");
  });
});

describe("compartimentos derivados", () => {
  const bloques = compartimentos("Reserva", RESERVA);
  const de = (est: string) => bloques.find((b) => b.estereotipo === est);

  it("«column» lleva todas las columnas, en orden", () => {
    expect(de("column")!.filas).toHaveLength(RESERVA.length);
    expect(de("column")!.filas[0]).toContain("id");
  });

  it("«FK» sale de las columnas marcadas fk, con su tabla destino", () => {
    expect(de("FK")!.filas).toEqual([`+ ${nombreFk("Reserva", RESERVA[3])}`]);
    expect(de("FK")!.filas[0]).toContain("FK_Reserva_servicio");
  });

  it("cada FK trae su índice: es por donde el motor hace el join", () => {
    expect(de("index")!.filas[0]).toContain("IXFK_Reserva_servicio_id");
  });

  it("«PK» nombra la clave con los tipos que la componen", () => {
    expect(de("PK")!.filas).toEqual([`+ ${nombrePk("Reserva", RESERVA)}`]);
    expect(nombrePk("Reserva", RESERVA)).toBe("PK_Reserva(integer)");
  });

  it("una tabla sin claves ni índices sólo muestra «column»", () => {
    const simple = compartimentos("Nota", [{ nombre: "texto", tipo: "text" }]);
    expect(simple.map((b) => b.estereotipo)).toEqual(["column"]);
  });

  it("un único que NO es la PK sale como restricción aparte", () => {
    const b = compartimentos("Usuario", [
      { nombre: "id", tipo: "integer", pk: true },
      { nombre: "correo", tipo: "varchar(100)", unico: true },
    ]);
    expect(b.find((x) => x.estereotipo === "unique")!.filas[0]).toContain("UQ_Usuario_correo");
    // La PK no se repite como único: ya es única por definición.
    expect(b.find((x) => x.estereotipo === "unique")!.filas).toHaveLength(1);
  });

  it("el índice de una columna común no lleva el prefijo de FK", () => {
    expect(nombreIndice("Reserva", { nombre: "fecha_inicio", indice: true })).toBe(
      "IX_Reserva_fecha_inicio"
    );
  });
});

describe("geometría", () => {
  it("el alto crece con las filas (una caja no es una ficha fija)", () => {
    const chica = tableBoxSize("A", [{ nombre: "id", tipo: "integer", pk: true }]);
    const grande = tableBoxSize("A", RESERVA);
    expect(grande.h).toBeGreaterThan(chica.h);
  });

  it("los compartimentos se apilan sin huecos ni solapes, y suman el alto", () => {
    const { h, bloques } = tableBoxLayout("Reserva", RESERVA);
    let y = TABLE_BOX.altoTitulo;
    for (const b of bloques) {
      expect(b.y).toBe(y);
      y += b.h;
    }
    expect(h).toBe(y);
  });

  it("el ancho se acota: un nombre kilométrico no estira la caja sin fin", () => {
    const larga = tableBoxSize("T".repeat(400), RESERVA);
    expect(larga.w).toBeLessThanOrEqual(TABLE_BOX.maxAncho);
    expect(tableBoxSize("T", []).w).toBeGreaterThanOrEqual(TABLE_BOX.minAncho);
  });

  it("sin columnas sigue siendo una caja dibujable (se ve que faltan)", () => {
    const vacia = tableBoxSize("Nueva", undefined);
    expect(vacia.h).toBeGreaterThan(TABLE_BOX.altoTitulo);
    expect(tableBoxLayout("Nueva", []).bloques[0].filas).toEqual([]);
  });
});

describe("validación", () => {
  it("una columna sin nombre no se puede dibujar", () => {
    expect(validarColumna({ nombre: "  " })).toMatch(/nombre/);
  });

  it("una FK tiene que decir a qué tabla apunta", () => {
    expect(validarColumna({ nombre: "servicio_id", fk: true })).toMatch(/apunta/);
    expect(validarColumna({ nombre: "servicio_id", fk: true, referencia: "servicio.id" })).toBeNull();
  });

  it("dos columnas con el mismo nombre son un error (no dos columnas)", () => {
    const problemas = validarColumnas([{ nombre: "id" }, { nombre: "ID" }]);
    expect(problemas.some((p) => p.includes("repetida"))).toBe(true);
  });

  it("pasado el tope, se dice; no se recorta en silencio", () => {
    const muchas = Array.from({ length: MAX_COLUMNAS_POR_TABLA + 1 }, (_, i) => ({
      nombre: `c${i}`,
    }));
    expect(validarColumnas(muchas).some((p) => p.includes("no puede declarar más"))).toBe(true);
  });
});

describe("normalización de lo que llega de afuera", () => {
  it("descarta lo que no es columna y recorta espacios", () => {
    const out = normalizarColumnas([
      { nombre: "  id  ", tipo: " integer " },
      { nombre: "" },
      null,
      "columna",
      42,
    ]);
    expect(out).toEqual([{ nombre: "id", tipo: "integer" }]);
  });

  it("no guarda los booleanos en falso (el archivo no engorda por nada)", () => {
    expect(normalizarColumnas([{ nombre: "id", pk: false, fk: false }])).toEqual([
      { nombre: "id" },
    ]);
    expect(normalizarColumnas([{ nombre: "id", pk: true }])).toEqual([{ nombre: "id", pk: true }]);
  });

  it("deduplica por nombre y respeta el tope", () => {
    expect(normalizarColumnas([{ nombre: "id" }, { nombre: "Id" }])).toHaveLength(1);
    const muchas = Array.from({ length: MAX_COLUMNAS_POR_TABLA + 5 }, (_, i) => ({
      nombre: `c${i}`,
    }));
    expect(normalizarColumnas(muchas)).toHaveLength(MAX_COLUMNAS_POR_TABLA);
  });

  it("sin columnas devuelve undefined: un proyecto que no es MER no cambia de forma", () => {
    expect(normalizarColumnas(undefined)).toBeUndefined();
    expect(normalizarColumnas([])).toBeUndefined();
    expect(normalizarColumnas([{ nombre: "" }])).toBeUndefined();
  });
});

describe("moverColumna", () => {
  it("cambia el orden, que es el que se ve y el del CREATE TABLE", () => {
    const l = [{ nombre: "a" }, { nombre: "b" }, { nombre: "c" }];
    expect(moverColumna(l, 2, 0).map((c) => c.nombre)).toEqual(["c", "a", "b"]);
    expect(moverColumna(l, 0, 1).map((c) => c.nombre)).toEqual(["b", "a", "c"]);
  });

  it("fuera de rango no toca nada (y nunca muta la lista original)", () => {
    const l = [{ nombre: "a" }, { nombre: "b" }];
    expect(moverColumna(l, 0, 5).map((c) => c.nombre)).toEqual(["a", "b"]);
    expect(moverColumna(l, -1, 0)).not.toBe(l);
    expect(l.map((c) => c.nombre)).toEqual(["a", "b"]);
  });
});

describe("agregar una columna desde el lienzo", () => {
  it("el nombre nunca choca con los que ya están", () => {
    const l = [{ nombre: "columna" }, { nombre: "Columna_2" }];
    expect(nuevaColumna(l).nombre).toBe("columna_3");
    expect(nuevaColumna(undefined).nombre).toBe("columna");
  });

  it("respeta lo que le pidan y sólo ajusta el nombre", () => {
    const c = nuevaColumna([{ nombre: "id" }], { nombre: "id", tipo: "integer", pk: true });
    expect(c).toEqual({ nombre: "id_2", tipo: "integer", pk: true });
  });

  it("agrega al FINAL: el orden de las columnas es parte del modelo", () => {
    const l = agregarColumna([{ nombre: "id", pk: true }], { nombre: "correo" });
    expect(l.map((c) => c.nombre)).toEqual(["id", "correo"]);
    expect(agregarColumna(undefined)).toHaveLength(1);
  });
});
