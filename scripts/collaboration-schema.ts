/** Derive a runtime wire schema from the application's existing persistent types. */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Schema {
  ref?: string;
  type?: "string" | "number" | "boolean" | "null" | "object" | "array" | "never";
  literal?: string | number | boolean;
  anyOf?: Schema[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additional?: Schema;
}
export interface GraphSchema {
  root: Schema;
  roots: Record<string, Schema>;
  definitions: Record<string, Schema>;
}
export function generateGraphSchema(): GraphSchema {
  const sourcePath = resolve("src/lib/types.ts");
  const viewPath = resolve("src/lib/views-types.ts");
  const program = ts.createProgram([sourcePath, viewPath], {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strictNullChecks: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker(),
    source = program.getSourceFile(sourcePath)!;
  const root = checker
    .getExportsOfModule(checker.getSymbolAtLocation(source)!)
    .find(symbol => symbol.name === "GraphData")!;
  const definitions: Record<string, Schema> = {},
    seen = new Map<ts.Type, string>();
  const convert = (type: ts.Type): Schema => {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
    if (type.flags & ts.TypeFlags.Never) return { type: "never" };
    if (type.isUnion())
      return { anyOf: type.types.filter(t => !(t.flags & ts.TypeFlags.Undefined)).map(convert) };
    if (type.isStringLiteral() || type.isNumberLiteral()) return { literal: type.value };
    if (type.flags & ts.TypeFlags.BooleanLiteral) return { literal: checker.typeToString(type) === "true" };
    if (type.flags & ts.TypeFlags.StringLike) return { type: "string" };
    if (type.flags & ts.TypeFlags.NumberLike) return { type: "number" };
    if (type.flags & ts.TypeFlags.BooleanLike) return { type: "boolean" };
    if (type.flags & ts.TypeFlags.Null) return { type: "null" };
    if (type.flags & ts.TypeFlags.Undefined) return { type: "never" };
    if (checker.isArrayType(type) || type.getSymbol()?.name === "ReadonlyArray")
      return { type: "array", items: convert(checker.getTypeArguments(type as ts.TypeReference)[0]) };
    if (checker.isTupleType(type))
      return {
        type: "array",
        items: { anyOf: checker.getTypeArguments(type as ts.TypeReference).map(convert) },
      };
    if (!(type.flags & ts.TypeFlags.Object) || type.getCallSignatures().length) return { type: "never" };
    const existing = seen.get(type);
    if (existing) return { ref: existing };
    const name = `S${seen.size}`;
    seen.set(type, name);
    const schema: Schema = { type: "object", properties: {}, required: [] };
    definitions[name] = schema;
    for (const property of checker.getPropertiesOfType(type)) {
      const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? source;
      const fieldType = checker.getTypeOfSymbolAtLocation(property, declaration);
      schema.properties![property.name] = convert(fieldType);
      if (!(property.flags & ts.SymbolFlags.Optional)) schema.required!.push(property.name);
    }
    // Older saved graphs omit these defaults; their present values still get
    // the exact declared type. Core identity/collection checks also run on wire.
    const keys = Object.keys(schema.properties!);
    if (keys.includes("tipo_elemento") && keys.includes("nombre"))
      schema.required = ["id", "nombre", "tipo_elemento"];
    if (keys.includes("fuente") && keys.includes("destino")) schema.required = ["fuente", "destino"];
    if (keys.includes("nombre_agregado")) schema.required = ["nombre_agregado", "nodos", "aristas"];
    if (keys.includes("nombre_proyecto")) schema.required = ["nombre_proyecto", "agregados", "big_picture"];
    if (keys.includes("hotspots") && keys.includes("nodos") && keys.includes("aristas"))
      schema.required = ["nodos", "aristas"];
    const index = checker.getIndexTypeOfType(type, ts.IndexKind.String);
    if (index) schema.additional = convert(index);
    return { ref: name };
  };
  const roots: Record<string, Schema> = { GraphData: convert(checker.getDeclaredTypeOfSymbol(root)) };
  for (const [file, names] of [
    [sourcePath, ["GraphNode", "GraphLink", "Agregado", "BigPicture"]],
    [viewPath, ["DesignView"]],
  ] as const) {
    const module = checker.getSymbolAtLocation(program.getSourceFile(file)!)!;
    for (const name of names) {
      const symbol = checker.getExportsOfModule(module).find(s => s.name === name)!;
      roots[name] = convert(checker.getDeclaredTypeOfSymbol(symbol));
    }
  }
  return { root: roots.GraphData, roots, definitions };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = resolve("src/lib/collaboration/graph-schema.json"),
    expected = `${JSON.stringify(generateGraphSchema(), null, 2)}\n`;
  if (process.argv.includes("--write")) {
    writeFileSync(path, expected);
    console.log("Persistent graph schema generated.");
  } else if (readFileSync(path, "utf8").replace(/\r\n/g, "\n") !== expected) {
    console.error("Persistent graph types changed: run npm run collaboration:schema.");
    process.exitCode = 1;
  } else console.log("Persistent graph schema matches source types.");
}
