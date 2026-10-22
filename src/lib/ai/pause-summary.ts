/**
 * @fileOverview Qué se está aprobando en una pausa del agente (#613). PURO.
 *
 * La tarjeta del plan mostraba el título y la lista de secciones con sus fuentes:
 * el CÓMO, pero no el QUÉ ni el efecto. El usuario veía «Aprobar y generar» sin
 * saber si iba a nacer un artefacto nuevo o a pisar uno que ya tenía, y aprobaba
 * a ciegas o cancelaba. Este módulo arma ese párrafo:
 *
 *  - **qué**: lo escribe el modelo (`summary`) si lo dio; si no, se arma acá con
 *    el título, el tipo y las fuentes. Un modelo local no siempre lo manda, y la
 *    tarjeta no puede quedar muda por eso.
 *  - **efecto**: SIEMPRE determinista. Si va a ser una revisión nueva lo sabe el
 *    linaje (`versioning.ts`), no el modelo: dejárselo al modelo sería pedirle que
 *    adivine algo que el estado ya sabe.
 *
 * Lo mismo para las preguntas: el porqué lo da el modelo (`why`) o un texto
 * genérico honesto, y siempre se dice qué pasa con «No sé».
 */

import type { AgentPause, Artifact } from "../agent-types";
import { currentRevision, lineageKey, type VersionedState } from "../artifacts/versioning";

type PlanPause = Extract<AgentPause, { kind: "plan" }>;
type QuestionPause = Extract<AgentPause, { kind: "question" }>;

/** Tope del texto que viene del modelo: es un párrafo, no un documento. */
export const MAX_RESUMEN = 400;

/** Recorta y limpia lo que manda el modelo; vacío → `undefined` (cae al determinista). */
export function textoDelModelo(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > MAX_RESUMEN ? `${t.slice(0, MAX_RESUMEN - 1).trimEnd()}…` : t;
}

/** «A», «A y B», «A, B y C». */
function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/** La revisión vigente del artefacto que este plan reemplazaría, si existe. */
export function revisionQueReemplaza(
  plan: Pick<PlanPause, "artifactKind" | "title">,
  estado: VersionedState,
  versionId: string
): Artifact | undefined {
  const key = lineageKey(plan.artifactKind, plan.title);
  const linaje = estado.lineages.find((l) => l.versionId === versionId && l.key === key);
  return linaje ? currentRevision(estado.artifacts, linaje.id) : undefined;
}

export interface ResumenDePlan {
  /** Qué va a generar y con qué. */
  que: string;
  /** Qué cambia al aprobar: artefacto nuevo o revisión nueva. */
  efecto: string;
}

/**
 * El párrafo de la tarjeta del plan. `tipo` es la etiqueta legible del kind
 * («Documento de arquitectura»); `existente`, la revisión que se reemplazaría.
 */
export function resumenDelPlan(
  plan: PlanPause,
  opts: { tipo?: string; existente?: Pick<Artifact, "title" | "revision"> } = {}
): ResumenDePlan {
  const tipo = opts.tipo?.trim() || plan.artifactKind;
  const fuentes = Array.from(new Set(plan.sections.flatMap((s) => s.sources).filter(Boolean)));
  const secciones = plan.sections.length;
  const que =
    textoDelModelo(plan.summary) ??
    `Va a generar «${plan.title}» (${tipo})` +
      (secciones ? ` en ${secciones} ${secciones === 1 ? "sección" : "secciones"}` : "") +
      (fuentes.length ? `, a partir de ${enumerar(fuentes)}.` : ".");
  const efecto = opts.existente
    ? `Ya existe «${opts.existente.title}»: al aprobar se crea la revisión ${(opts.existente.revision ?? 1) + 1} y la anterior queda en el historial.`
    : "Al aprobar se crea un artefacto nuevo y se abre para que lo revises. No cambia tus vistas ni el diagrama.";
  return { que, efecto };
}

/** Por qué pregunta el agente y qué pasa si el humano no sabe. */
export function porQueDeLaPregunta(q: QuestionPause): string {
  const porque =
    textoDelModelo(q.why) ?? "La respuesta cambia lo que se va a generar: cada opción lleva a un resultado distinto.";
  const supuesto = q.options[0] ? ` Si no sabés, sigue con «${q.options[0]}» y lo declara como supuesto.` : "";
  return `${porque}${supuesto}`;
}

/**
 * Cuál de los artefactos creados abrir al terminar la corrida: el del tipo que se
 * aprobó en el plan si está, y si no, el último. Varios a la vez no se abren:
 * el resto queda a un clic en el mensaje.
 */
export function artefactoPrincipal(
  creados: readonly Artifact[],
  kindDelPlan?: string
): Artifact | undefined {
  const delPlan = kindDelPlan ? creados.filter((a) => a.kind === kindDelPlan) : [];
  return (delPlan.length ? delPlan : creados)[(delPlan.length ? delPlan : creados).length - 1];
}

/**
 * ¿Se abre solo? Sólo si el humano está mirando: con la ventana sin foco o
 * escribiendo otra cosa en el chat, abrir un diálogo le roba el foco. En esos
 * casos queda el botón «Abrir» en el mensaje.
 */
export function abrirAlTerminar(ctx: { ventanaActiva: boolean; escribiendo: boolean; otroDialogoAbierto: boolean }): boolean {
  return ctx.ventanaActiva && !ctx.escribiendo && !ctx.otroDialogoAbierto;
}
