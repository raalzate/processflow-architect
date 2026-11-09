/**
 * @fileOverview Ontología por MCP (spec 027) — PURO.
 *
 * Fijar el significado de una flecha y CONSULTAR el conocimiento: patrones,
 * caminos, explicaciones y preguntas de competencia (FR-030). El servidor
 * (`main/services/mcp-tools.ts`) sólo carga los diagramas del alcance, llama y
 * devuelve el texto; la decisión y el formato viven acá para probarlos sin
 * levantar el proceso stdio. Cada tool responde con la API pura de
 * `ontology/` —misma respuesta, otro formato—.
 */

import { DEFAULT_NOTATION_ID } from "../notations";
import { preguntaCompetencia, PREGUNTAS_COMPETENCIA } from "../ontology/competency";
import { construirConocimiento, type Conocimiento } from "../ontology/conocimiento";
import { caminoLegible, explicacionLegible, filaLegible } from "../ontology/ficha";
import { predicadosCompatibles, validarPredicado } from "../ontology/predicate-guess";
import { camino, consultarPorNombre, resolver, MAX_SALTOS, type Camino, type Fila } from "../ontology/query";
import type { Origen } from "../ontology/types";
import type { DesignView } from "../views-types";
import { toGraphData, updateEdge, type DiagramModel } from "./diagram-builder";
import { mermaidSafeId } from "./mermaid-id";

/** El nodo por id exacto o por el id como se dibuja en Mermaid (como `updateEdge`). */
const tipoDe = (model: DiagramModel, id: string): string | undefined =>
  (model.nodes.find((n) => n.id === id) ?? model.nodes.find((n) => mermaidSafeId(n.id) === id))?.tipo_elemento;

/**
 * Fija (o quita, con `null`) el predicado de la relación `from → to`. Un
 * predicado que el reglamento no admite entre esos tipos se RECHAZA con los
 * compatibles: el agente externo debe elegir uno válido, no dejar un hallazgo.
 * @throws si la relación no existe o el predicado no corresponde.
 */
export function setEdgePredicate(
  model: DiagramModel,
  from: string,
  to: string,
  predicate: string | null
): { model: DiagramModel } {
  if (predicate === null) {
    // La MISMA arista que tocaría update_edge (mismo id exacto → id Mermaid, la
    // primera f→t): quitar y fijar no pueden actuar sobre aristas distintas.
    const antes = model.edges;
    const next = updateEdge(model, from, to, { predicado: undefined });
    return {
      model: {
        ...next,
        edges: next.edges.map((e, i) => {
          if (e === antes[i] || !("predicado" in e)) return e;
          const { predicado: _quitado, ...resto } = e;
          return resto;
        }),
      },
    };
  }
  // Que la relación exista va antes que el reglamento, con el mensaje de update_edge.
  updateEdge(model, from, to, {});
  const notation = model.meta.notation ?? DEFAULT_NOTATION_ID;
  const tf = tipoDe(model, from);
  const tt = tipoDe(model, to);
  if (tf && tt) {
    const h = validarPredicado(predicate, tf, tt, notation);
    if (h) {
      const compatibles = predicadosCompatibles(tf, tt, notation).map((p) => p.id);
      throw new Error(`${h.mensaje} Predicados compatibles entre ${tf} y ${tt}: ${compatibles.join(", ")}.`);
    }
  }
  return { model: updateEdge(model, from, to, { predicado: predicate }) };
}

// ── Consultas (T25) ──────────────────────────────────────────────────────────

/**
 * Conocimiento de un conjunto de diagramas del workspace: cada diagrama es una
 * vista del «proyecto» que forma el alcance (el diagrama activo, o la org entera
 * con `scope:"org"`). El IRI de cada caja lleva el id de su diagrama, así dos
 * Cliente de diagramas distintos no se confunden (FR-014).
 */
export function conocimientoDeDiagramas(diagramas: { id: string; model: DiagramModel }[], proyecto: string): Conocimiento {
  const vistas: DesignView[] = diagramas.map(({ id, model }) => ({
    id,
    name: id,
    kind: "graph",
    notation: model.meta.notation ?? DEFAULT_NOTATION_ID,
    graph: toGraphData(model),
    createdAt: "",
  }));
  return construirConocimiento({ proyecto, vistas }, { tipo: "proyecto" });
}

export type Inclusion = "explicit" | "inferred" | "all";
const ORIGEN: Record<Inclusion, Origen[] | "todos"> = {
  explicit: ["explicito"],
  inferred: ["deducido"],
  all: "todos",
};

const desconocido = (nombres: string[]) =>
  `Desconocido en el modelo: ${nombres.map((n) => `«${n}»`).join(", ")} no nombra ningún elemento, predicado ni clase. ` +
  "Revisá el nombre (list_diagrams da el vocabulario) o usá un IRI. Mundo abierto: que no esté no quiere decir que sea falso.";

function tabla(k: Conocimiento, filas: Fila[]): string {
  if (!filas.length) return "";
  const cols = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  const celda = (v: string) => v.replace(/\|/g, "\\|");
  return [
    `| ${cols.join(" | ")} |`,
    `| ${cols.map(() => "---").join(" | ")} |`,
    ...filas.map((f) => {
      const l = filaLegible(k, f);
      return `| ${cols.map((c) => celda(l[c] ?? "")).join(" | ")} |`;
    }),
  ].join("\n");
}

const listaCaminos = (k: Conocimiento, cs: Camino[]) => cs.map((c) => `- ${caminoLegible(k, c)}`).join("\n");

export function queryKnowledge(
  k: Conocimiento,
  patterns: [string, string, string][],
  include: Inclusion = "all",
  limit?: number
): string {
  const r = consultarPorNombre(k, patterns, { origen: ORIGEN[include], limite: limit });
  if (r.sinResolver.length) return desconocido(r.sinResolver);
  const aviso = r.truncado
    ? "\n\nAviso: los nombres repetidos daban demasiadas combinaciones y sólo se probaron las primeras; la respuesta puede estar incompleta. Usá IRIs para precisar."
    : "";
  if (!r.filas.length)
    return `Sin filas: el modelo no afirma nada que encaje con esos patrones (mundo abierto: desconocido, no falso).${aviso}`;
  // Cuántas respuestas sólo existen gracias al razonador.
  const soloDibujado =
    include === "all"
      ? new Set(consultarPorNombre(k, patterns, { origen: ["explicito"], limite: limit }).filas.map((f) => JSON.stringify(f)))
      : undefined;
  const deducidas = soloDibujado ? r.filas.filter((f) => !soloDibujado.has(JSON.stringify(f))).length : 0;
  return [
    `${r.filas.length} fila(s)${deducidas ? `, ${deducidas} gracias a hechos deducidos` : ""}:`,
    "",
    tabla(k, r.filas),
  ].join("\n") + aviso;
}

/** Elementos que nombra el texto (nombre o IRI de caja). */
const elementos = (k: Conocimiento, texto: string) =>
  resolver(k, texto)
    .filter((c) => c.tipo === "elemento" || (c.tipo === "iri" && c.termino.startsWith("kb:")))
    .map((c) => c.termino);

export function findPath(
  k: Conocimiento,
  from: string,
  opts: { to?: string; predicate?: string; maxHops?: number } = {}
): string {
  const desde = elementos(k, from);
  const hasta = opts.to ? elementos(k, opts.to) : [undefined];
  const faltan = [...(desde.length ? [] : [from]), ...(opts.to && !hasta.length ? [opts.to] : [])];
  if (faltan.length) return desconocido(faltan);
  let predicado = opts.predicate;
  if (predicado) {
    const p = resolver(k, predicado).find((c) => c.tipo === "predicado");
    if (!p) return desconocido([predicado]);
    predicado = p.termino;
  }
  const cs: Camino[] = [];
  for (const d of desde)
    for (const h of hasta)
      cs.push(...camino(k, d, { hasta: h, predicado, maxSaltos: opts.maxHops ?? MAX_SALTOS }));
  if (!cs.length)
    return `No hay camino${opts.to ? ` de «${from}» a «${opts.to}»` : ` desde «${from}»`}${predicado ? ` por ${predicado}` : ""} en ${opts.maxHops ?? MAX_SALTOS} saltos (desconocido en el modelo).`;
  return `${cs.length} camino(s):\n${listaCaminos(k, cs)}`;
}

export function explainFact(k: Conocimiento, subject: string, predicate: string, object: string): string {
  const partes = [subject, predicate, object].map((t) => resolver(k, t).map((c) => c.termino));
  const faltan = [subject, predicate, object].filter((_, i) => !partes[i].length);
  if (faltan.length) return desconocido(faltan);
  for (const s of partes[0])
    for (const p of partes[1])
      for (const o of partes[2]) {
        const l = explicacionLegible(k, [s, p, o]);
        if (!l) continue;
        return l
          .map(
            (x) =>
              `${"  ".repeat(x.nivel)}- ${x.texto}` +
              (x.dibujado ? " · dibujado" : x.regla ? ` · por ${x.regla}${x.axioma ? ` (${x.axioma})` : ""}` : "")
          )
          .join("\n");
      }
  return `El modelo no afirma «${subject} ${predicate} ${object}» (mundo abierto: desconocido, no falso).`;
}

export function askCompetency(k: Conocimiento, id: string, args: Record<string, string> = {}): string {
  const q = preguntaCompetencia(id);
  if (!q) return `No existe la pregunta «${id}». Disponibles: ${PREGUNTAS_COMPETENCIA.map((p) => p.id).join(", ")}.`;
  const r = q.ejecutar(k, args);
  const partes = [`**${q.id}** — ${q.titulo}`];
  if (r.nota) partes.push(r.nota);
  else if (!r.filas.length && !r.explicacion) partes.push("Sin respuesta: el modelo no lo afirma (mundo abierto).");
  if (r.filas.length && !r.explicacion) partes.push("", tabla(k, r.filas));
  if (r.caminos.length) partes.push("", "Caminos:", listaCaminos(k, r.caminos));
  if (r.explicacion) {
    const [s, p, o] = r.explicacion.hecho;
    partes.push("", explainFact(k, s, p, o));
  }
  return partes.join("\n");
}
