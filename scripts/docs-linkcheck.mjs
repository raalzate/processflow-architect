#!/usr/bin/env node
/**
 * Link-check de documentación: que ninguna referencia apunte a la nada.
 *
 * El anti-patrón "instalado y muerto" empieza casi siempre así: la memoria manda
 * consultar un archivo que se movió o que nunca se generó. Ninguna otra señal lo ve.
 *
 * Revisa, en todos los .md del repo:
 *   - enlaces markdown relativos: [texto](ruta.md#ancla)
 *   - rutas mencionadas en prosa o en `código`: docs/..., src/..., scripts/..., .claude/...
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude", "harness.config.json"), "utf8"));
const IGNORE = new Set(config.docs.ignore);
const IGNORE_FILES = new Set(config.docs.ignoreFiles ?? []);

const problems = [];
const rel = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");

function markdownFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".md")) out.push(abs);
    }
  };
  walk(REPO_ROOT);
  return out;
}

/** Una ruta existe si existe tal cual, o con glob simple (`x/*.sql`, `notebook/NN_*.ipynb`). */
function exists(target) {
  const abs = path.join(REPO_ROOT, target);
  if (fs.existsSync(abs)) return true;
  if (!target.includes("*")) return false;
  const dir = path.join(REPO_ROOT, path.dirname(target));
  if (!fs.existsSync(dir)) return false;
  const re = new RegExp(`^${path.basename(target).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return fs.readdirSync(dir).some((n) => re.test(n));
}

const SKIP_PREFIX = /^(https?:|mailto:|#|<|\$\{)/;
// Rutas del repo citadas en prosa: la primera parte identifica una raíz real.
const PROSE_PATH = /(?:^|[\s`(«"'])((?:docs|src|scripts|main|mcp-server|assets|public|specs|\.claude|\.github|\.githooks|\.tessl)\/[A-Za-z0-9_@./*-]+)/g;

for (const abs of markdownFiles()) {
  const file = rel(abs);
  if (IGNORE_FILES.has(file)) continue;
  const content = fs.readFileSync(abs, "utf8");
  const dir = path.dirname(file);
  const seen = new Set();

  const report = (target, kind) => {
    const key = `${kind}:${target}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push({ file, target, kind });
  };

  for (const m of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const raw = m[1].trim().split(" ")[0];
    if (SKIP_PREFIX.test(raw)) continue;
    const target = path.posix.normalize(path.posix.join(dir === "." ? "" : dir, raw.split("#")[0]));
    if (!target || target === ".") continue;
    if (!exists(target)) report(target, "enlace");
  }

  for (const m of content.matchAll(PROSE_PATH)) {
    let target = m[1].replace(/[.,;:)»`'"]+$/, "");
    if (target.endsWith("/")) target = target.slice(0, -1);
    if (!exists(target)) report(target, "ruta citada");
  }
}

if (problems.length) {
  for (const p of problems) console.error(`${p.file}: ${p.kind} rota → ${p.target}`);
  console.error(`\ndocs-linkcheck: ${problems.length} referencia(s) apuntan a la nada.`);
  process.exit(1);
}

console.log("docs-linkcheck: ok");
