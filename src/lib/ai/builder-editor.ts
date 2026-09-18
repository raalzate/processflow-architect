/**
 * @fileOverview Modo EDITOR del constructor (PURO). Feature 015, T10 (#339).
 *
 * «Agregá un elemento Persona llamado Cliente» no necesita que un modelo lea el
 * diagrama y razone: necesita que alguien resuelva CUÁL caja y llame UNA
 * herramienta. Eso es lo que hace este módulo, con las consultas deterministas
 * de `builder-queries` (FR-008). El modelo no participa: cada turno suyo es una
 * inferencia, y acá no hace falta ninguna.
 *
 * Cuando el pedido no alcanza para armar la llamada —falta el tipo, hay dos
 * cajas con el mismo nombre, no existe ninguna— no se elige por el humano: se
 * pregunta con opciones concretas (FR-010). Y si el pedido no entra en ninguno
 * de los casos, se devuelve `sin-plan` y el bucle ReAct de siempre lo atiende:
 * el atajo cubre lo frecuente, no reemplaza al agente.
 */

import type { GraphData } from "../types";
import { elementoPorNombre, elementos, contenedores, relacionEntre } from "./builder-queries";
import type { Intencion } from "./builder-intent";
import type { BuilderCall } from "./builder-tools";
import type { BuilderOption } from "./builder-run";

export type PlanEditor =
  | { kind: "llamada"; call: BuilderCall; resumen: string }
  | { kind: "pregunta"; texto: string; opciones: BuilderOption[] }
  | { kind: "sin-plan"; motivo: string };

/** Hasta cuántas cajas se ofrecen como opción antes de que la lista sea inútil. */
const MAX_OPCIONES = 4;

/** Opciones con los elementos que SÍ hay, para que el humano señale uno. */
function opcionesDeElementos(graph: GraphData, nombres?: string[]): BuilderOption[] {
  const lista = nombres ?? [...elementos(graph), ...contenedores(graph)].map((e) => e.nombre);
  return [
    ...lista.slice(0, MAX_OPCIONES).map((n, i) => ({ id: `el${i + 1}`, label: n })),
    { id: "otro", label: "Ninguno de esos", detalle: "Decime el nombre exacto." },
  ];
}

/** ¿El pedido quiere dar vuelta la relación? Lo dice el verbo, no el modelo. */
const pideInvertir = (mensaje: string) => /\b(invert|invierte|invirt|da(r)? vuelta|al rev)/i.test(mensaje);

/** La etiqueta nueva de una relación, cuando el pedido la dicta entre comillas. */
const etiquetaDictada = (mensaje: string) => /["«“]([^"»”]{2,60})["»”]/.exec(mensaje)?.[1];

/**
 * Arma la llamada que atiende el pedido, o la pregunta que falta para armarla.
 * `mensaje` entra además de la intención porque hay matices que viven en el
 * texto (invertir, la etiqueta dictada) y no en la clasificación.
 */
export function planEditorCall(
  intencion: Intencion,
  graph: GraphData | null | undefined,
  mensaje: string,
  vista?: string
): PlanEditor {
  if (!graph) return { kind: "sin-plan", motivo: "No hay una vista con contenido para editar." };
  const o = intencion.objetivo ?? {};
  const conVista = (args: Record<string, unknown>) => (vista ? { ...args, view: vista } : args);

  /** Resuelve un nombre a UNA caja, o devuelve la pregunta que corresponde. */
  const resolver = (nombre: string): { nombre: string } | PlanEditor => {
    const r = elementoPorNombre(graph, nombre);
    if (r.kind === "uno") return { nombre: r.valor.nombre };
    if (r.kind === "varios") {
      return {
        kind: "pregunta",
        texto: `Hay ${r.opciones.length} elementos llamados "${nombre}". ¿Cuál?`,
        opciones: r.opciones.slice(0, MAX_OPCIONES).map((e, i) => ({
          id: `el${i + 1}`,
          label: e.nombre,
          detalle: `${e.tipo_elemento}${e.container ? ` en ${e.container}` : ""}`,
        })),
      };
    }
    return {
      kind: "pregunta",
      texto: `No encuentro ningún elemento llamado "${nombre}" en la vista. ¿Cuál querías?`,
      opciones: opcionesDeElementos(graph),
    };
  };

  const esPlan = (x: unknown): x is PlanEditor => typeof (x as any)?.kind === "string" && !("nombre" in (x as any));

  // --- Relaciones: el pedido nombra los dos extremos ---
  if (o.desde && o.hasta) {
    const a = resolver(o.desde);
    if (esPlan(a)) return a;
    const b = resolver(o.hasta);
    if (esPlan(b)) return b;

    if (intencion.accion === "eliminar") {
      return {
        kind: "llamada",
        call: { tool: "remove_view_edge", args: conVista({ from: a.nombre, to: b.nombre }) },
        resumen: `Eliminar la relación entre "${a.nombre}" y "${b.nombre}".`,
      };
    }
    if (intencion.accion === "crear") {
      const label = etiquetaDictada(mensaje);
      return {
        kind: "llamada",
        call: { tool: "add_view_edge", args: conVista({ from: a.nombre, to: b.nombre, ...(label ? { label } : {}) }) },
        resumen: `Relacionar "${a.nombre}" con "${b.nombre}".`,
      };
    }
    if (intencion.accion === "modificar") {
      const existe = relacionEntre(graph, a.nombre, b.nombre);
      if (existe.kind === "ninguno") {
        return {
          kind: "pregunta",
          texto: `No hay una relación entre "${a.nombre}" y "${b.nombre}". ¿La creo?`,
          opciones: [
            { id: "crear", label: "Crearla" },
            { id: "cancelar", label: "No, dejalo", accion: "cancelar" },
          ],
        };
      }
      const label = etiquetaDictada(mensaje);
      const invertir = pideInvertir(mensaje);
      if (!invertir && !label) {
        return { kind: "sin-plan", motivo: "El pedido no dice qué cambiarle a la relación." };
      }
      return {
        kind: "llamada",
        call: {
          tool: "update_view_edge",
          args: conVista({
            from: a.nombre,
            to: b.nombre,
            ...(invertir ? { invert: true } : {}),
            ...(label ? { label } : {}),
          }),
        },
        resumen: invertir
          ? `Invertir la relación entre "${a.nombre}" y "${b.nombre}".`
          : `Reetiquetar la relación entre "${a.nombre}" y "${b.nombre}".`,
      };
    }
    return { kind: "sin-plan", motivo: "No se sabe qué hacer con esa relación." };
  }

  // --- Elementos ---
  if (intencion.accion === "crear") {
    if (!o.tipo) {
      return { kind: "sin-plan", motivo: "El pedido no dice de qué tipo es el elemento." };
    }
    if (!o.nombre) {
      return {
        kind: "pregunta",
        texto: `¿Cómo se va a llamar el ${o.tipo}?`,
        opciones: [
          { id: "nombrar", label: "Le digo el nombre" },
          { id: "cancelar", label: "Mejor no", accion: "cancelar" },
        ],
      };
    }
    // Agregar dos veces la misma caja es el defecto que se arregla con identidad
    // en `yaEjecutada`; acá se evita antes de gastar la llamada.
    const yaEsta = elementoPorNombre(graph, o.nombre);
    if (yaEsta.kind === "uno") {
      return {
        kind: "sin-plan",
        motivo: `La vista ya tiene un elemento llamado "${yaEsta.valor.nombre}".`,
      };
    }
    return {
      kind: "llamada",
      call: { tool: "add_view_element", args: conVista({ name: o.nombre, type: o.tipo }) },
      resumen: `Agregar "${o.nombre}" (${o.tipo}) a la vista.`,
    };
  }

  if (o.nombre && (intencion.accion === "eliminar" || intencion.accion === "modificar")) {
    const r = resolver(o.nombre);
    if (esPlan(r)) return r;
    if (intencion.accion === "eliminar") {
      return {
        kind: "llamada",
        call: { tool: "remove_view_element", args: conVista({ name: r.nombre }) },
        resumen: `Eliminar "${r.nombre}" de la vista.`,
      };
    }
    if (o.tipo) {
      return {
        kind: "llamada",
        call: { tool: "update_view_element", args: conVista({ name: r.nombre, type: o.tipo }) },
        resumen: `Cambiar el tipo de "${r.nombre}" a ${o.tipo}.`,
      };
    }
    return { kind: "sin-plan", motivo: "El pedido no dice qué cambiarle al elemento." };
  }

  return { kind: "sin-plan", motivo: "El pedido no nombra sobre qué actuar." };
}
