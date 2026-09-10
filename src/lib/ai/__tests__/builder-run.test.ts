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
  MAX_SIN_PROGRESO,
  MAX_BLOQUEOS,
  askUser,
  answerUser,
  extendRun,
  preguntaDeContinuar,
  yaRespondida,
  yaEjecutada,
  relecturaEsteril,
  pistaDeHerramienta,
  ultimoErrorReal,
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
    expect(s.cambios.map((c) => c.texto).join(" ")).toMatch(/Orden/);
    // Y queda marcado como trabajo de workspace: el lienzo del humano no cambió.
    expect(s.cambios[0].lienzo).toBe(false);
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

/**
 * La decisión del humano PERSISTE (#324). El bucle real: el agente preguntó si el
 * «FinOps Team» iba como Persona o como Contenedor, el humano eligió, y el agente
 * volvió a preguntar lo mismo — la elección viajaba sólo en el pedido de esa
 * continuación y el turno siguiente rearmaba el pedido desde cero. Si la decisión
 * no vive en el estado, no existe.
 */
describe("las decisiones del humano se recuerdan", () => {
  const pregunta = {
    texto: "¿Persona o Contenedor?",
    opciones: [
      { id: "persona", label: "Persona (Actor)" },
      { id: "contenedor", label: "Contenedor (Pool/Agregado)" },
    ],
  };

  it("la elección queda en el estado, no sólo en el turno", () => {
    const { state } = answerUser(askUser(startRun(), pregunta), "persona");
    expect(state.decisiones).toEqual([
      { pregunta: "¿Persona o Contenedor?", eleccion: "Persona (Actor)" },
    ]);
  });

  it("una pregunta ya respondida se reconoce aunque cambie el formato", () => {
    const { state } = answerUser(askUser(startRun(), pregunta), "persona");
    expect(yaRespondida(state, "  ¿PERSONA o contenedor?  ")).toEqual("Persona (Actor)");
    expect(yaRespondida(state, "¿Sobre qué vista trabajo?")).toBeUndefined();
  });

  it("las decisiones sobreviven a extender la corrida", () => {
    const { state } = answerUser(askUser(startRun(), pregunta), "contenedor");
    expect(extendRun(state).decisiones).toHaveLength(1);
  });

  it("la confirmación de un destructivo no ensucia el registro de decisiones", () => {
    const s = pendingConfirmation(startRun(), call("delete_view", { name: "Pagos" }), "Se elimina Pagos.");
    expect(resolveConfirmation(s, true).state.decisiones ?? []).toEqual([]);
  });
});

/**
 * Idempotencia (#325). El motor local no recuerda lo que hizo: las observaciones
 * viejas se recortan y con ellas se va la evidencia de que el diagrama ya existía.
 * En una corrida real el mismo diagrama quedó creado cinco veces. Que el agente
 * olvide es esperable; que la app le crea y ejecute de nuevo, no.
 */
describe("una acción ya hecha no se hace dos veces", () => {
  it("reconoce la llamada idéntica ya ejecutada con éxito", () => {
    const s = applyObservation(startRun(), call("create_diagram", { name: "FinOps" }), ok("creado"));
    expect(yaEjecutada(s, call("create_diagram", { name: "FinOps" }))).toBe(true);
  });

  it("el orden de los argumentos no la disfraza de distinta", () => {
    const s = applyObservation(
      startRun(),
      call("add_node", { name: "Orden", type: "Comando" }),
      ok("agregado")
    );
    expect(yaEjecutada(s, call("add_node", { type: "Comando", name: "Orden" }))).toBe(true);
  });

  it("una llamada que FALLÓ se puede reintentar: eso no es repetir trabajo", () => {
    const s = applyObservation(startRun(), call("add_node", { name: "Orden" }), {
      ok: false,
      texto: "falta type",
    });
    expect(yaEjecutada(s, call("add_node", { name: "Orden" }))).toBe(false);
  });

  it("no bloquea de más: otro elemento con la misma herramienta pasa", () => {
    const s = applyObservation(startRun(), call("add_node", { name: "Orden" }), ok("agregado"));
    expect(yaEjecutada(s, call("add_node", { name: "Pago" }))).toBe(false);
  });

  it("tampoco bloquea las herramientas que se repiten a propósito", () => {
    // Releer el estado dos veces es legítimo: el modelo cambió entre medio.
    const s = applyObservation(startRun(), call("get_app_state"), ok("proyecto Demo"));
    expect(yaEjecutada(s, call("get_app_state"))).toBe(false);
  });
});

/**
 * Leer no puede ser una forma de no terminar nunca (#326). Traza real: `get_view`
 * de una vista que no existe, `get_app_state` que devuelve siempre lo mismo, y
 * vuelta a empezar — doce pasos de presupuesto gastados en releer lo mismo. Las
 * lecturas quedaron fuera del freno de idempotencia a propósito (releer es
 * legítimo si el modelo cambió); lo que no es legítimo es releer y obtener el
 * MISMO texto.
 */
describe("relecturas que no aportan nada", () => {
  const estado = "Proyecto activo: Demo. 0 contenedores.";

  it("una relectura con el mismo resultado se reconoce", () => {
    const s = applyObservation(startRun(), call("get_app_state"), ok(estado));
    expect(relecturaEsteril(s, call("get_app_state"))).toBe(estado);
  });

  it("si el resultado puede haber cambiado, no se bloquea", () => {
    // Hubo una escritura después de la lectura: el estado del modelo cambió.
    let s = applyObservation(startRun(), call("get_app_state"), ok(estado));
    s = applyObservation(s, call("add_node", { name: "Orden" }), ok("agregado"));
    expect(relecturaEsteril(s, call("get_app_state"))).toBeUndefined();
  });

  it("una lectura que nunca se hizo no es estéril", () => {
    const s = applyObservation(startRun(), call("get_app_state"), ok(estado));
    expect(relecturaEsteril(s, call("list_views"))).toBeUndefined();
  });
});

describe("turnos sin progreso", () => {
  it("una lectura no cuenta como progreso, una escritura sí", () => {
    const leido = applyObservation(startRun(), call("get_app_state"), ok("estado"));
    expect(leido.sinProgreso).toBe(1);
    const escrito = applyObservation(leido, call("add_node", { name: "Orden" }), ok("agregado"));
    expect(escrito.sinProgreso).toBe(0);
  });

  it("al tope de turnos sin progreso la corrida para", () => {
    let s = startRun();
    for (let i = 0; i < MAX_SIN_PROGRESO; i++) {
      s = applyObservation(s, call("get_view", { name: `V${i}` }), ok("no existe"));
    }
    expect(runFinished(s)).toBe(true);
  });

  it("y lo dice sin fingir que se acabaron los pasos", () => {
    let s = startRun();
    for (let i = 0; i < MAX_SIN_PROGRESO; i++) {
      s = applyObservation(s, call("get_view", { name: `V${i}` }), ok("no existe"));
    }
    const texto = summarizeRun(s);
    expect(texto).toMatch(/sin construir|no llegu|leyendo/i);
    expect(texto).not.toMatch(/tope de pasos/i);
  });
});

/**
 * El agente tiene que saber QUÉ está construyendo (#327). El diagrama en curso
 * vive en el workspace del MCP; `get_app_state` mira el proyecto de la app, que
 * sigue vacío hasta `export_as_view`. El modelo preguntaba «¿quedó?», le decían
 * «0 elementos» y volvía a crear el diagrama desde cero: tres veces en una
 * corrida. El estado de la corrida ahora recuerda el diagrama fijado.
 */
describe("diagrama en curso", () => {
  const creado =
    'Diagrama creado y FIJADO. diagramId="finops-framework-15", notación=c4. Las próximas llamadas pueden omitir `diagramId`.';

  it("se detecta del resultado del MCP, sin que nadie lo declare", () => {
    const s = applyObservation(startRun(), call("create_diagram", { name: "FinOps Framework" }), ok(creado));
    expect(s.diagrama).toEqual({ id: "finops-framework-15", nombre: "FinOps Framework" });
  });

  it("use_diagram lo cambia", () => {
    let s = applyObservation(startRun(), call("create_diagram", { name: "A" }), ok(creado));
    s = applyObservation(
      s,
      call("use_diagram", { diagramId: "otro-3" }),
      ok('Diagrama fijado: "otro-3" (Otro, c4).')
    );
    expect(s.diagrama?.id).toBe("otro-3");
  });

  it("una lectura cualquiera no lo pisa", () => {
    let s = applyObservation(startRun(), call("create_diagram", { name: "A" }), ok(creado));
    s = applyObservation(s, call("get_app_state"), ok("Proyecto activo: Demo"));
    expect(s.diagrama?.id).toBe("finops-framework-15");
  });
});

describe("relectura estéril: la decide la LLAMADA, no el texto", () => {
  const estado = (t: string) =>
    `Proyecto activo: "Demo" (notación c4). Contenido: 0 elemento(s). Estado publicado: ${t}.`;

  it("repetir la misma lectura sin haber escrito nada es estéril, aunque la respuesta traiga un timestamp", () => {
    // No se puede saber si el texto cambiaría sin volver a llamar; lo que sí se
    // sabe es que NADA de lo que hizo el agente pudo cambiarlo (#327).
    const s = applyObservation(startRun(), call("get_app_state"), ok(estado("2026-09-09T21:35:49.936Z")));
    expect(relecturaEsteril(s, call("get_app_state"))).toBeDefined();
  });
});

describe("trabajo sin publicar", () => {
  it("el resumen avisa que quedó en el workspace", () => {
    let s = applyObservation(
      startRun(),
      call("create_diagram", { name: "FinOps" }),
      ok('Diagrama creado y FIJADO. diagramId="finops-1", notación=c4.')
    );
    s = applyObservation(s, call("add_container", { name: "Informar" }), ok("añadido"));
    expect(summarizeRun(s)).toMatch(/export_as_view|no .*public|workspace/i);
  });

  it("si se publicó, no avisa nada", () => {
    let s = applyObservation(
      startRun(),
      call("create_diagram", { name: "FinOps" }),
      ok('Diagrama creado y FIJADO. diagramId="finops-1", notación=c4.')
    );
    s = applyObservation(s, call("add_container", { name: "Informar" }), ok("añadido"));
    s = applyObservation(s, call("export_as_view", { name: "FinOps" }), ok("vista creada"));
    expect(summarizeRun(s)).not.toMatch(/no .*public/i);
  });
});

/**
 * Corregirse no es girar (#328). El modelo pidió add_container con un tipo de
 * elemento, el MCP lo rechazó, y al releer la notación para arreglarlo el freno
 * de #326 lo bloqueó tres veces hasta cerrar la corrida. Una observación puede
 * ser NEUTRA: no gasta paso (no hubo trabajo) y no suma fallo (no hubo error del
 * modelo), pero tampoco es progreso.
 */
describe("observaciones neutras", () => {
  it("no gastan paso ni suman fallo", () => {
    const s = applyObservation(startRun(), call("(relectura)"), { ok: false, texto: "ya lo leíste" }, { neutra: true });
    expect(s.restantes).toBe(MAX_BUILDER_STEPS);
    expect(s.fallos).toBe(0);
  });

  it("no cuentan como fallo ni como turno sin progreso: el turno lo consumió el freno", () => {
    // Sin esto, el tope de «sin progreso» mataba corridas que estaban a un paso de
    // recuperarse: el modelo se corregía y el arnés lo contaba en contra.
    const s = applyObservation(startRun(), call("(relectura)"), { ok: false, texto: "ya lo leíste" }, { neutra: true });
    expect(s.sinProgreso).toBe(0);
    expect(s.fallos).toBe(0);
    expect(s.bloqueos).toBe(1);
  });

  it("pero insistir tiene tope propio: cada freno cuesta una inferencia igual", () => {
    let s = startRun();
    for (let i = 0; i < MAX_BLOQUEOS; i++) {
      s = applyObservation(s, call("(relectura)"), { ok: false, texto: "ya lo leíste" }, { neutra: true });
    }
    expect(runFinished(s)).toBe(true);
    expect(summarizeRun(s)).toMatch(/insist/i);
  });

  it("una acción válida limpia los bloqueos: el modelo se reencaminó", () => {
    let s = applyObservation(startRun(), call("(relectura)"), { ok: false, texto: "x" }, { neutra: true });
    s = applyObservation(s, call("add_node", { name: "Orden" }), ok("agregado"));
    expect(s.bloqueos).toBe(0);
  });
});

/**
 * El error más probable de cualquier notación: pedir como contenedor algo que es
 * elemento, o al revés. El MCP lo rechaza con la lista de tipos válidos, pero no
 * dice CUÁL herramienta corresponde, y el modelo local no lo deduce (#328).
 */
describe("traducir contenedor ↔ elemento", () => {
  it("un tipo de elemento pedido como contenedor manda a add_node", () => {
    const pista = pistaDeHerramienta(
      call("add_container", { name: "Cliente", type: "Persona" }),
      '"Persona" no es un tipo contenedor. Contenedores válidos: Límite de Sistema, Pool, Carril.'
    );
    expect(pista).toMatch(/add_node/);
    expect(pista).toMatch(/Cliente/);
  });

  it("un tipo contenedor pedido como elemento manda a add_container", () => {
    const pista = pistaDeHerramienta(
      call("add_node", { name: "Ventas", type: "Límite de Sistema" }),
      '"Límite de Sistema" es un tipo CONTENEDOR: usá add_container.'
    );
    expect(pista).toMatch(/add_container/);
  });

  it("un error cualquiera no inventa pistas", () => {
    expect(pistaDeHerramienta(call("add_node", { name: "X" }), "Falta el argumento name.")).toBeUndefined();
  });
});

describe("el cierre dice primero por qué paró", () => {
  it("el motivo va antes que la lista de cambios", () => {
    let s = applyObservation(startRun(), call("add_node", { name: "Orden" }), ok("agregado"));
    s = cancelRun(s);
    const texto = summarizeRun(s);
    expect(texto.indexOf("Corrida cancelada")).toBeLessThan(texto.indexOf("Orden"));
  });

  it("sin motivo especial, el resumen abre por el estado del lienzo", () => {
    const s = applyObservation(startRun(), call("add_node", { name: "Orden" }), ok("agregado"));
    // add_node es workspace: lo primero que se dice es que el lienzo sigue igual.
    expect(summarizeRun(s).startsWith("Tu lienzo sigue igual")).toBe(true);
  });
});

/**
 * El reporte tiene que decir lo que PASÓ, no lo que el agente pidió (#329). El
 * humano ve su lienzo; lo que quedó en el workspace del MCP no es un cambio para
 * él. Llamar «cambios aplicados» a las dos cosas es mentir con formato de informe.
 */
describe("qué llegó al lienzo y qué no", () => {
  const conTrabajo = () => {
    let s = applyObservation(
      startRun(),
      call("create_diagram", { name: "MVC" }),
      ok('Diagrama creado y FIJADO. diagramId="mvc", notación=c4.')
    );
    return applyObservation(s, call("add_container", { name: "App", type: "Límite de Sistema" }), ok("añadido"));
  };

  it("sin exportar: el titular dice que el lienzo NO cambió", () => {
    const texto = summarizeRun(conTrabajo());
    expect(texto).toMatch(/tu lienzo (sigue|no)/i);
    // Y no puede abrir diciendo que aplicó cambios.
    expect(texto.startsWith("Cambios aplicados")).toBe(false);
  });

  it("lo del workspace se lista aparte, dicho como lo que es", () => {
    const texto = summarizeRun(conTrabajo());
    expect(texto).toMatch(/workspace/i);
    expect(texto).toMatch(/App/);
    expect(texto).toMatch(/export_as_view/);
  });

  it("al exportar, eso sí es un cambio del lienzo", () => {
    const s = applyObservation(conTrabajo(), call("export_as_view", { name: "MVC" }), ok("Vista creada."));
    const texto = summarizeRun(s);
    expect(texto).toMatch(/En tu lienzo/i);
    expect(texto).toMatch(/MVC/);
    expect(texto).not.toMatch(/todav[íi]a NO est[áa] en el lienzo/i);
  });

  it("borrar una vista también es del lienzo, no del workspace", () => {
    const s = applyObservation(startRun(), call("delete_view", { name: "Vieja" }), ok("eliminada"));
    expect(summarizeRun(s)).toMatch(/En tu lienzo[\s\S]*Vieja/i);
  });
});

/**
 * El mensaje de bloqueo se citaba a sí mismo y crecía en cada vuelta (#330): el
 * último paso no-ok era el propio bloqueo del arnés, no un error del MCP.
 */
describe("el último error es del MCP, no del arnés", () => {
  it("ignora los pasos que genera el propio bucle", () => {
    let s = applyObservation(startRun(), call("create_diagram", { notation: "C4" }), {
      ok: false,
      texto: "MCP error -32602: invalid_enum_value",
    });
    s = applyObservation(s, call("(relectura)"), { ok: false, texto: "Ya leíste describe_notation…" }, { neutra: true });
    expect(ultimoErrorReal(s)).toMatch(/-32602/);
    expect(ultimoErrorReal(s)).not.toMatch(/Ya leíste/);
  });

  it("sin errores reales, no inventa uno", () => {
    const s = applyObservation(startRun(), call("(relectura)"), { ok: false, texto: "x" }, { neutra: true });
    expect(ultimoErrorReal(s)).toBeUndefined();
  });
});

describe("enum inválido: la corrección está en el propio error (#330)", () => {
  it("traduce el valor recibido al válido", () => {
    const pista = pistaDeHerramienta(
      call("create_diagram", { name: "MVC", notation: "C4" }),
      'Input validation error: [{"received":"C4","code":"invalid_enum_value","options":["ddd","bpmn","c4","uml"],"path":["notation"]}]'
    );
    expect(pista).toMatch(/notation/);
    expect(pista).toMatch(/"c4"/);
  });

  it("si ninguna opción se parece, ofrece la lista", () => {
    const pista = pistaDeHerramienta(
      call("create_diagram", { name: "MVC", notation: "arquitectura" }),
      'Input validation error: [{"received":"arquitectura","code":"invalid_enum_value","options":["ddd","bpmn","c4"],"path":["notation"]}]'
    );
    expect(pista).toMatch(/ddd/);
    expect(pista).toMatch(/bpmn/);
  });
});
