/**
 * @fileOverview Estado de UNA corrida del agente constructor (PURO). 014 (#308).
 *
 * El analista tiene `agent-run.ts`; esto es su equivalente para el agente que
 * ESCRIBE, y por eso lo que fija es distinto: cuántos pasos quedan (una corrida
 * sin tope escribe hasta que la matan), qué confirmación está esperando al
 * humano, y —lo importante— QUÉ CAMBIÓ de verdad en el modelo, para que el
 * cierre no sea la palabra del modelo sino la lista de herramientas que
 * efectivamente se aplicaron.
 *
 * Ninguna función ejecuta nada ni muta su entrada: devuelven estado nuevo.
 */

import { nombreDeVista, type BuilderCall } from "./builder-tools";

/** Resultado de haber llamado a una herramienta (lo trae el adaptador). */
export interface ToolObservation {
  ok: boolean;
  texto: string;
}

export interface BuilderStep {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  texto: string;
}

/**
 * Una opción de una pregunta al humano. `accion` es lo que la app hace ADEMÁS de
 * devolver la elección al agente: hoy, abrir Ajustes o cortar la corrida.
 */
export interface BuilderOption {
  id: string;
  label: string;
  /** Pista para la UI. Sin esto, elegir sólo devuelve el id al agente. */
  accion?: "abrir-ajustes-ia" | "cancelar";
  /** Texto de apoyo bajo la opción (por qué elegirla). */
  detalle?: string;
}

export interface BuilderQuestion {
  texto: string;
  opciones: BuilderOption[];
  /**
   * Presente cuando la pregunta es la confirmación de una acción destructiva: el
   * «sí» ejecuta esta llamada. Confirmar dejó de ser un mecanismo aparte (#321).
   */
  call?: BuilderCall;
}

export interface BuilderRunState {
  pasos: BuilderStep[];
  /**
   * Cambios REALES, con su ámbito: `lienzo` es lo que el humano ve; el resto vive
   * en el workspace del MCP hasta que se publica (#329).
   */
  cambios: { texto: string; lienzo: boolean }[];
  /** Pregunta abierta: mientras esté, la corrida está detenida esperando al humano. */
  pregunta?: BuilderQuestion;
  restantes: number;
  /** Fallos SEGUIDOS del modelo (JSON roto, herramienta inventada, args inválidos). */
  fallos: number;
  /**
   * Veces SEGUIDAS que el bucle tuvo que frenar al modelo (relectura estéril,
   * diagrama repetido). No son fallos del modelo ni turnos sin progreso: son el
   * arnés diciendo «no». Tienen su propio tope porque cada una cuesta una
   * inferencia igual (#328).
   */
  bloqueos: number;
  /**
   * Turnos SEGUIDOS que no cambiaron el modelo. Leer está bien; leer y releer sin
   * construir nunca es la otra forma de no terminar (#326).
   */
  sinProgreso: number;
  cancelada?: boolean;
  /** El humano dijo que no a algo: se recuerda para no fingir que se hizo. */
  rechazos: string[];
  /**
   * Lo que el humano ya decidió, en el ESTADO. Si vive sólo en el pedido de la
   * continuación, el turno siguiente lo pierde y el agente vuelve a preguntar lo
   * mismo — pasó (#324). Se re-inyecta en cada turno.
   */
  decisiones: { pregunta: string; eleccion: string }[];
  /**
   * Diagrama fijado en el workspace del MCP. El agente NO lo ve en
   * `get_app_state` —eso mira el proyecto de la app—, y sin este recordatorio
   * concluía que su trabajo se había perdido y lo creaba de nuevo (#327).
   */
  diagrama?: { id: string; nombre: string; notacion?: string };
}

/**
 * Tope de pasos. Doce alcanza para orientarse, construir una vista de tamaño
 * humano y cerrarla; más que eso, con un modelo local, es divagar caro.
 */
export const MAX_BUILDER_STEPS = 12;

/**
 * Tope de fallos SEGUIDOS. El presupuesto de pasos mide trabajo hecho, así que un
 * turno fallido no lo toca (#323) — pero sin este segundo freno, un modelo que se
 * equivoca siempre deja el bucle girando gratis. Cuatro intentos alcanzan para
 * que se recupere de un JSON roto; al quinto no se está recuperando.
 */
export const MAX_BUILDER_FAILURES = 4;

/**
 * Tope de turnos SEGUIDOS sin tocar el modelo. Orientarse cuesta dos o tres
 * lecturas; seis sin escribir una sola vez no es orientarse, es girar — y el tope
 * de fallos no lo agarra, porque una lectura que sale bien limpia la racha.
 */
export const MAX_SIN_PROGRESO = 6;

/** Tope de frenos SEGUIDOS del propio bucle antes de dar la corrida por perdida. */
export const MAX_BLOQUEOS = 3;

/**
 * Herramientas cuyo efecto ve el HUMANO en su lienzo. Las demás escrituras quedan
 * en el workspace del MCP: son trabajo, pero no son un cambio del modelo del
 * humano hasta que se publican (#329).
 */
const TOCAN_EL_LIENZO = new Set([
  "export_as_view",
  "export_to_app",
  "delete_view",
  "rename_view",
  // El modo editor escribe DIRECTO en la vista abierta: eso el humano lo ve al
  // aplicarse, no al publicar (015, FR-009).
  "add_view_element",
  "update_view_element",
  "remove_view_element",
  "add_view_edge",
  "update_view_edge",
  "remove_view_edge",
  "set_view_graph",
]);

/** Herramientas que cambian el modelo (las demás sólo miran). */
const ESCRIBEN = new Set([
  "create_diagram",
  "add_container",
  "add_node",
  "add_edge",
  "update_element",
  "update_edge",
  "relayout_diagram",
  "remove_element",
  "remove_edge",
  "delete_view",
  "rename_view",
  "export_as_view",
  "add_view_element",
  "update_view_element",
  "remove_view_element",
  "add_view_edge",
  "update_view_edge",
  "remove_view_edge",
  "set_view_graph",
]);

/**
 * El diagrama que acaba de fijar el MCP, leído de SU respuesta: `create_diagram`
 * y `use_diagram` contestan con `diagramId="…"`. Se parsea en vez de asumirlo del
 * argumento porque el id lo genera el servidor (slug + contador).
 */
function diagramaDe(
  call: BuilderCall,
  texto: string
): { id: string; nombre: string; notacion?: string } | undefined {
  if (call.tool !== "create_diagram" && call.tool !== "use_diagram") return undefined;
  const id = /diagram(?:Id)?[=:]\s*"([^"]+)"/i.exec(texto)?.[1] ?? /"([^"]+)"/.exec(texto)?.[1];
  if (!id) return undefined;
  // El paréntesis de `use_diagram` es «(Nombre, notación)» y el nombre puede
  // tener comas: se parte por la ÚLTIMA (el `[^()]*` es codicioso), no por la
  // primera, o el nombre sale mutilado y la notación no sale (#331).
  const parentesis = /\(([^()]*),\s*([a-z0-9]+)\s*\)/i.exec(texto);
  const nombre =
    typeof call.args.name === "string" && call.args.name.trim()
      ? call.args.name.trim()
      : parentesis?.[1]?.trim() || id;
  // La NOTACIÓN también sale de la respuesta: `create_diagram` la escribe como
  // «notación=c4» y `use_diagram` como «(nombre, c4)». Sin ella, el arnés
  // validaba los tipos contra la vista abierta del humano (#331).
  const notacion =
    /notaci[oó]n\s*=\s*([a-z0-9]+)/i.exec(texto)?.[1] ??
    parentesis?.[2] ??
    (typeof call.args.notation === "string" ? call.args.notation : undefined);
  return { id, nombre, notacion: notacion?.toLowerCase() };
}

/**
 * Pasos que genera el propio bucle, no el MCP. No son errores del modelo y no
 * pueden citarse como «tu último error»: el mensaje se citaba a sí mismo y crecía
 * en cada vuelta (#330).
 */
const TOOLS_DEL_ARNES = new Set([
  "(relectura)",
  "(repetida)",
  "(create repetido)",
  "(inválida)",
  "(pregunta repetida)",
  "(verificación)",
]);

/**
 * El último error VIGENTE de una llamada real al MCP. Un error está SUPERADO
 * cuando la MISMA herramienta volvió a salir bien después —el `notation:"C4"`
 * que el reintento con `"c4"` arregló—: citarlo como si siguiera abierto le
 * ordenaba al modelo corregir lo que ya había corregido, y con el mismo texto
 * tres turnos seguidos la corrida moría con el diagrama vacío (#331).
 *
 * Que corte por herramienta y no por «el último acierto» importa: el modelo lee
 * PORQUE algo le falló, así que un `describe_notation` exitoso no arregla el
 * `add_container` que lo mandó a leer — y ese error es justo lo que el freno
 * tiene que devolverle (#326, #328).
 */
export function ultimoErrorReal(state: BuilderRunState): string | undefined {
  const reales = state.pasos.filter((p) => !TOOLS_DEL_ARNES.has(p.tool));
  for (let i = reales.length - 1; i >= 0; i--) {
    if (reales[i].ok) continue;
    const superado = reales.slice(i + 1).some((p) => p.ok && p.tool === reales[i].tool);
    if (!superado) return reales[i].texto;
  }
  return undefined;
}

/** Qué cambió, en una línea que el humano pueda leer sin abrir la traza. */
function frase(call: BuilderCall, diagramaNombre?: string): string {
  const nombre =
    call.tool === "export_as_view"
      ? nombreDeVista(call, diagramaNombre)
      : String(call.args.name ?? call.args.id ?? "");
  switch (call.tool) {
    case "add_node":
      return `Elemento "${nombre}" agregado${call.args.type ? ` (${String(call.args.type)})` : ""}.`;
    case "add_container":
      return `Contenedor "${nombre}" agregado.`;
    case "add_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} agregada.`;
    case "update_element":
      return `Elemento "${nombre}" modificado.`;
    case "update_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} modificada.`;
    case "remove_element":
      return `Elemento "${nombre}" eliminado.`;
    case "remove_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} eliminada.`;
    case "delete_view":
      return `Vista "${nombre}" eliminada.`;
    case "rename_view":
      return `Vista "${nombre}" renombrada a "${String(call.args.newName ?? "")}".`;
    case "export_as_view":
      return `Vista "${nombre}" publicada en el lienzo.`;
    case "create_diagram":
      return `Diagrama "${nombre}" creado.`;
    case "relayout_diagram":
      return "Diagrama reacomodado.";
    // Modo editor (015): el efecto está en la vista del humano, no en el workspace.
    case "add_view_element":
      return `Elemento "${nombre}" agregado a la vista${call.args.type ? ` (${String(call.args.type)})` : ""}.`;
    case "update_view_element":
      return `Elemento "${nombre}" modificado en la vista.`;
    case "remove_view_element":
      return `Elemento "${nombre}" eliminado de la vista.`;
    case "add_view_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} agregada a la vista.`;
    case "update_view_edge":
      // Invertir es lo que más se pide y lo que más se malinterpreta: el cierre
      // lo nombra con la palabra del humano, no con un «modificada» genérico.
      return call.args.invert
        ? `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} invertida en la vista.`
        : `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} modificada en la vista.`;
    case "remove_view_edge":
      return `Relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")} eliminada de la vista.`;
    case "set_view_graph":
      return "Diagrama publicado en la vista.";
    default:
      return `${call.tool} aplicado.`;
  }
}

export function startRun(): BuilderRunState {
  return { pasos: [], cambios: [], restantes: MAX_BUILDER_STEPS, fallos: 0, sinProgreso: 0, bloqueos: 0, rechazos: [], decisiones: [] };
}

/** Detiene la corrida con una pregunta concreta. No gasta paso: todavía no pasó nada. */
export function askUser(state: BuilderRunState, pregunta: BuilderQuestion): BuilderRunState {
  return { ...state, pregunta };
}

/**
 * La elección del humano. Una opción que no está en la lista NO se acepta: si el
 * agente pudiera inventar respuestas por él, la pausa no serviría de nada.
 */
export function answerUser(
  state: BuilderRunState,
  opcionId: string
): { state: BuilderRunState; eleccion?: BuilderOption } {
  const pregunta = state.pregunta;
  const eleccion = pregunta?.opciones.find((o) => o.id === opcionId);
  if (!pregunta || !eleccion) return { state };
  if (eleccion.accion === "cancelar") {
    return { state: { ...state, pregunta: undefined, cancelada: true }, eleccion };
  }
  // La confirmación de un destructivo y la pregunta de continuar son mecánica de
  // la corrida, no decisiones de MODELADO: no van al registro que se le recuerda
  // al agente turno a turno.
  const deModelado = !pregunta.call && !eleccion.accion && opcionId !== "seguir";
  return {
    state: {
      ...state,
      pregunta: undefined,
      decisiones: deModelado
        ? [...state.decisiones, { pregunta: pregunta.texto, eleccion: eleccion.label }]
        : state.decisiones,
    },
    eleccion,
  };
}

/**
 * Herramientas que se pueden repetir a propósito: leer el estado dos veces es
 * legítimo —el modelo cambió entre medio— y reacomodar también. La idempotencia
 * es para lo que CREA.
 */
const REPETIBLES = new Set([
  "get_app_state",
  "list_views",
  "get_view",
  "get_diagram",
  "list_notations",
  "describe_notation",
  "use_diagram",
  "validate_diagram",
  "relayout_diagram",
]);

/**
 * IDENTIDAD de lo que una llamada toca: la herramienta y la caja (o el par de
 * cajas) sobre la que actúa. La huella completa no sirve para esto: «agregá Ana»
 * y «agregá Ana con descripción» son argumentos distintos y la MISMA caja, así
 * que el modelo local la agregaba dos veces cambiando un detalle (015, T10).
 * Devuelve `undefined` cuando la llamada no nombra un objetivo.
 */
function identidad(call: BuilderCall): string | undefined {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  const nombre = texto(call.args.name ?? call.args.nombre ?? call.args.id);
  const desde = texto(call.args.from ?? call.args.fuente);
  const hasta = texto(call.args.to ?? call.args.destino);
  if (desde && hasta) return `${call.tool}:${desde}→${hasta}`;
  if (nombre) return `${call.tool}:${nombre}`;
  return undefined;
}

/** Huella de una llamada: herramienta + argumentos, sin que el orden la disfrace. */
function huella(call: BuilderCall): string {
  const args = Object.keys(call.args)
    .sort()
    .map((k) => `${k}=${JSON.stringify(call.args[k])}`)
    .join("|");
  return `${call.tool}(${args})`;
}

/**
 * ¿Esta llamada ya se ejecutó BIEN en esta corrida? Un fallo previo no cuenta:
 * reintentar lo que no salió no es repetir trabajo (#325).
 */
/**
 * ¿Esta lectura ya se hizo y devolvería lo mismo? Devuelve el resultado anterior
 * para recordárselo al modelo. Sólo cuenta si NO hubo escrituras después: si el
 * modelo cambió entre medio, releer es legítimo (#326).
 */
export function relecturaEsteril(state: BuilderRunState, call: BuilderCall): string | undefined {
  const h = huella(call);
  const idx = state.pasos.findIndex((p) => p.ok && huella({ tool: p.tool, args: p.args }) === h);
  if (idx < 0) return undefined;
  const escribióDespués = state.pasos.slice(idx + 1).some((p) => p.ok && ESCRIBEN.has(p.tool));
  return escribióDespués ? undefined : state.pasos[idx].texto;
}

export function yaEjecutada(state: BuilderRunState, call: BuilderCall): boolean {
  if (REPETIBLES.has(call.tool)) return false;
  const h = huella(call);
  if (state.pasos.some((p) => p.ok && huella({ tool: p.tool, args: p.args }) === h)) return true;
  // Por identidad: la misma caja con otro detalle sigue siendo la misma caja.
  const id = identidad(call);
  return Boolean(
    id && state.pasos.some((p) => p.ok && identidad({ tool: p.tool, args: p.args }) === id)
  );
}

/**
 * El error más probable en cualquier notación: pedir como CONTENEDOR algo que es
 * elemento, o al revés. El MCP contesta con los tipos válidos pero no dice qué
 * herramienta corresponde, y el modelo local no lo deduce: se queda releyendo la
 * notación (#328). Acá se traduce el rechazo en la acción concreta.
 */
export function pistaDeHerramienta(call: BuilderCall, error: string): string | undefined {
  const nombre = String(call.args.name ?? "").trim();
  const tipo = String(call.args.type ?? "").trim();
  if (call.tool === "add_container" && /no es un tipo contenedor/i.test(error)) {
    return `"${tipo}" es un ELEMENTO, no un contenedor: agregá "${nombre}" con add_node (mismos argumentos). Los contenedores son otros tipos.`;
  }
  if (call.tool === "add_node" && /es un tipo contenedor|us[aá] add_container/i.test(error)) {
    return `"${tipo}" es un CONTENEDOR: agregá "${nombre}" con add_container (mismos argumentos).`;
  }
  // Enum inválido: la corrección viene DENTRO del error (options + received), y el
  // caso típico es sólo mayúsculas —"C4" por "c4"— (#330).
  if (/invalid_enum_value/.test(error)) {
    const recibido = /"received"\s*:\s*"([^"]*)"/.exec(error)?.[1] ?? "";
    const campo = /"path"\s*:\s*\[\s*"([^"]+)"/.exec(error)?.[1] ?? "el argumento";
    const opciones = [...error.matchAll(/"options"\s*:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => m[1].split(",").map((o) => o.trim().replace(/^"|"$/g, "")))
      .filter(Boolean);
    const equivalente = opciones.find((o) => o.toLowerCase() === recibido.toLowerCase());
    return equivalente
      ? `${campo} debe ir tal cual: "${equivalente}" (mandaste "${recibido}"). Repetí la llamada con ese valor.`
      : `${campo} sólo acepta: ${opciones.join(", ")}. Mandaste "${recibido}".`;
  }
  return undefined;
}

/** Forma comparable de una pregunta: el modelo la reescribe con otro formato. */
const claveDePregunta = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** ¿Ya se respondió esto? Devuelve la elección del humano, para recordársela. */
export function yaRespondida(state: BuilderRunState, texto: string): string | undefined {
  const clave = claveDePregunta(texto);
  return state.decisiones.find((d) => claveDePregunta(d.pregunta) === clave)?.eleccion;
}

export function applyObservation(
  state: BuilderRunState,
  call: BuilderCall,
  obs: ToolObservation,
  /**
   * `neutra`: ni trabajo ni error del modelo. Es lo que devuelve un freno del
   * propio bucle (una relectura bloqueada, por ejemplo): no gasta paso porque no
   * se hizo nada, no suma fallo porque el modelo no se equivocó —corregirse no es
   * girar— y no cuenta como turno sin progreso, porque el turno lo consumió el
   * freno, no el modelo (#328). La insistencia la acota el tope de fallos, que sí
   * cuenta a partir de la segunda vez.
   */
  opts: { neutra?: boolean } = {}
): BuilderRunState {
  const paso: BuilderStep = { tool: call.tool, args: call.args, ok: obs.ok, texto: obs.texto };
  return {
    ...state,
    pasos: [...state.pasos, paso],
    // Un cambio se anota cuando la herramienta VOLVIÓ bien: lo contrario es
    // prometerle al humano un cambio que el MCP rechazó.
    cambios:
      obs.ok && !opts.neutra && ESCRIBEN.has(call.tool)
        ? [
            ...state.cambios,
            { texto: frase(call, state.diagrama?.nombre), lienzo: TOCAN_EL_LIENZO.has(call.tool) },
          ]
        : state.cambios,
    // El presupuesto mide TRABAJO: un turno que no llegó a tocar el modelo no lo
    // gasta. Lo que frena al modelo que se traba es el tope de fallos (#323).
    restantes: obs.ok && !opts.neutra ? Math.max(0, state.restantes - 1) : state.restantes,
    // Un acierto limpia la racha: el modelo se recuperó y merece el crédito entero.
    fallos: opts.neutra ? state.fallos : obs.ok ? 0 : state.fallos + 1,
    bloqueos: opts.neutra ? state.bloqueos + 1 : 0,
    // Progreso es CAMBIAR el modelo. Una lectura, por más que salga bien, deja
    // la corrida donde estaba.
    // Una observación neutra no mueve NINGÚN contador: no la produjo el modelo,
    // la produjo un freno del bucle. Lo que acota la insistencia es el tope de
    // fallos, que sí cuenta desde la segunda vez (#328).
    sinProgreso: opts.neutra
      ? state.sinProgreso
      : obs.ok && ESCRIBEN.has(call.tool)
        ? 0
        : state.sinProgreso + 1,
    diagrama: (obs.ok && !opts.neutra && diagramaDe(call, obs.texto)) || state.diagrama,
    pregunta: undefined,
  };
}

/**
 * Confirmar un destructivo es preguntar con dos opciones. Se mantiene la función
 * por lo que significa —esto NO es una pregunta cualquiera— pero por dentro es
 * el mismo mecanismo que el resto de las pausas (#321).
 */
export function pendingConfirmation(
  state: BuilderRunState,
  call: BuilderCall,
  alcance: string
): BuilderRunState {
  return askUser(state, {
    texto: `${alcance}\n\n¿Lo hago?`,
    opciones: [
      { id: "si", label: "Sí, hacelo" },
      { id: "no", label: "No" },
    ],
    call,
  });
}

export function resolveConfirmation(
  state: BuilderRunState,
  aceptada: boolean
): { state: BuilderRunState; ejecutar?: BuilderCall } {
  const pregunta = state.pregunta;
  const call = pregunta?.call;
  if (!pregunta || !call) return { state };
  if (aceptada) {
    return { state: { ...state, pregunta: undefined }, ejecutar: call };
  }
  return {
    state: {
      ...state,
      pregunta: undefined,
      // El alcance es la primera línea del texto: es lo que el humano leyó.
      rechazos: [...state.rechazos, pregunta.texto.split("\n")[0]],
    },
  };
}

/**
 * Renueva el presupuesto de pasos conservando traza y cambios. Lo pide el humano
 * viendo el avance (#322): subir el tope a ciegas, con el contexto recortándose,
 * compra trabajo repetido; extender a pedido compra lo que falta.
 *
 * Una corrida CANCELADA no se extiende: el humano ya dijo que no.
 */
export function extendRun(state: BuilderRunState, pasos = MAX_BUILDER_STEPS): BuilderRunState {
  if (state.cancelada) return state;
  return { ...state, restantes: pasos, fallos: 0, sinProgreso: 0, bloqueos: 0, pregunta: undefined };
}

/** La pregunta del tope: qué se hizo hasta acá y las dos salidas. */
export function preguntaDeContinuar(state: BuilderRunState): BuilderQuestion {
  const hecho = state.cambios.length
    ? `Llevo hecho:\n${state.cambios.map((c) => `- ${c.texto}`).join("\n")}`
    : "Todavía no cambié nada del modelo.";
  return {
    texto: `Se agotó el tope de ${MAX_BUILDER_STEPS} pasos de la corrida.\n\n${hecho}\n\n¿Sigo?`,
    opciones: [
      {
        id: "seguir",
        label: `Seguir ${MAX_BUILDER_STEPS} pasos más`,
        detalle: "Continúa esta misma corrida, con lo que ya averiguó.",
      },
      { id: "terminar", label: "Terminar acá", accion: "cancelar" },
    ],
  };
}

export function cancelRun(state: BuilderRunState): BuilderRunState {
  return { ...state, cancelada: true, pregunta: undefined };
}

export function runFinished(state: BuilderRunState): boolean {
  return (
    Boolean(state.cancelada) ||
    state.restantes <= 0 ||
    state.fallos >= MAX_BUILDER_FAILURES ||
    state.sinProgreso >= MAX_SIN_PROGRESO ||
    state.bloqueos >= MAX_BLOQUEOS
  );
}

/** El cierre: qué cambió, qué se rechazó y por qué terminó. */
export function summarizeRun(state: BuilderRunState): string {
  const enLienzo = state.cambios.filter((c) => c.lienzo);
  const enWorkspace = state.cambios.filter((c) => !c.lienzo);
  const lista = (titulo: string, items: { texto: string }[]) =>
    [titulo, ...items.map((c) => `- ${c.texto}`)].join("\n");

  // El motivo de la parada va PRIMERO cuando lo hay: es lo único que dice qué
  // hacer ahora (#328).
  const motivo: string[] = [];
  if (state.cancelada) {
    motivo.push("Corrida cancelada.");
  } else if (state.bloqueos >= MAX_BLOQUEOS) {
    motivo.push(
      `Insistí ${MAX_BLOQUEOS} veces con algo que ya estaba hecho o leído y no encontré cómo seguir. Probá con un pedido más concreto —qué vista y qué elementos— o pasá a IA remota.`
    );
  } else if (state.sinProgreso >= MAX_SIN_PROGRESO) {
    const ultimo = [...state.pasos].reverse().find((p) => p.ok)?.tool ?? "";
    motivo.push(
      `Me quedé leyendo sin construir: ${MAX_SIN_PROGRESO} turnos seguidos sin tocar el modelo (lo último, ${ultimo}). Probá con un pedido más concreto —qué vista y qué elementos— o pasá a IA remota para pedidos abiertos.`
    );
  } else if (state.fallos >= MAX_BUILDER_FAILURES) {
    const ultimo = ultimoErrorReal(state) ?? "";
    motivo.push(
      `Me trabé: ${MAX_BUILDER_FAILURES} intentos seguidos sin una acción válida. Lo último que devolvió el MCP: ${ultimo.slice(0, 200)}`
    );
  } else if (state.restantes <= 0) {
    motivo.push("Se agotó el tope de pasos de la corrida.");
  }

  const partes: string[] = [];
  // Lo primero que el humano necesita saber: si SU lienzo cambió o no. Decir
  // «cambios aplicados» por trabajo que quedó en el workspace es mentirle (#329).
  if (enLienzo.length) {
    partes.push(lista("En tu lienzo:", enLienzo));
  } else if (enWorkspace.length) {
    partes.push("Tu lienzo sigue igual: nada de esto llegó todavía al proyecto.");
  } else {
    partes.push("Sin cambios: el modelo quedó como estaba.");
  }

  if (enWorkspace.length) {
    partes.push(
      lista(
        `En el diagrama en curso${state.diagrama ? ` "${state.diagrama.nombre}"` : ""} (workspace del MCP, todavía sin publicar — falta \`export_as_view\`):`,
        enWorkspace
      )
    );
  }

  if (state.rechazos.length) {
    partes.push(["No se hizo (lo rechazaste):", ...state.rechazos.map((r) => `- ${r}`)].join("\n"));
  }

  return [...motivo, ...partes].join("\n\n");
}
