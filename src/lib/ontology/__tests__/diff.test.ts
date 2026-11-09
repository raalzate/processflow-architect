import { describe, expect, it } from "vitest";
import { updateNode } from "@/lib/mcp/diagram-builder";
import { typesWithRole } from "@/lib/notations";
import { conocimientoDeModelo } from "../conocimiento";
import { conocimientoDeTablero, diffConocimiento, hayCambios, resumirDiff } from "../diff";
import { RDF_TYPE, iriElemento, iriPredicado } from "../iri";
import { VINCULOS_PEDIDOS, modeloES, vistasPedidos } from "./fixtures/pedidos";
import { toGraphData } from "@/lib/mcp/diagram-builder";

const e = (n: string) => iriElemento("actual", "grafo", n);

// T35 · FR-043, FR-044, US9-AC1, US9-AC2, R-09.
describe("diffConocimiento", () => {
  it("Q13: quitar PagoRealizado ⇒ reemplazados con fecha y deducciones perdidas", () => {
    const antes = conocimientoDeModelo(modeloES());
    const m = modeloES();
    m.nodes = m.nodes.filter((n) => n.id !== "pago-realizado");
    m.edges = m.edges.filter((x) => x.fuente !== "pago-realizado" && x.destino !== "pago-realizado");
    const d = diffConocimiento(antes, conocimientoDeModelo(m), "2026-11-10");
    expect(d.reemplazados).toContainEqual(
      expect.objectContaining({ s: e("pagar"), p: iriPredicado("dispara"), o: e("pago-realizado"), fecha: "2026-11-10" })
    );
    expect(d.reemplazados.every((h) => h.origen !== "deducido")).toBe(true);
    expect(d.deduccionesPerdidas).toContainEqual(expect.objectContaining({ s: e("pagar"), p: iriPredicado("provoca"), o: e("factura-emitida") }));
    expect(d.agregados).toEqual([]);
    expect(d.deduccionesGanadas).toEqual([]);
  });

  it("cambiar el tipo: el tipo viejo queda reemplazado y el nuevo agregado (US9 Independent Test)", () => {
    const antes = conocimientoDeModelo(modeloES());
    const m = updateNode(modeloES(), "cancelar", { tipo_elemento: typesWithRole("ddd", "event")[0] });
    const d = diffConocimiento(antes, conocimientoDeModelo(m), "v2");
    const tipos = (hs: { s: string; p: string }[]) => hs.filter((h) => h.s === e("cancelar") && h.p === RDF_TYPE);
    expect(tipos(d.reemplazados)).toHaveLength(1);
    expect(tipos(d.agregados)).toHaveLength(1);
    expect(tipos(d.reemplazados)[0]).toMatchObject({ fecha: "v2" });
  });

  it("dos versiones iguales: sin cambios; el diff no escribe nada en el modelo", () => {
    const m = modeloES();
    const json = JSON.stringify(m);
    const d = diffConocimiento(conocimientoDeModelo(m), conocimientoDeModelo(modeloES()));
    expect(hayCambios(d)).toBe(false);
    expect(JSON.stringify(m)).toBe(json);
  });
});

describe("comparar dos versiones de un tablero (T36)", () => {
  const tablero = (m = modeloES()) => conocimientoDeTablero(toGraphData(m), { customViews: vistasPedidos().slice(1), vinculos: VINCULOS_PEDIDOS });

  it("el Modelo y las vistas entran; los vínculos también", () => {
    const k = tablero();
    expect(k.vistas.map((v) => v.vista)).toEqual(["design", "v-bpmn", "v-c4"]);
    expect(conocimientoDeTablero(toGraphData(modeloES()), undefined).vistas).toHaveLength(1);
  });

  it("el resumen cuenta el cambio en palabras, con la fecha en lo reemplazado", () => {
    const antes = tablero();
    const m = updateNode(modeloES(), "cancelar", { nombre: "Anular", tipo_elemento: typesWithRole("ddd", "event")[0] });
    const despues = tablero(m);
    const r = resumirDiff(antes, despues, diffConocimiento(antes, despues, "2026-11-10"));
    expect(r.reemplazados).toContainEqual({ texto: "Cancelar: se llama «Cancelar»", fecha: "2026-11-10" });
    expect(r.agregados).toContain("Anular: se llama «Anular»");
    expect(r.reemplazados.some((x) => /^Cancelar es /.test(x.texto))).toBe(true);
    expect(r.agregados.some((x) => /^Anular es /.test(x))).toBe(true);
  });
});
