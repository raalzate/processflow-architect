import { describe, expect, it } from "vitest";
import { hechosDeModelo, hechosDeVistas } from "../abox";
import { iriElemento, iriPredicado } from "../iri";
import { explicar, hojasDe, type Explicacion } from "../query";
import { razonar } from "../reasoner";
import { crearStore } from "../store";
import { tboxDe } from "../tbox";
import { PROYECTO_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";

const el = (id: string) => iriElemento(PROYECTO_PEDIDOS, "v-es", id);
const pf = iriPredicado;

function conocimientoES() {
  const store = crearStore();
  for (const h of hechosDeModelo(modeloES(), { proyecto: PROYECTO_PEDIDOS, vista: "v-es" }).hechos) store.add(h);
  razonar(store, [tboxDe("ddd")]);
  return { store };
}

const reglas = (e: Explicacion, out = new Set<string>()): Set<string> => {
  if (e.regla) out.add(e.regla);
  for (const p of e.premisas) reglas(p, out);
  return out;
};

// T15 · FR-029, US3-AC2, Q5.
describe("explicar", () => {
  const k = conocimientoES();

  it("Q5: Pagar provoca FacturaEmitida baja hasta los 4 hechos dibujados", () => {
    const e = explicar(k, [el("pagar"), pf("provoca"), el("factura-emitida")])!;
    expect(e.origen).toBe("deducido");
    const hojas = hojasDe(e).map((h) => h.hecho);
    expect(new Set(hojas.map((t) => t.join(" ")))).toEqual(
      new Set(
        [
          [el("pagar"), pf("dispara"), el("pago-realizado")],
          [el("facturar"), pf("reacciona_a"), el("pago-realizado")],
          [el("facturar"), pf("emite"), el("facturar-pedido")],
          [el("facturar-pedido"), pf("dispara"), el("factura-emitida")],
        ].map((t) => t.join(" "))
      )
    );
    expect(hojasDe(e).every((h) => h.origen === "explicito")).toBe(true);
    expect([...reglas(e)]).toEqual(expect.arrayContaining(["subpropiedad", "inversa", "transitiva"]));
  });

  it("las premisas van en orden de rondas", () => {
    const visitar = (e: Explicacion) => {
      const rondas = e.premisas.map((p) => p.ronda ?? 0);
      expect(rondas).toEqual([...rondas].sort((a, b) => a - b));
      e.premisas.forEach(visitar);
    };
    visitar(explicar(k, [el("pagar"), pf("provoca"), el("factura-emitida")])!);
  });

  it("un explícito se explica solo, y lo que no está en el grafo no tiene explicación", () => {
    const e = explicar(k, [el("pagar"), pf("dispara"), el("pago-realizado")])!;
    expect(e).toMatchObject({ origen: "explicito", premisas: [] });
    expect(explicar(k, [el("pagar"), pf("dispara"), el("cancelar")])).toBeUndefined();
  });

  it("el axioma aplicado se cita", () => {
    const e = explicar(k, [el("pago-realizado"), pf("activa"), el("facturar")])!;
    expect(e).toMatchObject({ regla: "inversa", axioma: expect.stringContaining("reacciona_a") });
  });

  // SC-007: el 100 % de los deducidos tiene explicación navegable hasta explícitos.
  it("todo deducido del proyecto entero llega a explícitos", () => {
    const store = crearStore();
    for (const h of hechosDeVistas(vistasPedidos(), PROYECTO_PEDIDOS).hechos) store.add(h);
    razonar(store, [tboxDe("ddd"), tboxDe("bpmn"), tboxDe("c4")]);
    const deducidos = store.match().filter((h) => h.origen === "deducido");
    expect(deducidos.length).toBeGreaterThan(50);
    for (const h of deducidos) {
      const e = explicar({ store }, [h.s, h.p, h.o])!;
      const hojas = hojasDe(e);
      expect(hojas.length).toBeGreaterThan(0);
      expect(hojas.every((x) => x.origen === "explicito")).toBe(true);
    }
  });
});
