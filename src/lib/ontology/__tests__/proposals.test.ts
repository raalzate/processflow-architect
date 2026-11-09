import { describe, expect, it } from "vitest";
import { typesWithRole } from "@/lib/notations";
import { conocimientoDeModelo } from "../conocimiento";
import { iriElemento, iriPredicado } from "../iri";
import { aplicarPropuestas, revisarPropuestas, type HechoPropuesto } from "../proposals";
import { modeloES } from "./fixtures/pedidos";

const evento = typesWithRole("ddd", "event")[0];
const comando = typesWithRole("ddd", "command")[0];
const P = { fuente: "docs/pedidos.md", aceptadoPor: "ana", fecha: "2026-11-10" };
const h = (s: string, p: string, o: string, cita = "según el documento"): HechoPropuesto => ({ s, p, o, cita });

// T33 · FR-034, FR-036, US8-AC1…AC3.
describe("revisar propuestas de la IA contra el reglamento", () => {
  it("válidas: un elemento nuevo con su tipo y una relación que se apoya en él", () => {
    const r = revisarPropuestas(modeloES(), [h("Cancelar", "dispara", "PedidoCancelado"), h("PedidoCancelado", "es", evento)]);
    expect(r.map((x) => [x.clase, x.valida, x.resuelto])).toEqual([
      ["relacion", true, "dispara"],
      ["tipo", true, evento],
    ]);
    expect(r[0].nuevos).toEqual(["PedidoCancelado"]);
  });

  it("US8-AC2: dominio/rango inválido queda marcado y no es aceptable", () => {
    const [r] = revisarPropuestas(modeloES(), [h("Cliente", "dispara", "PagoRealizado")]);
    expect(r).toMatchObject({ valida: false, resuelto: "dispara" });
    expect(r.motivo).toMatch(/dispara/);
  });

  it("sin cita, predicado inexistente, elemento sin tipo, tipo inventado y flecha repetida", () => {
    const r = revisarPropuestas(modeloES(), [
      h("Cancelar", "dispara", "X", ""),
      h("Cancelar", "come", "PagoRealizado"),
      h("Cancelar", "dispara", "Fantasma"),
      h("Nuevo", "es", "Dragón"),
      h("Pagar", "dispara", "PagoRealizado"),
    ]);
    expect(r.every((x) => !x.valida)).toBe(true);
    expect(r.map((x) => x.motivo)).toEqual([
      expect.stringMatching(/No cita la fuente/),
      expect.stringMatching(/no es un predicado/),
      expect.stringMatching(/No se sabe qué es «Fantasma»/),
      expect.stringMatching(/no es un tipo/),
      expect.stringMatching(/Ya hay una flecha/),
    ]);
  });

  it("la IA no cambia tipos: «Pagar es Evento» es un conflicto", () => {
    const [r] = revisarPropuestas(modeloES(), [h("Pagar", "es", evento)]);
    expect(r.valida).toBe(false);
    expect(r.motivo).toMatch(new RegExp(`ya existe como ${comando}`));
  });

  it("propuestas repetidas se muestran una vez", () => {
    expect(revisarPropuestas(modeloES(), [h("A", "es", evento), h("a", "ES", evento)])).toHaveLength(1);
  });
});

describe("aplicar sólo lo aceptado (US8-AC3)", () => {
  it("lo aceptado entra con su predicado y su procedencia; el resto no", () => {
    const r = revisarPropuestas(modeloES(), [
      h("PedidoCancelado", "es", evento, "«al cancelar queda el pedido cancelado»"),
      h("Cancelar", "dispara", "PedidoCancelado"),
      h("Reembolso", "es", evento),
    ]);
    const { model, aplicadas, omitidas } = aplicarPropuestas(modeloES(), r.slice(0, 2), P);
    expect(aplicadas).toHaveLength(2);
    expect(omitidas).toEqual([]);
    expect(model.nodes.map((n) => n.nombre)).toContain("PedidoCancelado");
    expect(model.nodes.map((n) => n.nombre)).not.toContain("Reembolso");
    const arista = model.edges.find((e) => e.fuente === "cancelar")!;
    expect(arista.predicado).toBe("dispara");
    const proc = model.nodes.find((n) => n.nombre === "PedidoCancelado")!.metadata!.find((m) => m.clave === "procedencia")!.valor;
    expect(proc).toMatch(/^IA · docs\/pedidos\.md · aceptó ana · 2026-11-10/);
    expect(model.nodes.find((n) => n.id === "cancelar")!.metadata!.find((m) => m.clave === "procedencia")!.valor).toMatch(/Cancelar dispara/);
    // Explícito en el conocimiento: la forma CADENA ya no marca a Cancelar.
    const k = conocimientoDeModelo(model);
    const nuevo = model.nodes.find((n) => n.nombre === "PedidoCancelado")!.id;
    expect(k.store.match(iriElemento("actual", "grafo", "cancelar"), iriPredicado("dispara"), iriElemento("actual", "grafo", nuevo))[0].origen).toBe(
      "explicito"
    );
  });

  it("una relación cuyo elemento nuevo no se aceptó se omite, con el motivo", () => {
    const r = revisarPropuestas(modeloES(), [h("PedidoCancelado", "es", evento), h("Cancelar", "dispara", "PedidoCancelado")]);
    const { aplicadas, omitidas } = aplicarPropuestas(modeloES(), [r[1]], P);
    expect(aplicadas).toEqual([]);
    expect(omitidas[0].motivo).toMatch(/Falta aceptar qué es «PedidoCancelado»/);
  });

  it("una inválida aunque venga marcada como aceptada no entra", () => {
    const r = revisarPropuestas(modeloES(), [h("Cliente", "dispara", "PagoRealizado")]);
    expect(aplicarPropuestas(modeloES(), r, P).aplicadas).toEqual([]);
  });
});
