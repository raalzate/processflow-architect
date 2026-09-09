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
  properties?: Record<string, { type?: string; description?: string }>;
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
] as const;

/** Acciones que resuelven una vista del proyecto por nombre (las aplica el renderer). */
const TOOLS_SOBRE_VISTA: Record<string, "delete-view" | "rename-view"> = {
  delete_view: "delete-view",
  rename_view: "rename-view",
};

const esTexto = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** El menú en texto: nombre, para qué sirve y qué argumentos son obligatorios. */
export function buildToolMenu(tools: ToolSpec[], allow: string[]): string {
  const porNombre = new Map(tools.map((t) => [t.name, t]));
  const lineas: string[] = [];
  for (const id of allow) {
    const t = porNombre.get(id);
    // Un id de la allowlist que el registro no tiene NO se inventa: si la
    // herramienta desapareció, el modelo no debe enterarse de que existió.
    if (!t) continue;
    const req = t.inputSchema?.required ?? [];
    const opc = Object.keys(t.inputSchema?.properties ?? {}).filter((k) => !req.includes(k));
    const args = [
      req.length ? `obligatorios: ${req.join(", ")}` : "sin argumentos obligatorios",
      opc.length ? `opcionales: ${opc.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    lineas.push(`- ${t.name} — ${t.description ?? ""} (${args})`);
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
    const compatible =
      esperado === real ||
      (esperado === "integer" && real === "number") ||
      esperado === "object" ||
      real === "object";
    if (!compatible) {
      return `El argumento ${clave} de ${spec.name} debe ser ${esperado}, no ${real}.`;
    }
  }
  return null;
}

export interface JudgeContext {
  tools: ToolSpec[];
  vistas: VistaConocida[];
  /** Notación de la vista/diagrama en curso: los tipos válidos salen de ahí (§P6). */
  notation?: string;
}

/** Qué se pierde si el humano dice que sí. Va tal cual al chat. */
export function describeScope(call: BuilderCall, vistas: VistaConocida[]): string {
  const nombre = String(call.args.name ?? call.args.view ?? "");
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

export function judgeCall(call: BuilderCall, ctx: JudgeContext): CallVerdict {
  const spec = ctx.tools.find((t) => t.name === call.tool);
  if (!spec) {
    return { kind: "rechazar", motivo: `La herramienta "${call.tool}" no existe en el MCP.` };
  }

  const problema = validarArgs(spec, call.args);
  if (problema) return { kind: "rechazar", motivo: problema };

  // Tipos: los de la notación de la vista, nunca una lista cableada (§P6).
  if (esTexto(call.args.type) && ctx.notation) {
    const validos = notationTypes(ctx.notation, { includeContainers: true });
    if (!validos.includes(String(call.args.type))) {
      return {
        kind: "rechazar",
        motivo: `"${String(call.args.type)}" no es un tipo de ${getNotation(ctx.notation).label}. Usá uno de: ${validos.join(", ")}.`,
      };
    }
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
    return { kind: "confirmar", call, alcance: describeScope(call, ctx.vistas) };
  }

  if ((DESTRUCTIVE_TOOLS as readonly string[]).includes(call.tool)) {
    return { kind: "confirmar", call, alcance: describeScope(call, ctx.vistas) };
  }

  // Exportar es seguro salvo cuando pisa una vista que ya existe.
  if (call.tool === "export_as_view") {
    const nombre = String(call.args.name ?? "").trim().toLowerCase();
    const pisa =
      call.args.replace === true ||
      ctx.vistas.some((v) => !v.builtin && v.name.trim().toLowerCase() === nombre);
    if (pisa) return { kind: "confirmar", call, alcance: describeScope(call, ctx.vistas) };
  }

  return { kind: "ejecutar", call };
}
