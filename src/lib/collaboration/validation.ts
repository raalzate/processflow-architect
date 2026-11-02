import { ArchitectureDriversOutputSchema, ConstraintsRisksOutputSchema, RoadmapOutputSchema, TechnicalElementsOutputSchema } from "../types";
import { decodeGraph } from "./graph-codec";
import { validGraphCell, validPersistentGraph } from "./graph-validation";

function invalid(): never { throw new Error("Documento compartido inválido o incompatible."); }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const text = (value: unknown): value is string => typeof value === "string";
const id = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 2048;

export function assertJson(value: unknown, depth = 0): void {
  if (depth > 64) invalid();
  if (value === undefined || value === null || text(value) || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) assertJson(item, depth + 1); return; }
  if (object(value)) { for (const item of Object.values(value)) assertJson(item, depth + 1); return; }
  invalid();
}
function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(object)) return invalid();
  const ids = value.map(item => item.id);
  if (!ids.every(id) || new Set(ids).size !== ids.length) invalid();
  return value;
}
function graph(value: unknown): void {
  if (!object(value) || !object(value.meta) || !text(value.meta.nombre_proyecto) || !object(value.bigMeta)) invalid();
  const record = value as Record<string, unknown>;
  const containers = records(record.containers), nodes = records(record.nodes), edges = records(record.edges);
  const names = [...containers, ...nodes].map(item => item.id);
  if (new Set(names).size !== names.length) invalid();
  for (const container of containers) if (!text(container.nombre_agregado)) invalid();
  for (const node of nodes) {
    if (!(node.parent === null || id(node.parent)) || !object(node.value) || node.value.id !== node.id || !text(node.value.nombre) || !text(node.value.tipo_elemento)) invalid();
  }
  for (const edge of edges) if (!id(edge.fuente) || !id(edge.destino)) invalid();
  if (!validPersistentGraph(decodeGraph(record as unknown as Parameters<typeof decodeGraph>[0]).graph)) invalid();
}
export function assertEncodedProject(value: unknown): void {
  if (!object(value) || !text(value.name) || !object(value.agent) || !object(value.analysis)) invalid();
  const project = value as Record<string, unknown>;
  graph(project.content);
  for (const view of records(project.customViews)) {
    if (!text(view.name) || !["design", "graph", "mermaid"].includes(String(view.kind))) invalid();
    if (view.graph !== undefined) graph(view.graph);
    if (view.mermaidCode !== undefined && !text(view.mermaidCode)) invalid();
  }
  for (const doc of records(project.references)) if (!text(doc.name) || !text(doc.text) || !["file", "text"].includes(String(doc.kind)) || !text(doc.addedAt) || typeof doc.chars !== "number" || !Number.isFinite(doc.chars)) invalid();
  const agent = project.agent as Record<string, unknown>;
  for (const version of records(agent.versions)) if (!text(version.label) || !text(version.createdAt)) invalid();
  for (const lineage of records(agent.lineages)) if (!text(lineage.kind) || !text(lineage.key) || !text(lineage.versionId) || !text(lineage.createdAt)) invalid();
  const schemas = { drivers: ArchitectureDriversOutputSchema, constraints: ConstraintsRisksOutputSchema, roadmap: RoadmapOutputSchema, proposal: TechnicalElementsOutputSchema };
  for (const artifact of records(agent.artifacts)) {
    if (!text(artifact.kind) || !text(artifact.title) || !text(artifact.versionId) || !text(artifact.createdAt) || !["markdown", "mermaid", ...Object.keys(schemas)].includes(String(artifact.render))) invalid();
    if (artifact.contextArtifactIds !== undefined && (!Array.isArray(artifact.contextArtifactIds) || !artifact.contextArtifactIds.every(text))) invalid();
    if (["markdown", "mermaid"].includes(String(artifact.render))) {
      if (!object(artifact.payload)) invalid();
      const field = artifact.render === "markdown" ? "markdown" : "code";
      if (artifact.payload[field] !== undefined && !text(artifact.payload[field])) invalid();
    } else if (!schemas[artifact.render as keyof typeof schemas].safeParse(artifact.payload).success) invalid();
  }
  const analysis = project.analysis as Record<string, unknown>;
  for (const [field, schema] of Object.entries(schemas)) {
    const result = analysis[`${field}Result`]; if (result !== undefined && result !== null && !schema.safeParse(result).success) invalid();
  }
}
export function assertCell(pathKey: string, value: unknown): void {
  if (pathKey.length > 32_768) invalid();
  let path: unknown;
  try { path = JSON.parse(pathKey); } catch { return invalid(); }
  if (!Array.isArray(path) || path.length > 64 || !path.every(part => text(part) && part.length <= 2048)) invalid();
  if (path.length && !["name", "content", "customViews", "references", "agent", "analysis"].includes(path[0])) invalid();
  if (!object(value) || !["object", "list", "value"].includes(String(value.kind))) invalid();
  const cell = value as Record<string, unknown>;
  if (!path.length && cell.kind !== "object") invalid();
  if (Object.keys(cell).some(key => key !== "kind" && !(cell.kind === "value" && key === "value"))) invalid();
  if (cell.kind === "value") assertJson(cell.value);
  if (!validGraphCell(path, cell)) invalid();
}
