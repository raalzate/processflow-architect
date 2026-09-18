/**
 * @fileOverview EDITAR la vista abierta del proyecto (PURO). Feature 015, T3 (#341).
 *
 * Hasta acá la única puerta del agente al lienzo era `export_as_view`, que
 * REEMPLAZA la pestaña entera. Por eso «agregá un elemento en la vista actual»
 * no existía como acción: lo que el agente escribía iba al workspace del MCP y
 * el lienzo del humano no cambiaba nunca (#332). Esto es la acción que faltaba:
 * una operación chica sobre el grafo de UNA vista.
 *
 * El cambio se hace sobre `DiagramModel` —donde viven `addNode`, `updateEdge` y
 * compañía, ya probadas— y vuelve a `GraphData`. Esa ida y vuelta pierde lo que
 * el modelo del constructor no representa, así que `fundir()` lo reaplica desde
 * el grafo previo: la geometría que el humano movió, el `viewRef` del drill-down
 * y los quiebres y anclas que dibujó a mano (#344). Sin eso, agregar una caja le
 * borraba al humano el trabajo de acomodar el diagrama.
 */

import type { GraphData, GraphLink, GraphNode } from "../types";
import { isNotationContainer, notationTypes, type NotationId } from "../notations";
import {
  addContainer,
  addEdge,
  addNode,
  fromGraphData,
  removeEdge,
  removeNode,
  toGraphData,
  updateEdge,
  updateNode,
  type BuilderNode,
  type DiagramModel,
} from "./diagram-builder";
import { mergeProjectGraph } from "./project-update";
import { normalizarTipo, plano } from "./tipo-notacion";

/** Operación de edición sobre el grafo de una vista. */
export type ViewEdit =
  | { kind: "add-element"; name: string; type: string; container?: string; description?: string }
  | {
      kind: "update-element";
      name: string;
      newName?: string;
      type?: string;
      description?: string;
      container?: string;
    }
  | { kind: "remove-element"; name: string }
  | { kind: "add-edge"; from: string; to: string; label?: string; dashed?: boolean; arrow?: GraphLink["arrow"] }
  | {
      kind: "update-edge";
      from: string;
      to: string;
      label?: string;
      dashed?: boolean;
      arrow?: GraphLink["arrow"];
      /** true → da vuelta la relación (el «invertí la flecha» del humano). */
      invert?: boolean;
    }
  | { kind: "remove-edge"; from: string; to: string }
  | { kind: "set-graph"; graph: GraphData };

export type ViewEditResult =
  | { ok: true; graph: GraphData; message: string }
  | { ok: false; error: string };

/** Campos por NODO que `DiagramModel` no representa y hay que devolver desde el previo. */
const EXTRAS_NODO = ["viewRef", "nivel", "isGroup", "fragmentOp", "fragmentParts"] as const;
/** Campos por ARISTA que dibuja el humano y el modelo no lleva. */
const EXTRAS_ARISTA = [
  "midpoints",
  "midpoint",
  "labelOffset",
  "sourceAnchor",
  "targetAnchor",
  "orden",
  "messageKind",
] as const;

type Arista = Omit<GraphLink, "tipo" | "source" | "target">;

const nodosDe = (g: GraphData): (Omit<GraphNode, "agregado"> & Record<string, unknown>)[] => [
  ...((g.big_picture?.nodos ?? []) as any[]),
  ...(g.agregados ?? []).flatMap((a) => (a.nodos ?? []) as any[]),
];

const aristasDe = (g: GraphData): Arista[] => [
  ...(g.big_picture?.aristas ?? []),
  ...(g.agregados ?? []).flatMap((a) => a.aristas ?? []),
  ...(g.politicas_inter_agregados ?? []),
];

/** Reaplica a un objeto los campos del previo que la ida y vuelta no lleva. */
function conExtras<T extends Record<string, any>>(
  actualizado: T,
  previo: Record<string, any> | undefined,
  campos: readonly string[]
): T {
  if (!previo) return actualizado;
  const salida: Record<string, any> = { ...actualizado };
  for (const campo of campos) {
    if (previo[campo] !== undefined && salida[campo] === undefined) salida[campo] = previo[campo];
  }
  return salida as T;
}

/**
 * Funde el grafo recalculado sobre el que ya estaba en la vista.
 *
 * `mergeProjectGraph` conserva lo de nivel proyecto (notas, hotspots,
 * responsables) y la geometría por id. Acá se suma lo que se perdía en la
 * conversión: los extras por nodo y por arista (#344). La arista se busca por
 * sus extremos porque no tiene id.
 */
export function fundir(actual: GraphData, entrante: GraphData): GraphData {
  const { graph } = mergeProjectGraph(actual, entrante);
  const previosNodo = new Map(nodosDe(actual).map((n) => [n.id, n]));
  const previasAristas = new Map(aristasDe(actual).map((e) => [`${e.fuente}→${e.destino}`, e]));

  const nodo = (n: any) => conExtras(n, previosNodo.get(n.id), EXTRAS_NODO);
  const arista = (e: Arista) =>
    conExtras(e, previasAristas.get(`${e.fuente}→${e.destino}`), EXTRAS_ARISTA);

  return {
    ...graph,
    big_picture: {
      ...graph.big_picture,
      nodos: (graph.big_picture?.nodos ?? []).map(nodo),
      aristas: (graph.big_picture?.aristas ?? []).map(arista),
    },
    agregados: (graph.agregados ?? []).map((a) => ({
      ...a,
      nodos: (a.nodos ?? []).map(nodo),
      aristas: (a.aristas ?? []).map(arista),
    })),
    politicas_inter_agregados: (graph.politicas_inter_agregados ?? []).map(arista),
  };
}

/**
 * Reconcilia los ids del grafo entrante con los del previo cuando el NOMBRE
 * coincide. El modo creativo va y vuelve por Mermaid, donde el id se sanea, así
 * que la misma caja vuelve con otro id y la fusión la trataba como nueva: la
 * posición que el humano le había dado se perdía (FR-006).
 */
export function reconciliarIds(actual: GraphData, entrante: GraphData): GraphData {
  const porNombre = new Map<string, string[]>();
  for (const n of nodosDe(actual)) {
    const k = plano(n.nombre);
    porNombre.set(k, [...(porNombre.get(k) ?? []), n.id]);
  }
  const yaUsados = new Set(nodosDe(entrante).map((n) => n.id));
  const mapa = new Map<string, string>();
  for (const n of nodosDe(entrante)) {
    const candidatos = porNombre.get(plano(n.nombre)) ?? [];
    // Sólo cuando NO hay duda: un nombre repetido no dice qué caja es cuál.
    if (candidatos.length === 1 && candidatos[0] !== n.id && !yaUsados.has(candidatos[0])) {
      mapa.set(n.id, candidatos[0]);
    }
  }
  if (!mapa.size) return entrante;
  const id = (x: string) => mapa.get(x) ?? x;
  const nodo = (n: any) => ({ ...n, id: id(n.id) });
  const arista = (e: Arista) => ({ ...e, fuente: id(e.fuente), destino: id(e.destino) });
  return {
    ...entrante,
    big_picture: {
      ...entrante.big_picture,
      nodos: (entrante.big_picture?.nodos ?? []).map(nodo),
      aristas: (entrante.big_picture?.aristas ?? []).map(arista),
    },
    agregados: (entrante.agregados ?? []).map((a) => ({
      ...a,
      nodos: (a.nodos ?? []).map(nodo),
      aristas: (a.aristas ?? []).map(arista),
    })),
    politicas_inter_agregados: (entrante.politicas_inter_agregados ?? []).map(arista),
  };
}

/** El elemento del modelo que se llama así (o el motivo por el que no hay UNO). */
function porNombre(model: DiagramModel, nombre: string): { node: BuilderNode } | { error: string } {
  const buscado = plano(nombre ?? "");
  if (!buscado) return { error: "Falta el nombre del elemento." };
  const exactos = model.nodes.filter((n) => plano(n.nombre) === buscado);
  const hallados = exactos.length ? exactos : model.nodes.filter((n) => n.id === nombre.trim());
  if (hallados.length === 1) return { node: hallados[0] };
  if (hallados.length > 1) {
    // Elegir por el humano entre dos cajas homónimas es justo lo que FR-010 prohíbe.
    return {
      error: `Hay ${hallados.length} elementos llamados "${nombre}" (${hallados
        .map((n) => `${n.tipo_elemento}${n.container ? ` en ${n.container}` : ""}`)
        .join(", ")}). Preguntá cuál antes de tocarlo.`,
    };
  }
  const opciones = model.nodes.map((n) => `"${n.nombre}"`).join(", ") || "(ninguno)";
  return { error: `No hay ningún elemento llamado "${nombre}" en la vista. Los que hay: ${opciones}.` };
}

/** El tipo, resuelto contra la notación de la vista (§P6). */
function tipoValido(tipo: string, notation: NotationId): { tipo: string } | { error: string } {
  const validos = notationTypes(notation, { includeContainers: true });
  const r = normalizarTipo(tipo, validos);
  if ("tipo" in r) return r;
  const sugerencia = r.sugerido ? ` ¿Quisiste decir "${r.sugerido}"?` : "";
  return {
    error: `"${tipo}" no es un tipo de ${notation}.${sugerencia} Los válidos: ${validos.join(", ")}.`,
  };
}

/**
 * Aplica una operación al grafo de una vista y devuelve el grafo nuevo.
 * No muta nada: el renderer decide qué hacer con el resultado.
 */
export function applyViewEdit(
  actual: GraphData,
  edit: ViewEdit,
  notation: NotationId
): ViewEditResult {
  if (edit.kind === "set-graph") {
    const nodos = nodosDe(edit.graph).length + (edit.graph.agregados?.length ?? 0);
    // §P8: ningún camino deja el lienzo en blanco.
    if (!nodos) return { ok: false, error: "El grafo entrante no tiene elementos: no se publica vacío." };
    return {
      ok: true,
      graph: fundir(actual, reconciliarIds(actual, edit.graph)),
      message: `Vista reemplazada: ${nodos} elemento(s).`,
    };
  }

  const model = fromGraphData(actual, notation);
  let nuevo: DiagramModel;
  let message: string;

  try {
    switch (edit.kind) {
      case "add-element": {
        const t = tipoValido(edit.type, notation);
        if ("error" in t) return { ok: false, error: t.error };
        const base = {
          nombre: edit.name?.trim(),
          tipo_elemento: t.tipo,
          descripcion: edit.description,
        };
        if (!base.nombre) return { ok: false, error: "Falta el nombre del elemento." };
        nuevo = isNotationContainer(t.tipo)
          ? addContainer(model, base).model
          : addNode(model, { ...base, container: edit.container ?? "" }).model;
        message = `"${base.nombre}" (${t.tipo}) agregado a la vista.`;
        break;
      }
      case "update-element": {
        const r = porNombre(model, edit.name);
        if ("error" in r) return { ok: false, error: r.error };
        let tipo: string | undefined;
        if (edit.type) {
          const t = tipoValido(edit.type, notation);
          if ("error" in t) return { ok: false, error: t.error };
          tipo = t.tipo;
        }
        nuevo = updateNode(model, r.node.id, {
          ...(edit.newName ? { nombre: edit.newName } : {}),
          ...(edit.description !== undefined ? { descripcion: edit.description } : {}),
          ...(tipo ? { tipo_elemento: tipo } : {}),
        });
        if (edit.container !== undefined && !isNotationContainer(r.node.tipo_elemento)) {
          nuevo = {
            ...nuevo,
            nodes: nuevo.nodes.map((n) => (n.id === r.node.id ? { ...n, container: edit.container } : n)),
          };
        }
        message = `"${r.node.nombre}" actualizado.`;
        break;
      }
      case "remove-element": {
        const r = porNombre(model, edit.name);
        if ("error" in r) return { ok: false, error: r.error };
        nuevo = removeNode(model, r.node.id);
        message = `"${r.node.nombre}" eliminado de la vista.`;
        break;
      }
      case "add-edge": {
        const f = porNombre(model, edit.from);
        if ("error" in f) return { ok: false, error: f.error };
        const t = porNombre(model, edit.to);
        if ("error" in t) return { ok: false, error: t.error };
        nuevo = addEdge(model, {
          fuente: f.node.id,
          destino: t.node.id,
          ...(edit.label ? { descripcion: edit.label } : {}),
          ...(edit.dashed !== undefined ? { dashed: edit.dashed } : {}),
          ...(edit.arrow ? { arrow: edit.arrow } : {}),
        });
        message = `Relación "${f.node.nombre}" → "${t.node.nombre}" agregada.`;
        break;
      }
      case "update-edge": {
        const f = porNombre(model, edit.from);
        if ("error" in f) return { ok: false, error: f.error };
        const t = porNombre(model, edit.to);
        if ("error" in t) return { ok: false, error: t.error };
        // La relación puede estar dibujada al revés de como la nombra el humano.
        const derecha = model.edges.find((e) => e.fuente === f.node.id && e.destino === t.node.id);
        const revés = model.edges.find((e) => e.fuente === t.node.id && e.destino === f.node.id);
        const actualEdge = derecha ?? revés;
        if (!actualEdge) {
          return {
            ok: false,
            error: `No hay una relación entre "${f.node.nombre}" y "${t.node.nombre}".`,
          };
        }
        const patch = {
          ...(edit.label !== undefined ? { descripcion: edit.label } : {}),
          ...(edit.dashed !== undefined ? { dashed: edit.dashed } : {}),
          ...(edit.arrow ? { arrow: edit.arrow } : {}),
        };
        nuevo = updateEdge(model, actualEdge.fuente, actualEdge.destino, patch);
        if (edit.invert) {
          nuevo = {
            ...nuevo,
            edges: nuevo.edges.map((e) =>
              e.fuente === actualEdge.fuente && e.destino === actualEdge.destino
                ? { ...e, fuente: actualEdge.destino, destino: actualEdge.fuente }
                : e
            ),
          };
        }
        message = edit.invert
          ? `Relación entre "${f.node.nombre}" y "${t.node.nombre}" invertida.`
          : `Relación entre "${f.node.nombre}" y "${t.node.nombre}" actualizada.`;
        break;
      }
      case "remove-edge": {
        const f = porNombre(model, edit.from);
        if ("error" in f) return { ok: false, error: f.error };
        const t = porNombre(model, edit.to);
        if ("error" in t) return { ok: false, error: t.error };
        const existe = model.edges.find(
          (e) =>
            (e.fuente === f.node.id && e.destino === t.node.id) ||
            (e.fuente === t.node.id && e.destino === f.node.id)
        );
        if (!existe) {
          return { ok: false, error: `No hay una relación entre "${f.node.nombre}" y "${t.node.nombre}".` };
        }
        nuevo = removeEdge(model, existe.fuente, existe.destino);
        message = `Relación entre "${f.node.nombre}" y "${t.node.nombre}" eliminada.`;
        break;
      }
    }
  } catch (e: any) {
    // Los errores de `diagram-builder` ya están escritos para que el modelo se
    // corrija en el turno siguiente: se pasan tal cual.
    return { ok: false, error: String(e?.message ?? e) };
  }

  return { ok: true, graph: fundir(actual, toGraphData(nuevo)), message };
}
