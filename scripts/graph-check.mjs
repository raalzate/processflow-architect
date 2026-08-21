#!/usr/bin/env node
/**
 * Señal del gate: el índice de graphify no miente.
 *
 * Dos formas de mentir que un índice tiene, y las dos se miden acá:
 *
 *  1. **Estar viejo.** Se compara contra la fecha de HEAD, no contra el working
 *     tree. Si midiéramos contra el árbol, cada edición sin reindexar pondría el
 *     gate en rojo a mitad de desarrollo y el freno terminaría desactivado a mano
 *     — que es la forma más común de perder un freno.
 *  2. **Haberse encogido.** Un reindexado a medias (extracción caída, corpus mal
 *     detectado, `graphify update` que falló silencioso) deja un grafo más chico
 *     que igual responde consultas: contesta con menos verdad y sin avisar. Por eso
 *     el tamaño del índice tiene línea base declarada en `.claude/harness.config.json`
 *     (`graph.baseline`) y una tolerancia; encogerse más que eso es rojo.
 *
 * `graphify-out/` es derivado y NO se commitea: en CI no existe y la señal se
 * reporta OMITIDA (exit 0). Un gate que exige un artefacto que el clon no puede
 * tener sería rojo eterno.
 *
 *   node scripts/graph-check.mjs
 *   node scripts/graph-check.mjs --graph <ruta>   # medir OTRO grafo (lo usa el self-test)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude", "harness.config.json"), "utf8"));
const graph = config.graph;

const flagIndex = process.argv.indexOf("--graph");
const graphRel = flagIndex !== -1 ? process.argv[flagIndex + 1] : graph.graphFile;
const graphFile = path.isAbsolute(graphRel) ? graphRel : path.join(REPO_ROOT, graphRel);

if (!fs.existsSync(graphFile)) {
  // Ni construido ni obligatorio: el índice acelera al agente, no define el producto.
  const donde = process.env.CI ? "CI" : "esta máquina";
  console.log(`graph-check: omitido — no hay \`${graphRel}\` en ${donde}. Construilo con \`/graphify .\`.`);
  process.exit(0);
}

const problemas = [];

// 1 · Frescura contra HEAD.
const headISO = execFileSync("git", ["log", "-1", "--format=%cI"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
const headTime = new Date(headISO).getTime();
const graphTime = fs.statSync(graphFile).mtimeMs;
if (graphTime < headTime) {
  const atraso = Math.round((headTime - graphTime) / 60000);
  problemas.push(
    `el índice es más viejo que HEAD (${atraso} min de atraso): una consulta contestaría con el repo anterior al último commit. Arreglo: \`${graph.updateCommand}\` (el post-commit de .githooks lo hace solo; si no corrió, \`npm run hooks:install\`).`,
  );
}

// 2 · Tamaño contra la línea base declarada.
let medido = { nodes: 0, edges: 0 };
try {
  const data = JSON.parse(fs.readFileSync(graphFile, "utf8"));
  medido = { nodes: (data.nodes ?? []).length, edges: (data.edges ?? data.links ?? []).length };
} catch (e) {
  problemas.push(`\`${graphRel}\` no es JSON legible (${e.message}): el índice está corrupto, no viejo. Reconstruilo con \`/graphify .\`.`);
}

const base = graph.baseline ?? { nodes: 0, edges: 0 };
const tol = graph.shrinkTolerance ?? 0.15;
for (const clave of ["nodes", "edges"]) {
  const minimo = Math.floor((base[clave] ?? 0) * (1 - tol));
  if (medido[clave] < minimo) {
    problemas.push(
      `el índice se encogió: ${medido[clave]} ${clave} contra una base de ${base[clave]} (mínimo tolerado ${minimo}). Un reindexado a medias contesta igual, con menos verdad. Reconstruí con \`/graphify .\`; si el achique es real y buscado, actualizá \`graph.baseline\` en \`.claude/harness.config.json\` en un commit que lo declare.`,
    );
  }
}

if (problemas.length) {
  console.error(problemas.map((p) => `graph-check: ${p}`).join("\n"));
  process.exit(1);
}

console.log(`graph-check: ok — índice al día con HEAD y en tamaño (${medido.nodes} nodos, ${medido.edges} aristas).`);
