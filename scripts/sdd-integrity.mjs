#!/usr/bin/env node
/** Integridad de artefactos de prueba y validación del kit local, sin servicios externos. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const FORMAT = "processflow-sdd-integrity/v1";
function inside(root, file) {
  const target = path.resolve(root, file), relative = path.relative(root, target);
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) throw new Error("Archivo fuera del workspace seleccionado.");
  const real = fs.realpathSync(target), realRelative = path.relative(fs.realpathSync(root), real);
  if (path.isAbsolute(realRelative) || realRelative === ".." || realRelative.startsWith(`..${path.sep}`)) throw new Error("Enlace fuera del workspace seleccionado.");
  if (!fs.statSync(real).isFile()) throw new Error("Se esperaba un archivo de prueba.");
  return target;
}
function digest(file) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(file)).replace(/\r\n/g, "\n");
  return createHash("sha256").update(text, "utf8").digest("hex");
}
/** Capturar una referencia nueva; nunca sustituir una referencia previa. */
export function captureIntegrity(manifest, files, root = process.cwd()) {
  root = path.resolve(root);
  if (!files.length) throw new Error("Indica al menos un archivo de escenarios o pruebas.");
  const entries = [...new Set(files.map(file => inside(root, file)))].map(file => ({ path: path.relative(root, file).split(path.sep).join("/"), sha256: digest(file) }));
  fs.mkdirSync(path.dirname(path.resolve(manifest)), { recursive: true });
  fs.writeFileSync(manifest, `${JSON.stringify({ format: FORMAT, files: entries }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return entries.length;
}
/** Los fallos nombran el archivo; no imprimen su contenido. */
export function verifyIntegrity(manifest, root = process.cwd()) {
  if (fs.statSync(manifest).size > 1024 * 1024) throw new Error("Manifiesto demasiado grande.");
  const data = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (data?.format !== FORMAT || !Array.isArray(data.files) || !data.files.length) throw new Error("Manifiesto de integridad inválido o vacío.");
  const errors = [], seen = new Set();
  for (const entry of data.files) {
    if (!entry || typeof entry.path !== "string" || !entry.path || !/^[a-f0-9]{64}$/.test(entry.sha256) || seen.has(entry.path)) throw new Error("Entrada de integridad inválida o repetida.");
    seen.add(entry.path);
    try { if (digest(inside(path.resolve(root), entry.path)) !== entry.sha256) errors.push(`${entry.path}: contenido modificado.`); }
    catch (error) { errors.push(`${entry.path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return errors;
}
/** Una carpeta vacía no cuenta como una fase instalada. */
export function kitProblems(roots, phases) {
  return phases.flatMap(phase => {
    if (!/^[a-z0-9-]+$/.test(phase)) return [`${phase}: nombre de fase inválido.`];
    for (const root of roots) {
      try {
        const content = fs.readFileSync(path.join(root, phase, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
        const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
        if (!match || !match[2].trim()) continue;
        const name = match[1].match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1];
        const description = match[1].match(/^description:\s*(.+)$/m)?.[1]?.replace(/^["']|["']$/g, "").trim();
        if (name === phase && description) return [];
      } catch { /* Probar la siguiente raíz configurada. */ }
    }
    return [`${phase}: falta SKILL.md válido con nombre, descripción e instrucciones.`];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, manifest, ...args] = process.argv.slice(2); let root = process.cwd();
    const option = args.indexOf("--root");
    if (option >= 0) { if (!args[option + 1]) throw new Error("Falta el workspace de --root."); root = path.resolve(args[option + 1]); args.splice(option, 2); }
    if (!manifest || !["capture", "verify"].includes(command)) throw new Error("Uso: node scripts/sdd-integrity.mjs capture <manifest.json> <archivos...> [--root <workspace>] | verify <manifest.json> [--root <workspace>]");
    if (command === "capture") console.log(`Referencia creada: ${captureIntegrity(manifest, args, root)} archivo(s).`);
    else {
      if (args.length) throw new Error("verify no admite archivos adicionales.");
      const errors = verifyIntegrity(manifest, root);
      if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
      else console.log("Integridad verificada; los archivos conservan su contenido.");
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
