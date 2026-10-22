import { describe, expect, it } from "vitest";
import {
  SECUENCIA_LAYOUT,
  alturaDeMensaje,
  altoNecesario,
  columnaDeParticipante,
  disponerSecuencia,
  ordenarParticipantes,
} from "@/lib/sequence/layout";
import { rangoPorGeometria } from "@/lib/sequence/fragments";

describe("la altura sale del ORDEN, no del arrastre (T2 · #265)", () => {
  it("dos mensajes consecutivos no comparten altura", () => {
    expect(alturaDeMensaje(1)).not.toBe(alturaDeMensaje(2));
  });

  it("el orden mayor va MÁS ABAJO: el tiempo baja", () => {
    expect(alturaDeMensaje(2)).toBeGreaterThan(alturaDeMensaje(1));
    expect(alturaDeMensaje(9)).toBeGreaterThan(alturaDeMensaje(8));
  });

  it("el paso entre mensajes es constante: la separación no depende de dónde estés", () => {
    const paso = alturaDeMensaje(2) - alturaDeMensaje(1);
    expect(alturaDeMensaje(5) - alturaDeMensaje(4)).toBe(paso);
    expect(paso).toBe(SECUENCIA_LAYOUT.pasoMensaje);
  });

  it("el primer mensaje nace POR DEBAJO de la cabecera del participante", () => {
    // Un mensaje sobre la cabecera taparía el nombre.
    expect(alturaDeMensaje(1)).toBeGreaterThan(SECUENCIA_LAYOUT.altoCabecera);
  });

  it("misma entrada, misma altura: es una función, no un estado", () => {
    expect(alturaDeMensaje(3)).toBe(alturaDeMensaje(3));
  });

  it("un orden roto cae al primero en vez de mandar el mensaje al infinito", () => {
    // SC-008: ninguna altura puede sacar la caja del lienzo.
    for (const roto of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(alturaDeMensaje(roto)).toBe(alturaDeMensaje(1));
    }
  });

  it("el alto del diagrama crece con la cantidad de mensajes", () => {
    expect(altoNecesario(5)).toBeGreaterThan(altoNecesario(2));
    // Y siempre deja aire por debajo del último, o el pie queda pegado.
    expect(altoNecesario(3)).toBeGreaterThan(alturaDeMensaje(3));
  });

  it("sin mensajes el diagrama igual tiene alto: el participante se ve", () => {
    expect(altoNecesario(0)).toBeGreaterThan(SECUENCIA_LAYOUT.altoCabecera);
  });
});

describe("los participantes van en fila (T12 apoya acá)", () => {
  it("cada participante ocupa su columna, de izquierda a derecha", () => {
    expect(columnaDeParticipante(1)).toBeGreaterThan(columnaDeParticipante(0));
  });

  it("el paso entre participantes es constante", () => {
    const paso = columnaDeParticipante(1) - columnaDeParticipante(0);
    expect(columnaDeParticipante(4) - columnaDeParticipante(3)).toBe(paso);
  });

  it("un índice roto cae al primero, no a una coordenada absurda", () => {
    for (const roto of [-2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(columnaDeParticipante(roto)).toBe(columnaDeParticipante(0));
    }
  });
});

describe("preset de secuencia (T12 · #275)", () => {
  it("los participantes quedan en fila, sin cruzarse", () => {
    const out = ordenarParticipantes(["a", "b", "c"], 4);
    expect(out.map((p) => p.x)).toEqual([
      columnaDeParticipante(0),
      columnaDeParticipante(1),
      columnaDeParticipante(2),
    ]);
  });

  it("todos arrancan a la MISMA altura: el tiempo es uno solo", () => {
    // A distinta altura parecería que empiezan en momentos distintos.
    const out = ordenarParticipantes(["a", "b"], 3);
    expect(new Set(out.map((p) => p.y)).size).toBe(1);
  });

  it("el alto lo decide la cantidad de mensajes, y es el mismo para todos", () => {
    const pocos = ordenarParticipantes(["a", "b"], 2);
    const muchos = ordenarParticipantes(["a", "b"], 9);
    expect(muchos[0].height).toBeGreaterThan(pocos[0].height);
    expect(new Set(muchos.map((p) => p.height)).size).toBe(1);
  });

  it("el preset y el lienzo NO pueden discrepar: comparten la misma función", () => {
    // Con dos cálculos distintos, el desacuerdo no lo vería nadie.
    const out = ordenarParticipantes(["a"], 5);
    expect(out[0].height).toBe(altoNecesario(5));
  });

  it("sin participantes devuelve una lista vacía, no explota", () => {
    expect(ordenarParticipantes([], 3)).toEqual([]);
  });
});

describe("disponerSecuencia (#616)", () => {
  const mensajes = [
    { orden: 1, fuente: "a", destino: "b" },
    { orden: 2, fuente: "b", destino: "c" },
    { orden: 3, fuente: "c", destino: "b" },
    { orden: 4, fuente: "b", destino: "a" },
  ];

  it("participantes en columnas lado a lado, misma y, alto para todos los mensajes", () => {
    const cajas = disponerSecuencia(["a", "b", "c"], mensajes, []);
    const [a, b, c] = ["a", "b", "c"].map((id) => cajas.get(id)!);
    expect(new Set([a.y, b.y, c.y])).toEqual(new Set([0]));
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    expect(b.x - a.x).toBe(SECUENCIA_LAYOUT.pasoParticipante);
    expect(a.height).toBe(altoNecesario(4));
    // Las cajas no se pisan.
    expect(a.x + a.width).toBeLessThan(b.x);
  });

  it("el fragmento tapa la altura de sus mensajes: el lienzo le deriva el MISMO rango", () => {
    const cajas = disponerSecuencia(["a", "b", "c"], mensajes, [{ id: "f", desde: 2, hasta: 3 }]);
    const f = cajas.get("f")!;
    const colocados = mensajes.map((m) => ({ orden: m.orden, y: alturaDeMensaje(m.orden) }));
    expect(rangoPorGeometria({ y: f.y, height: f.height }, colocados)).toEqual({ desde: 2, hasta: 3 });
  });

  it("el fragmento abarca sólo las líneas de vida de su tramo", () => {
    const cajas = disponerSecuencia(["a", "b", "c"], mensajes, [{ id: "f", desde: 2, hasta: 3 }]);
    const f = cajas.get("f")!;
    const a = cajas.get("a")!;
    const b = cajas.get("b")!;
    const c = cajas.get("c")!;
    expect(f.x).toBeGreaterThan(a.x + a.width);
    expect(f.x).toBeLessThan(b.x);
    expect(f.x + f.width).toBeGreaterThan(c.x + c.width);
  });

  it("una guarda larga ensancha el fragmento, pero no más allá de la secuencia", () => {
    const cajas = disponerSecuencia(["a", "b", "c"], mensajes, [
      { id: "f", desde: 1, hasta: 1, anchoMinimo: 5000 },
    ]);
    const f = cajas.get("f")!;
    const c = cajas.get("c")!;
    expect(f.x + f.width).toBe(c.x + c.width + SECUENCIA_LAYOUT.margenFragmento);
  });

  it("sin participantes no inventa cajas", () => {
    expect(disponerSecuencia([], [], [{ id: "f", desde: 1, hasta: 2 }]).size).toBe(0);
  });
});
