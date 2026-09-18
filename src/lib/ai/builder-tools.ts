/**
 * @fileOverview Repertorio y VEREDICTO del agente constructor (PURO). 014 (#308).
 *
 * El analista sólo lee: si se equivoca, redacta mal. El constructor escribe, así
 * que el error del modelo llega al trabajo del humano. Por eso ninguna llamada
 * sale directo al MCP: pasa por `judgeCall`, que devuelve `ejecutar`,
 * `confirmar` (destructiva: la decide el humano, §P10) o `rechazar` (con un
 * motivo que el modelo pueda corregir en el turno siguiente).
 *
 * El menú que ve el modelo se ARMA DEL REGISTRO real (lo que devuelve
 * `mcpPlaygroundListTools`), filtrado por la allowlist del perfil: no hay una
 * segunda lista de herramientas que pueda quedar desfasada.
 */

import { notationTypes, getNotation } from "@/lib/notations";
import { planAppAction, type VistaConocida } from "@/lib/mcp/app-actions";
import { escapeStrayQuotes, repairProtocolJson } from "./litert-agent";

/** Una herramienta tal como la describe el registro MCP. */
export interface ToolSpec {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>;
  required?: string[];
}

export interface BuilderCall {
  tool: string;
  args: Record<string, unknown>;
}

export type CallVerdict =
  | { kind: "ejecutar"; call: BuilderCall }
  | { kind: "confirmar"; call: BuilderCall; alcance: string }
  | { kind: "rechazar"; motivo: string };

/**
 * Herramientas que QUITAN trabajo hecho. No es la lista de las que escriben:
 * agregar una caja se deshace mirando el lienzo, borrar una vista no.
 */
export const DESTRUCTIVE_TOOLS = [
  "delete_view",
  "rename_view",
  "remove_element",
  "remove_edge",
  // Sobre la vista del humano: lo que borra ahí se ve en el lienzo y no se
  // deshace mirando el diagrama del workspace (015, #336).
  "remove_view_element",
  "remove_view_edge",
] as const;

/** Acciones que resuelven una vista del proyecto por nombre (las aplica el renderer). */
const TOOLS_SOBRE_VISTA: Record<string, "delete-view" | "rename-view"> = {
  delete_view: "delete-view",
  rename_view: "rename-view",
};

const esTexto = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/**
 * Primera frase de la descripción, acotada. Las del registro MCP están escritas
 * para un humano con Claude Code detrás —párrafos con ejemplos— y veinte de esas
 * no entran en la ventana del motor local: el menú solo se comía el presupuesto
 * entero y la corrida moría a mitad de camino (#308).
 */
function resumenCorto(texto: string, tope = 140): string {
  const frase = (texto.split(/(?<=\.)\s/)[0] ?? texto).trim();
  return frase.length <= tope ? frase : `${frase.slice(0, tope - 1).trimEnd()}…`;
}

/**
 * El menú en texto: nombre, para qué sirve y qué argumentos son obligatorios.
 * Con `compacto`, sólo nombre y obligatorios: es el último recorte antes de
 * rendirse cuando la ventana del modelo es chica.
 */
export function buildToolMenu(
  tools: ToolSpec[],
  allow: string[],
  opts: { compacto?: boolean } = {}
): string {
  const porNombre = new Map(tools.map((t) => [t.name, t]));
  const lineas: string[] = [];
  for (const id of allow) {
    const t = porNombre.get(id);
    // Un id de la allowlist que el registro no tiene NO se inventa: si la
    // herramienta desapareció, el modelo no debe enterarse de que existió.
    if (!t) continue;
    const req = t.inputSchema?.required ?? [];
    const opc = Object.keys(t.inputSchema?.properties ?? {}).filter((k) => !req.includes(k));
    if (opts.compacto) {
      lineas.push(`- ${t.name}(${req.join(", ")})`);
      continue;
    }
    const args = [
      req.length ? `obligatorios: ${req.join(", ")}` : "sin argumentos obligatorios",
      opc.length ? `opcionales: ${opc.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    lineas.push(`- ${t.name} — ${resumenCorto(t.description ?? "")} (${args})`);
  }
  return lineas.join("\n");
}

/**
 * El objeto JSON del turno, aunque venga con prosa alrededor: se toma el primer
 * `{` y se cierra por balance de llaves. Es lo que escribe el modelo local, que
 * casi nunca responde SÓLO el JSON pedido.
 */
function objetoDelTurno(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}" && --depth === 0) {
      const bloque = raw.slice(start, i + 1);
      for (const intento of [bloque, escapeStrayQuotes(bloque)]) {
        try {
          const v = JSON.parse(intento);
          if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
        } catch {
          /* siguiente intento */
        }
      }
      break;
    }
  }
  // Último recurso: el rescate por campos del analista (comillas sueltas dentro
  // de los strings), que ya está probado contra los desvaríos del modelo local.
  return repairProtocolJson(raw);
}

/** Saca la acción del turno del modelo y la valida contra el repertorio. */
export function parseBuilderAction(
  raw: string,
  allow: string[]
): { call: BuilderCall } | { error: string } {
  const obj = objetoDelTurno(raw);
  const tool = obj?.tool ?? obj?.action ?? obj?.herramienta;
  if (!esTexto(tool)) {
    return { error: 'No entendí la acción. Respondé SÓLO con {"tool":"<nombre>","args":{…}}.' };
  }
  if (!allow.includes(tool as string)) {
    return {
      error: `La herramienta "${tool}" no está en tu repertorio. Usá una de: ${allow.join(", ")}.`,
    };
  }
  const crudos = obj?.args ?? obj?.arguments ?? obj?.parametros;
  const args =
    crudos && typeof crudos === "object" && !Array.isArray(crudos)
      ? (crudos as Record<string, unknown>)
      : {};
  return { call: { tool: tool as string, args } };
}

/** Valida los argumentos contra el schema del registro (obligatorios y tipo básico). */
function validarArgs(spec: ToolSpec, args: Record<string, unknown>): string | null {
  const schema = spec.inputSchema;
  if (!schema) return null;
  const faltan = (schema.required ?? []).filter(
    (k) => args[k] === undefined || args[k] === null || args[k] === ""
  );
  if (faltan.length) {
    return `Falta${faltan.length > 1 ? "n" : ""} el argumento obligatorio ${faltan.join(", ")} de ${spec.name}.`;
  }
  for (const [clave, valor] of Object.entries(args)) {
    const esperado = schema.properties?.[clave]?.type;
    if (!esperado || valor === undefined || valor === null) continue;
    const real = Array.isArray(valor) ? "array" : typeof valor;
    // El tipo se compara ESTRICTO. Las dos escapatorias que había —«si alguno de
    // los dos es object, pasa»— dejaban entrar un objeto donde el schema pide una
    // lista, y eso es un `-32602 invalid_type expected array` del servidor: el
    // caso real es `metadata: {repo:"…"}` en vez de `[{clave,valor}]`, que la
    // propia descripción del schema le sugiere al modelo en C4 (#331). Un
    // rechazo local dice qué forma mandar; el -32602 se come un turno.
    const compatible = esperado === real || (esperado === "integer" && real === "number");
    if (!compatible) {
      const forma = esperado === "array" ? " (una LISTA JSON: [ … ])" : "";
      return `El argumento ${clave} de ${spec.name} debe ser ${esperado}, no ${real}${forma}.`;
    }
  }
  return null;
}

/**
 * Los enums que el modelo escribe con otra capitalización («C4» por «c4»). El
 * registro MCP publica las opciones, así que corregirlas acá cuesta cero;
 * dejarlas pasar costaba un turno entero contra un `-32602` del servidor, y con
 * el motor local cada turno perdido es un cuarto de la corrida (#331).
 *
 * Un valor que no se parece a ninguna opción NO se adivina: se rechaza con la
 * lista, que es lo que el modelo necesita para corregirse.
 */
export function normalizarEnums(
  spec: ToolSpec,
  args: Record<string, unknown>
): { args: Record<string, unknown>; error?: string } {
  const props = spec.inputSchema?.properties;
  if (!props) return { args };
  const salida: Record<string, unknown> = { ...args };
  let corregido = false;
  for (const [clave, valor] of Object.entries(args)) {
    const opciones = props[clave]?.enum;
    if (!Array.isArray(opciones) || typeof valor !== "string") continue;
    const textos = opciones.filter((o): o is string => typeof o === "string");
    if (!textos.length || textos.includes(valor)) continue;
    const equivalente = textos.find((o) => o.toLowerCase() === valor.trim().toLowerCase());
    if (!equivalente) {
      return {
        args,
        error: `${clave} de ${spec.name} sólo acepta: ${textos.join(", ")}. Mandaste "${valor}".`,
      };
    }
    salida[clave] = equivalente;
    corregido = true;
  }
  return { args: corregido ? salida : args };
}

/**
 * La resolución de tipos vive en `mcp/tipo-notacion.ts`: la comparte el parser de
 * Mermaid del modo creativo (#333). Se re-exporta para no mover a quien ya la
 * importa de acá.
 */
import { plano, tipoParecido, normalizarTipo } from "../mcp/tipo-notacion";
export { plano, tipoParecido, normalizarTipo };

/**
 * El nombre de la pestaña que va a quedar en el lienzo. El MCP lo declara como
 * `viewName` y opcional (sin él, toma el del diagrama); el arnés leía `args.name`
 * y se quedaba con la cadena vacía: el cierre decía «Vista "" publicada» y —peor—
 * el chequeo de pisada nunca encontraba nada, así que exportar encima de una
 * vista existente se ejecutaba sin preguntarle al humano (§P10, #331).
 */
export function nombreDeVista(call: BuilderCall, diagramaNombre?: string): string {
  // `args.name` NO entra en la cadena: el schema de `export_as_view` no lo tiene,
  // así que el servidor lo ignora y publica con el nombre del diagrama. Leerlo
  // hacía que el texto de confirmación prometiera pisar una vista que no se iba
  // a pisar — describir mal el efecto es el mismo agujero de §P10 por otro lado.
  const candidato = [call.args.viewName, diagramaNombre].find(esTexto);
  return typeof candidato === "string" ? candidato.trim() : "";
}

/**
 * La orden concreta para cuando el aviso suave ya no alcanzó. Repetir el mismo
 * texto no cambia lo que hace el modelo —tres frenos idénticos y la corrida
 * muerta con el diagrama vacío, #331—: la segunda vez se le dice QUÉ herramienta
 * usar y con qué tipos, que es lo único que le falta.
 */
export function ordenDeConstruir(notation?: string): string {
  // Sin notación NO se listan tipos: `getNotation(undefined)` cae al default
  // (DDD) y la orden le habría dictado tipos DDD sobre un diagrama C4 — el mismo
  // daño que este arreglo viene a cerrar. Se lo manda a preguntarle al registro.
  if (!notation) {
    return (
      "El próximo turno DEBE ser una escritura: add_container o add_node. " +
      "Si no tenés los tipos, pedilos con describe_notation UNA vez y después escribí. " +
      "Cuando el diagrama tenga contenido, publicá con export_as_view."
    );
  }
  const elements = getNotation(notation).elements;
  const contenedores = elements.filter((e) => e.container).map((e) => e.type);
  const elementos = elements.filter((e) => !e.container).map((e) => e.type);
  return [
    "El próximo turno DEBE ser una escritura: add_container o add_node.",
    contenedores.length ? `Contenedores válidos: ${contenedores.join(", ")}.` : "",
    elementos.length ? `Elementos válidos: ${elementos.join(", ")}.` : "",
    "Cuando el diagrama tenga contenido, publicá con export_as_view.",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface JudgeContext {
  tools: ToolSpec[];
  vistas: VistaConocida[];
  /** Notación de la vista ABIERTA en la app. Sólo manda si no hay diagrama en curso. */
  notation?: string;
  /**
   * Diagrama en curso en el workspace del MCP. Su notación MANDA sobre la de la
   * vista abierta: el diagrama puede ser C4 mientras el humano mira una vista
   * DDD, y validar contra la vista rechazaba tipos válidos hasta comerse la
   * corrida entera (#331).
   */
  diagrama?: { id: string; nombre: string; notacion?: string };
}

/** Qué se pierde si el humano dice que sí. Va tal cual al chat. */
export function describeScope(
  call: BuilderCall,
  vistas: VistaConocida[],
  diagramaNombre?: string
): string {
  const nombre =
    call.tool === "export_as_view"
      ? nombreDeVista(call, diagramaNombre)
      : String(call.args.name ?? call.args.view ?? "");
  switch (call.tool) {
    case "delete_view":
      return `Se elimina la vista "${nombre}" del proyecto activo. Quedarían ${
        vistas.filter((v) => !v.builtin).length - 1
      } vistas propias.`;
    case "rename_view":
      return `Se renombra la vista "${nombre}" a "${String(call.args.newName ?? "")}".`;
    case "remove_element":
      return `Se quita el elemento "${nombre}" del diagrama en curso, con sus relaciones.`;
    case "remove_edge":
      return `Se quita la relación ${String(call.args.from ?? "?")} → ${String(call.args.to ?? "?")}.`;
    case "export_as_view":
      return `Se sobrescribe la vista "${nombre}" con el diagrama en curso: lo que tenga hoy se reemplaza.`;
    default:
      return `Se ejecuta ${call.tool} sobre "${nombre}".`;
  }
}

export function judgeCall(entrada: BuilderCall, ctx: JudgeContext): CallVerdict {
  const spec = ctx.tools.find((t) => t.name === entrada.tool);
  if (!spec) {
    return { kind: "rechazar", motivo: `La herramienta "${entrada.tool}" no existe en el MCP.` };
  }

  // Lo que el registro deja corregir, se corrige antes de gastar el viaje (#331).
  const normalizados = normalizarEnums(spec, entrada.args);
  if (normalizados.error) return { kind: "rechazar", motivo: normalizados.error };
  const call: BuilderCall = { ...entrada, args: normalizados.args };

  const problema = validarArgs(spec, call.args);
  if (problema) return { kind: "rechazar", motivo: problema };

  // Tipos: los de la notación del DIAGRAMA en curso —y sólo si no hay, los de la
  // vista abierta—, nunca una lista cableada (§P6, #331).
  const notacion = ctx.diagrama?.notacion ?? ctx.notation;
  if (esTexto(call.args.type) && notacion) {
    const validos = notationTypes(notacion, { includeContainers: true });
    const r = normalizarTipo(String(call.args.type), validos);
    if ("error" in r) {
      // La sugerencia va PRIMERO: es la única parte del mensaje que el modelo
      // local puede convertir en la llamada siguiente (#331).
      const sugerencia = r.sugerido
        ? ` ¿Querías "${r.sugerido}"? Repetí la llamada con ese valor exacto.`
        : "";
      return {
        kind: "rechazar",
        motivo:
          `"${String(call.args.type)}" no es un tipo de ${getNotation(notacion).label}.${sugerencia}` +
          ` Los tipos son: ${validos.join(", ")}.`,
      };
    }
    call.args = { ...call.args, type: r.tipo };
  }

  // Acciones sobre una vista del proyecto: la resolución (y el veto a las vistas
  // del sistema) es la misma que usa el MCP, no una copia.
  const accion = TOOLS_SOBRE_VISTA[call.tool];
  if (accion) {
    const plan = planAppAction(
      accion === "rename-view"
        ? { kind: "rename-view", name: String(call.args.name ?? ""), newName: String(call.args.newName ?? "") }
        : { kind: "delete-view", name: String(call.args.name ?? "") },
      ctx.vistas
    );
    if (!plan.ok) return { kind: "rechazar", motivo: plan.error };
    return { kind: "confirmar", call, alcance: describeScope(call, ctx.vistas, ctx.diagrama?.nombre) };
  }

  if ((DESTRUCTIVE_TOOLS as readonly string[]).includes(call.tool)) {
    return { kind: "confirmar", call, alcance: describeScope(call, ctx.vistas, ctx.diagrama?.nombre) };
  }

  // Exportar es seguro salvo cuando pisa una vista que ya existe. El nombre sale
  // de `viewName` —el argumento REAL del MCP—: leyendo `args.name` el chequeo
  // comparaba contra la cadena vacía y no pisaba nunca (#331).
  if (call.tool === "export_as_view") {
    const nombre = nombreDeVista(call, ctx.diagrama?.nombre).toLowerCase();
    const pisa =
      call.args.replace === true ||
      (Boolean(nombre) &&
        ctx.vistas.some((v) => !v.builtin && v.name.trim().toLowerCase() === nombre));
    if (pisa) {
      return { kind: "confirmar", call, alcance: describeScope(call, ctx.vistas, ctx.diagrama?.nombre) };
    }
  }

  return { kind: "ejecutar", call };
}
