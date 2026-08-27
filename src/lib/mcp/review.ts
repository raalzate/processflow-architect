/**
 * @fileOverview Paquete de REVISIÓN HUMANA de un diagrama (PURO).
 *
 * El problema que resuelve: cuando un agente sube diagramas a la app, el humano
 * tiene que decidir si son fieles a la fuente. Si para eso hay que releer el
 * documento y recorrer el lienzo nodo por nodo, la revisión no ocurre — se
 * aprueba por cansancio.
 *
 * Este módulo produce UN artefacto por diagrama, en orden de lectura fijo:
 *   1. la historia (Mermaid, para ver la topología de un golpe),
 *   2. elemento ← fuente (agrupado por contenedor: se contrasta sin buscar),
 *   3. decisiones tomadas y lo que quedó pendiente en la fuente,
 *   4. hallazgos de calidad, graves primero,
 *   5. veredicto y qué falta para poder exportar.
 *
 * Todo lo que el revisor necesita, una sola vez y en el mismo orden siempre: la
 * carga cognitiva baja porque la forma del artefacto no cambia entre diagramas.
 */

import { isContainerType } from "./catalog";
import {
  pendingAmbiguities,
  type BuilderNode,
  type DiagramModel,
  validate,
} from "./diagram-builder";
import { qualityFindings, type QualityFinding } from "./quality";
import { aliasEncontrados, problemasDePropiedades } from "../element-properties";
import { formatMetadata, metadataFaltantes } from "../element-metadata";
import { toMermaid } from "./to-mermaid";

export interface ReviewPacket {
  /** Markdown listo para pegar al humano. */
  markdown: string;
  /** Veredicto legible por máquina: ¿se puede exportar sin corregir? */
  ready: boolean;
  findings: QualityFinding[];
  /** Elementos sin cita de fuente (los que el revisor no puede contrastar). */
  untraced: string[];
  /**
   * Cajas SIN referencias (repo/wiki/dueño). Es un aviso, no un error: un Evento
   * no necesita repositorio. Contesta «¿qué falta enganchar al código?» sin abrir
   * las fichas una por una.
   */
  sinReferencias: string[];
}

const isContainer = (n: BuilderNode) => isContainerType(n.tipo_elemento);

/** Tabla «elemento ← fuente» de un grupo de nodos. */
function sourceTable(nodes: BuilderNode[]): string {
  const rows = nodes.map((n) => {
    const fuente = n.source?.trim() || "— (sin fuente)";
    const detalle = (n.descripcion || "").replace(/\s+/g, " ").trim();
    const corto = detalle.length > 80 ? `${detalle.slice(0, 77)}…` : detalle;
    // Las referencias van en la misma tabla: el revisor contrasta la caja con la
    // fuente Y con el artefacto vivo (repo, wiki) en una sola pasada.
    return `| ${n.nombre} | ${n.tipo_elemento} | ${fuente} | ${formatMetadata(n.metadata) || "—"} | ${corto || "—"} |`;
  });
  return [
    "| Elemento | Tipo | Fuente | Referencias | Detalle |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

/**
 * Construye el paquete de revisión. `sourceLabel` es cómo se llama el material
 * revisado ("PRD Aurora v3", "repo backend") — encabeza el artefacto para que el
 * revisor sepa contra qué contrasta.
 */
export function reviewPacket(model: DiagramModel, sourceLabel?: string): ReviewPacket {
  const nodes = model.nodes.filter((n) => !isContainer(n));
  const containers = model.nodes.filter(isContainer);
  const findings = qualityFindings(model);
  const graves = findings.filter((f) => f.level === "grave");
  const v = validate(model);
  const pendientes = pendingAmbiguities(model);
  const untraced = nodes.filter((n) => !n.source?.trim()).map((n) => n.nombre);
  const sinReferencias = metadataFaltantes([...containers, ...nodes]);
  const decididas = (model.ambiguities ?? []).filter((a) => a.resolucion?.trim());

  const ready = v.errors.length === 0 && graves.length === 0;

  const parts: string[] = [];

  parts.push(
    `# Revisión — ${model.meta.nombre_proyecto} (${model.meta.notation})`,
    sourceLabel ? `Fuente revisada: **${sourceLabel}**` : "",
    `${containers.length} contenedor(es) · ${nodes.length} elemento(s) · ${model.edges.length} relación(es)`
  );

  parts.push(
    "## 1 · La historia",
    "Léela de principio a fin: ¿cuenta lo que dice la fuente?",
    "```mermaid\n" + toMermaid(model) + "\n```"
  );

  parts.push("## 2 · Elemento ← fuente", "Cada fila debe poder defenderse contra la fuente.");
  if (!nodes.length) {
    parts.push("_El diagrama no tiene elementos._");
  } else {
    for (const c of containers) {
      const dentro = nodes.filter((n) => n.container === c.nombre);
      if (!dentro.length) continue;
      parts.push(`### ${c.nombre} (${c.tipo_elemento})`, sourceTable(dentro));
    }
    const sueltos = nodes.filter(
      (n) => !n.container || !containers.some((c) => c.nombre === n.container)
    );
    if (sueltos.length) parts.push("### Sin contenedor", sourceTable(sueltos));
  }
  if (untraced.length) {
    parts.push(
      `⚠️ ${untraced.length} elemento(s) sin fuente: ${untraced.join(", ")}. Sin cita, el revisor no puede contrastarlos.`
    );
  }
  // Propiedades canónicas: lo que falta (obligatorio o no) y los alias, para que
  // el humano vea de un tirón qué hay que completar antes de que esto llegue a
  // quien construye. Los obligatorios ya los frena `validate`; acá se explican.
  const huecos = problemasDePropiedades(model);
  if (huecos.length) {
    parts.push(
      "**Propiedades por completar** (dónde vive y por dónde se le habla):",
      huecos.map((h) => `- ${h.motivo === "falta" ? "❌" : "⚠️"} ${h.detalle}`).join("\n")
    );
  }
  const alias = aliasEncontrados(model);
  if (alias.length) {
    parts.push(
      "ℹ️ Propiedades escritas con un alias (se reconocen, pero conviene normalizarlas): " +
        alias.map((a) => `${a.elemento}: \`${a.escrita}\` → \`${a.canonica}\``).join(" · ")
    );
  }
  if (sinReferencias.length) {
    parts.push(
      `ℹ️ ${sinReferencias.length} caja(s) sin referencias: ${sinReferencias.join(", ")}. Poné al menos \`repo\` o \`wiki\` donde el artefacto exista (con \`update_element\`); no es un error del diagrama.`
    );
  }

  parts.push("## 3 · Decisiones y pendientes");
  if (decididas.length) {
    parts.push(
      "**Decisiones tomadas** (así se resolvió lo que la fuente no cerraba):",
      decididas.map((a) => `- ${a.pregunta} → ${a.resolucion}`).join("\n")
    );
  }
  if (pendientes.length) {
    parts.push(
      "**Pendiente en la fuente** (el diagrama NO lo inventa):",
      pendientes
        .map(
          (a) =>
            `- ${a.pregunta}${a.opciones?.length ? ` (opciones: ${a.opciones.join(" | ")})` : ""}${
              a.afecta ? ` — afecta: ${a.afecta}` : ""
            }`
        )
        .join("\n")
    );
  }
  if (!decididas.length && !pendientes.length) {
    parts.push("_Sin ambigüedades registradas: la fuente decidía todo lo modelado._");
  }

  parts.push("## 4 · Hallazgos");
  if (v.errors.length) {
    parts.push("**Errores de validez** (rompen la importación):\n- " + v.errors.join("\n- "));
  }
  parts.push(
    findings.length
      ? findings
          .map((f) => `- ${f.level === "grave" ? "❌" : "⚠️"} [${f.rule}] ${f.message}`)
          .join("\n")
      : "_Sin hallazgos de calidad._"
  );

  parts.push(
    "## 5 · Veredicto",
    ready
      ? "✅ Listo para exportar. Revisa la tabla del punto 2 y aprueba (o pide cambios puntuales)."
      : `❌ No exportes todavía: ${v.errors.length} error(es) de validez y ${graves.length} hallazgo(s) grave(s). Corrige y vuelve a pedir la revisión.`
  );

  return { markdown: parts.filter(Boolean).join("\n\n"), ready, findings, untraced, sinReferencias };
}
