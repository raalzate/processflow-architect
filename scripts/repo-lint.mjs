#!/usr/bin/env node
/**
 * Lint de convenciones del repo — sin dependencias nuevas (el bundle ya es pesado).
 *
 * No reemplaza al type-checker: verifica las reglas de CLAUDE.md que un compilador no ve,
 * y las verifica con un COMANDO QUE FALLA. Una regla en markdown sin esto es una sugerencia.
 *
 *   node scripts/repo-lint.mjs                 # todo el repo (señal del gate)
 *   node scripts/repo-lint.mjs --file <ruta>   # sólo ese archivo (hook PostToolUse)
 *
 * Reglas:
 *   PUREZA    src/lib/** es lógica pura: sin React, sin Electron, sin Next, sin UI.
 *   NOTACION  los tipos de componente sólo se cablean en src/lib/notations.ts (+ allowlist de deuda).
 *   ONLY      nada de .only( en tests: apaga la suite entera en silencio.
 *   DEPS      sin SDKs de nube en package.json (las llamadas van con fetch desde el main).
 *   WEBGPU    main.ts conserva los switches de WebGPU y no reactiva disableHardwareAcceleration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude", "harness.config.json"), "utf8"));

const problems = [];
const fail = (file, line, rule, message) => problems.push({ file, line, rule, message });

const rel = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");
const read = (relPath) => fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");

/** Archivos fuente del repo (sin derivados). */
function sourceFiles(root) {
  const out = [];
  const skip = new Set(["node_modules", ".next", ".git", "build", "dist", "out", "coverage", ".processflow"]);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel(abs));
    }
  };
  walk(path.join(REPO_ROOT, root));
  return out;
}

const isTest = (relPath) => /(^|\/)__tests__\//.test(relPath) || /\.(test|spec)\.tsx?$/.test(relPath);
const lineOf = (content, index) => content.slice(0, index).split("\n").length;

// ── Reglas por archivo ────────────────────────────────────────────────────────

const NOTATION_TYPES = (() => {
  const src = read(config.notation.source);
  return [...new Set([...src.matchAll(/type:\s*"([^"]+)"/g)].map((m) => m[1]))];
})();

function checkFile(relPath) {
  let content;
  try {
    content = read(relPath);
  } catch {
    return; // el archivo pudo borrarse entre la edición y el chequeo
  }

  // PUREZA — src/lib/ no conoce React, Electron ni la UI.
  if (relPath.startsWith(`${config.purity.dir}/`) && !isTest(relPath)) {
    const importRe = /(?:^|\n)\s*(?:import[^;]*?from\s*|import\s*|(?:const|let|var)[^=]*=\s*require\s*\()\s*["']([^"']+)["']/g;
    for (const m of content.matchAll(importRe)) {
      const spec = m[1];
      const bad = config.purity.forbiddenImports.find((f) => (f.endsWith("/") ? spec.startsWith(f) : spec === f || spec.startsWith(`${f}/`)));
      if (bad) {
        fail(
          relPath,
          lineOf(content, m.index),
          "PUREZA",
          `\`${config.purity.dir}/\` es lógica pura y testeable: no puede importar \`${spec}\`. Los componentes orquestan; lib/ decide.`,
        );
      }
    }
  }

  // NOTACION — el registro es la única fuente de verdad de los tipos.
  if (relPath.startsWith("src/") && !isTest(relPath) && !config.notation.allow.includes(relPath)) {
    for (const type of NOTATION_TYPES) {
      const idx = content.indexOf(`"${type}"`);
      if (idx !== -1) {
        fail(
          relPath,
          lineOf(content, idx),
          "NOTACION",
          `literal de tipo de notación (\`"${type}"\`) cableado fuera de \`${config.notation.source}\`. Derivalo del registro (notaciones, elementos, contenedores) — el arnés es agnóstico de notación.`,
        );
        break;
      }
    }
  }

  // ONLY — un .only olvidado deja la suite verde sin haber corrido nada.
  if (isTest(relPath)) {
    const m = /(?:describe|it|test)\.only\s*\(/.exec(content);
    if (m) {
      fail(relPath, lineOf(content, m.index), "ONLY", "`.only(` apaga el resto de la suite: el verde deja de significar nada. Quitalo antes de entregar.");
    }
  }
}

// ── Reglas globales ───────────────────────────────────────────────────────────

function checkDeps() {
  const pkg = JSON.parse(read("package.json"));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of config.forbiddenDeps.packages) {
    if (declared[forbidden]) {
      fail("package.json", 1, "DEPS", `\`${forbidden}\` es un SDK de nube: las peticiones a proveedores se hacen con \`fetch\` nativo desde el proceso main.`);
    }
  }
}

function checkWebgpu() {
  const file = config.webgpu.file;
  const content = read(file);
  for (const needle of config.webgpu.required) {
    if (!content.includes(needle)) {
      fail(file, 1, "WEBGPU", `falta \`${needle}\`: LiteRT-LM no arranca sin GPU y WebGPU viene deshabilitado en Electron.`);
    }
  }
  for (const needle of config.webgpu.forbidden) {
    const idx = content.indexOf(needle);
    if (idx !== -1 && !/^\s*(\/\/|\*)/.test(content.split("\n")[lineOf(content, idx) - 1])) {
      fail(file, lineOf(content, idx), "WEBGPU", `\`${needle}\` mata la aceleración por hardware y con ella el motor local.`);
    }
  }
}

// ── Ejecución ─────────────────────────────────────────────────────────────────

const fileFlagIndex = process.argv.indexOf("--file");
const single = fileFlagIndex !== -1 ? process.argv[fileFlagIndex + 1] : null;

if (single) {
  if (/\.(ts|tsx)$/.test(single)) checkFile(single);
  if (single === "package.json") checkDeps();
  if (single === config.webgpu.file) checkWebgpu();
} else {
  for (const relPath of [...sourceFiles("src"), ...sourceFiles("main"), ...sourceFiles("mcp-server")]) checkFile(relPath);
  checkDeps();
  checkWebgpu();
}

if (problems.length) {
  for (const p of problems) console.error(`${p.file}:${p.line}  [${p.rule}] ${p.message}`);
  console.error(`\nrepo-lint: ${problems.length} problema(s).`);
  process.exit(1);
}

console.log(single ? `repo-lint: ok (${single})` : "repo-lint: ok");
