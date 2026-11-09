import { describe, expect, it } from "vitest";
import { hechosDeModelo, hechosDeVistas } from "../abox";
import { ELEMENTO, RDF_TYPE, iriElemento, iriPredicado } from "../iri";
import { razonar } from "../reasoner";
import { crearStore, type TripleStore } from "../store";
import { construirTbox, tboxDe } from "../tbox";
import type { Hecho } from "../types";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const el = (id: string, vista = "v-es") => iriElemento(PROYECTO_PEDIDOS, vista, id);
const pf = iriPredicado;

function storeDe(hechos: Hecho[]): TripleStore {
  const s = crearStore();
  for (const h of hechos) s.add(h);
  return s;
}

const explicito = (s: string, p: string, o: string): Hecho => ({ s, p, o, origen: "explicito" });

// T14 · FR-015, US3-AC1: la cadena comando → evento → política → comando → evento.
describe("razonar sobre el Event Storming de Pedidos", () => {
  const store = storeDe(hechosDeModelo(modeloES(), { proyecto: PROYECTO_PEDIDOS, vista: "v-es" }).hechos);
  const r = razonar(store, [tboxDe("ddd")]);

  it("Pagar provoca, por cadena, FacturarPedido y FacturaEmitida", () => {
    const provoca = store.match(el("pagar"), pf("provoca")).map((h) => h.o);
    expect(provoca).toEqual(
      expect.arrayContaining([el("pago-realizado"), el("facturar"), el("facturar-pedido"), el("factura-emitida")])
    );
    expect(store.match(el("pagar"), pf("provoca"), el("factura-emitida"))[0].origen).toBe("deducido");
  });

  it("la inversa: PagoRealizado activa Facturar (declarado «reacciona a»)", () => {
    const h = store.match(el("pago-realizado"), pf("activa"), el("facturar"));
    expect(h).toHaveLength(1);
    expect(store.justificacion([el("pago-realizado"), pf("activa"), el("facturar")])).toMatchObject({
      regla: "inversa",
      premisas: [[el("facturar"), pf("reacciona_a"), el("pago-realizado")]],
    });
  });

  it("clases heredadas: un Comando es una Intención y un Nodo de flujo", () => {
    expect(store.has([el("pagar"), RDF_TYPE, "pf:rol/command"])).toBe(true);
    expect(store.has([el("pagar"), RDF_TYPE, "pf:NodoDeFlujo"])).toBe(true);
    expect(store.justificacion([el("pagar"), RDF_TYPE, "pf:rol/command"])).toMatchObject({ regla: "subclase" });
  });

  it("cada deducido guarda regla, premisas y ronda", () => {
    const deducidos = store.match().filter((h) => h.origen === "deducido");
    expect(deducidos.length).toBe(r.deducidos);
    expect(r.deducidos).toBeGreaterThan(0);
    for (const h of deducidos) {
      const j = store.justificacion([h.s, h.p, h.o])!;
      expect(j.ronda).toBeGreaterThanOrEqual(1);
      expect(j.premisas.length).toBeGreaterThan(0);
    }
    expect(r.topeAlcanzado).toBe(false);
    expect(r.hallazgos).toEqual([]);
  });

  // US3-AC5 · FR-018
  it("no emite triviales: ni reflexivos ni la clase raíz", () => {
    const todos = store.match();
    expect(todos.some((h) => h.s === h.o)).toBe(false);
    expect(todos.some((h) => h.p === RDF_TYPE && h.o === ELEMENTO && h.origen === "deducido")).toBe(false);
    expect(todos.some((h) => h.s.startsWith("pf:"))).toBe(false);
  });

  it("es idempotente: razonar de nuevo no agrega nada", () => {
    const antes = store.size;
    expect(razonar(store, [tboxDe("ddd")]).deducidos).toBe(0);
    expect(store.size).toBe(antes);
  });
});

describe("reglas sueltas", () => {
  const ddd = tboxDe("ddd");

  // US3-AC3 · FR-019: mundo abierto.
  it("una relación sin dominio ni rango no clasifica a nadie", () => {
    const store = storeDe([explicito("kb:x", pf("relacionado_con"), "kb:y")]);
    razonar(store, [ddd]);
    expect(store.match(undefined, RDF_TYPE)).toEqual([]);
  });

  it("dominio y rango clasifican a quien no tiene tipo conocido", () => {
    const store = storeDe([explicito("kb:x", RDF_TYPE, ELEMENTO), explicito("kb:x", pf("dispara"), "kb:y")]);
    razonar(store, [ddd]);
    expect(store.justificacion(["kb:x", RDF_TYPE, "pf:rol/command"])).toMatchObject({ regla: "dominio" });
    expect(store.justificacion(["kb:y", RDF_TYPE, "pf:rol/event"])).toMatchObject({ regla: "rango" });
    expect(store.has(["kb:y", RDF_TYPE, "pf:NodoDeFlujo"])).toBe(true);
  });

  it("dominio o rango con varias opciones no eligen una (no adivina)", () => {
    // `invoca` admite actor | external: ninguno de los dos se puede afirmar.
    const store = storeDe([explicito("kb:x", pf("invoca"), "kb:y")]);
    razonar(store, [ddd]);
    expect(store.match("kb:x", RDF_TYPE)).toEqual([]);
    expect(store.has(["kb:y", RDF_TYPE, "pf:rol/command"])).toBe(true);
  });

  it("un ciclo de transitiva termina y no produce reflexivos", () => {
    const store = storeDe([
      explicito("kb:a", pf("depende_de"), "kb:b"),
      explicito("kb:b", pf("depende_de"), "kb:c"),
      explicito("kb:c", pf("depende_de"), "kb:a"),
    ]);
    const r = razonar(store, [ddd]);
    expect(r.topeAlcanzado).toBe(false);
    expect(store.has(["kb:a", pf("depende_de"), "kb:c"])).toBe(true);
    expect(store.has(["kb:a", pf("depende_de"), "kb:a"])).toBe(false);
  });

  it("simétrica: es_mismo_que vale en los dos sentidos", () => {
    const store = storeDe([explicito("kb:a", pf("es_mismo_que"), "kb:b")]);
    razonar(store, [ddd]);
    expect(store.justificacion(["kb:b", pf("es_mismo_que"), "kb:a"])).toMatchObject({ regla: "simetrica" });
  });

  it("subpropiedad: escribe_en ⊂ depende_de", () => {
    const store = storeDe([explicito("kb:a", pf("escribe_en"), "kb:db")]);
    razonar(store, [ddd]);
    expect(store.justificacion(["kb:a", pf("depende_de"), "kb:db"])).toMatchObject({ regla: "subpropiedad" });
  });

  it("equivalencia: lo que vale para uno vale para el otro (sin copiar su tipo)", () => {
    const store = storeDe([
      explicito("kb:a", RDF_TYPE, "pf:ddd/comando"),
      explicito("kb:b", RDF_TYPE, "pf:ddd/comando"),
      explicito("kb:a", pf("es_mismo_que"), "kb:b"),
      explicito("kb:a", pf("depende_de"), "kb:z"),
      explicito("kb:q", pf("depende_de"), "kb:b"),
    ]);
    razonar(store, [ddd]);
    expect(store.justificacion(["kb:b", pf("depende_de"), "kb:z"])).toMatchObject({ regla: "equivalencia" });
    expect(store.has(["kb:q", pf("depende_de"), "kb:a"])).toBe(true);
  });

  // Edge case de la spec: equivalencia entre clases disjuntas.
  it("equivalencia entre clases disjuntas: se reporta y no se propaga", () => {
    const store = storeDe([
      explicito("kb:ev", RDF_TYPE, "pf:ddd/evento"),
      explicito("kb:ac", RDF_TYPE, "pf:ddd/actor"),
      explicito("kb:ev", pf("es_mismo_que"), "kb:ac"),
      explicito("kb:ev", pf("depende_de"), "kb:z"),
    ]);
    const r = razonar(store, [ddd]);
    expect(store.has(["kb:ac", pf("depende_de"), "kb:z"])).toBe(false);
    expect(r.hallazgos).toEqual([
      expect.objectContaining({ forma: "EQUIVALENCIA-DISJUNTA", severidad: "error", nodo: "kb:ev" }),
    ]);
  });

  it("equivalencia disjunta: no se propaga aunque el hecho llegue ANTES que la equivalencia", () => {
    const store = storeDe([
      explicito("kb:ev", RDF_TYPE, "pf:ddd/evento"),
      explicito("kb:ac", RDF_TYPE, "pf:ddd/actor"),
      explicito("kb:ev", pf("depende_de"), "kb:z"),
      explicito("kb:q", pf("depende_de"), "kb:ev"),
      explicito("kb:ev", pf("es_mismo_que"), "kb:ac"),
    ]);
    const r = razonar(store, [ddd]);
    expect(store.has(["kb:ac", pf("depende_de"), "kb:z"])).toBe(false);
    expect(store.has(["kb:q", pf("depende_de"), "kb:ac"])).toBe(false);
    expect(r.hallazgos.filter((h) => h.forma === "EQUIVALENCIA-DISJUNTA")).toHaveLength(1);
  });

  it("A ≡ B, B ≡ C con A y C disjuntas: no deduce A ≡ C", () => {
    const store = storeDe([
      explicito("kb:a", RDF_TYPE, "pf:ddd/evento"),
      explicito("kb:c", RDF_TYPE, "pf:ddd/actor"),
      explicito("kb:a", pf("es_mismo_que"), "kb:b"),
      explicito("kb:b", pf("es_mismo_que"), "kb:c"),
    ]);
    const r = razonar(store, [ddd]);
    expect(store.has(["kb:a", pf("es_mismo_que"), "kb:c"])).toBe(false);
    expect(r.hallazgos.map((h) => h.forma)).toContain("EQUIVALENCIA-DISJUNTA");
  });

  it("dominio que contradice la disjunción no clasifica y avisa", () => {
    const store = storeDe([explicito("kb:x", RDF_TYPE, "pf:ddd/actor"), explicito("kb:x", pf("dispara"), "kb:y")]);
    const r = razonar(store, [ddd]);
    expect(store.has(["kb:x", RDF_TYPE, "pf:rol/command"])).toBe(false);
    expect(r.hallazgos).toEqual([expect.objectContaining({ forma: "DOMINIO-RANGO", nodo: "kb:x" })]);
  });

  // Edge case de la spec: en una secuencia UML los mensajes no son transitivos.
  it("«mensaje» de UML no es transitivo", () => {
    const store = storeDe([explicito("kb:a", pf("mensaje"), "kb:b"), explicito("kb:b", pf("mensaje"), "kb:c")]);
    razonar(store, [tboxDe("uml")]);
    expect(store.has(["kb:a", pf("mensaje"), "kb:c"])).toBe(false);
  });

  // FR-020: el tope corta y avisa.
  it("tope de hechos: corta, avisa TOPE-RAZONADOR y no se cuelga", () => {
    const hechos: Hecho[] = [];
    for (let i = 0; i < 60; i++) hechos.push(explicito(`kb:n${i}`, pf("depende_de"), `kb:n${i + 1}`));
    const store = storeDe(hechos);
    const r = razonar(store, [ddd], { maxHechos: 200 });
    expect(r.topeAlcanzado).toBe(true);
    expect(r.hallazgos).toEqual([expect.objectContaining({ forma: "TOPE-RAZONADOR", severidad: "aviso" })]);
  });

  it("tope de rondas: corta y avisa", () => {
    const hechos: Hecho[] = [];
    for (let i = 0; i < 60; i++) hechos.push(explicito(`kb:n${i}`, pf("depende_de"), `kb:n${i + 1}`));
    // La ronda 1 deja deducidos sin procesar: cortar ahí es quedarse a medias.
    const r = razonar(storeDe(hechos), [ddd], { maxRondas: 1 });
    expect(r.rondas).toBe(1);
    expect(r.topeAlcanzado).toBe(true);
  });

  it("una notación sintética nueva razona con sus roles sin tocar ontology/", () => {
    const t = construirTbox({
      notation: { id: "sintetica" as never, elements: [{ type: "Orden", icon: "x", bg: "", border: "", text: "" }] },
      roles: { command: ["Orden"] },
      predicados: [],
    });
    const store = storeDe([explicito("kb:o", RDF_TYPE, "pf:sintetica/orden")]);
    razonar(store, [t]);
    expect(store.has(["kb:o", RDF_TYPE, "pf:NodoDeFlujo"])).toBe(true);
  });
});

describe("razonar el proyecto entero (varias notaciones)", () => {
  it("cada vista razona con el reglamento de su notación", () => {
    const store = storeDe(hechosDeVistas(vistasPedidos(), PROYECTO_PEDIDOS).hechos);
    razonar(store, [tboxDe("ddd"), tboxDe("bpmn"), tboxDe("c4")]);
    // BPMN: flujo_a ⊂ precede (transitiva) ⇒ el inicio precede al fin.
    expect(store.has([el("inicio", "v-bpmn"), pf("precede"), el("fin", "v-bpmn")])).toBe(true);
    // C4: escribe_en ⊂ depende_de.
    expect(store.has([el("pagos", "v-c4"), pf("depende_de"), el("pagos-db", "v-c4")])).toBe(true);
    expect(store.has([el("pagos", "v-c4"), RDF_TYPE, "pf:Agente"])).toBe(true);
  });
});
