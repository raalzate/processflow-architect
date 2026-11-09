/**
 * @fileOverview El agente del chat CONSULTA el grafo en vez de adivinar (spec 027 · T26) — PURO.
 *
 * Tres lecturas sobre el conocimiento del proyecto (FR-032): un patrón con
 * huecos («Pagar provoca ?x»), un camino entre dos cajas y el «¿por qué?» de
 * un hecho. Responden con NOMBRES y caminos legibles —lo que el modelo local
 * puede citar— y, cuando no hay filas, lo dicen como «desconocido en el
 * modelo» para que el agente no complete el hueco inventando (US5-AC2).
 *
 * Todo corre en el renderer sobre el catálogo que ya tiene el agente: nada de
 * la consulta ni del grafo sale de la máquina (US5-AC4, FR-035).
 */

import { DEFAULT_NOTATION_ID, type NotationId } from "../notations";
import { construirConocimiento, PROYECTO_SUELTO, type Conocimiento } from "../ontology/conocimiento";
import { caminoLegible, explicacionLegible, filaLegible, nombreDe } from "../ontology/ficha";
import { camino, consultarPorNombre, patronDeTexto, resolver, type Camino } from "../ontology/query";
import type { DesignView } from "../views-types";
import type { Catalog, ToolResult } from "./agent-retrieval";

/** Tope de filas y caminos que vuelven al modelo: la observación compite por la ventana. */
export const MAX_FILAS_AGENTE = 15;

export const DESCONOCIDO =
  "Desconocido en el modelo: el grafo no lo afirma. Respondé eso tal cual; no lo completes con lo que suele pasar en otros sistemas.";

/** El conocimiento de las vistas con grafo del catálogo (memorizado por contenido en `construirConocimiento`). */
export function conocimientoDelCatalogo(cat: Catalog): Conocimiento {
  const vistas: DesignView[] = cat.views
    .filter((v) => v.graph)
    .map((v) => ({
      id: v.name,
      name: v.name,
      kind: "graph",
      notation: (v.notation || v.graph?.notation || DEFAULT_NOTATION_ID) as NotationId,
      graph: v.graph,
      createdAt: "",
    }));
  return construirConocimiento({ proyecto: PROYECTO_SUELTO, vistas }, { tipo: "proyecto" });
}

const nota = (nombre: string, facts: string[], nodos: string[]) => ({
  source: { type: "model" as const, name: nombre },
  facts,
  nodes: [...new Set(nodos)],
});

const resultado = (texto: string, nombre: string, facts: string[], nodos: string[]): ToolResult => ({
  ok: true,
  text: texto,
  cost: texto.length,
  note: nota(nombre, facts, nodos),
});

/** Nombres de las cajas (citables por el artefacto): el nombre tal cual, sin la vista. */
const cajas = (k: Conocimiento, ts: string[]) => ts.filter((t) => t.startsWith("kb:")).map((t) => nombreDe(k, t));
const nodosDe = (k: Conocimiento, cs: Camino[]) => cajas(k, cs.flatMap((c) => c.pasos.flatMap((p) => [p.s, p.o])));

/**
 * `patron` admite varios patrones separados por «;», que se combinan por sus
 * variables: «?c dispara ?e; ?e activa ?p».
 */
export function consultarGrafo(cat: Catalog, patron: string): ToolResult {
  const k = conocimientoDelCatalogo(cat);
  const textos = patron.split(";").map((p) => p.trim()).filter(Boolean);
  if (!textos.length) return { ok: false, error: 'consultar_grafo necesita un patrón: "Sujeto predicado ?x".' };
  const patrones: [string, string, string][] = [];
  for (const t of textos) {
    // Estricto primero (el corte bueno cuando los nombres existen); laxo después,
    // para que un nombre que el modelo no tiene dé «desconocido» y no «ilegible».
    const p = patronDeTexto(k, t) ?? patronDeTexto(k, t, { laxo: true });
    if (!p)
      return {
        ok: false,
        error: `No entiendo el patrón «${t}»: escribilo como «Sujeto predicado Objeto», con ?x en lo que buscás, usando nombres de cajas y un predicado del reglamento (dispara, activa, provoca, usa, depende de…). Si un nombre no existe, el modelo no lo conoce.`,
      };
    patrones.push(p);
  }
  const r = consultarPorNombre(k, patrones, { limite: MAX_FILAS_AGENTE });
  const aviso = r.truncado ? " (hay nombres repetidos: se probaron sólo algunas combinaciones)" : "";
  if (r.sinResolver.length || !r.filas.length) return resultado(DESCONOCIDO + aviso, `grafo: ${patron}`, [], []);
  const lineas = r.filas.map((f) =>
    Object.entries(filaLegible(k, f))
      .map(([v, n]) => `?${v} = ${n}`)
      .join(", ")
  );
  return resultado(
    `${r.filas.length} respuesta(s)${r.filas.length === MAX_FILAS_AGENTE ? " (hay más)" : ""}${aviso}:\n${lineas.map((l) => `- ${l}`).join("\n")}`,
    `grafo: ${patron}`,
    lineas,
    cajas(k, r.filas.flatMap((f) => Object.values(f)))
  );
}

const elementos = (k: Conocimiento, texto: string) =>
  resolver(k, texto)
    .filter((c) => c.tipo === "elemento")
    .map((c) => c.termino);

export function caminoGrafo(cat: Catalog, desde: string, hasta?: string, predicado?: string): ToolResult {
  const k = conocimientoDelCatalogo(cat);
  const origenes = elementos(k, desde);
  const destinos = hasta ? elementos(k, hasta) : [undefined];
  if (!origenes.length || !destinos.length) return resultado(DESCONOCIDO, `camino: ${desde}`, [], []);
  const p = predicado ? resolver(k, predicado).find((c) => c.tipo === "predicado")?.termino : undefined;
  if (predicado && !p) return { ok: false, error: `«${predicado}» no es un predicado del reglamento.` };
  const cs: Camino[] = [];
  for (const o of origenes) for (const d of destinos) cs.push(...camino(k, o, { hasta: d, predicado: p }));
  const vistos = cs.slice(0, MAX_FILAS_AGENTE);
  if (!vistos.length) return resultado(DESCONOCIDO, `camino: ${desde}`, [], []);
  const lineas = vistos.map((c) => caminoLegible(k, c));
  return resultado(`${cs.length} camino(s):\n${lineas.map((l) => `- ${l}`).join("\n")}`, `camino: ${desde}`, lineas, nodosDe(k, vistos));
}

export function porQue(cat: Catalog, hecho: string): ToolResult {
  const k = conocimientoDelCatalogo(cat);
  const p = patronDeTexto(k, hecho);
  if (!p) return resultado(DESCONOCIDO, `por qué: ${hecho}`, [], []);
  const terminos = p.map((t, i) => resolver(k, t, { sinonimos: i === 1 }).map((c) => c.termino));
  for (const s of terminos[0])
    for (const pr of terminos[1])
      for (const o of terminos[2]) {
        const l = explicacionLegible(k, [s, pr, o]);
        if (!l) continue;
        const lineas = l.map(
          (x) => `${"  ".repeat(x.nivel)}- ${x.texto}${x.dibujado ? " (dibujado)" : x.regla ? ` (por ${x.regla})` : ""}`
        );
        return resultado(lineas.join("\n"), `por qué: ${hecho}`, lineas.map((x) => x.trim()), cajas(k, [s, o]));
      }
  return resultado(DESCONOCIDO, `por qué: ${hecho}`, [], []);
}
