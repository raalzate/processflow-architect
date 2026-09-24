#!/usr/bin/env node
/**
 * Adaptador del panel del arnés a ESTE gestor (GitHub Issues). Es del repo y no del arnés a
 * propósito: ningún script del arnés conoce una forja, así que cada repo escribe el suyo contra el
 * contrato de `panel.tracker.command` (docs/panel.md):
 *
 *   stdout → { "items": [{ id, title, state, url, type, createdAt, closedAt, inPlan }] }
 *
 * UNA sola llamada a `gh`: todas las issues del repo, con sus fechas. Las del plan son las que
 * lleva el label de tarea de la ruta SDD (`sdd.github.taskLabel`), porque acá el plan vive en
 * GitHub y no en archivos; el resto viaja con `inPlan: false`, sólo para resolver las citas de la
 * memoria (`#123`) sin contarse como alcance del burn-down.
 *
 * Toca la red: no es una señal del gate. Si `gh` no está o no tiene sesión (CI), sale con 1 y el
 * panel lo muestra como «sin dato» con este error, nunca como un tablero en cero.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(RAIZ, ".claude", "harness.config.json"), "utf8"));
const gh = config.sdd?.github ?? {};
if (!gh.repo) {
  process.stderr.write("panel-gestor: el config no declara `sdd.github.repo`.\n");
  process.exit(1);
}
const etiquetaDeTarea = gh.taskLabel ?? "sdd:task";

let crudo;
try {
  crudo = execFileSync(
    "gh",
    ["issue", "list", "--repo", gh.repo, "--state", "all", "--limit", "2000", "--json", "number,title,state,url,createdAt,closedAt,labels"],
    { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (e) {
  process.stderr.write(`panel-gestor: gh falló — ${String(e.stderr ?? e.message).trim().split("\n")[0]}\n`);
  process.exit(1);
}

const items = JSON.parse(crudo)
  .map((i) => {
    const etiquetas = (i.labels ?? []).map((l) => l.name);
    return {
      id: `#${i.number}`,
      title: i.title,
      state: String(i.state).toLowerCase(),
      url: i.url,
      type: etiquetas.includes(etiquetaDeTarea) ? "tarea" : etiquetas.includes(gh.featureLabel ?? "sdd:feature") ? "feature" : "issue",
      createdAt: i.createdAt,
      closedAt: i.closedAt || null,
      inPlan: etiquetas.includes(etiquetaDeTarea),
    };
  })
  // Orden estable: el panel tiene que salir igual con la misma respuesta.
  .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

process.stdout.write(`${JSON.stringify({ items })}\n`);
