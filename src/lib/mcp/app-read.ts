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
import { countGraph } from "./app-state";

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
  | { kind: "view"; name: string; project?: string };

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
  /** Elementos de la vista (0 en vistas Mermaid, que son código). */
  elements: number;
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
      } | ${v.elements} | ${(v.description || "—").replace(/\s+/g, " ").slice(0, 60)} |`
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
