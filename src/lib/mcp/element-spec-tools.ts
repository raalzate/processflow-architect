/**
 * @fileOverview Especificaciones de elementos por MCP: escribir, leer, reportar (PURO).
 *
 * La ficha de la app deja escribir el contrato de una caja a mano
 * (`element-spec.ts`); esto es lo mismo para un agente externo. Vive acá —y no en
 * `main/services/mcp-tools.ts`— porque lo que DECIDE debe ser puro y tener
 * cobertura: el handler MCP sólo orquesta.
 *
 * Lo que llega de un agente NO se confía: pasa por `sanitizeSpec`, igual que lo
 * que llega de un archivo guardado. Una spec basura deja el diagrama como estaba
 * en vez de reventarlo.
 */

import { isSpecEmpty, patchSpec, sanitizeSpec, specToMarkdown, type ElementSpec } from "../element-spec";
import type { DiagramModel } from "./diagram-builder";

/** Ids de los elementos, para el mensaje de error de un id que no existe. */
const idsDisponibles = (model: DiagramModel): string =>
  model.nodes.map((n) => n.id).join(", ") || "(el diagrama no tiene elementos)";

/**
 * Escribe la especificación de un elemento. Reemplaza la que hubiera: una spec
 * no se fusiona a medias —el resultado sería un contrato que nadie escribió— y
 * el agente que quiera cambiar una parte la lee, la edita y la vuelve a mandar.
 *
 * Una spec vacía BORRA la que había (es la forma de decir «esto ya no aplica»).
 * Con `merge`, en cambio, lo que no viene se conserva y las listas se suman: una
 * spec vacía en ese modo no borra nada.
 *
 * @throws si el id no existe, nombrando los que hay.
 */
export function setElementSpec(
  model: DiagramModel,
  id: string,
  spec: unknown,
  merge = false
): DiagramModel {
  const target = model.nodes.find((n) => n.id === id);
  if (!target) throw new Error(`No existe el elemento "${id}". Los que hay: ${idsDisponibles(model)}.`);
  // `merge` PARCHEA en vez de reemplazar (ver `patchSpec`): así se agrega un
  // requisito sin releer y reenviar el contrato entero, que era el motivo por el
  // que las specs quedaban sin escribir y el detalle terminaba en la descripción.
  const limpia = merge ? patchSpec(target.spec, spec) : sanitizeSpec(spec);
  return {
    ...model,
    nodes: model.nodes.map((n) => (n.id === id ? { ...n, spec: limpia } : n)),
  };
}

/** La especificación de un elemento. @throws si el id no existe. */
export function getElementSpec(model: DiagramModel, id: string): ElementSpec | undefined {
  const target = model.nodes.find((n) => n.id === id);
  if (!target) throw new Error(`No existe el elemento "${id}". Los que hay: ${idsDisponibles(model)}.`);
  return target.spec;
}

/**
 * Markdown de la especificación: de un elemento, o del diagrama entero (una
 * sección por elemento con spec). Es el mismo texto que copia el botón de la
 * ficha, así que lo que se pegue en una issue se ve igual venga de donde venga.
 */
export function specMarkdown(model: DiagramModel, id?: string): string {
  if (id) {
    const target = model.nodes.find((n) => n.id === id);
    if (!target) throw new Error(`No existe el elemento "${id}". Los que hay: ${idsDisponibles(model)}.`);
    return target.spec ? specToMarkdown(target.spec, target.nombre) : "";
  }
  const partes: string[] = [];
  for (const n of model.nodes) {
    if (!n.spec || isSpecEmpty(n.spec)) continue;
    partes.push(`<!-- ${n.nombre} (${n.id}) -->`, specToMarkdown(n.spec, n.nombre));
  }
  return partes.join("\n");
}

/**
 * Tecnologías que un REQUISITO no debería nombrar: un requisito dice qué debe
 * pasar, no con qué se hace. Es una lista corta y declarada a propósito —no una
 * heurística— para que el reporte sea reproducible y ampliable de una línea.
 */
const TECNOLOGIAS = [
  "react", "angular", "vue", "next.js", "nextjs", "node", "nodejs", "java", "spring",
  "kotlin", "python", "django", "flask", "dotnet", ".net", "php", "laravel", "rails",
  "postgres", "postgresql", "mysql", "oracle", "mongodb", "redis", "dynamodb",
  "kafka", "rabbitmq", "sqs", "docker", "kubernetes", "k8s", "aws", "azure", "gcp",
  "lambda", "s3", "graphql", "grpc", "jwt", "oauth",
] as const;

/** Tecnologías nombradas en un texto (palabra completa, sin distinguir mayúsculas). */
export function tecnologiasEn(texto: string): string[] {
  const t = ` ${texto.toLowerCase().replace(/[^a-z0-9. ]+/g, " ")} `;
  return TECNOLOGIAS.filter((tec) => t.includes(` ${tec} `));
}

/** Un criterio de éxito sin ningún número no se puede medir: es un deseo. */
export const criterioEsMedible = (texto: string): boolean => /\d/.test(texto);

/** Estado de la especificación de un elemento. */
export interface SpecEstado {
  id: string;
  nombre: string;
  /** `false` → no tiene spec (o la tiene vacía). */
  tiene: boolean;
  /** Requisitos sin ningún criterio de éxito con el que verificarlos. */
  requisitosSinCriterios: boolean;
  /** Requisitos marcados «necesita aclaración». */
  porAclarar: string[];
  /** Historias sin ningún escenario: no se pueden verificar. */
  historiasSinEscenarios: string[];
  /** Criterios de éxito sin ningún número: no se pueden medir. */
  criteriosSinNumero: string[];
  /** Requisitos que nombran una tecnología (dicen el CÓMO, no el QUÉ). */
  requisitosConTecnologia: { texto: string; tecnologias: string[] }[];
}

export interface SpecReport {
  estados: SpecEstado[];
  /** Nombres sin spec, para el resumen. */
  sinSpec: string[];
  markdown: string;
}

/**
 * Qué falta en las especificaciones del diagrama. No es una validación (una caja
 * sin spec no rompe nada): es la lista de lo que hay que terminar antes de que
 * esto llegue a quien construye.
 */
export function specReport(model: DiagramModel): SpecReport {
  const estados: SpecEstado[] = model.nodes.map((n) => {
    const spec = n.spec;
    const tiene = !!spec && !isSpecEmpty(spec);
    const requisitos = spec?.requirements?.filter((r) => r.texto.trim()) ?? [];
    const criterios = spec?.criteria?.filter((c) => c.texto.trim()) ?? [];
    return {
      id: n.id,
      nombre: n.nombre,
      tiene,
      requisitosSinCriterios: tiene && requisitos.length > 0 && criterios.length === 0,
      porAclarar: requisitos.filter((r) => r.needsClarification).map((r) => r.texto.trim()),
      historiasSinEscenarios: (spec?.stories ?? [])
        .filter((h) => h.titulo.trim() && !h.escenarios.some((e) => e.given || e.when || e.then))
        .map((h) => h.titulo.trim()),
      criteriosSinNumero: criterios.map((c) => c.texto.trim()).filter((t) => !criterioEsMedible(t)),
      requisitosConTecnologia: requisitos
        .map((r) => ({ texto: r.texto.trim(), tecnologias: tecnologiasEn(r.texto) }))
        .filter((r) => r.tecnologias.length > 0),
    };
  });

  const sinSpec = estados.filter((e) => !e.tiene).map((e) => e.nombre);
  const conSpec = estados.filter((e) => e.tiene);

  const lineas: string[] = [`# Especificaciones — ${model.meta.nombre_proyecto}`];
  lineas.push(`${conSpec.length} de ${estados.length} elemento(s) con especificación.`);
  if (sinSpec.length) lineas.push(`**Sin especificación:** ${sinSpec.join(", ")}.`);

  for (const e of conSpec) {
    const faltas: string[] = [];
    if (e.requisitosSinCriterios)
      faltas.push("tiene requisitos pero ningún criterio de éxito con el que verificarlos");
    if (e.historiasSinEscenarios.length)
      faltas.push(`historias sin escenarios: ${e.historiasSinEscenarios.join(", ")}`);
    if (e.criteriosSinNumero.length)
      faltas.push(`criterios sin número (no se pueden medir): ${e.criteriosSinNumero.join(" · ")}`);
    if (e.requisitosConTecnologia.length)
      faltas.push(
        `requisitos que nombran tecnología (dicen el cómo): ${e.requisitosConTecnologia
          .map((r) => `${r.texto} [${r.tecnologias.join(", ")}]`)
          .join(" · ")}`
      );
    if (e.porAclarar.length) faltas.push(`por aclarar: ${e.porAclarar.join(" · ")}`);
    if (faltas.length) lineas.push(`- **${e.nombre}** (${e.id}): ${faltas.join("; ")}`);
  }

  const completas = conSpec.filter(
    (e) =>
      !e.requisitosSinCriterios &&
      !e.historiasSinEscenarios.length &&
      !e.porAclarar.length &&
      !e.criteriosSinNumero.length &&
      !e.requisitosConTecnologia.length
  );
  if (conSpec.length && completas.length === conSpec.length)
    lineas.push("_Las especificaciones que hay están completas._");

  return { estados, sinSpec, markdown: lineas.join("\n") };
}
