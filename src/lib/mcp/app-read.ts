/**
 * @fileOverview Lectura de la app por MCP: artefactos, vistas y otros proyectos (PURO).
 *
 * `app-state.ts` responde "¿qué hay?" (inventario: proyecto activo, nombres de
 * vistas, conteos). Esto responde "¿qué DICE?": el Markdown de un artefacto, los
 * elementos de una vista, el contenido de un proyecto que no es el activo.
 *
 * Por qué separado: el inventario se PUBLICA (renderer → main, barato, siempre
 * fresco); el contenido se PIDE bajo demanda con una petición que puede fallar
 * (app cerrada, proyecto inexistente). Mezclarlos obligaba a cachear todo el
 * contenido de todos los proyectos en el proceso main para nada.
 *
 * Acá viven los tipos de la petición, la selección por nombre —una sola
 * definición de "se refiere a esta vista", que usan el renderer al resolver y el
 * main al sugerir alternativas— y el formato de la respuesta MCP.
 */

import type { NotationId } from "../notations";
import type { GraphData } from "../types";
import type { ElementSpec } from "../element-spec";
import { formatDocsIndex } from "../element-docs";
import { countGraph, type AppFocus } from "./app-state";
import { fromGraphData } from "./diagram-builder";
import { textoConteo } from "./conteo";

/* -------------------------------------------------------------------------- */
/* Petición y respuesta                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `project` ausente = el proyecto ACTIVO. Con nombre, cualquier proyecto guardado:
 * es lo que permite mirar "lo necesario de otro proyecto" sin que el usuario
 * tenga que abrirlo (abrirlo le cambiaría el lienzo bajo los pies).
 */
export type AppReadRequest =
  | { kind: "artifacts"; project?: string }
  | { kind: "artifact"; title: string; project?: string; revision?: number }
  | { kind: "views"; project?: string }
  | { kind: "view"; name: string; project?: string }
  /** La caja cuya ficha tiene abierta el humano (feature 019). Siempre del proyecto activo. */
  | { kind: "focused" };

/**
 * La ficha entera de la caja en foco, en UNA lectura: lo que el agente externo
 * necesita para pulirla sin encadenar `get_view` → buscar el nodo → leer la spec.
 */
export interface FocusedElement {
  view: string;
  id: string;
  name: string;
  type: string;
  container?: string;
  description?: string;
  estado?: string;
  tags?: string[];
  spec?: ElementSpec;
  metadata?: { clave: string; valor: string }[];
  /** Índice del material adjunto (nombre, tipo, tamaño): el contenido se pide con `read_element_doc`. */
  attachments: string;
  incoming: { name: string; label?: string }[];
  outgoing: { name: string; label?: string }[];
}

export interface ArtifactBrief {
  title: string;
  /** Tipo del artefacto (drivers, adr, roadmap…). */
  kind: string;
  render: string;
  revision: number;
  createdAt: string;
  /** Tamaño del cuerpo en caracteres: dice si conviene pedirlo entero. */
  chars: number;
  /** Revisiones disponibles del linaje, ascendente. */
  revisions: number[];
}

export interface ArtifactPayload extends ArtifactBrief {
  /** Cuerpo en Markdown (el mismo que ve el humano en el visor). */
  markdown: string;
}

export interface ViewBrief {
  name: string;
  kind: string;
  notation?: NotationId;
  builtin?: boolean;
  /** Elementos de la vista, SIN contar contenedores (0 en vistas Mermaid, que son código). */
  elements: number;
  /** Contenedores (pools, carriles, agregados): aparte, como en get_diagram (#533). */
  containers: number;
  description?: string;
}

export interface ViewPayload extends ViewBrief {
  /** Grafo de la vista (vistas de tipo grafo). */
  graph?: GraphData;
  /** Código Mermaid (vistas Mermaid). */
  mermaidCode?: string;
}

export type AppReadResult =
  | { ok: true; project: string; kind: "artifacts"; artifacts: ArtifactBrief[] }
  | { ok: true; project: string; kind: "artifact"; artifact: ArtifactPayload }
  | { ok: true; project: string; kind: "views"; views: ViewBrief[] }
  | { ok: true; project: string; kind: "view"; view: ViewPayload }
  | { ok: true; project: string; kind: "focused"; element: FocusedElement }
  /** `options` = qué SÍ existe, para que el agente no adivine en el siguiente turno. */
  | { ok: false; error: string; options?: string[] };

/* -------------------------------------------------------------------------- */
/* Selección por nombre                                                       */
/* -------------------------------------------------------------------------- */

/** Normaliza para comparar nombres escritos por un humano o por un modelo. */
export function normalizeRef(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Elige por nombre: exacto normalizado y, si no, el único que lo contiene.
 * Con dos candidatos NO adivina: devuelve null y el llamador ofrece la lista.
 * Un agente que pide "drivers" cuando existe "Drivers de Arquitectura" acierta;
 * uno que pide "vista" con cinco vistas recibe las opciones, no la primera.
 */
export function pickByName<T>(items: T[], ref: string, nameOf: (item: T) => string): T | null {
  const n = normalizeRef(ref);
  if (!n) return null;
  const exacto = items.filter((i) => normalizeRef(nameOf(i)) === n);
  if (exacto.length) return exacto[0];
  const parcial = items.filter((i) => {
    const candidato = normalizeRef(nameOf(i));
    return candidato.includes(n) || n.includes(candidato);
  });
  return parcial.length === 1 ? parcial[0] : null;
}

/* -------------------------------------------------------------------------- */
/* Formato de la respuesta MCP                                                */
/* -------------------------------------------------------------------------- */

/**
 * Tope del cuerpo que viaja en una respuesta. Un artefacto largo entero llena la
 * ventana del cliente y deja al agente sin margen para trabajar; se corta y se
 * dice dónde, que es honesto y accionable (pedir la sección que falta).
 */
export const MAX_ARTIFACT_CHARS = 12_000;

/** Recorta un cuerpo largo dejando dicho el corte (nunca lo esconde). */
export function clampBody(text: string, max = MAX_ARTIFACT_CHARS): string {
  const t = text ?? "";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n… [recortado: ${t.length - max} de ${t.length} caracteres. Pedí una sección concreta si necesitás el resto.]`;
}

export function formatArtifactList(project: string, artifacts: ArtifactBrief[]): string {
  if (!artifacts.length) {
    return `El proyecto "${project}" no tiene artefactos generados. Los crea el agente de IA de la app (panel «Artefactos»).`;
  }
  const rows = artifacts.map(
    (a) =>
      `| ${a.title} | ${a.kind} | ${a.render} | v${a.revision}${
        a.revisions.length > 1 ? ` (de ${a.revisions.length})` : ""
      } | ${a.chars} |`
  );
  return [
    `Artefactos de "${project}" (${artifacts.length}):`,
    "",
    "| Título | Tipo | Render | Revisión | Caracteres |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "Pedí el contenido con `get_artifact` usando el título. La revisión vigente es la última: pasá `revision` sólo si querés una anterior.",
  ].join("\n");
}

export function formatArtifact(project: string, a: ArtifactPayload): string {
  const historia =
    a.revisions.length > 1 ? ` · revisiones disponibles: ${a.revisions.map((r) => `v${r}`).join(", ")}` : "";
  return [
    `# ${a.title} (v${a.revision})`,
    `Proyecto "${project}" · tipo ${a.kind} · render ${a.render} · creado ${a.createdAt}${historia}`,
    "",
    clampBody(a.markdown),
  ].join("\n");
}

export function formatViewList(project: string, views: ViewBrief[]): string {
  if (!views.length) return `El proyecto "${project}" no tiene vistas.`;
  const rows = views.map(
    (v) =>
      `| ${v.name} | ${v.kind}${v.notation ? ` / ${v.notation}` : ""} | ${
        v.builtin ? "sistema" : "custom"
      } | ${textoConteo({ nodes: v.elements, containers: v.containers, edges: 0 })} | ${(v.description || "—").replace(/\s+/g, " ").slice(0, 60)} |`
  );
  return [
    `Vistas de "${project}" (${views.length}):`,
    "",
    "| Vista | Tipo | Origen | Elementos | Descripción |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "Pedí una con `get_view` para ver sus elementos; con `importAs` la traés como diagrama editable y la continuás en vez de rehacerla.",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Del estado del renderer a la respuesta                                     */
/* -------------------------------------------------------------------------- */

/**
 * Lo mínimo que el renderer tiene que aportar de un artefacto. `markdown` ya
 * viene resuelto (`artifactBodyMarkdown`): la conversión de un payload
 * estructurado a texto es del renderer, que es quien tiene el grafo para las
 * citas; acá sólo se agrupa, se elige y se formatea.
 */
export interface ArtifactInput {
  title: string;
  kind: string;
  render: string;
  revision?: number;
  createdAt: string;
  /** Linaje: agrupa las revisiones del MISMO artefacto. */
  lineageId?: string;
  markdown: string;
}

const revOf = (a: ArtifactInput) => (typeof a.revision === "number" && a.revision >= 1 ? a.revision : 1);
const lineOf = (a: ArtifactInput) => a.lineageId || `titulo:${normalizeRef(a.title)}`;

/** Revisiones de un linaje, ascendente. */
function historyOf(items: ArtifactInput[], lineage: string): ArtifactInput[] {
  return items.filter((a) => lineOf(a) === lineage).sort((x, y) => revOf(x) - revOf(y));
}

/**
 * Una fila por ARTEFACTO (linaje), no por revisión: el agente pide "los
 * artefactos" y espera la lista que ve el humano en el panel, no el histórico
 * completo — que igual queda declarado en `revisions`.
 */
export function artifactBriefs(items: ArtifactInput[]): ArtifactBrief[] {
  const linajes = [...new Set(items.map(lineOf))];
  return linajes
    .map((l) => {
      const historia = historyOf(items, l);
      const vigente = historia[historia.length - 1];
      return {
        title: vigente.title,
        kind: vigente.kind,
        render: vigente.render,
        revision: revOf(vigente),
        createdAt: vigente.createdAt,
        chars: (vigente.markdown ?? "").length,
        revisions: historia.map(revOf),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Elige un artefacto por título (y revisión, si se pide una anterior).
 * Devuelve null cuando el título no resuelve a UNO solo: el llamador contesta
 * con las opciones en vez de entregar el artefacto equivocado.
 */
export function selectArtifact(
  items: ArtifactInput[],
  title: string,
  revision?: number
): ArtifactPayload | null {
  const briefs = artifactBriefs(items);
  const elegido = pickByName(briefs, title, (b) => b.title);
  if (!elegido) return null;
  // El linaje sale de los items (el brief es de salida y no lo lleva): cualquier
  // revisión con ese título pertenece al mismo linaje que la vigente.
  const conEseTitulo = items.filter((a) => normalizeRef(a.title) === normalizeRef(elegido.title));
  const linaje = conEseTitulo.length ? lineOf(conEseTitulo[conEseTitulo.length - 1]) : null;
  const candidatos = linaje ? historyOf(items, linaje) : [];
  if (!candidatos.length) return null;
  const pedida = revision
    ? candidatos.find((a) => revOf(a) === revision)
    : candidatos[candidatos.length - 1];
  if (!pedida) return null;
  return {
    title: pedida.title,
    kind: pedida.kind,
    render: pedida.render,
    revision: revOf(pedida),
    createdAt: pedida.createdAt,
    chars: (pedida.markdown ?? "").length,
    revisions: candidatos.map(revOf),
    markdown: pedida.markdown ?? "",
  };
}

/** Vista tal como la tiene el renderer. */
export interface ViewInput {
  name: string;
  kind: string;
  notation?: NotationId;
  builtin?: boolean;
  description?: string;
  graph?: GraphData;
  mermaidCode?: string;
}

export function viewBriefs(views: ViewInput[]): ViewBrief[] {
  return views.map((v) => ({
    name: v.name,
    kind: v.kind,
    notation: v.notation,
    builtin: v.builtin,
    elements: v.graph ? countGraph(v.graph).nodes : 0,
    containers: v.graph ? countGraph(v.graph).containers : 0,
    description: v.description,
  }));
}

export function selectView(views: ViewInput[], name: string): ViewPayload | null {
  const v = pickByName(views, name, (x) => x.name);
  if (!v) return null;
  return {
    name: v.name,
    kind: v.kind,
    notation: v.notation,
    builtin: v.builtin,
    elements: v.graph ? countGraph(v.graph).nodes : 0,
    containers: v.graph ? countGraph(v.graph).containers : 0,
    description: v.description,
    graph: v.graph,
    mermaidCode: v.mermaidCode,
  };
}

/* -------------------------------------------------------------------------- */
/* Resolución de una petición                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Todo lo que hace falta para contestar, inyectado: el renderer aporta los datos
 * (contextos + localStorage) y acá se decide. Así las ramas que importan —proyecto
 * que no existe, título ambiguo, vista sin contenido— se prueban sin React.
 */
export interface AppReadContext {
  /** Proyecto abierto en el lienzo (null en la pantalla de bienvenida). */
  active: { id: string; name: string } | null;
  /** Todos los proyectos guardados. */
  projects: { id: string; name: string }[];
  viewsOf: (projectId: string) => ViewInput[];
  artifactsOf: (projectId: string) => ArtifactInput[];
  /** Ficha abierta en la app (feature 019); null o ausente = ninguna. */
  focus?: AppFocus | null;
}

/**
 * La ficha de la caja en foco, armada desde el grafo de su vista. Devuelve
 * null si la caja ya no está (se borró con la ficha abierta): el llamador lo
 * dice en vez de inventar una caja vacía.
 */
export function focusedElement(view: ViewInput, focus: AppFocus): FocusedElement | null {
  if (!view.graph) return null;
  // El mismo camino que el resto del MCP: el modelo del constructor unifica nodos
  // y contenedores (id `agg-<nombre>`, igual que el lienzo) y trae spec, metadatos
  // y adjuntos ya saneados.
  const model = fromGraphData(view.graph, view.notation ?? view.graph.notation ?? "ddd");
  // Sólo por id: con homónimos, caer al nombre devolvería OTRA caja que la que
  // el humano tenía abierta (y que quizá borró).
  const node = model.nodes.find((n) => n.id === focus.elementId);
  if (!node) return null;
  const nombreDe = (id: string) => model.nodes.find((n) => n.id === id)?.nombre ?? id;
  const vecinos = (propios: (e: { fuente: string; destino: string }) => boolean, otro: (e: { fuente: string; destino: string }) => string) =>
    model.edges
      .filter((e) => propios(e) && e.fuente !== e.destino)
      .map((e) => ({ name: nombreDe(otro(e)), ...(e.descripcion ? { label: e.descripcion } : {}) }));
  return {
    view: view.name,
    id: node.id,
    name: node.nombre,
    type: node.tipo_elemento,
    ...(node.container ? { container: node.container } : {}),
    ...(node.descripcion ? { description: node.descripcion } : {}),
    ...(node.estado_comparativo ? { estado: node.estado_comparativo } : {}),
    ...(node.tags_tecnologia?.length ? { tags: node.tags_tecnologia } : {}),
    ...(node.spec ? { spec: node.spec } : {}),
    ...(node.metadata?.length ? { metadata: node.metadata.map((m) => ({ clave: m.clave, valor: m.valor })) } : {}),
    attachments: formatDocsIndex(node.adjuntos ?? []),
    incoming: vecinos((e) => e.destino === node.id, (e) => e.fuente),
    outgoing: vecinos((e) => e.fuente === node.id, (e) => e.destino),
  };
}

/** La ficha en foco como la lee el agente: todo lo que hay, y qué hacer con ello. */
export function formatFocusedElement(project: string, el: FocusedElement): string {
  const lista = (v: { name: string; label?: string }[]) =>
    v.length ? v.map((x) => `"${x.name}"${x.label ? ` (${x.label})` : ""}`).join(", ") : "—";
  const lines = [
    `# ${el.name} (${el.type}) · id "${el.id}"`,
    `Proyecto "${project}" · vista "${el.view}"${el.container ? ` · dentro de "${el.container}"` : ""}${el.estado ? ` · estado ${el.estado}` : ""}`,
    `Descripción: ${el.description?.trim() || "(sin descripción)"}`,
  ];
  if (el.tags?.length) lines.push(`Tags: ${el.tags.join(", ")}`);
  if (el.metadata?.length) lines.push(`Metadatos: ${el.metadata.map((m) => `${m.clave} = ${m.valor}`).join(" · ")}`);
  lines.push(`Entrantes (quién la llama): ${lista(el.incoming)}`, `Salientes (a quién llama): ${lista(el.outgoing)}`);
  lines.push(
    el.spec ? `Spec actual (JSON):\n${JSON.stringify(el.spec, null, 2)}` : "Spec: todavía no tiene."
  );
  lines.push(el.attachments ? `Adjuntos (pedilos con read_element_doc):\n${el.attachments}` : "Adjuntos: ninguno.");
  lines.push(
    "",
    `Para escribir su contrato donde el humano lo ve: \`set_view_element_spec\` con name "${el.name}" (merge: true conserva lo que ya escribió una persona). Mostrá la propuesta antes de escribir.`
  );
  return lines.join("\n");
}

/** Nombres disponibles, para que el error diga qué SÍ se puede pedir. */
const nombres = <T>(items: T[], nameOf: (i: T) => string) => items.map(nameOf);

export function resolveAppRead(req: AppReadRequest, ctx: AppReadContext): AppReadResult {
  const pedido = (req as { project?: string }).project;
  let proyecto = ctx.active;
  if (pedido) {
    const encontrado = pickByName(ctx.projects, pedido, (p) => p.name);
    if (!encontrado) {
      return {
        ok: false,
        error: `No hay un proyecto que resuelva a "${pedido}".`,
        options: nombres(ctx.projects, (p) => p.name),
      };
    }
    proyecto = encontrado;
  }
  if (!proyecto) {
    return {
      ok: false,
      error:
        "No hay proyecto activo en la app (pantalla de bienvenida). Pasá `project` con el nombre de uno guardado, o pedile al usuario que abra uno.",
      options: nombres(ctx.projects, (p) => p.name),
    };
  }

  if (req.kind === "artifacts") {
    return { ok: true, project: proyecto.name, kind: "artifacts", artifacts: artifactBriefs(ctx.artifactsOf(proyecto.id)) };
  }

  if (req.kind === "focused") {
    const focus = ctx.focus;
    const vistas = ctx.viewsOf(proyecto.id);
    if (!focus) {
      return {
        ok: false,
        error:
          "No hay ninguna ficha abierta en la app. Pedile al humano que abra la caja (doble clic en el lienzo) o que la nombre, y usá get_view para leerla.",
        options: nombres(vistas, (v) => v.name),
      };
    }
    // La vista del foco, por nombre exacto (es el que publicó la propia app).
    const vista = vistas.find((v) => v.name === focus.viewName) ?? selectView(vistas, focus.viewName);
    if (!vista?.graph) {
      return {
        ok: false,
        error: `La ficha abierta es de "${focus.elementName}" en la vista "${focus.viewName}", pero esa vista no tiene un grafo que leer (¿es Mermaid?).`,
        options: nombres(vistas, (v) => v.name),
      };
    }
    const element = focusedElement(vista, focus);
    if (!element) {
      return {
        ok: false,
        error: `La ficha abierta era de "${focus.elementName}", pero esa caja ya no está en la vista "${vista.name}".`,
        options: nombres(vistas, (v) => v.name),
      };
    }
    return { ok: true, project: proyecto.name, kind: "focused", element };
  }

  if (req.kind === "artifact") {
    const items = ctx.artifactsOf(proyecto.id);
    const artifact = selectArtifact(items, req.title, req.revision);
    if (!artifact) {
      const disponibles = artifactBriefs(items);
      return {
        ok: false,
        error: req.revision
          ? `En "${proyecto.name}" no hay un artefacto "${req.title}" con revisión v${req.revision}.`
          : `En "${proyecto.name}" no hay un artefacto que resuelva a "${req.title}" (o el nombre es ambiguo).`,
        options: nombres(disponibles, (a) => `${a.title} (v${a.revision})`),
      };
    }
    return { ok: true, project: proyecto.name, kind: "artifact", artifact };
  }

  if (req.kind === "views") {
    return { ok: true, project: proyecto.name, kind: "views", views: viewBriefs(ctx.viewsOf(proyecto.id)) };
  }

  const views = ctx.viewsOf(proyecto.id);
  const view = selectView(views, req.name);
  if (!view) {
    return {
      ok: false,
      error: `En "${proyecto.name}" no hay una vista que resuelva a "${req.name}" (o el nombre es ambiguo).`,
      options: nombres(views, (v) => v.name),
    };
  }
  if (!view.graph && !view.mermaidCode) {
    return {
      ok: false,
      error: `La vista "${view.name}" existe pero está vacía: no tiene elementos ni código Mermaid.`,
      options: nombres(views, (v) => v.name),
    };
  }
  return { ok: true, project: proyecto.name, kind: "view", view };
}
