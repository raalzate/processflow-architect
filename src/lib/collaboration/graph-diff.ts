import { encodeGraph } from "./graph-codec";
import type { Agregado, GraphData, GraphLink, GraphNode } from "../types";

export type DiffStatusKind = "added" | "removed" | "modified" | "moved";

export interface ElementDiffMark {
  kind: DiffStatusKind;
  fields: string[];
}

export interface GraphDiffResult {
  beforeNodes: Map<string, ElementDiffMark>;
  afterNodes: Map<string, ElementDiffMark>;
  beforeLinks: Map<string, ElementDiffMark>;
  afterLinks: Map<string, ElementDiffMark>;
  counts: {
    added: number;
    removed: number;
    modified: number;
    moved: number;
  };
}

type ContainerMeta = Omit<Agregado, "nodos" | "aristas">;

function containerKey(c: ContainerMeta): string {
  return c.id || `agg-${c.nombre_agregado}`;
}

function compareContainer(a: ContainerMeta, b: ContainerMeta): ElementDiffMark | undefined {
  const fields: string[] = [];
  if (a.nombre_agregado !== b.nombre_agregado) fields.push("Nombre");
  if ((a.tipo_contenedor ?? "") !== (b.tipo_contenedor ?? "")) fields.push("Tipo");
  if (
    ((a.descripcion || a.entidad_raiz || "").trim()) !==
    ((b.descripcion || b.entidad_raiz || "").trim())
  ) {
    fields.push("Descripción");
  }
  if (JSON.stringify(a.metadata ?? []) !== JSON.stringify(b.metadata ?? [])) {
    fields.push("Referencias");
  }
  if (JSON.stringify(a.spec ?? null) !== JSON.stringify(b.spec ?? null)) {
    fields.push("Especificación");
  }
  if ((a.fuente ?? "").trim() !== (b.fuente ?? "").trim()) fields.push("Fuente");
  if ((a.estado_comparativo ?? "nuevo") !== (b.estado_comparativo ?? "nuevo")) {
    fields.push("Estado comparativo");
  }
  if (
    (a.icono ?? "") !== (b.icono ?? "") ||
    (a.color ?? "") !== (b.color ?? "") ||
    (a.borderColor ?? "") !== (b.borderColor ?? "") ||
    JSON.stringify(a.estilo ?? null) !== JSON.stringify(b.estilo ?? null)
  ) {
    fields.push("Estilo visual");
  }
  if (
    (a.fragmentOp ?? "") !== (b.fragmentOp ?? "") ||
    JSON.stringify(a.fragmentParts ?? []) !== JSON.stringify(b.fragmentParts ?? [])
  ) {
    fields.push("Operador de fragmento");
  }

  const moved =
    Math.abs((a.x ?? 0) - (b.x ?? 0)) >= 0.5 ||
    Math.abs((a.y ?? 0) - (b.y ?? 0)) >= 0.5 ||
    Math.abs((a.width ?? 0) - (b.width ?? 0)) >= 0.5 ||
    Math.abs((a.height ?? 0) - (b.height ?? 0)) >= 0.5;

  if (fields.length > 0) {
    if (moved) fields.push("Posición o tamaño");
    return { kind: "modified", fields };
  }
  if (moved) {
    return { kind: "moved", fields: ["Posición o tamaño"] };
  }
  return undefined;
}

function compareNode(
  a: { parent: string | null; value: GraphNode },
  b: { parent: string | null; value: GraphNode },
): ElementDiffMark | undefined {
  const fields: string[] = [];
  const av = a.value;
  const bv = b.value;
  if (av.nombre !== bv.nombre) fields.push("Nombre");
  if (av.tipo_elemento !== bv.tipo_elemento) fields.push("Tipo");
  if ((av.descripcion ?? "").trim() !== (bv.descripcion ?? "").trim()) fields.push("Descripción");
  if ((a.parent ?? "") !== (b.parent ?? "")) fields.push("Agrupación");
  if (JSON.stringify(av.tags_tecnologia ?? []) !== JSON.stringify(bv.tags_tecnologia ?? [])) {
    fields.push("Tecnologías");
  }
  if (JSON.stringify(av.columnas ?? []) !== JSON.stringify(bv.columnas ?? [])) {
    fields.push("Columnas");
  }
  if (JSON.stringify(av.metadata ?? []) !== JSON.stringify(bv.metadata ?? [])) {
    fields.push("Referencias");
  }
  if (JSON.stringify(av.spec ?? null) !== JSON.stringify(bv.spec ?? null)) {
    fields.push("Especificación");
  }
  if ((av.fuente ?? "").trim() !== (bv.fuente ?? "").trim()) fields.push("Fuente");
  if ((av.viewRef ?? "") !== (bv.viewRef ?? "")) fields.push("Subdiagrama");
  if ((av.estado_comparativo ?? "nuevo") !== (bv.estado_comparativo ?? "nuevo")) {
    fields.push("Estado comparativo");
  }
  if (
    (av.icono ?? "") !== (bv.icono ?? "") ||
    (av.color ?? "") !== (bv.color ?? "") ||
    (av.borderColor ?? "") !== (bv.borderColor ?? "") ||
    JSON.stringify(av.estilo ?? null) !== JSON.stringify(bv.estilo ?? null)
  ) {
    fields.push("Estilo visual");
  }

  const moved =
    Math.abs((av.x ?? 0) - (bv.x ?? 0)) >= 0.5 ||
    Math.abs((av.y ?? 0) - (bv.y ?? 0)) >= 0.5 ||
    Math.abs((av.width ?? 0) - (bv.width ?? 0)) >= 0.5 ||
    Math.abs((av.height ?? 0) - (bv.height ?? 0)) >= 0.5;

  if (fields.length > 0) {
    if (moved) fields.push("Posición o tamaño");
    return { kind: "modified", fields };
  }
  if (moved) {
    return { kind: "moved", fields: ["Posición o tamaño"] };
  }
  return undefined;
}

function compareEdge(a: GraphLink, b: GraphLink): ElementDiffMark | undefined {
  const fields: string[] = [];
  if (a.fuente !== b.fuente || a.destino !== b.destino) fields.push("Extremos");
  if ((a.descripcion ?? "").trim() !== (b.descripcion ?? "").trim()) fields.push("Descripción");
  if ((a.relation ?? "asociacion") !== (b.relation ?? "asociacion")) fields.push("Tipo de relación");
  if (
    (a.arrow ?? "end") !== (b.arrow ?? "end") ||
    Boolean(a.dashed) !== Boolean(b.dashed) ||
    (a.color ?? "") !== (b.color ?? "")
  ) {
    fields.push("Estilo visual");
  }
  if ((a.messageKind ?? "") !== (b.messageKind ?? "") || (a.orden ?? -1) !== (b.orden ?? -1)) {
    fields.push("Orden de mensaje");
  }

  const moved =
    (a.routing ?? "") !== (b.routing ?? "") ||
    JSON.stringify([
      a.sourceAnchor ?? null,
      a.targetAnchor ?? null,
      a.midpoint ?? null,
      a.midpoints ?? null,
      a.labelOffset ?? null,
    ]) !==
      JSON.stringify([
        b.sourceAnchor ?? null,
        b.targetAnchor ?? null,
        b.midpoint ?? null,
        b.midpoints ?? null,
        b.labelOffset ?? null,
      ]);

  if (fields.length > 0) {
    if (moved) fields.push("Trazado");
    return { kind: "modified", fields };
  }
  if (moved) {
    return { kind: "moved", fields: ["Trazado"] };
  }
  return undefined;
}

export function computeGraphDiff(
  before: GraphData | undefined,
  after: GraphData | undefined,
): GraphDiffResult {
  const bRec = before ? encodeGraph(before) : null;
  const aRec = after ? encodeGraph(after) : null;

  const bContainers = new Map((bRec?.containers ?? []).map(c => [containerKey(c), c]));
  const aContainers = new Map((aRec?.containers ?? []).map(c => [containerKey(c), c]));
  const bNodes = new Map((bRec?.nodes ?? []).map(n => [n.id, n]));
  const aNodes = new Map((aRec?.nodes ?? []).map(n => [n.id, n]));
  const bEdges = new Map((bRec?.edges ?? []).map(e => [e.id, e]));
  const aEdges = new Map((aRec?.edges ?? []).map(e => [e.id, e]));

  const beforeNodes = new Map<string, ElementDiffMark>();
  const afterNodes = new Map<string, ElementDiffMark>();
  const beforeLinks = new Map<string, ElementDiffMark>();
  const afterLinks = new Map<string, ElementDiffMark>();

  const counts = { added: 0, removed: 0, modified: 0, moved: 0 };

  for (const [id, bC] of bContainers) {
    const aC = aContainers.get(id);
    if (!aC) {
      beforeNodes.set(id, { kind: "removed", fields: ["Eliminado en esta versión"] });
      counts.removed++;
      continue;
    }
    const diff = compareContainer(bC, aC);
    if (diff) {
      beforeNodes.set(id, diff);
      afterNodes.set(id, diff);
      if (diff.kind === "modified") counts.modified++;
      else counts.moved++;
    }
  }
  for (const [id] of aContainers) {
    if (!bContainers.has(id)) {
      afterNodes.set(id, { kind: "added", fields: ["Agregado en esta versión"] });
      counts.added++;
    }
  }

  for (const [id, bNode] of bNodes) {
    const aNode = aNodes.get(id);
    if (!aNode) {
      beforeNodes.set(id, { kind: "removed", fields: ["Eliminado en esta versión"] });
      counts.removed++;
      continue;
    }
    const diff = compareNode(bNode, aNode);
    if (diff) {
      beforeNodes.set(id, diff);
      afterNodes.set(id, diff);
      if (diff.kind === "modified") counts.modified++;
      else counts.moved++;
    }
  }
  for (const [id] of aNodes) {
    if (!bNodes.has(id)) {
      afterNodes.set(id, { kind: "added", fields: ["Agregado en esta versión"] });
      counts.added++;
    }
  }

  for (const [id, bEdge] of bEdges) {
    const aEdge = aEdges.get(id);
    if (!aEdge) {
      beforeLinks.set(id, { kind: "removed", fields: ["Conexión eliminada"] });
      counts.removed++;
      continue;
    }
    const diff = compareEdge(bEdge, aEdge);
    if (diff) {
      beforeLinks.set(id, diff);
      afterLinks.set(id, diff);
      if (diff.kind === "modified") counts.modified++;
      else counts.moved++;
    }
  }
  for (const [id] of aEdges) {
    if (!bEdges.has(id)) {
      afterLinks.set(id, { kind: "added", fields: ["Conexión nueva"] });
      counts.added++;
    }
  }

  return { beforeNodes, afterNodes, beforeLinks, afterLinks, counts };
}
