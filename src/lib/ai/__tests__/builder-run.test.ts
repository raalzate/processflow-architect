/**
 * Estado de una corrida del constructor (014, #308).
 *
 * Un agente que escribe sin tope escribe hasta que el humano lo mata. Acá está
 * lo que hace que una corrida TERMINE y que se sepa qué dejó hecha: tope de
 * pasos, cancelación, registro de cambios aplicados y resumen final (FR-009,
 * FR-011, FR-015). Ninguna función ejecuta herramientas: sólo mueve el estado.
 */
import { describe, it, expect } from "vitest";
import {
  startRun,
  applyObservation,
  pendingConfirmation,
  resolveConfirmation,
  cancelRun,
  runFinished,
  summarizeRun,
  MAX_BUILDER_STEPS,
} from "@/lib/ai/builder-run";

const call = (tool: string, args: Record<string, unknown> = {}) => ({ tool, args });
const ok = (texto: string) => ({ ok: true, texto });

describe("corrida del constructor", () => {
  it("arranca con el tope de pasos completo y sin cambios", () => {
    const s = startRun();
    expect(s.restantes).toBe(MAX_BUILDER_STEPS);
    expect(s.cambios).toEqual([]);
    expect(runFinished(s)).toBe(false);
  });

  it("cada observación gasta un paso y queda en la traza", () => {
    const s = applyObservation(startRun(), call("list_views"), ok("2 vistas"));
    expect(s.restantes).toBe(MAX_BUILDER_STEPS - 1);
    expect(s.pasos).toHaveLength(1);
    expect(s.pasos[0]).toMatchObject({ tool: "list_views", ok: true });
  });

  it("no muta el estado que recibe", () => {
    const antes = startRun();
    applyObservation(antes, call("list_views"), ok("ok"));
    expect(antes.pasos).toHaveLength(0);
    expect(antes.restantes).toBe(MAX_BUILDER_STEPS);
  });

  it("una lectura no cuenta como cambio; una escritura sí", () => {
    let s = applyObservation(startRun(), call("list_views"), ok("2 vistas"));
    expect(s.cambios).toEqual([]);
    s = applyObservation(s, call("add_node", { name: "Orden", type: "Comando" }), ok("agregado"));
    expect(s.cambios.join(" ")).toMatch(/Orden/);
  });

  it("una herramienta que falla queda en la traza y NO cuenta como cambio", () => {
    const s = applyObservation(startRun(), call("add_node", { name: "Orden" }), {
      ok: false,
      texto: "falta type",
    });
    expect(s.pasos[0].ok).toBe(false);
    expect(s.cambios).toEqual([]);
  });

  it("al consumir el tope la corrida termina", () => {
    let s = startRun();
    for (let i = 0; i < MAX_BUILDER_STEPS; i++) s = applyObservation(s, call("list_views"), ok("ok"));
    expect(s.restantes).toBe(0);
    expect(runFinished(s)).toBe(true);
  });

  it("una confirmación pendiente frena la corrida hasta que el humano responda", () => {
    const s = pendingConfirmation(startRun(), call("delete_view", { name: "Pagos" }), "Se elimina Pagos.");
    expect(s.pendiente?.alcance).toMatch(/Pagos/);
    // Pendiente no gasta paso: el paso lo gasta la ejecución, si la hay.
    expect(s.restantes).toBe(MAX_BUILDER_STEPS);
  });

  it("un sí libera la llamada para ejecutarse", () => {
    const s = pendingConfirmation(startRun(), call("delete_view", { name: "Pagos" }), "Se elimina Pagos.");
    const r = resolveConfirmation(s, true);
    expect(r.ejecutar).toEqual(call("delete_view", { name: "Pagos" }));
    expect(r.state.pendiente).toBeUndefined();
  });

  it("un no deja el modelo intacto y lo deja dicho", () => {
    const s = pendingConfirmation(startRun(), call("delete_view", { name: "Pagos" }), "Se elimina Pagos.");
    const r = resolveConfirmation(s, false);
    expect(r.ejecutar).toBeUndefined();
    expect(r.state.cambios).toEqual([]);
    expect(summarizeRun(r.state)).toMatch(/no se hizo|sin cambios|canceló|rechaz/i);
  });

  it("cancelar detiene la corrida", () => {
    const s = cancelRun(applyObservation(startRun(), call("list_views"), ok("ok")));
    expect(runFinished(s)).toBe(true);
    expect(summarizeRun(s)).toMatch(/cancel/i);
  });

  it("el resumen enumera los cambios aplicados", () => {
    let s = applyObservation(startRun(), call("add_node", { name: "Orden", type: "Comando" }), ok("ok"));
    s = applyObservation(s, call("export_as_view", { name: "Pagos" }), ok("ok"));
    const texto = summarizeRun(s);
    expect(texto).toMatch(/Orden/);
    expect(texto).toMatch(/Pagos/);
  });

  it("una corrida sin cambios lo dice, en vez de fingir trabajo", () => {
    const s = applyObservation(startRun(), call("list_views"), ok("2 vistas"));
    expect(summarizeRun(s)).toMatch(/sin cambios|no se cambió|no cambió/i);
  });
});
