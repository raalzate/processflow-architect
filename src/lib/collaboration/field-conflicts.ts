import { encodeProject } from "./graph-codec";
import { deRegistro } from "../registro";
import type { SharedProject } from "./types";

export type AuditCell = { kind: "object" | "list" } | { kind: "value"; value: unknown };

export interface AuditRecord {
  path: string;
  previous?: AuditCell;
  value?: AuditCell;
}

export interface DiscardedFieldEdit {
  id: string;
  pathKey: string;
  label: string;
  scope: string;
  previousValue: unknown;
  discardedValue: unknown;
  currentValue: unknown;
}

type EncodedProject = ReturnType<typeof encodeProject>;
type EncodedGraph = EncodedProject["content"];

const FIELD_NAMES: Record<string, string> = {
  nombre: "Nombre",
  nombre_agregado: "Nombre",
  nombre_proyecto: "Nombre del proyecto",
  descripcion: "Descripción",
  entidad_raiz: "Entidad raíz",
  tipo_elemento: "Tipo",
  tipo_contenedor: "Tipo de contenedor",
  estado_comparativo: "Estado comparativo",
  mermaidCode: "Código Mermaid",
  notas: "Notas",
  transcript: "Transcripción",
  viewRef: "Subdiagrama vinculado",
  fuente: "Origen",
  destino: "Destino",
  routing: "Enrutado",
  parent: "Agrupación",
  name: "Nombre",
  title: "Título",
  content: "Contenido",
  markdown: "Contenido",
  x: "Posición horizontal",
  y: "Posición vertical",
  width: "Ancho",
  height: "Alto",
};

const IGNORED_LEAF_FIELDS = new Set(["#rank", "x", "y"]);

const serialize = (value: unknown): string => JSON.stringify(value) ?? "__undefined__";

function friendlyField(segments: string[]): string {
  const clean = segments.filter(s => s !== "value").map(s => (s.startsWith("@") ? s.slice(1) : s));
  if (!clean.length) return "Valor";
  return clean.map(s => deRegistro(FIELD_NAMES, s) ?? s).join(" · ");
}

function describeGraphPath(prefix: string, segments: string[], graph?: EncodedGraph): string {
  const [section, entitySeg, ...rest] = segments;
  const entityId = entitySeg?.startsWith("@") ? entitySeg.slice(1) : undefined;
  if (section === "nodes" && entityId) {
    const nodeName = graph?.nodes.find(n => n.id === entityId)?.value.nombre ?? entityId;
    return `${prefix} · Componente «${nodeName}» · ${friendlyField(rest)}`;
  }
  if (section === "containers" && entityId) {
    const containerName = graph?.containers.find(c => c.id === entityId)?.nombre_agregado ?? entityId;
    return `${prefix} · Grupo «${containerName}» · ${friendlyField(rest)}`;
  }
  if (section === "edges" && entityId) {
    const edge = graph?.edges.find(e => e.id === entityId);
    const edgeLabel = edge?.descripcion?.trim() || entityId;
    return `${prefix} · Conexión «${edgeLabel}» · ${friendlyField(rest)}`;
  }
  if (section === "meta" || section === "bigMeta") {
    return `${prefix} · ${friendlyField([entitySeg ?? "", ...rest].filter(Boolean))}`;
  }
  return `${prefix} · ${friendlyField(segments)}`;
}

export function describeEncodedPath(
  path: string[],
  encoded?: EncodedProject,
): { scope: string; label: string } {
  const [root, second, ...rest] = path;
  if (root === "content") {
    return {
      scope: "design",
      label: describeGraphPath("Modelo", [second ?? "", ...rest].filter(Boolean), encoded?.content),
    };
  }
  if (root === "customViews" && second?.startsWith("@")) {
    const viewId = second.slice(1);
    const view = encoded?.customViews.find(v => v.id === viewId);
    const prefix = `Vista «${view?.name ?? viewId}»`;
    if (rest[0] === "graph") {
      return {
        scope: `view:${viewId}`,
        label: describeGraphPath(prefix, rest.slice(1), view?.graph as EncodedGraph | undefined),
      };
    }
    return {
      scope: `view:${viewId}`,
      label: `${prefix} · ${friendlyField(rest)}`,
    };
  }
  if (root === "name") {
    return { scope: "project", label: "Datos comunes · Nombre del proyecto" };
  }
  return {
    scope: "project",
    label: `Datos comunes · ${friendlyField(path)}`,
  };
}

export function describeMergeConflictPath(rawPath: string, ...projects: SharedProject[]): string {
  const parts = rawPath.split(" / ");
  if (parts.length < 2) return rawPath;
  const encodedList = projects.map(p => encodeProject(p));
  const first = parts[0];
  let normalized: string[] | undefined;
  if (first === "Modelo") normalized = ["content", ...parts.slice(1)];
  else if (first.startsWith("view:")) normalized = ["customViews", `@${first.slice(5)}`, ...parts.slice(1)];
  else if (first === "Datos comunes") normalized = parts.slice(1);
  if (!normalized) return rawPath;
  const best = encodedList.find(e => {
    const label = describeEncodedPath(normalized, e).label;
    return !label.includes(`«${normalized.find(s => s.startsWith("@"))?.slice(1) ?? ""}»`);
  });
  return describeEncodedPath(normalized, best ?? encodedList[0]).label;
}

export function collectDiscardedFieldEdits(
  fields: ReadonlyMap<string, AuditCell>,
  tombstones: ReadonlyMap<string, boolean>,
  auditEntries: Iterable<[string, AuditRecord]>,
  encoded?: EncodedProject,
): DiscardedFieldEdit[] {
  const byPath = new Map<string, { id: string; record: AuditRecord }[]>();
  for (const [id, record] of auditEntries) {
    if (record.value?.kind !== "value") continue;
    const list = byPath.get(record.path) ?? [];
    list.push({ id, record });
    byPath.set(record.path, list);
  }

  const results: DiscardedFieldEdit[] = [];
  for (const [pathKey, entries] of byPath) {
    const current = fields.get(pathKey);
    if (!current || current.kind !== "value") continue;

    let path: string[];
    try {
      path = JSON.parse(pathKey) as string[];
    } catch {
      continue;
    }
    if (!Array.isArray(path) || !path.length) continue;
    const leaf = path[path.length - 1]!;
    if (IGNORED_LEAF_FIELDS.has(leaf)) continue;

    let enclosingRemoved = false;
    for (let i = 1; i <= path.length; i++) {
      const prefixKey = JSON.stringify(path.slice(0, i));
      if (tombstones.get(prefixKey) || !fields.has(prefixKey)) {
        enclosingRemoved = true;
        break;
      }
    }
    if (enclosingRemoved) continue;

    const observedPrevious = new Set<string>();
    for (const { record } of entries) {
      if (record.previous?.kind === "value") {
        observedPrevious.add(serialize(record.previous.value));
      }
    }

    const currentSerialized = serialize(current.value);
    const seenDiscarded = new Set<string>();
    for (const { id, record } of entries) {
      if (record.value?.kind !== "value") continue;
      const candidateSerialized = serialize(record.value.value);
      if (
        candidateSerialized === currentSerialized ||
        observedPrevious.has(candidateSerialized) ||
        seenDiscarded.has(candidateSerialized)
      ) {
        continue;
      }
      seenDiscarded.add(candidateSerialized);
      const { scope, label } = describeEncodedPath(path, encoded);
      results.push({
        id,
        pathKey,
        label,
        scope,
        previousValue: record.previous?.kind === "value" ? record.previous.value : undefined,
        discardedValue: record.value.value,
        currentValue: current.value,
      });
    }
  }
  return results;
}
