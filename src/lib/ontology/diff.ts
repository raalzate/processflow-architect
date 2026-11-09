/**
 * @fileOverview Qué cambió en el conocimiento entre dos versiones (spec 027 · T35, US9) — PURO.
 *
 * El historial NO se guarda (FR-043, R-09): se DERIVA comparando el proyecto
 * abierto con otra versión que el humano elige (el archivo en disco, otro
 * tablero). Un hecho que estaba y ya no está —borrado o contradicho, como un
 * tipo que cambió— es REEMPLAZADO, con la fecha de la versión en que cambió;
 * las consultas sobre la versión vigente ya no lo devuelven. Lo deducido se
 * compara aparte: perder una deducción es la consecuencia, no el cambio.
 */

import type { GraphData } from "../types";
import type { DesignView, PersistedViews } from "../views-types";
import { construirConocimiento, PROYECTO_SUELTO, type Conocimiento } from "./conocimiento";
import { nombreDe, textoDeHecho } from "./ficha";
import { RDFS_LABEL, esLiteral, valorLiteral } from "./iri";
import type { TripleStore } from "./store";
import type { Hecho } from "./types";

export interface DiffConocimiento {
  agregados: Hecho[];
  /** Estaban en la versión anterior y no en la nueva. */
  reemplazados: (Hecho & { fecha?: string })[];
  deduccionesGanadas: Hecho[];
  deduccionesPerdidas: Hecho[];
}

const clave = (h: Hecho) => `${h.s} ${h.p} ${h.o}`;

/** Separa lo afirmado (dibujado o propuesto) de lo deducido, indexado por tripleta. */
function partir(store: TripleStore) {
  const afirmados = new Map<string, Hecho>();
  const deducidos = new Map<string, Hecho>();
  for (const h of store.match()) (h.origen === "deducido" ? deducidos : afirmados).set(clave(h), h);
  return { afirmados, deducidos };
}

const faltan = (a: Map<string, Hecho>, b: Map<string, Hecho>) => [...a].filter(([k]) => !b.has(k)).map(([, h]) => h);

export function diffConocimiento(
  antes: { store: TripleStore },
  despues: { store: TripleStore },
  fechaDespues?: string
): DiffConocimiento {
  const a = partir(antes.store);
  const d = partir(despues.store);
  return {
    agregados: faltan(d.afirmados, a.afirmados),
    reemplazados: faltan(a.afirmados, d.afirmados).map((h) => (fechaDespues ? { ...h, fecha: fechaDespues } : { ...h })),
    deduccionesGanadas: faltan(d.deducidos, a.deducidos),
    deduccionesPerdidas: faltan(a.deducidos, d.deducidos),
  };
}

/** ¿Hay algo distinto? */
export const hayCambios = (d: DiffConocimiento) =>
  d.agregados.length + d.reemplazados.length + d.deduccionesGanadas.length + d.deduccionesPerdidas.length > 0;

/**
 * El conocimiento de un TABLERO guardado: el Modelo (vista `design`) más sus
 * vistas con grafo y sus vínculos. Dos versiones del mismo proyecto se arman
 * con el mismo nombre de proyecto, así sus IRIs se pueden comparar.
 */
export function conocimientoDeTablero(
  proyecto: GraphData,
  vistas: Pick<PersistedViews, "customViews" | "vinculos"> | undefined
): Conocimiento {
  const modelo: DesignView = {
    id: "design",
    name: "Modelo",
    kind: "graph",
    notation: proyecto.notation,
    graph: proyecto,
    createdAt: "",
  };
  const otras = (vistas?.customViews ?? []).filter((v) => v.graph && v.id !== "design");
  return construirConocimiento({ proyecto: PROYECTO_SUELTO, vistas: [modelo, ...otras], vinculos: vistas?.vinculos }, { tipo: "proyecto" });
}

export interface ResumenDiff {
  agregados: string[];
  reemplazados: { texto: string; fecha?: string }[];
  deduccionesGanadas: string[];
  deduccionesPerdidas: string[];
}

/** Un hecho en palabras, con el nombre de quien lo conoce (lo quitado sólo está en la versión anterior). */
function enPalabras(k: Conocimiento, h: Hecho): string {
  if (esLiteral(h.o)) {
    const quien = nombreDe(k, h.s);
    const que = h.p === RDFS_LABEL ? "se llama" : h.p.replace(/^pf:(atributo\/)?/, "");
    return `${quien}: ${que} «${valorLiteral(h.o)}»`;
  }
  return textoDeHecho(k, [h.s, h.p, h.o]);
}

export function resumirDiff(antes: Conocimiento, despues: Conocimiento, d: DiffConocimiento): ResumenDiff {
  return {
    agregados: d.agregados.map((h) => enPalabras(despues, h)),
    reemplazados: d.reemplazados.map((h) => ({ texto: enPalabras(antes, h), ...(h.fecha ? { fecha: h.fecha } : {}) })),
    deduccionesGanadas: d.deduccionesGanadas.map((h) => enPalabras(despues, h)),
    deduccionesPerdidas: d.deduccionesPerdidas.map((h) => enPalabras(antes, h)),
  };
}
