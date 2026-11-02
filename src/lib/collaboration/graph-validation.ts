import generated from "./graph-schema.json";

interface Schema {
  ref?: string;
  type?: string;
  literal?: string | number | boolean;
  anyOf?: Schema[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additional?: Schema;
}
const { roots, definitions } = generated as unknown as {
  roots: Record<string, Schema>;
  definitions: Record<string, Schema>;
};
const list = (items: Schema): Schema => ({ type: "array", items });
const graphRecord: Schema = {
  type: "object",
  properties: {
    meta: roots.GraphData,
    bigMeta: roots.BigPicture,
    containers: list(roots.Agregado),
    edges: list(roots.GraphLink),
    nodes: list({
      type: "object",
      properties: {
        id: { type: "string" },
        parent: { anyOf: [{ type: "string" }, { type: "null" }] },
        value: roots.GraphNode,
      },
    }),
  },
};
function resolve(schema: Schema): Schema {
  return schema.ref ? definitions[schema.ref] : schema;
}
function accepts(value: unknown, input: Schema, depth = 0): boolean {
  if (depth > 64) return false;
  const schema = resolve(input);
  if (schema.anyOf) return schema.anyOf.some(rule => accepts(value, rule, depth + 1));
  if (schema.literal !== undefined) return value === schema.literal;
  if (!schema.type) return true;
  if (schema.type === "null") return value === null;
  if (schema.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (schema.type === "array")
    return Array.isArray(value) && value.every(item => accepts(item, schema.items ?? {}, depth + 1));
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      (schema.required ?? []).every(key => record[key] !== undefined) &&
      Object.entries(record).every(
        ([key, item]) =>
          item === undefined || accepts(item, schema.properties?.[key] ?? schema.additional ?? {}, depth + 1),
      )
    );
  }
  return typeof value === schema.type;
}
function descend(input: Schema, path: string[]): Schema {
  const schema = resolve(input);
  if (!path.length) return schema;
  if (schema.anyOf) return { anyOf: schema.anyOf.map(rule => descend(rule, path)) };
  const [part, ...rest] = path;
  if (schema.type === "array" && part.startsWith("@")) return descend(schema.items ?? {}, rest);
  if (schema.type === "object") return descend(schema.properties?.[part] ?? schema.additional ?? {}, rest);
  if (!schema.type && schema.literal === undefined) return {};
  return { type: "never" };
}
function marker(input: Schema, type: string): boolean {
  const schema = resolve(input);
  if (schema.anyOf) return schema.anyOf.some(rule => marker(rule, type));
  return (!schema.type && schema.literal === undefined) || schema.type === type;
}
/** Check even hidden/tombstoned fields before they can be restored later. */
export function validGraphCell(path: string[], cell: Record<string, unknown>): boolean {
  let rule: Schema;
  if (path[0] === "content") rule = descend(graphRecord, path.slice(1));
  else if (path[0] === "customViews") {
    rule =
      path[2] === "graph"
        ? descend(graphRecord, path.slice(3))
        : descend(list(roots.DesignView), path.slice(1));
  } else return true;
  // The flat CRDT stores list ordering separately from persistent properties.
  if (path[path.length - 1] === "#rank")
    return cell.kind === "value" && typeof cell.value === "number" && Number.isFinite(cell.value);
  return cell.kind === "value"
    ? accepts(cell.value, rule)
    : marker(rule, cell.kind === "list" ? "array" : "object");
}
export function validPersistentGraph(value: unknown): boolean {
  return accepts(value, roots.GraphData);
}
