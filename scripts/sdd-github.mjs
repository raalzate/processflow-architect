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
 *   node scripts/sdd-github.mjs mirror-docs [--apply] espeja gotchas y ADRs a issues (no borra archivos)
 *   node scripts/sdd-github.mjs new <archivo.md>      abre la issue madre de una feature nueva
 *   node scripts/sdd-github.mjs tasks <issue> <tasks.md>   crea las issues de tarea y las enlaza
 *   node scripts/sdd-github.mjs status                 qué hay abierto, por feature
 *
 * Todo subcomando toca la red (`gh`): esto NO es una señal del gate. Hubo un `check`
 * que prohibía artefactos SDD bajo `specs/` y un `migrate` que traía esas carpetas
 * acá; se fueron con el directorio (#156). Que la ruta SDD viva en Issues es hoy
 * convención escrita (docs/harness/sdd.md), no un freno.
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

/** Los dos labels base. Sin ellos `issue create --label` falla entero, no avisa y no crea. */
function asegurarLabelsBase() {
  asegurarLabel(gh.featureLabel, "Feature de la ruta SDD (spec en el cuerpo)");
  asegurarLabel(gh.taskLabel, "Tarea de una feature SDD");
}

/**
 * Los labels de un issue, ya creado. Se lee de la API porque NO se puede confiar en
 * `--label` ni en el código de salida: si la cuenta activa de `gh` no tiene permiso de
 * triage, GitHub descarta los labels y crea el issue igual, y `gh issue edit` imprime
 * «failed to update 1 issue» **saliendo 0** (#158). Lo único que dice la verdad es releer.
 */
function labelsDe(numero) {
  try {
    return ghCli(["issue", "view", numero, "--json", "labels", "--jq", ".labels[].name"])
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Exige que el issue quede con `esperados`. Reintenta una vez con `issue edit` y, si
 * tampoco entran, MUERE con la causa y el remedio: un issue sin label es un issue que
 * nadie encuentra, y el fallo original de #157 fue justamente pasar en verde.
 */
function exigirLabels(urlONumero, esperados) {
  const numero = String(urlONumero).split("/").pop();
  const faltan = () => esperados.filter((l) => !labelsDe(numero).includes(l));

  if (!faltan().length) return;
  try {
    ghCli(["issue", "edit", numero, "--add-label", faltan().join(",")], { stdio: "pipe" });
  } catch {
    /* el diagnóstico real lo da la relectura de abajo, no esta excepción */
  }
  const restan = faltan();
  if (!restan.length) return;

  const cuenta = (() => {
    try {
      return execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8" }).trim();
    } catch {
      return "(desconocida)";
    }
  })();
  console.error(
    [
      `El issue #${numero} quedó SIN los labels ${restan.map((l) => `\`${l}\``).join(", ")}.`,
      "",
      `Causa habitual: la cuenta activa de \`gh\` (${cuenta}) no tiene permiso de triage/write en ${gh.repo},`,
      "así que GitHub descarta los labels y crea el issue igual, sin fallar.",
      "",
      `Remedio: \`gh auth status\` para ver las cuentas, \`gh auth switch -u <dueño>\` y después`,
      `\`gh issue edit ${numero} --repo ${gh.repo} --add-label ${restan.join(",")}\`.`,
    ].join("\n"),
  );
  process.exit(1);
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
  exigirLabels(url, [gh.featureLabel, labelFeature].filter(Boolean));
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
    exigirLabels(url, [gh.taskLabel, labelFeature].filter(Boolean));
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

// ── mirror-docs (gotchas y ADRs a issues) ────────────────────────────────────

/**
 * Espeja a issues los registros que ya viven en el repo: los incidentes de
 * `gotchas.md` y las decisiones de `docs/decisions/`.
 *
 * Espeja, no muda, y el motivo es que los archivos son MECANISMO: la regla
 * INCIDENTE del lint exige cada gotcha con su línea `Mecanismo:` (P12) y un ADR
 * explica el código, así que tiene que viajar con el clon. Lo que se gana en
 * GitHub es lo que un archivo no da: buscable desde afuera, comentable y enlazable
 * desde un commit o un PR. Cada entrada queda con su `Issue: #N`, y esa línea es
 * lo que hace el comando idempotente: lo ya espejado no se duplica.
 *
 * Nacen CERRADAS: son registro de algo que ya pasó, no trabajo pendiente.
 */
function mirrorDocs({ apply }) {
  const gotchasFile = config.incidents.file;
  const md = leer(gotchasFile);
  const heading = config.incidents.heading;
  const partes = md.split(new RegExp(`(?=^${heading})`, "m"));
  const pendientes = partes.filter((b) => b.startsWith(heading) && !/^Issue:\s*#\d+/m.test(b));

  const adrDir = gh.decisionsDir;
  const adrs = fs.existsSync(abs(adrDir))
    ? fs.readdirSync(abs(adrDir)).filter((f) => f.endsWith(".md")).filter((f) => !/^Issue:\s*#\d+/m.test(leer(`${adrDir}/${f}`)))
    : [];

  if (!apply) {
    console.log(`DRY-RUN — se espejarían a ${gh.repo}:`);
    console.log(`  ${pendientes.length} gotcha(s) sin issue de ${partes.filter((b) => b.startsWith(heading)).length} en ${gotchasFile}`);
    console.log(`  ${adrs.length} ADR(s) sin issue en ${adrDir}`);
    console.log("Los archivos NO se borran: son el mecanismo (regla INCIDENTE + P12). Se les agrega la línea `Issue: #N`.");
    return;
  }

  asegurarLabel(gh.gotchaLabel, "Incidente registrado en docs/harness/gotchas.md");
  asegurarLabel(gh.adrLabel, "Decisión de arquitectura (docs/decisions/)");

  let nuevoMd = md;
  for (const bloque of pendientes) {
    const titulo = bloque.split("\n")[0].replace(heading, "").replace(/^:\s*/, "").trim();
    const cuerpo = [
      `Registrado en \`${gotchasFile}\` (el archivo es el mecanismo: la regla INCIDENTE del lint exige su línea \`Mecanismo:\`).`,
      "",
      bloque.trim(),
    ].join("\n");
    const url = ghCli(["issue", "create", "--title", `[gotcha] ${recorta(titulo)}`, "--body", cuerpo, "--label", gh.gotchaLabel]);
    exigirLabels(url, [gh.gotchaLabel]);
    const numero = url.split("/").pop();
    ghCli(["issue", "close", numero, "--reason", "completed"]);
    // La línea va justo después del encabezado: queda visible al leer el gotcha.
    const lineas = bloque.split("\n");
    lineas.splice(1, 0, "", `Issue: #${numero}`);
    nuevoMd = nuevoMd.replace(bloque, lineas.join("\n"));
    console.log(`· #${numero} [gotcha] ${titulo}`);
  }
  if (pendientes.length) fs.writeFileSync(abs(gotchasFile), nuevoMd);

  for (const archivo of adrs) {
    const ruta = `${adrDir}/${archivo}`;
    const contenido = leer(ruta);
    const titulo = tituloDe(contenido, archivo.replace(/\.md$/, ""));
    const cuerpo = [`Decisión versionada en \`${ruta}\`: el archivo manda y viaja con el clon.`, "", contenido].join("\n");
    const url = ghCli(["issue", "create", "--title", `[adr] ${recorta(titulo)}`, "--body", cuerpo, "--label", gh.adrLabel]);
    exigirLabels(url, [gh.adrLabel]);
    const numero = url.split("/").pop();
    ghCli(["issue", "close", numero, "--reason", "completed"]);
    const lineas = contenido.split("\n");
    const iH1 = lineas.findIndex((l) => l.startsWith("# "));
    lineas.splice(iH1 + 1, 0, "", `Issue: #${numero}`);
    fs.writeFileSync(abs(ruta), lineas.join("\n"));
    console.log(`· #${numero} [adr] ${titulo}`);
  }
}

// ── Ejecución ────────────────────────────────────────────────────────────────

const [subcomando, ...resto] = process.argv.slice(2);
switch (subcomando) {
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
  case "mirror-docs":
    mirrorDocs({ apply: resto.includes("--apply") });
    break;
  case "status":
    status();
    break;
  default:
    console.error("Subcomandos: mirror-docs [--apply] · new <archivo.md> · tasks <issue> <tasks.md> · status");
    process.exit(1);
}
