/**
 * @fileOverview El diagrama como HECHOS (ABox, spec 027 · FR-008) — PURO.
 *
 * Cada caja es un individuo con IRI estable (su id), un tipo y sus atributos;
 * cada flecha, un hecho con predicado —el confirmado por el humano o, si no lo
 * hay, el propuesto en memoria (FR-013: se razona con él, pero no se escribe).
 * El contenedor se lee como «pertenece_a», que es composición: meter una caja
 * en un Contexto no la vuelve subclase de él (edge case de la spec).
 */

import { fromGraphData, type DiagramModel } from "../mcp/diagram-builder";
import { DEFAULT_NOTATION_ID, isNotationContainer, type NotationId } from "../notations";
import type { SourceDoc } from "../source-docs";
import type { GraphData } from "../types";
import type { DesignView } from "../views-types";
import { ELEMENTO, RDF_TYPE, RDFS_LABEL, iriElemento, iriPredicado, literal, slugTipo } from "./iri";
import { sugerirPredicado } from "./predicate-guess";
import { claseDeTipo, tboxDe } from "./tbox";
import type { Hallazgo, Hecho } from "./types";

/** Dónde vive lo que se expresa: proyecto y vista forman el IRI de cada caja. */
export interface ContextoAbox {
  proyecto: string;
  vista: string;
}

/**
 * Índice de lo DIBUJADO, en el orden del diagrama. Los hechos dicen qué
 * significa el modelo; esto conserva lo que una tripleta no puede: el orden de
 * lectura, la etiqueta de cada flecha (dos flechas iguales son un solo hecho) y
 * los documentos adjuntos. Las formas lo necesitan para decir exactamente lo
 * que decían las reglas de calidad (FR-023).
 */
export interface ElementoAbox {
  iri: string;
  id: string;
  nombre: string;
  tipo: string;
  proyecto: string;
  vista: string;
  contenedor: boolean;
  /** La cita tal cual (FUENTE-SIN-ADJUNTAR la resuelve contra los adjuntos). */
  fuente?: string;
}

export interface AristaAbox {
  s: string;
  p: string;
  o: string;
  /** Ids crudos: una flecha a un elemento que no existe se conserva igual. */
  fuente: string;
  destino: string;
  etiqueta?: string;
  proyecto: string;
  vista: string;
}

export interface VistaAbox {
  proyecto: string;
  vista: string;
  notation: NotationId;
  documentos: SourceDoc[];
}

export interface ResultadoAbox {
  hechos: Hecho[];
  hallazgos: Hallazgo[];
  elementos: ElementoAbox[];
  aristas: AristaAbox[];
  vistas: VistaAbox[];
}

export function hechosDeModelo(m: DiagramModel, ctx: ContextoAbox): ResultadoAbox {
  const notation: NotationId = m.meta.notation ?? DEFAULT_NOTATION_ID;
  const t = tboxDe(notation);
  const hechos: Hecho[] = [];
  const hallazgos: Hallazgo[] = [];
  const elementos: ElementoAbox[] = [];
  const aristas: AristaAbox[] = [];
  const iri = (id: string) => iriElemento(ctx.proyecto, ctx.vista, id);
  const poner = (s: string, p: string, o: string, extra?: Partial<Hecho>) =>
    hechos.push({ s, p, o, origen: "explicito", vista: ctx.vista, ...extra });

  const porId = new Map(m.nodes.map((n) => [n.id, n]));
  const contenedorPorNombre = new Map(
    m.nodes.filter((n) => isNotationContainer(n.tipo_elemento)).map((n) => [n.nombre, n.id])
  );

  for (const n of m.nodes) {
    const e = iri(n.id);
    elementos.push({
      iri: e,
      id: n.id,
      nombre: n.nombre,
      tipo: n.tipo_elemento,
      proyecto: ctx.proyecto,
      vista: ctx.vista,
      contenedor: isNotationContainer(n.tipo_elemento),
      ...(n.source !== undefined ? { fuente: n.source } : {}),
    });
    const clase = claseDeTipo(t, n.tipo_elemento);
    if (clase === ELEMENTO)
      hallazgos.push({
        forma: "TIPO-DESCONOCIDO",
        severidad: "aviso",
        nodo: n.id,
        vista: ctx.vista,
        encontrado: n.tipo_elemento,
        mensaje: `«${n.nombre}» tiene un tipo que no existe en la notación (${n.tipo_elemento}): se trata como Elemento genérico.`,
        sugerencia: "Cambiale el tipo por uno de la paleta para que apliquen las reglas de su rol.",
      });
    poner(e, RDF_TYPE, clase);
    poner(e, RDFS_LABEL, literal(n.nombre));
    if (n.descripcion?.trim()) poner(e, "pf:descripcion", literal(n.descripcion.trim()));
    for (const tag of n.tags_tecnologia ?? []) if (tag.trim()) poner(e, "pf:tecnologia", literal(tag.trim()));
    for (const meta of n.metadata ?? [])
      if (meta.clave?.trim() && meta.valor?.trim()) poner(e, `pf:atributo/${slugTipo(meta.clave)}`, literal(meta.valor.trim()));
    if (n.source?.trim()) poner(e, "pf:fuente", literal(n.source.trim()));
    if (n.spec?.featureName?.trim()) poner(e, "pf:especificacion", literal(n.spec.featureName.trim()));
    const cont = n.container ? contenedorPorNombre.get(n.container) : undefined;
    if (cont && cont !== n.id) poner(e, iriPredicado("pertenece_a"), iri(cont));
  }

  for (const a of m.edges) {
    const f = porId.get(a.fuente);
    const d = porId.get(a.destino);
    const arista: AristaAbox = {
      s: iri(a.fuente),
      p: "",
      o: iri(a.destino),
      fuente: a.fuente,
      destino: a.destino,
      proyecto: ctx.proyecto,
      vista: ctx.vista,
      ...(a.descripcion !== undefined ? { etiqueta: a.descripcion } : {}),
    };
    aristas.push(arista);
    if (!f || !d) continue;
    const s = sugerirPredicado(a, f, d, notation);
    arista.p = iriPredicado(s.id);
    poner(arista.s, arista.p, arista.o, s.confianza === "confirmado" ? {} : { sugerido: true });
  }

  const vistas: VistaAbox[] = [{ proyecto: ctx.proyecto, vista: ctx.vista, notation, documentos: m.sources ?? [] }];
  return { hechos, hallazgos, elementos, aristas, vistas };
}

export function hechosDeGraphData(
  g: GraphData,
  ctx: ContextoAbox,
  notation: NotationId = g.notation ?? DEFAULT_NOTATION_ID
): ResultadoAbox {
  return hechosDeModelo(fromGraphData(g, notation), ctx);
}

/** Hechos de todas las vistas de grafo de un proyecto (las Mermaid no son modelo). */
export function hechosDeVistas(vistas: DesignView[], proyecto: string): ResultadoAbox {
  return unirAbox(
    vistas
      .filter((v) => v.graph)
      .map((v) => hechosDeGraphData(v.graph!, { proyecto, vista: v.id }, v.notation ?? v.graph!.notation ?? DEFAULT_NOTATION_ID))
  );
}

/** Varios ABox en uno, en orden. */
export function unirAbox(partes: ResultadoAbox[]): ResultadoAbox {
  const out: ResultadoAbox = { hechos: [], hallazgos: [], elementos: [], aristas: [], vistas: [] };
  for (const r of partes) {
    out.hechos.push(...r.hechos);
    out.hallazgos.push(...r.hallazgos);
    out.elementos.push(...r.elementos);
    out.aristas.push(...r.aristas);
    out.vistas.push(...r.vistas);
  }
  return out;
}
