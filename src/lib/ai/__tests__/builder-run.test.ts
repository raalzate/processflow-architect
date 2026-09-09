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
  MAX_BUILDER_FAILURES,
  askUser,
  answerUser,
  extendRun,
  preguntaDeContinuar,
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
    expect(s.pregunta?.texto).toMatch(/Pagos/);
    // Pendiente no gasta paso: el paso lo gasta la ejecución, si la hay.
    expect(s.restantes).toBe(MAX_BUILDER_STEPS);
  });

  it("un sí libera la llamada para ejecutarse", () => {
    const s = pendingConfirmation(startRun(), call("delete_view", { name: "Pagos" }), "Se elimina Pagos.");
    const r = resolveConfirmation(s, true);
    expect(r.ejecutar).toEqual(call("delete_view", { name: "Pagos" }));
    expect(r.state.pregunta).toBeUndefined();
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

/**
 * Pausa con OPCIONES (#321). El agente que no puede seguir tenía un solo recurso:
 * escribir un párrafo y morirse. «Partilo en pasos o activá la nube» decía las dos
 * cosas que se podían hacer y no dejaba hacer ninguna. Una pausa con opciones es el
 * mismo mecanismo que la confirmación de un borrado —de hecho, ésta pasa a ser un
 * caso de aquélla—: la corrida se detiene con su estado y la elección la retoma.
 */
describe("pausa con opciones", () => {
  const pregunta = {
    texto: "El pedido no entra en una corrida del motor local. ¿Cómo seguimos?",
    opciones: [
      { id: "partir", label: "Partilo en pasos" },
      { id: "ajustes", label: "Abrir Ajustes de IA", accion: "abrir-ajustes-ia" as const },
      { id: "cancelar", label: "Cancelar", accion: "cancelar" as const },
    ],
  };

  it("preguntar detiene la corrida sin gastar un paso", () => {
    const s = askUser(startRun(), pregunta);
    expect(s.pregunta?.opciones).toHaveLength(3);
    expect(s.restantes).toBe(MAX_BUILDER_STEPS);
    expect(runFinished(s)).toBe(false);
  });

  it("la respuesta retoma la corrida y queda en la traza", () => {
    const s = answerUser(askUser(startRun(), pregunta), "partir");
    expect(s.state.pregunta).toBeUndefined();
    expect(s.eleccion?.id).toBe("partir");
    expect(summarizeRun(s.state)).not.toMatch(/cancel/i);
  });

  it("una opción inventada no se acepta: la corrida sigue esperando", () => {
    const s = answerUser(askUser(startRun(), pregunta), "borrar-todo");
    expect(s.eleccion).toBeUndefined();
    expect(s.state.pregunta).toBeDefined();
  });

  it("la opción de cancelar cierra la corrida", () => {
    const s = answerUser(askUser(startRun(), pregunta), "cancelar");
    expect(runFinished(s.state)).toBe(true);
    expect(summarizeRun(s.state)).toMatch(/cancel/i);
  });

  it("la confirmación de lo destructivo es una pregunta con dos opciones", () => {
    const s = pendingConfirmation(startRun(), { tool: "delete_view", args: { name: "Pagos" } }, "Se elimina Pagos.");
    expect(s.pregunta?.texto).toMatch(/Pagos/);
    expect(s.pregunta?.opciones.map((o) => o.id)).toEqual(["si", "no"]);
    // Y el sí sigue devolviendo la llamada a ejecutar, como antes.
    expect(resolveConfirmation(s, true).ejecutar?.tool).toBe("delete_view");
  });
});

/**
 * Seguir donde quedó (#322). Agotar el tope cerraba la corrida y la única salida
 * era repetir el pedido desde cero, tirando lo que el agente ya sabía del
 * proyecto. Subir el número no arregla eso: con el motor local, más pasos con el
 * contexto recortado terminan en trabajo repetido. Lo que faltaba era que el
 * humano decida, viendo el avance.
 */
describe("extender la corrida", () => {
  const agotada = () => {
    let s = startRun();
    for (let i = 0; i < MAX_BUILDER_STEPS; i++) {
      s = applyObservation(s, call("add_node", { name: `N${i}`, type: "Comando" }), ok("hecho"));
    }
    return s;
  };

  it("renueva el presupuesto sin perder lo hecho", () => {
    const s = extendRun(agotada());
    expect(s.restantes).toBe(MAX_BUILDER_STEPS);
    expect(s.pasos).toHaveLength(MAX_BUILDER_STEPS);
    expect(s.cambios).toHaveLength(MAX_BUILDER_STEPS);
    expect(runFinished(s)).toBe(false);
  });

  it("la pregunta de continuar muestra el avance y ofrece las dos salidas", () => {
    const pregunta = preguntaDeContinuar(agotada());
    expect(pregunta.texto).toMatch(/tope/i);
    expect(pregunta.texto).toMatch(/N0/); // lo hecho va en la pregunta, no escondido
    expect(pregunta.opciones.map((o) => o.id)).toEqual(["seguir", "terminar"]);
    expect(pregunta.opciones.find((o) => o.id === "terminar")?.accion).toBe("cancelar");
  });

  it("una corrida cancelada por el humano no se extiende", () => {
    const s = extendRun(cancelRun(agotada()));
    expect(runFinished(s)).toBe(true);
    expect(s.restantes).toBe(0);
  });
});

/**
 * El tope mide TRABAJO, no intentos (#323). El modelo local devuelve JSON roto,
 * inventa herramientas y manda argumentos incompletos: si cada uno de esos turnos
 * gasta paso, la corrida se queda sin cuerda sin haber tocado el modelo. Pero un
 * bucle sin freno a los fallos gira para siempre, así que los fallos tienen su
 * propio tope, chico.
 */
describe("los fallos no gastan el tope de pasos", () => {
  const fallo = (texto = "no existe esa herramienta") => ({ ok: false, texto });

  it("una observación fallida no consume presupuesto", () => {
    const s = applyObservation(startRun(), call("inventada"), fallo());
    expect(s.restantes).toBe(MAX_BUILDER_STEPS);
    expect(s.pasos).toHaveLength(1); // pero sí queda en la traza
  });

  it("una herramienta que salió bien sí lo consume", () => {
    const s = applyObservation(startRun(), call("list_views"), ok("2 vistas"));
    expect(s.restantes).toBe(MAX_BUILDER_STEPS - 1);
  });

  it("los fallos tienen su propio tope: el bucle no gira para siempre", () => {
    let s = startRun();
    for (let i = 0; i < MAX_BUILDER_FAILURES; i++) s = applyObservation(s, call("inventada"), fallo());
    expect(runFinished(s)).toBe(true);
    expect(s.restantes).toBe(MAX_BUILDER_STEPS); // no gastó ni un paso de trabajo
  });

  it("un acierto después de fallos limpia el contador: el modelo se recuperó", () => {
    let s = applyObservation(startRun(), call("inventada"), fallo());
    s = applyObservation(s, call("inventada"), fallo());
    s = applyObservation(s, call("list_views"), ok("2 vistas"));
    expect(s.fallos).toBe(0);
    expect(runFinished(s)).toBe(false);
  });

  it("el resumen distingue trabarse de quedarse sin pasos", () => {
    let s = startRun();
    for (let i = 0; i < MAX_BUILDER_FAILURES; i++) s = applyObservation(s, call("inventada"), fallo("JSON inválido"));
    const texto = summarizeRun(s);
    expect(texto).toMatch(/trab|no logr|inválid/i);
    expect(texto).not.toMatch(/tope de pasos/i);
  });

  it("extender la corrida también limpia los fallos", () => {
    let s = startRun();
    for (let i = 0; i < MAX_BUILDER_FAILURES; i++) s = applyObservation(s, call("inventada"), fallo());
    expect(extendRun(s).fallos).toBe(0);
    expect(runFinished(extendRun(s))).toBe(false);
  });
});
