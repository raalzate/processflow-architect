#!/usr/bin/env node
/**
 * Sincroniza los skills canónicos de `.claude/skills/` con su copia embebida en
 * `src/lib/mcp-skill.ts` (la que descarga la guía /mcp y escribe la herramienta
 * MCP `install_skill`).
 *
 * Por qué existe: la app empaquetada no incluye `.claude/`, así que el skill
 * viaja como constante. Copiarlo a mano es exactamente el tipo de tarea que se
 * desincroniza en silencio; aquí se genera, y el test `mcp-skill.test.ts` falla
 * si alguien edita el skill y no regenera.
 *
 * Uso: `npm run skills:sync` (idempotente). Con `--check` no escribe: sale con
 * código 1 si el embed está desactualizado — para el gate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SKILLS_DIR = path.join(REPO_ROOT, ".claude", "skills");
const TARGET = path.join(REPO_ROOT, "src", "lib", "mcp-skill.ts");
const START = "// <<<SKILLS_CONTENT_START>>>";
const END = "// <<<SKILLS_CONTENT_END>>>";

/** Skills que se entregan (el resto de `.claude/skills/` es de uso interno). */
const SHIPPED = ["documento-a-processflow", "disenar-diagrama"];

/** Archivos .md de un skill, con ruta relativa a su carpeta (orden estable). */
function skillFiles(dir) {
  const out = [];
  const walk = (abs, prefix) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(abs, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next, rel);
      else if (entry.name.endsWith(".md")) out.push([rel, fs.readFileSync(next, "utf8")]);
    }
  };
  walk(dir, "");
  // SKILL.md primero: es el que se lee siempre.
  return out.sort(([a], [b]) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)));
}

/** Escapa un contenido para vivir dentro de un template literal de TS. */
const escapeTemplate = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

function generatedBlock() {
  const lines = [
    START + " generado por scripts/sync-skills.mjs — no editar a mano",
    "export const SKILL_CONTENT: Record<string, Record<string, string>> = {",
  ];
  for (const id of SHIPPED) {
    const dir = path.join(SKILLS_DIR, id);
    if (!fs.existsSync(dir)) throw new Error(`Falta el skill canónico .claude/skills/${id}`);
    lines.push(`  ${JSON.stringify(id)}: {`);
    for (const [rel, content] of skillFiles(dir)) {
      lines.push(`    ${JSON.stringify(rel)}: \`${escapeTemplate(content)}\`,`);
    }
    lines.push("  },");
  }
  lines.push("};", END);
  return lines.join("\n");
}

const source = fs.readFileSync(TARGET, "utf8");
const from = source.indexOf(START);
const to = source.indexOf(END);
if (from === -1 || to === -1) {
  console.error(`[sync-skills] faltan los marcadores ${START} / ${END} en ${path.relative(REPO_ROOT, TARGET)}`);
  process.exit(1);
}

const next = source.slice(0, from) + generatedBlock() + source.slice(to + END.length);
const check = process.argv.includes("--check");

if (next === source) {
  console.log("[sync-skills] embed al día.");
  process.exit(0);
}
if (check) {
  console.error(
    "[sync-skills] el embed de src/lib/mcp-skill.ts NO refleja .claude/skills/. Corré `npm run skills:sync`."
  );
  process.exit(1);
}
fs.writeFileSync(TARGET, next, "utf8");
console.log(`[sync-skills] regenerado el embed de ${SHIPPED.length} skill(s).`);
