/**
 * @fileOverview Reglas de CALIDAD de diseño de un diagrama (PURO).
 *
 * `validate()` (diagram-builder) responde "¿la app puede importar esto?".
 * Esto responde otra pregunta, la que importa para un revisor humano: "¿el
 * diagrama está bien MODELADO?" — ¿hay un inicio?, ¿las ramas de la decisión
 * dicen su condición?, ¿la cadena Comando→Evento existe?, ¿las relaciones C4
 * declaran su tecnología?, ¿los nombres caben en el lienzo?
 *
 * Las reglas SEMÁNTICAS (flujo, ramas, cadena, política, relación sin
 * etiqueta, contenedor vacío, descripción, fuente) ya no viven acá: son FORMAS
 * de la ontología declaradas sobre roles en `NOTATION_SHAPES` (spec 027) y
 * se evalúan con `ontology/validate.ts`. Acá quedan las VISUALES: lo que
 * depende de cómo se dibuja, no de qué significa.
 *
 * Un hallazgo NO rompe la importación: `grave` = el diagrama no es defendible
 * como modelo; `aviso` = mejora recomendada.
 */

import { getNotation } from "../notations";
import { conocimientoDeModelo } from "../ontology/conocimiento";
import { validar } from "../ontology/validate";
import { MAX_FOCAL } from "../skin";
import { esIconoValido } from "../icons/catalog";
import { isContainerType } from "./catalog";
import { hayProblemaDeLegibilidad } from "../layout/metrics";
import { medirDisposicion } from "../layout/legible";
import { problemasDeNumeracion } from "./numeracion";
import {
  layout,
  MAX_EDGE_LABEL_CHARS,
  MAX_NAME_CHARS,
  type BuilderNode,
  type DiagramModel,
} from "./diagram-builder";

export interface QualityFinding {
  level: "grave" | "aviso";
  /** Regla que lo produjo (estable, para citarla en la revisión). */
  rule: string;
  message: string;
  /** Elemento afectado, si el hallazgo es puntual. */
  nodeId?: string;
}

// Los límites de texto derivan de la geometría real del lienzo (diagram-builder),
// no de números elegidos a ojo: un umbral inventado deja pasar nombres que se
// recortan, que es justo lo que pasó con los diagramas de Geiser.
export { MAX_NAME_CHARS, MAX_EDGE_LABEL_CHARS } from "./diagram-builder";

/** Nodos (sin contar contenedores) a partir de los cuales el lienzo pierde legibilidad. */
export const MAX_NODES = 40;

/** Vive en el registro, junto a la forma DESCRIPCION-POBRE que lo usa. */
export { MIN_PALABRAS_DESCRIPCION } from "../notations";

const isContainer = (n: BuilderNode) => isContainerType(n.tipo_elemento);

/**
 * Reglas de presentación: el lienzo dibuja cajas de tamaño acotado y un nombre
 * largo se recorta; pasado cierto tamaño el diagrama deja de leerse. Son las dos
 * cosas que hacen que un modelo correcto se vea poco profesional.
 */
function presentationFindings(model: DiagramModel): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const nodes = model.nodes.filter((n) => !isContainer(n));

  for (const n of nodes) {
    if (n.nombre.length > MAX_NAME_CHARS) {
      findings.push({
        level: "aviso",
        rule: "NOMBRE-LARGO",
        message: `"${n.nombre}" (${n.nombre.length} caracteres) se recortará en el lienzo: déjalo en ~${MAX_NAME_CHARS} y mueve el detalle a la descripción.`,
        nodeId: n.id,
      });
    }
  }

  // Etiqueta de arista: se dibuja suelta sobre la línea, sin caja. Pasada cierta
  // longitud invade los nodos vecinos y, con varias juntas, tapa el diagrama.
  const nombre = new Map(model.nodes.map((n) => [n.id, n.nombre]));
  for (const e of model.edges) {
    const label = e.descripcion?.trim() ?? "";
    if (label.length <= MAX_EDGE_LABEL_CHARS) continue;
    findings.push({
      level: "aviso",
      rule: "ETIQUETA-LARGA",
      message: `La relación "${nombre.get(e.fuente) ?? e.fuente}" → "${nombre.get(e.destino) ?? e.destino}" tiene una etiqueta de ${label.length} caracteres ("${label}"): déjala en ~${MAX_EDGE_LABEL_CHARS} (verbo + [tecnología]) y mueve el detalle a la descripción; sobre la línea no hay caja que la acote y tapa los nodos vecinos.`,
    });
  }

  // Icono de tecnología (spec 025): un id que no está en el catálogo se
  // dibuja con el icono del tipo y nadie se entera, salvo por acá.
  for (const n of model.nodes) {
    if (n.icono && !esIconoValido(n.icono)) {
      findings.push({
        level: "aviso",
        rule: "ICONO",
        message: `"${n.nombre}" pide el icono "${n.icono}", que no está en el catálogo: se dibuja con el icono de su tipo. Buscá uno válido con list_icons.`,
        nodeId: n.id,
      });
    }
  }

  if (nodes.length > MAX_NODES) {
    findings.push({
      level: "aviso",
      rule: "TAMANO",
      message: `${nodes.length} elementos superan los ~${MAX_NODES} legibles: divide el diagrama por fases o subprocesos y entrégalo como varias vistas.`,
    });
  }

  return findings;
}

/**
 * Presupuesto de COMPLEJIDAD de la notación (`Notation.budget`). `TAMANO` dice
 * cuándo el lienzo deja de caber; esto dice cuándo el diagrama deja de leerse
 * de un vistazo, que llega mucho antes: un paisaje C4 con 20 sistemas cabe en
 * pantalla y no cuenta nada. La salida no es «quitá cosas» sino «partí en una
 * vista panorámica y vistas de detalle» (ADR 0002): la profundidad en esta app
 * se da por vistas, y `suggest_views` propone el corte. Una notación sin
 * presupuesto (dibujo libre) no produce hallazgos. Adaptado de diagram-design
 * (ADR 0006).
 */
function budgetFindings(model: DiagramModel): QualityFinding[] {
  const budget = getNotation(model.meta.notation).budget;
  if (!budget) return [];
  const findings: QualityFinding[] = [];
  const contenedores = model.nodes.filter(isContainer);
  const nodes = model.nodes.filter((n) => !isContainer(n));
  const partir =
    "Partí el diagrama en una vista panorámica y vistas de detalle (suggest_views propone el corte) en vez de apretar más en una sola.";

  if (nodes.length > budget.nodos) {
    findings.push({
      level: "aviso",
      rule: "PRESUPUESTO",
      message: `${nodes.length} elementos superan el presupuesto de ${budget.nodos} con que un diagrama de esta notación se lee de un vistazo. ${partir}`,
    });
  }
  if (model.edges.length > budget.relaciones) {
    findings.push({
      level: "aviso",
      rule: "PRESUPUESTO",
      message: `${model.edges.length} relaciones superan el presupuesto de ${budget.relaciones}: con más de eso las líneas se cruzan y ninguna se sigue. ${partir}`,
    });
  }
  if (budget.contenedores !== undefined && contenedores.length > budget.contenedores) {
    findings.push({
      level: "aviso",
      rule: "PRESUPUESTO",
      message: `${contenedores.length} contenedores superan el presupuesto de ${budget.contenedores} (${contenedores
        .slice(0, 4)
        .map((c) => `"${c.nombre}"`)
        .join(", ")}${contenedores.length > 4 ? "…" : ""}). ${partir}`,
    });
  }
  if (budget.porContenedor !== undefined) {
    for (const c of contenedores) {
      const dentro = nodes.filter((n) => n.container === c.nombre).length;
      if (dentro <= budget.porContenedor) continue;
      findings.push({
        level: "aviso",
        rule: "PRESUPUESTO",
        message: `"${c.nombre}" tiene ${dentro} elementos; el presupuesto por contenedor es ${budget.porContenedor}. Lo que no entra suele ser otra fase o un subproceso: dale su propia vista.`,
        nodeId: c.id,
      });
    }
  }
  return findings;
}

/**
 * Legibilidad de la DISPOSICIÓN (feature 017). No habla del modelado sino de lo
 * que se ve: una relación que atraviesa una caja ajena se lee mal por buena que
 * sea la semántica, y sin número "quedó feo" no es accionable. El umbral es el
 * declarado en el spec (C2): cualquier paso sobre caja, o cruces por encima del
 * 10% de las relaciones.
 */
function legibilidadFindings(model: DiagramModel): QualityFinding[] {
  // Se mide sobre el diagrama DISPUESTO: `layout()` respeta la geometría que ya
  // tenga, así que esto es exactamente lo que verá quien lo abra.
  const medida = medirDisposicion(layout(model)).legibilidad.antes;
  if (!hayProblemaDeLegibilidad(medida)) return [];
  const partes: string[] = [];
  if (medida.sobreCaja > 0)
    partes.push(`${medida.sobreCaja} relación(es) atraviesan una caja que no es su extremo`);
  if (medida.relaciones > 0 && medida.cruces > medida.relaciones * 0.1)
    partes.push(`${medida.cruces} cruces sobre ${medida.relaciones} relaciones (más del 10%)`);
  if (medida.solape > 0) partes.push(`${medida.solape} par(es) de relaciones van encimadas por el mismo corredor`);
  // Las dos reglas de conector de diagram-design (ADR 0006 · #538): cada punta
  // con su propio anclaje, y ninguna etiqueta debajo de una caja ajena.
  if (medida.etiquetasTapadas > 0)
    partes.push(`${medida.etiquetasTapadas} etiqueta(s) de relación quedan tapadas por una caja ajena`);
  if (medida.anclajesCompartidos > 0)
    partes.push(`${medida.anclajesCompartidos} par(es) de relaciones nacen o mueren en el mismo punto de una caja`);
  return [
    {
      level: "aviso",
      rule: "LEGIBILIDAD",
      message: `${partes.join(", ")}. Probá relayout_diagram con otra estrategia; si persiste, suele sobrar una relación o faltar una banda.`,
    },
  ];
}

/**
 * Focos (spec 022): los hotspots son lo ÚNICO que lleva acento en la skin
 * editorial, y el acento señala sólo mientras es escaso. Con más de `MAX_FOCAL`
 * el lector no sabe a dónde mirar primero. Aplica en cualquier skin: el consejo
 * de elegir qué importa vale aunque hoy se vea canónico.
 */
function focalFindings(model: DiagramModel): QualityFinding[] {
  const hotspots = model.meta.hotspots ?? [];
  if (hotspots.length <= MAX_FOCAL) return [];
  return [
    {
      level: "aviso",
      rule: "ACENTO",
      message: `${hotspots.length} hotspots (${hotspots.slice(0, 4).join(", ")}${hotspots.length > 4 ? "…" : ""}) superan los ${MAX_FOCAL} que el acento puede señalar: elegí cuáles importan de verdad y bajá el resto a notas, o partí en vistas con un foco cada una.`,
    },
  ];
}

/**
 * Pasos de un flujo sin numerar, fuera de orden o repetidos (#618). Por MCP se
 * numeran solos al guardar; esto atrapa lo que llegó de otro lado (un import, una
 * edición a mano) y lo dice antes de que el humano lo lea mal.
 */
function numeracionFindings(model: DiagramModel): QualityFinding[] {
  return problemasDeNumeracion(model).map((message) => ({ level: "aviso" as const, rule: "NUMERACION", message }));
}

/** Las formas que se leen ANTES de la legibilidad (de qué está hecho cada elemento). */
const DE_ELEMENTO = new Set(["FUENTE-SIN-ADJUNTAR", "DESCRIPCION-POBRE"]);

/**
 * Hallazgos SEMÁNTICOS: los dicen las formas de la ontología (spec 027 · T21,
 * FR-023), evaluadas sobre el diagrama ya razonado. Mismo id, mismo mensaje y
 * mismo nodo que cuando eran código acá: lo prueba `quality-parity.test.ts`.
 */
function semanticFindings(model: DiagramModel): QualityFinding[] {
  return validar(conocimientoDeModelo(model)).map((h) => ({
    level: h.severidad === "error" ? ("grave" as const) : ("aviso" as const),
    rule: h.forma,
    message: h.mensaje,
    ...(h.nodo !== undefined ? { nodeId: h.nodo } : {}),
  }));
}

/**
 * Todos los hallazgos de calidad, en orden de lectura: foco, numeración, de qué
 * está hecho cada elemento, legibilidad, semántica (flujo → dominio →
 * arquitectura → contenedores), presentación y presupuesto; los `grave` primero.
 */
export function qualityFindings(model: DiagramModel): QualityFinding[] {
  const semanticas = semanticFindings(model);
  const all = [
    ...focalFindings(model),
    ...numeracionFindings(model),
    ...semanticas.filter((f) => DE_ELEMENTO.has(f.rule)),
    ...legibilidadFindings(model),
    ...semanticas.filter((f) => !DE_ELEMENTO.has(f.rule)),
    ...presentationFindings(model),
    ...budgetFindings(model),
  ];
  return [...all.filter((f) => f.level === "grave"), ...all.filter((f) => f.level === "aviso")];
}

/** A partir de cuántos hallazgos de la MISMA regla se resumen en una línea. */
const AGRUPAR_DESDE = 4;

/**
 * Hallazgos formateados para respuesta MCP. Cuando una regla se repite muchas
 * veces (29 nombres largos, 23 etiquetas largas) se resume en una línea con los
 * primeros ejemplos: 58 líneas de hallazgos no se leen, y un informe que no se
 * lee no corrige nada — el mismo motivo por el que existe el paquete de revisión.
 */
export function formatFindings(findings: QualityFinding[]): string {
  if (!findings.length) return "Sin hallazgos de calidad.";

  const porRegla = new Map<string, QualityFinding[]>();
  for (const f of findings) (porRegla.get(f.rule) ?? porRegla.set(f.rule, []).get(f.rule)!).push(f);

  const lines: string[] = [];
  for (const [rule, items] of porRegla) {
    const icono = items.some((f) => f.level === "grave") ? "❌" : "⚠️";
    if (items.length < AGRUPAR_DESDE) {
      lines.push(...items.map((f) => `${f.level === "grave" ? "❌" : "⚠️"} [${rule}] ${f.message}`));
      continue;
    }
    const muestra = items.slice(0, 3).map((f) => f.message);
    lines.push(
      `${icono} [${rule}] ${items.length} casos. Ejemplos:\n   - ${muestra.join("\n   - ")}\n   (+${items.length - muestra.length} más con el mismo arreglo)`
    );
  }
  return lines.join("\n");
}
