#!/usr/bin/env node
/**
 * La ruta SDD vive en GitHub: los artefactos de una feature son Issues, no archivos.
 *
 * Por qué se movió: `specs/<NNN>/` versionaba spec, plan y tasks junto al código, y ahí
 * el plan no se puede asignar, no tiene estado propio y nadie externo lo ve. Un tablero
 * de tareas dentro del repo es un tablero que sólo lee quien ya clonó.
 *
 * Forma en GitHub (una feature = un árbol de issues):
 *
 *   #N  [sdd] NNN · <título>          ← issue MADRE: spec en el cuerpo; plan/checklist/
 *                                       testify/analyze como comentarios
 *    ├─ #N+1  NNN · T1 — <tarea>      ← un issue por TAREA (asignable, cerrable)
 *    └─ …                                labels: sdd:feature | sdd:task · feature:NNN
 *
 * Subcomandos:
 *
 *   node scripts/sdd-github.mjs migrate [--apply]     migra specs/ a issues (dry-run por defecto)
 *   node scripts/sdd-github.mjs new <archivo.md>      abre la issue madre de una feature nueva
 *   node scripts/sdd-github.mjs tasks <issue> <tasks.md>   crea las issues de tarea y las enlaza
 *   node scripts/sdd-github.mjs status                 qué hay abierto, por feature
 *   node scripts/sdd-github.mjs check                  señal del gate (ver abajo)
 *
 * `check` es la parte que impide volver atrás: si aparece un artefacto SDD dentro del
 * repo (`specs/**` fuera de lo permitido), el gate se pone rojo y dice dónde va.
 * No toca la red: el gate corre en CI y offline.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude", "harness.config.json"), "utf8"));
const sdd = config.sdd;
const gh = sdd.github;

const abs = (p) => path.join(REPO_ROOT, p);
const leer = (p) => fs.readFileSync(abs(p), "utf8");

/** `gh` con el repo fijado: nunca depende de en qué directorio se lo llame. */
const ghCli = (args, opciones = {}) =>
  execFileSync("gh", [...args, "--repo", gh.repo], { cwd: REPO_ROOT, encoding: "utf8", ...opciones }).trim();

// ── Lectura de los artefactos ────────────────────────────────────────────────

/** Carpetas de feature: `specs/001-nombre`, ordenadas por su número. */
function featureDirs() {
  const dir = abs(sdd.specsDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{3}-/.test(e.name))
    .map((e) => e.name)
    .sort();
}

/** Título de un artefacto: su primer `# …`, sin el prefijo `spec · NNN — `. */
function tituloDe(md, fallback) {
  const h1 = md.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!h1) return fallback;
  return h1.replace(/^\w+\s*·\s*\d{3}\s*[—-]\s*/, "").trim() || fallback;
}

/**
 * Tareas de un `tasks.md`: filas `| T1 | descripción | requisitos | verificación |`
 * más el estado del checklist `- [x] T1 · [ ] T2`. El checklist es la única fuente
 * de si una tarea está hecha: la tabla no lo dice.
 */
function parseTasks(md) {
  // Sin exigir el `-` de la lista: el estado suele venir apilado en una línea
  // (`- [x] T1 · [x] T2 · [ ] T3`), y pedir el guion sólo veía la primera casilla.
  const hechas = new Set();
  for (const m of md.matchAll(/\[([ xX])\]\s*(T\d+)/g)) {
    if (m[1].toLowerCase() === "x") hechas.add(m[2]);
  }
  const tareas = [];
  for (const linea of md.split("\n")) {
    if (!/^\|\s*T\d+\s*\|/.test(linea)) continue;
    const celdas = linea.split("|").slice(1, -1).map((c) => c.trim());
    const [id, descripcion, requisitos = "", verificacion = ""] = celdas;
    tareas.push({ id, descripcion, requisitos, verificacion, hecha: hechas.has(id) });
  }
  return tareas;
}

const RECORTE = 240;
const recorta = (s) => (s.length <= RECORTE ? s : `${s.slice(0, RECORTE - 1)}…`);

// ── migrate ──────────────────────────────────────────────────────────────────

function migrate({ apply }) {
  const features = featureDirs();
  if (!features.length) {
    console.log("No hay carpetas de feature en `%s`: nada que migrar.", sdd.specsDir);
    return;
  }
  console.log(`${apply ? "Migrando" : "DRY-RUN — se migrarían"} ${features.length} feature(s) a ${gh.repo}\n`);
  if (apply) asegurarLabelsBase();

  for (const feature of features) {
    const numero = feature.slice(0, 3);
    const specPath = `${sdd.specsDir}/${feature}/spec.md`;
    if (!fs.existsSync(abs(specPath))) {
      console.log(`· ${feature}: sin spec.md, se salta`);
      continue;
    }
    const spec = leer(specPath);
    const titulo = `[sdd] ${numero} · ${tituloDe(spec, feature)}`;
    const labelFeature = `${gh.featureLabelPrefix}${numero}`;

    const tasksPath = `${sdd.specsDir}/${feature}/tasks.md`;
    const tareas = fs.existsSync(abs(tasksPath)) ? parseTasks(leer(tasksPath)) : [];
    const anexos = gh.artifactOrder.filter((n) => n !== "spec" && n !== "tasks" && fs.existsSync(abs(`${sdd.specsDir}/${feature}/${n}.md`)));

    if (!apply) {
      console.log(`· ${titulo}`);
      console.log(`    labels: ${gh.featureLabel}, ${labelFeature}`);
      console.log(`    cuerpo: spec.md (${spec.length} car.) · comentarios: ${anexos.join(", ") || "—"}`);
      console.log(`    tareas: ${tareas.length} (${tareas.filter((t) => t.hecha).length} ya hechas → se cerrarían)`);
      continue;
    }

    asegurarLabel(labelFeature, `Feature SDD ${numero}`);
    const cuerpo = [
      `> Migrado de \`${specPath}\` (la ruta SDD vive en GitHub: ver \`docs/harness/sdd.md\`).`,
      "",
      spec,
    ].join("\n");
    const url = ghCli([
      "issue",
      "create",
      "--title",
      titulo,
      "--body",
      cuerpo,
      "--label",
      `${gh.featureLabel},${labelFeature}`,
    ]);
    const madre = url.split("/").pop();
    console.log(`· #${madre} ${titulo}`);

    for (const anexo of anexos) {
      const md = leer(`${sdd.specsDir}/${feature}/${anexo}.md`);
      ghCli(["issue", "comment", madre, "--body", `## ${anexo}\n\n${md}`]);
      console.log(`    comentario: ${anexo}.md`);
    }

    const hijos = [];
    for (const t of tareas) {
      const hijoUrl = ghCli([
        "issue",
        "create",
        "--title",
        `${numero} · ${t.id} — ${recorta(t.descripcion)}`,
        "--body",
        [
          `Tarea de #${madre}.`,
          "",
          t.descripcion,
          "",
          `- **Requisitos:** ${t.requisitos || "—"}`,
          `- **Verificación:** ${t.verificacion || "—"}`,
        ].join("\n"),
        "--label",
        `${gh.taskLabel},${labelFeature}`,
      ]);
      const hijo = hijoUrl.split("/").pop();
      hijos.push({ ...t, numero: hijo });
      if (t.hecha) ghCli(["issue", "close", hijo, "--reason", "completed"]);
    }
    if (hijos.length) {
      ghCli([
        "issue",
        "comment",
        madre,
        "--body",
        ["## Tareas", "", ...hijos.map((h) => `- [${h.hecha ? "x" : " "}] #${h.numero} — ${h.id}`)].join("\n"),
      ]);
      console.log(`    ${hijos.length} tarea(s), ${hijos.filter((h) => h.hecha).length} cerradas`);
    }
  }
}

/** Los dos labels base. Sin ellos `issue create --label` falla entero, no avisa y no crea. */
function asegurarLabelsBase() {
  asegurarLabel(gh.featureLabel, "Feature de la ruta SDD (spec en el cuerpo)");
  asegurarLabel(gh.taskLabel, "Tarea de una feature SDD");
}

/** Crea el label si falta. `gh label create` falla si ya existe: eso no es un error. */
function asegurarLabel(nombre, descripcion) {
  try {
    ghCli(["label", "create", nombre, "--description", descripcion, "--color", gh.labelColor], { stdio: "pipe" });
  } catch {
    /* ya existía */
  }
}

// ── new · tasks · status ─────────────────────────────────────────────────────

function nuevaFeature(archivo) {
  const md = fs.readFileSync(archivo, "utf8");
  asegurarLabelsBase();
  const numero = path.basename(archivo).match(/(\d{3})/)?.[1] ?? "";
  const labelFeature = numero ? `${gh.featureLabelPrefix}${numero}` : null;
  if (labelFeature) asegurarLabel(labelFeature, `Feature SDD ${numero}`);
  const titulo = `[sdd] ${numero ? `${numero} · ` : ""}${tituloDe(md, path.basename(archivo, ".md"))}`;
  const url = ghCli([
    "issue",
    "create",
    "--title",
    titulo,
    "--body",
    md,
    "--label",
    [gh.featureLabel, labelFeature].filter(Boolean).join(","),
  ]);
  console.log(url);
}

function tareasDesde(issueMadre, archivo) {
  const md = fs.readFileSync(archivo, "utf8");
  const tareas = parseTasks(md);
  if (!tareas.length) {
    console.error(`No encontré filas \`| T1 | … |\` en ${archivo}.`);
    process.exit(1);
  }
  asegurarLabelsBase();
  const etiquetas = ghCli(["issue", "view", issueMadre, "--json", "labels", "--jq", ".labels[].name"]).split("\n");
  const labelFeature = etiquetas.find((l) => l.startsWith(gh.featureLabelPrefix));
  const hijos = [];
  for (const t of tareas) {
    const url = ghCli([
      "issue",
      "create",
      "--title",
      `${labelFeature ? `${labelFeature.replace(gh.featureLabelPrefix, "")} · ` : ""}${t.id} — ${recorta(t.descripcion)}`,
      "--body",
      [`Tarea de #${issueMadre}.`, "", t.descripcion, "", `- **Requisitos:** ${t.requisitos || "—"}`, `- **Verificación:** ${t.verificacion || "—"}`].join("\n"),
      "--label",
      [gh.taskLabel, labelFeature].filter(Boolean).join(","),
    ]);
    hijos.push({ ...t, numero: url.split("/").pop() });
  }
  ghCli([
    "issue",
    "comment",
    issueMadre,
    "--body",
    ["## Tareas", "", ...hijos.map((h) => `- [ ] #${h.numero} — ${h.id}`)].join("\n"),
  ]);
  console.log(`${hijos.length} tarea(s) creadas y enlazadas a #${issueMadre}.`);
}

function status() {
  const salida = ghCli([
    "issue",
    "list",
    "--label",
    gh.featureLabel,
    "--state",
    "all",
    "--json",
    "number,title,state,labels",
    "--limit",
    "100",
  ]);
  const features = JSON.parse(salida);
  if (!features.length) {
    console.log(`No hay issues con la etiqueta \`${gh.featureLabel}\` en ${gh.repo}.`);
    return;
  }
  for (const f of features.sort((a, b) => a.number - b.number)) {
    const labelFeature = f.labels.map((l) => l.name).find((n) => n.startsWith(gh.featureLabelPrefix));
    const abiertas = labelFeature
      ? JSON.parse(ghCli(["issue", "list", "--label", `${gh.taskLabel},${labelFeature}`, "--state", "open", "--json", "number", "--limit", "200"])).length
      : 0;
    const todas = labelFeature
      ? JSON.parse(ghCli(["issue", "list", "--label", `${gh.taskLabel},${labelFeature}`, "--state", "all", "--json", "number", "--limit", "200"])).length
      : 0;
    console.log(`#${f.number} [${f.state}] ${f.title} — tareas: ${todas - abiertas}/${todas} cerradas`);
  }
}

// ── check (señal del gate, sin red) ──────────────────────────────────────────

function check() {
  const dir = abs(sdd.specsDir);
  if (!fs.existsSync(dir)) {
    console.log(`sdd-github: ok — no hay \`${sdd.specsDir}/\`; la ruta SDD vive en ${gh.repo}.`);
    return;
  }
  const permitidos = new Set(gh.allowedInRepo ?? []);
  const sobrantes = [];
  const caminar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.relative(REPO_ROOT, path.join(d, e.name)).split(path.sep).join("/");
      if (e.isDirectory()) caminar(path.join(d, e.name));
      else if (!permitidos.has(p)) sobrantes.push(p);
    }
  };
  caminar(dir);
  if (sobrantes.length) {
    console.error(
      [
        `sdd-github: ${sobrantes.length} artefacto(s) SDD dentro del repo:`,
        ...sobrantes.map((s) => `  - ${s}`),
        "",
        `Los artefactos de una feature son Issues de ${gh.repo}: la issue madre lleva el spec (y el plan/checklist/testify como comentarios) y cada tarea es su propio issue.`,
        "Abrí la feature con `npm run sdd:new <archivo.md>` y sus tareas con `npm run sdd:tasks <issue> <tasks.md>`; después borrá el archivo del repo.",
        "Criterio completo: docs/harness/sdd.md.",
      ].join("\n"),
    );
    process.exit(1);
  }
  console.log(`sdd-github: ok — \`${sdd.specsDir}/\` sólo tiene lo declarado; la ruta SDD vive en ${gh.repo}.`);
}

// ── Ejecución ────────────────────────────────────────────────────────────────

const [subcomando, ...resto] = process.argv.slice(2);
switch (subcomando) {
  case "migrate":
    migrate({ apply: resto.includes("--apply") });
    break;
  case "new":
    if (!resto[0]) {
      console.error("Uso: node scripts/sdd-github.mjs new <archivo.md>");
      process.exit(1);
    }
    nuevaFeature(resto[0]);
    break;
  case "tasks":
    if (!resto[1]) {
      console.error("Uso: node scripts/sdd-github.mjs tasks <issue-madre> <tasks.md>");
      process.exit(1);
    }
    tareasDesde(resto[0].replace(/^#/, ""), resto[1]);
    break;
  case "status":
    status();
    break;
  case "check":
    check();
    break;
  default:
    console.error("Subcomandos: migrate [--apply] · new <archivo.md> · tasks <issue> <tasks.md> · status · check");
    process.exit(1);
}
