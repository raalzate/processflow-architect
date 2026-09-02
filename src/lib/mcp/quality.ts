/**
 * @fileOverview Reglas de CALIDAD de diseño de un diagrama (PURO).
 *
 * `validate()` (diagram-builder) responde "¿la app puede importar esto?".
 * Esto responde otra pregunta, la que importa para un revisor humano: "¿el
 * diagrama está bien MODELADO?" — ¿hay un inicio?, ¿las ramas de la decisión
 * dicen su condición?, ¿la cadena Comando→Evento existe?, ¿las relaciones C4
 * declaran su tecnología?, ¿los nombres caben en el lienzo?
 *
 * Las reglas se escriben sobre ROLES semánticos (`roleOfType` de
 * `../notations`), nunca sobre literales de tipo: una notación nueva hereda las
 * reglas con sólo declarar sus roles (P6 — el arnés es agnóstico de notación).
 *
 * Un hallazgo NO rompe la importación: `grave` = el diagrama no es defendible
 * como modelo; `aviso` = mejora recomendada.
 */

import { hasRole, roleOfType, typesWithRole, type ElementRole } from "../notations";
import { resolveCita } from "../source-docs";
import { isContainerType } from "./catalog";
import {
  MAX_EDGE_LABEL_CHARS,
  MAX_NAME_CHARS,
  type BuilderEdge,
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

const isContainer = (n: BuilderNode) => isContainerType(n.tipo_elemento);

/** Índices de aristas por extremo (sin recorrer el array en cada regla). */
function indexEdges(edges: BuilderEdge[]) {
  const out = new Map<string, BuilderEdge[]>();
  const inc = new Map<string, BuilderEdge[]>();
  for (const e of edges) {
    (out.get(e.fuente) ?? out.set(e.fuente, []).get(e.fuente)!).push(e);
    (inc.get(e.destino) ?? inc.set(e.destino, []).get(e.destino)!).push(e);
  }
  return { out, inc };
}

/**
 * Reglas de flujo: existe un arranque, los caminos cierran y cada bifurcación
 * dice por qué se toma cada rama. Aplica a cualquier notación que declare los
 * roles `start`/`end`/`gateway` (hoy BPMN y UML).
 */
function flowFindings(model: DiagramModel): QualityFinding[] {
  const { notation } = model.meta;
  const findings: QualityFinding[] = [];
  const nodes = model.nodes.filter((n) => !isContainer(n));
  const { out, inc } = indexEdges(model.edges);

  const roleIn = (n: BuilderNode, ...roles: ElementRole[]) =>
    hasRole(notation, n.tipo_elemento, ...roles);

  const hasStartRole = typesWithRole(notation, "start").length > 0;
  const hasEndRole = typesWithRole(notation, "end").length > 0;
  const tasks = nodes.filter((n) => roleIn(n, "task"));

  if (hasStartRole && tasks.length > 0) {
    const starts = nodes.filter((n) => roleIn(n, "start"));
    if (!starts.length) {
      findings.push({
        level: "grave",
        rule: "FLUJO-INICIO",
        message: `El proceso no tiene arranque: añade un nodo de tipo ${typesWithRole(notation, "start").join(" o ")} y conéctalo al primer paso.`,
      });
    }
    // Un Pool es un proceso independiente: exactamente un arranque cada uno.
    const pools = model.nodes.filter((n) => roleIn(n, "pool"));
    for (const pool of pools) {
      const dentro = starts.filter((s) => s.container === pool.nombre);
      if (dentro.length > 1) {
        findings.push({
          level: "aviso",
          rule: "FLUJO-INICIO",
          message: `"${pool.nombre}" tiene ${dentro.length} arranques (${dentro.map((s) => s.nombre).join(", ")}); un participante arranca su proceso una sola vez.`,
          nodeId: pool.id,
        });
      }
    }
  }

  if (hasEndRole && tasks.length > 0) {
    const ends = nodes.filter((n) => roleIn(n, "end"));
    if (!ends.length) {
      findings.push({
        level: "grave",
        rule: "FLUJO-FIN",
        message: `Ningún camino termina: añade al menos un nodo de tipo ${typesWithRole(notation, "end").join(" o ")} (uno por desenlace distinto).`,
      });
    }
    // Un nodo de trabajo o decisión sin salidas deja el flujo colgando.
    for (const n of nodes) {
      if (!roleIn(n, "task", "gateway")) continue;
      if (!(out.get(n.id)?.length ?? 0)) {
        findings.push({
          level: "aviso",
          rule: "FLUJO-FIN",
          message: `"${n.nombre}" no tiene continuación; el camino queda colgando sin llegar a un cierre.`,
          nodeId: n.id,
        });
      }
    }
  }

  for (const n of nodes) {
    if (!roleIn(n, "gateway")) continue;
    const salidas = out.get(n.id) ?? [];
    if (salidas.length < 2) {
      findings.push({
        level: "aviso",
        rule: "RAMAS",
        message: `"${n.nombre}" es una decisión con ${salidas.length} salida(s): una decisión que no bifurca es una tarea.`,
        nodeId: n.id,
      });
    }
    const sinCondicion = salidas.filter((e) => !e.descripcion?.trim());
    if (sinCondicion.length) {
      findings.push({
        level: "grave",
        rule: "RAMAS",
        message: `"${n.nombre}" tiene ${sinCondicion.length} rama(s) sin condición: etiqueta cada arista con su caso (Sí / No / la condición de la fuente).`,
        nodeId: n.id,
      });
    }
    if (!/[?¿]/.test(n.nombre)) {
      findings.push({
        level: "aviso",
        rule: "DECISION-PREGUNTA",
        message: `"${n.nombre}" es una decisión: nómbrala como pregunta ("¿Hay stock?") para que sus ramas se lean solas.`,
        nodeId: n.id,
      });
    }
    if (!(inc.get(n.id)?.length ?? 0)) {
      findings.push({
        level: "aviso",
        rule: "RAMAS",
        message: `"${n.nombre}" no recibe flujo: una decisión evalúa el resultado de un paso anterior.`,
        nodeId: n.id,
      });
    }
  }

  return findings;
}

/**
 * Reglas de dominio: la cadena Comando → Evento y el papel de la Política
 * (reacciona a un hecho disparando otra intención). Aplica a cualquier notación
 * que declare esos roles (hoy DDD).
 */
function domainFindings(model: DiagramModel): QualityFinding[] {
  const { notation } = model.meta;
  if (!typesWithRole(notation, "command").length) return [];
  const findings: QualityFinding[] = [];
  const nodes = model.nodes.filter((n) => !isContainer(n));
  const { out, inc } = indexEdges(model.edges);
  const roleOf = (id: string): ElementRole | undefined => {
    const n = model.nodes.find((x) => x.id === id);
    return n ? roleOfType(notation, n.tipo_elemento) : undefined;
  };

  for (const n of nodes) {
    const role = roleOfType(notation, n.tipo_elemento);
    if (role === "command") {
      const produceEvento = (out.get(n.id) ?? []).some((e) => roleOf(e.destino) === "event");
      if (!produceEvento) {
        findings.push({
          level: "aviso",
          rule: "CADENA",
          message: `"${n.nombre}" no produce ningún hecho: todo comando termina en un evento (en pasado) que registre su resultado.`,
          nodeId: n.id,
        });
      }
    }
    if (role === "event") {
      const tieneOrigen = (inc.get(n.id) ?? []).some((e) =>
        ["command", "policy", "actor", "external", "task"].includes(roleOf(e.fuente) ?? "")
      );
      if (!tieneOrigen) {
        findings.push({
          level: "aviso",
          rule: "CADENA",
          message: `"${n.nombre}" ocurre sin causa visible: conéctalo al comando (o al actor/sistema) que lo dispara.`,
          nodeId: n.id,
        });
      }
    }
    if (role === "policy") {
      const escucha = (inc.get(n.id) ?? []).some((e) => roleOf(e.fuente) === "event");
      const dispara = (out.get(n.id) ?? []).some((e) => roleOf(e.destino) === "command");
      if (!escucha || !dispara) {
        findings.push({
          level: "aviso",
          rule: "POLITICA",
          message: `"${n.nombre}" no cierra el patrón "cuando <evento> entonces <comando>"${
            escucha ? " (le falta el comando que dispara)" : " (le falta el evento que la activa)"
          }.`,
          nodeId: n.id,
        });
      }
    }
  }

  return findings;
}

/**
 * Reglas de arquitectura: en un paisaje de sistemas una flecha sin etiqueta no
 * dice nada (¿quién llama a quién, con qué protocolo?). Aplica a las notaciones
 * con rol `system` (hoy C4).
 */
function architectureFindings(model: DiagramModel): QualityFinding[] {
  const { notation } = model.meta;
  if (!typesWithRole(notation, "system").length) return [];
  const nombre = new Map(model.nodes.map((n) => [n.id, n.nombre]));
  return model.edges
    .filter((e) => !e.descripcion?.trim())
    .map((e) => ({
      level: "grave" as const,
      rule: "RELACION-SIN-ETIQUETA",
      message: `"${nombre.get(e.fuente) ?? e.fuente}" → "${nombre.get(e.destino) ?? e.destino}" sin etiqueta: en un paisaje de sistemas toda relación lleva verbo + tecnología ("consulta inventario [SQL]").`,
    }));
}

/**
 * Reglas de presentación: el lienzo dibuja cajas de tamaño acotado y un nombre
 * largo se recorta; pasado cierto tamaño el diagrama deja de leerse. Son las dos
 * cosas que hacen que un modelo correcto se vea poco profesional.
 */
function presentationFindings(model: DiagramModel): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const nodes = model.nodes.filter((n) => !isContainer(n));

  // Contenedor sin hijos: el lienzo dibuja bandas/marcos PLANOS (no hay
  // anidamiento contenedor→contenedor en el formato), así que un Pool con sus
  // Carriles al lado deja el Pool vacío y una banda en blanco en el diagrama.
  for (const c of model.nodes.filter(isContainer)) {
    if (nodes.some((n) => n.container === c.nombre)) continue;
    findings.push({
      level: "aviso",
      rule: "CONTENEDOR-VACIO",
      message: `"${c.nombre}" (${c.tipo_elemento}) no contiene elementos: el lienzo lo dibujaría como una banda vacía. Los contenedores no se anidan entre sí — elige UN nivel (participante o rol) y pon los elementos dentro, o elimínalo.`,
      nodeId: c.id,
    });
  }

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
 * Todos los hallazgos de calidad, en orden de lectura: flujo → dominio →
 * arquitectura → presentación, y dentro de cada bloque los `grave` primero.
 */
/**
 * Citas que nombran un documento que el diagrama NO tiene adjunto. Una cita así
 * sostiene la revisión sólo para quien tenga el archivo delante: dentro de la app
 * —y para el agente que responde ahí— es un puntero a la nada (feature 012).
 */
function sourceFindings(model: DiagramModel): QualityFinding[] {
  const docs = model.sources ?? [];
  const faltan = new Map<string, string[]>();
  for (const n of model.nodes) {
    const r = resolveCita(docs, n.source);
    if (r.estado !== "falta") continue;
    (faltan.get(r.doc) ?? faltan.set(r.doc, []).get(r.doc)!).push(n.nombre);
  }
  return [...faltan].map(([doc, nodos]) => ({
    level: "aviso" as const,
    rule: "FUENTE-SIN-ADJUNTAR",
    message: `${nodos.length} elemento(s) citan "${doc}", que no está adjunto al diagrama (${nodos
      .slice(0, 3)
      .join(", ")}${nodos.length > 3 ? "…" : ""}): dentro de la app esa cita no lleva a ningún lado. Adjuntalo con attach_source usando ESE nombre.`,
  }));
}

export function qualityFindings(model: DiagramModel): QualityFinding[] {
  const all = [
    ...sourceFindings(model),
    ...flowFindings(model),
    ...domainFindings(model),
    ...architectureFindings(model),
    ...presentationFindings(model),
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
