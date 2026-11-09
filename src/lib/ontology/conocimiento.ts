/**
 * @fileOverview Construir el CONOCIMIENTO de un alcance (spec 027 · T16) — PURO.
 *
 * Junta en un store los hechos de las vistas del alcance (vista, proyecto u
 * organización), razona con el reglamento de cada notación presente y entrega
 * el resultado con sus hallazgos. Es lo que leen la ficha, la validación, la IA
 * y el MCP.
 *
 * Memo por HASH del contenido (R-09b): la ficha pide el conocimiento en cada
 * edición (con debounce) y casi siempre nada cambió. Expresar una vista se
 * memoriza por su propio hash —editar una no re-expresa las otras— y el
 * conocimiento completo por la suma de hashes. El resultado memorizado se
 * comparte: quien lo recibe NO debe agregarle hechos.
 */

import { DEFAULT_NOTATION_ID, type NotationId } from "../notations";
import type { GraphData } from "../types";
import type { DesignView } from "../views-types";
import type { DiagramModel } from "../mcp/diagram-builder";
import {
  hechosDeGraphData,
  hechosDeModelo,
  unirAbox,
  type AristaAbox,
  type ContextoAbox,
  type ElementoAbox,
  type ResultadoAbox,
  type VistaAbox,
} from "./abox";
import { razonar, type OpcionesRazonador } from "./reasoner";
import { crearStore, type TripleStore } from "./store";
import { tboxDe } from "./tbox";
import type { Hallazgo } from "./types";

export type Alcance =
  | { tipo: "vista"; vista: string; proyecto?: string }
  | { tipo: "proyecto" }
  | { tipo: "organizacion" };

export interface ProyectoEntrada {
  proyecto: string;
  vistas: DesignView[];
}

export interface OrganizacionEntrada {
  organizacion: string;
  proyectos: ProyectoEntrada[];
}

/** Lo que se razona: el lienzo abierto, un proyecto con sus vistas o una organización entera. */
export type EntradaConocimiento = GraphData | ProyectoEntrada | OrganizacionEntrada;

export interface Conocimiento {
  store: TripleStore;
  deducidos: number;
  rondas: number;
  topeAlcanzado: boolean;
  /** Los del ABox (tipo desconocido) más los del razonador. */
  hallazgos: Hallazgo[];
  notaciones: NotationId[];
  /** Índice de lo dibujado (ver `abox.ts`): lo usan las formas. */
  elementos: ElementoAbox[];
  aristas: AristaAbox[];
  vistas: VistaAbox[];
}

/** Proyecto y vista con que se nombra el lienzo suelto. */
export const PROYECTO_SUELTO = "actual";
export const VISTA_SUELTA = "grafo";

interface Pieza {
  proyecto: string;
  vista: string;
  notation: NotationId;
  graph: GraphData;
}

const esOrganizacion = (e: EntradaConocimiento): e is OrganizacionEntrada => "proyectos" in e;
const esProyecto = (e: EntradaConocimiento): e is ProyectoEntrada => "vistas" in e && Array.isArray(e.vistas);

function piezasDe(entrada: EntradaConocimiento, alcance: Alcance): Pieza[] {
  if (!esOrganizacion(entrada) && !esProyecto(entrada)) {
    const g = entrada;
    return [{ proyecto: PROYECTO_SUELTO, vista: VISTA_SUELTA, notation: g.notation ?? DEFAULT_NOTATION_ID, graph: g }];
  }
  const proyectos = esOrganizacion(entrada) ? entrada.proyectos : [entrada];
  const out: Pieza[] = [];
  for (const p of proyectos) {
    if (alcance.tipo === "vista" && alcance.proyecto !== undefined && alcance.proyecto !== p.proyecto) continue;
    for (const v of p.vistas) {
      // Las vistas Mermaid son texto, no modelo.
      if (!v.graph) continue;
      if (alcance.tipo === "vista" && v.id !== alcance.vista) continue;
      out.push({ proyecto: p.proyecto, vista: v.id, notation: v.notation ?? v.graph.notation ?? DEFAULT_NOTATION_ID, graph: v.graph });
    }
  }
  return out;
}

/** FNV-1a de 32 bits: barato y suficiente para distinguir versiones de una vista. */
function fnv(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + texto.length.toString(36);
}

/** Caché acotada (LRU por orden de inserción del Map). */
function lru<V>(max: number) {
  const m = new Map<string, V>();
  return {
    get(k: string): V | undefined {
      const v = m.get(k);
      if (v !== undefined) m.delete(k), m.set(k, v);
      return v;
    },
    set(k: string, v: V) {
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value!);
    },
  };
}

// Un proyecto de 50 vistas cabe entero; el de conocimientos guarda los alcances recientes.
const ABOX = lru<ResultadoAbox>(256);
const CONOCIMIENTO = lru<Conocimiento>(16);

// Serializar 50 vistas para hashearlas cuesta más que razonar una: el hash se
// recuerda por IDENTIDAD del grafo. El estado de la app es inmutable (un grafo
// editado es otro objeto), así que una vista que nadie tocó no se re-serializa.
const HASH_DE_GRAFO = new WeakMap<GraphData, string>();

function hashDe(g: GraphData): string {
  let h = HASH_DE_GRAFO.get(g);
  if (h === undefined) HASH_DE_GRAFO.set(g, (h = fnv(JSON.stringify(g))));
  return h;
}

function expresar(p: Pieza): { hash: string; abox: ResultadoAbox } {
  const hash = `${p.proyecto}|${p.vista}|${p.notation}|${hashDe(p.graph)}`;
  let abox = ABOX.get(hash);
  if (!abox) {
    abox = hechosDeGraphData(p.graph, { proyecto: p.proyecto, vista: p.vista }, p.notation);
    ABOX.set(hash, abox);
  }
  return { hash, abox };
}

export function construirConocimiento(
  entrada: EntradaConocimiento,
  alcance: Alcance,
  opts: OpcionesRazonador = {}
): Conocimiento {
  const fuentes = piezasDe(entrada, alcance);
  const piezas = fuentes.map(expresar);
  const clave = `${JSON.stringify(opts)}#${piezas.map((p) => p.hash).join("#")}`;
  const hecho = CONOCIMIENTO.get(clave);
  if (hecho) return hecho;

  const k = razonarAbox(
    unirAbox(piezas.map((p) => p.abox)),
    [...new Set(fuentes.map((p) => p.notation))],
    opts
  );
  CONOCIMIENTO.set(clave, k);
  return k;
}

function razonarAbox(abox: ResultadoAbox, notaciones: NotationId[], opts: OpcionesRazonador): Conocimiento {
  const store = crearStore();
  for (const h of abox.hechos) store.add(h);
  const r = razonar(store, notaciones.map(tboxDe), opts);
  return {
    store,
    deducidos: r.deducidos,
    rondas: r.rondas,
    topeAlcanzado: r.topeAlcanzado,
    hallazgos: [...abox.hallazgos, ...r.hallazgos],
    notaciones,
    elementos: abox.elementos,
    aristas: abox.aristas,
    vistas: abox.vistas,
  };
}

/**
 * Conocimiento de UN diagrama del constructor (el MCP y las reglas de calidad
 * trabajan con `DiagramModel`). Sin memo: el modelo cambia en cada llamada.
 */
export function conocimientoDeModelo(
  m: DiagramModel,
  ctx: ContextoAbox = { proyecto: PROYECTO_SUELTO, vista: VISTA_SUELTA },
  opts: OpcionesRazonador = {}
): Conocimiento {
  return razonarAbox(hechosDeModelo(m, ctx), [m.meta.notation ?? DEFAULT_NOTATION_ID], opts);
}
