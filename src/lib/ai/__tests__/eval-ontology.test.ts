import { describe, expect, it } from "vitest";
import { construirConocimiento } from "@/lib/ontology/conocimiento";
import { PROYECTO_PEDIDOS, vistasPedidos } from "@/lib/ontology/__tests__/fixtures/pedidos";
import { nombresCitados, puntuar, resumir, vocabularioEvaluacion } from "../eval-ontology";

const VOCAB = ["Pagar", "PagoRealizado", "Facturar", "FacturarPedido", "FacturaEmitida", "Pasarela", "Pagos"];

// T28 · SC-002: el criterio de la evaluación, fijo y probado.
describe("puntuar una respuesta del agente", () => {
  it("acierta si nombra todos los esperados, sin importar acentos ni mayúsculas", () => {
    const p = puntuar("Termina provocando PagoRealizado y, vía la política, facturaemitida.", ["PagoRealizado", "FacturaEmitida"], VOCAB);
    expect(p).toEqual({ acierto: true, faltan: [], inexistentes: [] });
  });

  it("reconoce el nombre escrito como id o separado, pero no dentro de otra palabra", () => {
    expect(puntuar("Emite el comando facturar-pedido.", ["FacturarPedido"], VOCAB).acierto).toBe(true);
    expect(puntuar("Emite Facturar Pedido.", ["FacturarPedido"], VOCAB).acierto).toBe(true);
    expect(puntuar("Escribe en PagosDB.", ["Pagos"], VOCAB).acierto).toBe(false);
  });

  it("falla si falta uno", () => {
    expect(puntuar("Provoca PagoRealizado.", ["PagoRealizado", "FacturaEmitida"], VOCAB)).toMatchObject({
      acierto: false,
      faltan: ["FacturaEmitida"],
    });
  });

  it("nombrar un elemento que no existe es alucinación aunque estén los esperados", () => {
    const p = puntuar("Provoca PagoRealizado, FacturaEmitida y «Notificar cliente».", ["PagoRealizado", "FacturaEmitida"], VOCAB);
    expect(p.acierto).toBe(false);
    expect(p.inexistentes).toEqual(["Notificar cliente"]);
  });

  it("sin esperados, acierta quien dice que el modelo no lo sabe", () => {
    expect(puntuar("Desconocido en el modelo.", [], VOCAB).acierto).toBe(true);
    expect(puntuar("El modelo no lo afirma.", [], VOCAB).acierto).toBe(true);
    expect(puntuar("Cancelar dispara PedidoCancelado.", [], VOCAB)).toMatchObject({ acierto: false, inexistentes: ["PedidoCancelado"] });
  });

  it("nombres citados: comillas, angulares, negritas y CamelCase", () => {
    expect(nombresCitados('Es «Pagos» y "Pasarela", también **Cobro web** y PagoRealizado.').sort()).toEqual(
      ["Cobro web", "PagoRealizado", "Pagos", "Pasarela"].sort()
    );
  });

  // #742 · H1: respuestas REALES de la corrida de evaluación que se contaban como alucinación.
  it("la respuesta «desconocido» citada en negrita no es un nombre inventado", () => {
    expect(puntuar("**Desconocido en el modelo.** No hay arista de Cancelar a un evento.", [], VOCAB)).toEqual({
      acierto: true,
      faltan: [],
      inexistentes: [],
    });
  });

  it("citar una flecha entre dos elementos que existen no es alucinar", () => {
    expect(puntuar("El comando **Pagar** emite **PagoRealizado** (arista «Pagar emite PagoRealizado»).", ["PagoRealizado"], VOCAB).acierto).toBe(true);
    expect(puntuar("Según la arista «pagar → pago-realizado».", ["PagoRealizado"], VOCAB).acierto).toBe(true);
    // Con un solo elemento real, lo citado sigue siendo un invento.
    expect(puntuar("Provoca «Notificar Pagos»", [], VOCAB).inexistentes).toEqual(["Notificar Pagos"]);
  });

  it("el vocabulario de la evaluación suma predicados, tipos y etiquetas dibujadas", () => {
    const k = construirConocimiento({ proyecto: PROYECTO_PEDIDOS, vistas: vistasPedidos() }, { tipo: "proyecto" });
    const voc = vocabularioEvaluacion(k);
    expect(voc).toEqual(expect.arrayContaining(["Pagar", "reacciona a", "emite", "Escribe en [SQL]", "Sí", "Comando", "Tarea"]));
    expect(puntuar("La política Facturar «reacciona a» **PagoRealizado**.", ["PagoRealizado"], voc).acierto).toBe(true);
    expect(puntuar("Pagos escribe en PagosDB («Escribe en [SQL]»).", ["Pagos"], voc).acierto).toBe(true);
    expect(puntuar("Provoca «InventarioActualizado».", [], voc).inexistentes).toEqual(["InventarioActualizado"]);
  });

  it("resumen: exactitud y respuestas con inexistentes", () => {
    const r = resumir([
      { acierto: true, faltan: [], inexistentes: [] },
      { acierto: false, faltan: ["x"], inexistentes: ["Y"] },
    ]);
    expect(r).toEqual({ preguntas: 2, exactitud: 0.5, conInexistentes: 1 });
    expect(resumir([]).exactitud).toBe(0);
  });
});
