#!/usr/bin/env node
/**
 * Señal del gate: el índice de graphify no miente.
 *
 * Dos formas de mentir que un índice tiene, y las dos se miden acá:
 *
 *  1. **Estar viejo.** Se mide por CONTENIDO, no por reloj: el post-commit deja el
 *     sha que indexó en `graphify-out/.indexed-head` y acá se compara con HEAD; si
 *     difieren, sólo es rojo cuando entre ambos cambió algún archivo indexable.
 *     No se mide contra el working tree a propósito: cada edición sin reindexar
 *     pondría el gate en rojo a mitad de desarrollo y el freno terminaría
 *     desactivado a mano — la forma más común de perder un freno.
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

// 1 · Frescura: ¿el índice se construyó para ESTE contenido?
//
// Se pregunta por contenido y no por reloj. La versión anterior comparaba el mtime
// de graph.json contra la fecha de HEAD y se ponía roja sola: `graphify update` NO
// reescribe el archivo cuando no encontró nada nuevo, así que un commit sin cambios
// indexables dejaba el índice «atrasado 0 minutos». El sello dice para qué commit se
// indexó; lo escribe `.githooks/post-commit`.
const git = (...args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
const HEAD = git("rev-parse", "HEAD");
const stampFile = path.join(REPO_ROOT, graph.stampFile);
const sello = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, "utf8").trim() : "";

/** Rutas cuyo cambio obliga a reindexar (lo que graphify sabe leer). */
const indexables = (desde, hasta) =>
  git("diff", "--name-only", `${desde}..${hasta}`, "--", "*.ts", "*.tsx", "*.js", "*.mjs", "*.md")
    .split("\n")
    .filter(Boolean);

if (sello === HEAD) {
  // Indexado exactamente para este commit.
} else if (sello) {
  let pendientes = [];
  try {
    pendientes = indexables(sello, HEAD);
  } catch {
    pendientes = ["(no se pudo comparar con el sello: commit reescrito o rama nueva)"];
  }
  if (pendientes.length) {
    problemas.push(
      `el índice se construyó para ${sello.slice(0, 7)} y desde ahí cambiaron ${pendientes.length} archivo(s) indexables (${pendientes.slice(0, 3).join(", ")}${pendientes.length > 3 ? "…" : ""}): una consulta contestaría con el repo viejo. Arreglo: \`${graph.updateCommand}\`.`,
    );
  }
} else {
  // Sin sello (índice hecho a mano con `/graphify .` antes de que existiera el sello):
  // se cae al reloj, con margen para el hook que corre junto al commit.
  const ultimoIndexable = git("log", "-1", "--format=%cI", "--", "*.ts", "*.tsx", "*.js", "*.mjs", "*.md");
  const margenMs = (graph.freshnessGraceSeconds ?? 300) * 1000;
  if (ultimoIndexable && fs.statSync(graphFile).mtimeMs + margenMs < new Date(ultimoIndexable).getTime()) {
    problemas.push(
      `el índice no tiene sello y es más viejo que el último commit con archivos indexables: reconstruilo con \`${graph.updateCommand}\` (el post-commit deja el sello en \`${graph.stampFile}\`).`,
    );
  }
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
