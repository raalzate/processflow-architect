#!/usr/bin/env node
/**
 * Señal del gate: el índice de graphify no describe un repo viejo.
 *
 * `graphify-out/` es derivado y NO se commitea (se reconstruye solo en el
 * post-commit de `.githooks/`). Consecuencias, y por qué esta señal es así:
 *
 *  - **En CI no existe** el directorio: la señal se reporta OMITIDA (exit 0). Un
 *    gate que exige un artefacto que el clon no puede tener sería rojo eterno.
 *  - **La frescura se mide contra la fecha de HEAD**, no contra los archivos del
 *    working tree. Si midiéramos contra el árbol, cada edición sin reindexar
 *    pondría el gate en rojo a mitad de desarrollo y el freno terminaría
 *    desactivado a mano — que es la forma más común de perder un freno.
 *
 * Sale en rojo sólo en el caso que importa: hay grafo, pero se construyó ANTES
 * del último commit, así que una consulta devolvería el repo de ayer.
 *
 *   node scripts/graph-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude", "harness.config.json"), "utf8"));
const graph = config.graph;

const graphFile = path.join(REPO_ROOT, graph.graphFile);

if (!fs.existsSync(graphFile)) {
  // Ni construido ni obligatorio: el índice acelera al agente, no define el producto.
  const donde = process.env.CI ? "CI" : "esta máquina";
  console.log(`graph-check: omitido — no hay \`${graph.graphFile}\` en ${donde}. Construilo con \`/graphify .\` (o \`${graph.updateCommand}\`).`);
  process.exit(0);
}

const headISO = execFileSync("git", ["log", "-1", "--format=%cI"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
const headTime = new Date(headISO).getTime();
const graphTime = fs.statSync(graphFile).mtimeMs;

if (graphTime < headTime) {
  const atraso = Math.round((headTime - graphTime) / 60000);
  console.error(
    [
      `graph-check: el índice es más viejo que HEAD (${atraso} min de atraso).`,
      `Una consulta al grafo contestaría con el repo anterior al último commit.`,
      `Arreglo: \`${graph.updateCommand}\` (el post-commit de .githooks lo hace solo; si no corrió, instalá los hooks con \`npm run hooks:install\`).`,
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`graph-check: ok — índice al día con HEAD (${graph.graphFile}).`);
