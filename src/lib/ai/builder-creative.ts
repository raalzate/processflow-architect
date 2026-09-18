/**
 * @fileOverview Modo CREATIVO del constructor (PURO). Feature 015, T9 (#338).
 *
 * Un diagrama entero en UNA inferencia. El modelo ve lo que ya hay como Mermaid
 * y responde con el Mermaid completo; el arnés hace el resto de forma
 * determinista: convierte (`fromMermaid`), valida contra la notación, recorta si
 * no entra y publica. Los tipos y la geometría los pone el código; el modelo
 * aporta QUÉ hay y cómo se conecta, que es lo que sabe hacer (#332).
 *
 * Lo que este archivo no negocia:
 *  - **Nunca se publica un grafo vacío** (§P8, SC-006): antes que dejar el
 *    lienzo en blanco, la corrida falla y lo dice.
 *  - **Pisar una vista con contenido lo decide el humano** (§P10, FR-012).
 *  - **El cierre reporta lo verificado**, no el log de llamadas (FR-011).
 *
 * Todo lo que toca el mundo (modelo, MCP) entra por `deps`: acá sólo vive la
 * decisión, y los tests la prueban sin Electron.
 */

import type { GraphData } from "../types";
import type { NotationId } from "../notations";
import { fromMermaid } from "../mcp/from-mermaid";
import { toMermaid } from "../mcp/to-mermaid";
import { fromGraphData, toGraphData, validate, type DiagramModel } from "../mcp/diagram-builder";
import { qualityFindings, MAX_NODES } from "../mcp/quality";

export interface CreativeDeps {
  /** Pide el Mermaid al modelo (la `AiTask` `creative-diagram`). */
  generar: (input: {
    pedido: string;
    existente?: string;
    notation?: string;
    hallazgos?: string[];
  }) => Promise<string>;
  /** Deja el grafo en la vista del humano (`set_view_graph`). */
  aplicar: (graph: GraphData) => Promise<{ ok: boolean; texto: string }>;
  /** Comprobación contra la app para el cierre (opcional). */
  verificar?: () => Promise<string | undefined>;
}

export interface CreativeInput {
  pedido: string;
  vista: {
    nombre: string;
    notation: NotationId;
    /** Grafo actual de la vista (vacío/ausente = vista sin contenido). */
    graph?: GraphData | null;
  };
  /** true → el humano ya aceptó que se pise el contenido de la vista. */
  confirmado?: boolean;
}

export type CreativeResult =
  | { kind: "listo"; graph: GraphData; reply: string; hallazgos: string[] }
  | { kind: "confirmar"; texto: string; graph: GraphData; hallazgos: string[] }
  | { kind: "error"; reply: string; hallazgos: string[] };

/** Cuántos elementos tiene hoy la vista (contenedores incluidos). */
export function cuantosElementos(graph: GraphData | null | undefined): number {
  if (!graph) return 0;
  const sueltos = graph.big_picture?.nodos?.length ?? 0;
  const contenedores = graph.agregados?.length ?? 0;
  const dentro = (graph.agregados ?? []).reduce((n, a) => n + (a.nodos?.length ?? 0), 0);
  return sueltos + contenedores + dentro;
}

/** Lo que ya hay, en el formato que el modelo entiende. */
export function contextoMermaid(vista: CreativeInput["vista"]): string | undefined {
  if (!cuantosElementos(vista.graph)) return undefined;
  return toMermaid(fromGraphData(vista.graph as GraphData, vista.notation));
}

/**
 * Recorta una propuesta que no entra en una vista. Se van los ÚLTIMOS nodos y
 * las aristas que quedan colgando: publicar 60 cajas ilegibles no es cumplir el
 * pedido, y truncar en silencio es peor (FR-013).
 */
export function recortarSiNoEntra(
  model: DiagramModel,
  tope: number = MAX_NODES
): { model: DiagramModel; aviso?: string } {
  if (model.nodes.length <= tope) return { model };
  const quedan = model.nodes.slice(0, tope);
  const ids = new Set(quedan.map((n) => n.id));
  const nombres = new Set(quedan.map((n) => n.nombre));
  const fuera = model.nodes.length - quedan.length;
  return {
    model: {
      ...model,
      nodes: quedan.map((n) => (n.container && !nombres.has(n.container) ? { ...n, container: "" } : n)),
      edges: model.edges.filter((e) => ids.has(e.fuente) && ids.has(e.destino)),
    },
    aviso: `La propuesta traía ${model.nodes.length} elementos y una vista admite ${tope}: quedaron los primeros ${tope} y ${fuera} no entraron. Pedí el resto en otra vista.`,
  };
}

/**
 * Los problemas de una propuesta que el modelo PUEDE corregir escribiendo otro
 * Mermaid: lo que el parser no resolvió y los hallazgos graves de calidad.
 *
 * `validate()` queda fuera a propósito: sus errores más frecuentes son
 * propiedades canónicas ausentes (`repo`, `puerto`), que la convención Mermaid
 * no sabe expresar. Pedírselas gastaría el único reintento en algo que el
 * modelo no tiene forma de arreglar, y esa es exactamente la corrida que se
 * quema sin llegar al lienzo (#331). Se declaran igual en el resumen del cierre.
 */
function problemas(model: DiagramModel, hallazgos: string[]): string[] {
  const graves = qualityFindings(model)
    .filter((f) => f.level === "grave")
    .map((f) => f.message);
  return [...hallazgos, ...graves];
}

/** Lo que el humano tiene que mirar aunque no dispare un reintento. */
function porRevisar(model: DiagramModel): string[] {
  return validate(model).errors;
}

/**
 * Corre el modo creativo de punta a punta. Un solo reintento: si con los
 * hallazgos en la mano el modelo no mejora, insistir sólo gasta la corrida
 * —tres frenos idénticos y el diagrama vacío fue exactamente #331—.
 */
export async function runCreative(
  input: CreativeInput,
  deps: CreativeDeps
): Promise<CreativeResult> {
  const existente = contextoMermaid(input.vista);
  let hallazgos: string[] = [];
  let model: DiagramModel | null = null;
  let aviso: string | undefined;

  for (let intento = 0; intento < 2; intento++) {
    let mermaid: string;
    try {
      mermaid = await deps.generar({
        pedido: input.pedido,
        existente,
        notation: input.vista.notation,
        ...(intento ? { hallazgos } : {}),
      });
    } catch (e: any) {
      return { kind: "error", reply: `No pude pensar el diagrama: ${e?.message ?? e}`, hallazgos };
    }

    if (!mermaid.trim()) {
      hallazgos = ["La respuesta no traía ningún diagrama Mermaid."];
      model = null;
      continue;
    }

    const parsed = fromMermaid(mermaid, input.vista.notation, { nombre: input.vista.nombre });
    const recortado = recortarSiNoEntra(parsed.model);
    model = recortado.model;
    aviso = recortado.aviso;
    hallazgos = problemas(model, parsed.hallazgos);

    // Un diagrama sin elementos no se publica ni se reintenta a ciegas: se dice.
    if (!model.nodes.length) {
      hallazgos = ["El diagrama propuesto no tiene ningún elemento."];
      continue;
    }
    if (!hallazgos.length) break;
  }

  if (!model || !model.nodes.length) {
    return {
      kind: "error",
      reply: [
        "No conseguí un diagrama publicable y no voy a dejar la vista en blanco.",
        ...hallazgos.map((h) => `- ${h}`),
      ].join("\n"),
      hallazgos,
    };
  }

  const graph = toGraphData(model);
  const resumen = [
    `Propuesta: ${model.nodes.length} elemento(s) y ${model.edges.length} relación(es) en "${input.vista.nombre}".`,
    aviso,
    (() => {
      const revisar = [...hallazgos, ...porRevisar(model!)];
      return revisar.length ? `Quedó por revisar:\n${revisar.map((h) => `- ${h}`).join("\n")}` : "";
    })(),
  ]
    .filter(Boolean)
    .join("\n\n");

  // Pisar lo que el humano tiene dibujado lo decide el humano (§P10, FR-012).
  if (cuantosElementos(input.vista.graph) && !input.confirmado) {
    return {
      kind: "confirmar",
      texto: `La vista "${input.vista.nombre}" ya tiene ${cuantosElementos(
        input.vista.graph
      )} elemento(s) y esto la reemplaza (lo que se repita por nombre conserva su posición). ¿La publico?`,
      graph,
      hallazgos,
    };
  }

  const r = await deps.aplicar(graph);
  if (!r.ok) return { kind: "error", reply: `No pude publicarlo: ${r.texto}`, hallazgos };

  const verificacion = await deps.verificar?.();
  return {
    kind: "listo",
    graph,
    reply: [resumen, r.texto, verificacion].filter(Boolean).join("\n\n"),
    hallazgos,
  };
}
