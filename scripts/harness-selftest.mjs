#!/usr/bin/env node
/**
 * Self-test del arnés — prueba de vida.
 *
 * Un hook roto o un config que apunta a la nada fallan EN SILENCIO: ninguna otra señal
 * los ve. Este script responde, para cada regla, la única pregunta que importa:
 * «¿qué comando falla si alguien la viola?». La respuesta es este comando.
 *
 * Cubre:
 *   1. cada hook declarado en .claude/settings.json existe y es ejecutable por node;
 *   2. cada ruta y cada regex de .claude/harness.config.json resuelve/compila;
 *   3. los hooks BLOQUEAN de verdad lo que dicen bloquear (se ejecutan con payloads reales);
 *   4. el clasificador SDD no se degrada (casos de ruteo fijos);
 *   5. subagentes y comandos citados por el arnés existen;
 *   6. el kit de SDD está instalado (en CI se reporta "omitido", nunca "pasó").
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const abs = (p) => path.join(REPO_ROOT, p);
const config = JSON.parse(fs.readFileSync(abs(".claude/harness.config.json"), "utf8"));
const settings = JSON.parse(fs.readFileSync(abs(".claude/settings.json"), "utf8"));

let failures = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, detail) => {
  failures += 1;
  console.error(`  ✗ ${name}\n      ${detail}`);
};
const skip = (name, detail) => console.log(`  – ${name} (omitido: ${detail})`);
const section = (title) => console.log(`\n${title}`);

/** Ejecuta un hook con un payload de entrada y devuelve {status, stderr, stdout}. */
function runHook(hookFile, payload) {
  const res = spawnSync("node", [abs(`.claude/hooks/${hookFile}`)], {
    input: JSON.stringify({ cwd: REPO_ROOT, ...payload }),
    encoding: "utf8",
  });
  return { status: res.status, stderr: res.stderr ?? "", stdout: res.stdout ?? "" };
}

const writeInput = (file, content = "x") => ({
  hook_event_name: "PreToolUse",
  tool_name: "Write",
  tool_input: { file_path: abs(file), content },
});

// ── 1. Hooks declarados vs. hooks que existen ────────────────────────────────
section("1. settings.json → hooks declarados");
const declared = [];
for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
  for (const group of groups) {
    for (const hook of group.hooks ?? []) {
      const file = /node\s+(\S+)/.exec(hook.command)?.[1];
      declared.push({ event, command: hook.command, file });
    }
  }
}
if (!declared.length) bad("hay hooks declarados", "settings.json no declara ninguno: el arnés está instalado y muerto");
for (const d of declared) {
  if (!d.file || !fs.existsSync(abs(d.file))) bad(`${d.event} → ${d.command}`, "el archivo del hook no existe");
  else {
    const syntax = spawnSync("node", ["--check", abs(d.file)], { encoding: "utf8" });
    if (syntax.status !== 0) bad(`${d.event} → ${d.file}`, syntax.stderr.trim());
    else ok(`${d.event} → ${d.file}`);
  }
}

// ── 2. El config no apunta a la nada ─────────────────────────────────────────
section("2. harness.config.json → rutas y regex");
const mustExist = [
  config.notation.source,
  config.purity.dir,
  config.webgpu.file,
  config.status.file,
  config.lint.command[1],
  ...config.notation.allow,
  ...(config.reuse ?? []).map((r) => r.see),
];
for (const p of mustExist) {
  if (fs.existsSync(abs(p))) ok(`existe ${p}`);
  else bad(`existe ${p}`, "referenciado por la config y no está en el repo");
}

const regexes = [
  ...(config.protectedPaths ?? []).map((r) => ["protectedPaths", r.pattern]),
  ...(config.bash?.deny ?? []).map((r) => ["bash.deny", r.pattern]),
  ...(config.reuse ?? []).flatMap((r) => [["reuse.pattern", r.pattern], ["reuse.appliesTo", r.appliesTo]]),
  ...(config.sdd?.routes ?? []).flatMap((r) => (r.patterns ?? []).map((p) => [`sdd.${r.route}`, p])),
  ...(config.graph?.questionPatterns ?? []).map((p) => ["graph.questionPatterns", p]),
];
let badRegex = 0;
for (const [where, pattern] of regexes) {
  try {
    new RegExp(pattern, "i");
  } catch (e) {
    badRegex += 1;
    bad(`regex de ${where}`, `\`${pattern}\` no compila: ${e.message}`);
  }
}
if (!badRegex) ok(`${regexes.length} expresiones regulares compilan`);

// ── 3. Los hooks bloquean lo que dicen bloquear ──────────────────────────────
section("3. los frenos muerden");
const blocks = [
  ["protected-paths.mjs", ".env editable", writeInput(".env"), 2],
  ["protected-paths.mjs", "package-lock.json editable", writeInput("package-lock.json"), 2],
  ["protected-paths.mjs", "build/ editable", writeInput("build/main.js"), 2],
  ["protected-paths.mjs", "código normal pasa", writeInput("src/lib/graph-processor.ts"), 0],
  ["bash-guard.mjs", "--no-verify", { tool_input: { command: "git commit -m x --no-verify" } }, 2],
  ["bash-guard.mjs", "reset --hard", { tool_input: { command: "git reset --hard HEAD~1" } }, 2],
  ["bash-guard.mjs", "git add .", { tool_input: { command: "git add ." } }, 2],
  ["bash-guard.mjs", "sed -i sobre src", { tool_input: { command: "sed -i '' 's/a/b/g' src/lib/*.ts" } }, 2],
  ["bash-guard.mjs", "rm -rf de fuente", { tool_input: { command: "rm -rf src/components" } }, 2],
  ["bash-guard.mjs", "find -delete", { tool_input: { command: "find . -name '*.tmp' -delete" } }, 2],
  ["bash-guard.mjs", "comando inocuo pasa", { tool_input: { command: "npm run test" } }, 0],
  ["reuse-guard.mjs", "ipcRenderer en el renderer", writeInput("src/hooks/useX.ts", 'ipcRenderer.invoke("x")'), 2],
  ["reuse-guard.mjs", "SDK de nube instanciado", writeInput("main/services/x.ts", "const c = new Anthropic({});"), 2],
  ["reuse-guard.mjs", "código sin boilerplate pasa", writeInput("src/hooks/useX.ts", "export const useX = () => 1;"), 0],
];
for (const [hook, name, payload, expected] of blocks) {
  const res = runHook(hook, payload);
  if (res.status === expected) ok(`${hook}: ${name}`);
  else bad(`${hook}: ${name}`, `esperaba exit ${expected}, salió ${res.status}. stderr: ${res.stderr.trim().slice(0, 200)}`);
}

// gate-stop: bloquea con marcador presente, deja pasar sin él. Se restaura el estado real.
{
  const marker = abs(config.gate.marker);
  const had = fs.existsSync(marker);
  const previous = had ? fs.readFileSync(marker, "utf8") : null;
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, "selftest");
    const blocked = runHook("gate-stop.mjs", { hook_event_name: "Stop" });
    if (blocked.status === 2) ok("gate-stop.mjs: cierre bloqueado con gate pendiente");
    else bad("gate-stop.mjs: cierre bloqueado con gate pendiente", `esperaba exit 2, salió ${blocked.status}`);

    fs.rmSync(marker);
    const free = runHook("gate-stop.mjs", { hook_event_name: "Stop" });
    if (free.status === 0) ok("gate-stop.mjs: cierre libre con gate verde");
    else bad("gate-stop.mjs: cierre libre con gate verde", `esperaba exit 0, salió ${free.status}`);
  } finally {
    if (had) fs.writeFileSync(marker, previous);
    else if (fs.existsSync(marker)) fs.rmSync(marker);
  }
}

/**
 * Corre el lint sobre un archivo QUE NO EXISTE: la ruta elige las reglas y el
 * contenido viaja por stdin. Antes esto se probaba escribiendo temporales dentro
 * de `src/`; con `next dev` vivo, el watcher los veía aparecer y desaparecer y
 * el build moría con `ENOENT ... __harness-selftest-tmp.tsx`. El self-test ya no
 * escribe una sola línea en el árbol de fuentes.
 */
function lintVirtual(rutaVirtual, contenido) {
  const res = spawnSync(
    "node",
    [abs("scripts/repo-lint.mjs"), "--file", rutaVirtual, "--stdin"],
    { cwd: REPO_ROOT, encoding: "utf8", input: contenido },
  );
  return { status: res.status, salida: `${res.stderr}${res.stdout}` };
}

/** Un freno del lint muerde: el caso impuro sale con exit 1 y nombra su regla. */
function frenoDelLint(titulo, rutaVirtual, contenido, regla, extras = []) {
  const { status, salida } = lintVirtual(rutaVirtual, contenido);
  const pega = status === 1 && new RegExp(regla).test(salida);
  const conExtras = extras.every((e) => salida.includes(e));
  if (pega && conExtras) ok(titulo);
  else bad(titulo, `exit ${status}: ${salida.trim().slice(0, 240)}`);
}

// El lint del repo también tiene que morder: se prueba con un archivo impuro virtual.
frenoDelLint(
  "repo-lint: detecta React dentro de src/lib",
  "src/lib/__selftest.ts",
  'import { useState } from "react";\nexport const x = useState;\n',
  "PUREZA",
);

// DEPSHOOK: el freno que faltaba cuando un hook midió con la notación pero no
// reaccionaba a ella. Sin ESLint en el repo, esta regla es el único mecanismo.
frenoDelLint(
  "repo-lint: detecta hook que usa notationId sin declararlo",
  "src/components/__selftest.tsx",
  "export const X = () => {\n  const w = useMemo(() => medir(nodes, notationId), [nodes]);\n  return w;\n};\n",
  "DEPSHOOK",
);

// TOKENS: el color y la escala salen del tema. Sin este freno, el modo oscuro se
// rompe de a un archivo por vez (spec 003).
frenoDelLint(
  "repo-lint: detecta color crudo y tamaño de letra arbitrario",
  "src/components/__selftest-tokens.tsx",
  'export const X = () => <div className="bg-green-100 text-[11px]" />;\n',
  "TOKENS",
  ["bg-green-100", "text-[11px]"],
);

// SVGFILL: el texto de un <text> SVG sin `fill` cae a negro. Compila, pasa los
// tests y sólo se ve mirando la pantalla: por eso necesita un freno.
frenoDelLint(
  "repo-lint: detecta <text> de SVG sin fill",
  "src/components/__selftest-svg.tsx",
  'export const X = () => <svg><text className="text-sm">hola</text></svg>;\n',
  "SVGFILL",
);

// PLATAFORMA: la detección del SO vive en un solo módulo y sin API deprecada.
frenoDelLint(
  "repo-lint: detecta navigator.platform fuera de lib/platform",
  "src/components/__selftest-plat.tsx",
  'export const esMac = () => navigator.platform.includes("Mac");\n',
  "PLATAFORMA",
);

// El índice de graphify: el hook empuja a consultarlo SÓLO si existe, y la señal
// del gate se omite donde no está (CI). Las dos mitades se prueban acá porque un
// hook que habla sin grafo, o un gate rojo en CI por un derivado, terminan
// desactivados a mano.
{
  const grafoPresente = fs.existsSync(abs(config.graph.graphFile));
  const pregunta = { hook_event_name: "UserPromptSubmit", prompt: "dónde está el graph-processor" };
  const res = runHook("graph-first.mjs", pregunta);
  const hablo = res.stdout.includes("graph-first");
  if (hablo === grafoPresente) {
    ok(`graph-first.mjs: ${grafoPresente ? "empuja al índice cuando el grafo existe" : "callado sin grafo construido"}`);
  } else {
    bad("graph-first.mjs", `grafo ${grafoPresente ? "presente" : "ausente"} y salida ${hablo ? "con" : "sin"} aviso`);
  }

  // Silencio en lo trivial: un hook que habla en cada turno deja de leerse.
  const trivial = runHook("graph-first.mjs", { hook_event_name: "UserPromptSubmit", prompt: "gracias, dale" });
  if (trivial.stdout.trim() === "") ok("graph-first.mjs: callado en lo que no es pregunta de código");
  else bad("graph-first.mjs: callado en lo trivial", trivial.stdout.trim().slice(0, 160));

  const check = spawnSync("node", [abs("scripts/graph-check.mjs")], { cwd: REPO_ROOT, encoding: "utf8" });
  if (check.status === 0) ok("graph-check: verde (índice al día u omitido donde no existe)");
  else bad("graph-check", `${check.stdout}${check.stderr}`.trim().slice(0, 240));
}

// RELEASE: una versión sin notas en el repo es gate rojo. Sin este freno, el
// borrador del release sale vacío y las notas se improvisan en la web al publicar.
{
  const res = spawnSync("node", [abs("scripts/repo-lint.mjs"), "--release-check", "99.99.99"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const salida = `${res.stderr}${res.stdout}`;
  if (res.status === 1 && /RELEASE/.test(salida)) ok("repo-lint: exige notas de release para la versión que se empaqueta");
  else bad("repo-lint: exige notas de release", `exit ${res.status}: ${salida.trim().slice(0, 240)}`);

  // Y la versión real SÍ las tiene: si no, el freno estaría midiendo el aire.
  const version = JSON.parse(fs.readFileSync(abs("package.json"), "utf8")).version;
  const real = spawnSync("node", [abs("scripts/repo-lint.mjs"), "--release-check", version], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  if (real.status === 0) ok(`las notas de ${version} existen y están completas`);
  else bad(`las notas de ${version}`, `${real.stderr}${real.stdout}`.trim().slice(0, 240));
}

// El link-check mide contra `git ls-files`, no contra el disco: un puntero a un
// archivo gitignored existe en TU máquina y no en el clon de CI. Ese fue el gate
// verde local y rojo en CI de `.tessl/RULES.md`.
{
  const linkcheckVirtual = (contenido) => {
    const res = spawnSync(
      "node",
      [abs("scripts/docs-linkcheck.mjs"), "--file", "docs/__virtual.md", "--stdin"],
      { cwd: REPO_ROOT, encoding: "utf8", input: contenido },
    );
    return { status: res.status, salida: `${res.stderr}${res.stdout}` };
  };

  const cebo = abs(".claude/__selftest-ignorado.md");
  try {
    fs.writeFileSync(cebo, "# temporal del self-test\n");
    const { status, salida } = linkcheckVirtual("ver `.claude/__selftest-ignorado.md`\n");
    if (status === 1 && salida.includes("gitignored")) {
      ok("docs-linkcheck: caza un puntero a un archivo gitignored");
    } else {
      bad("docs-linkcheck: caza un puntero a un archivo gitignored", `exit ${status}: ${salida.trim().slice(0, 240)}`);
    }
  } finally {
    fs.rmSync(cebo, { force: true });
  }

  // Y lo declarado como externo (lo genera una herramienta fuera del repo) no molesta.
  const externos = JSON.parse(fs.readFileSync(abs(".claude/harness.config.json"), "utf8")).docs.externalPaths ?? [];
  if (externos.length) {
    const { status } = linkcheckVirtual(`ver \`${externos[0]}RULES.md\`\n`);
    if (status === 0) ok("docs-linkcheck: respeta docs.externalPaths");
    else bad("docs-linkcheck: respeta docs.externalPaths", `exit ${status} para ${externos[0]}`);
  }
}

// El self-test no deja rastro en el árbol de fuentes: si algún freno vuelve a
// escribir un temporal en `src/`, esto lo caza (era el ENOENT del build con dev vivo).
{
  const sospechosos = [];
  const buscar = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) buscar(p);
      else if (/__(harness-)?selftest/.test(e.name)) sospechosos.push(path.relative(REPO_ROOT, p));
    }
  };
  buscar(abs("src"));
  if (!sospechosos.length) ok("el self-test no escribe temporales dentro de src/");
  else bad("el self-test no escribe temporales dentro de src/", `quedaron: ${sospechosos.join(", ")}`);
}

// ── 4. El clasificador SDD no se degrada ─────────────────────────────────────
section("4. clasificador SDD");
const routeCases = [
  ["quiero una nueva feature de exportación a PDF", "sdd"],
  ["armemos el MVP del merger multi-vista", "sdd"],
  ["hay que soportar una nueva notación ArchiMate", "sdd"],
  ["el canvas se rompe al arrastrar un contenedor", "bugfix"],
  ["esto no funciona cuando la vista está vacía", "bugfix"],
  ["cambiá el system prompt del agente local", "ai"],
  ["corregí un typo en el tooltip del sidebar", null],
  ["explicame cómo funciona graph-processor", null],
];
for (const [prompt, expected] of routeCases) {
  const res = runHook("sdd-router.mjs", { hook_event_name: "UserPromptSubmit", prompt });
  const routed = /\*\*(\w+)\*\*/.exec(res.stdout)?.[1] ?? null;
  const matches = expected === null ? res.stdout.trim() === "" : routed === expected;
  if (matches) ok(`«${prompt.slice(0, 40)}…» → ${expected ?? "sin ruteo"}`);
  else bad(`«${prompt.slice(0, 40)}…»`, `esperaba ${expected ?? "silencio"}, obtuvo ${routed ?? "silencio"}`);
}

// ── 5. Subagentes y comandos ─────────────────────────────────────────────────
section("5. subagentes y comandos");
for (const [dir, expected] of [
  [".claude/agents", ["explorer.md", "reviewer.md", "gate-runner.md"]],
  [".claude/commands", ["gate.md", "lesson.md", "harness-audit.md"]],
]) {
  for (const file of expected) {
    if (fs.existsSync(abs(`${dir}/${file}`))) ok(`${dir}/${file}`);
    else bad(`${dir}/${file}`, "citado por docs/harness/harness.md y no existe: flujo re-tipeado a mano");
  }
}

// ── 6. Kit de SDD instalado ──────────────────────────────────────────────────
section("6. kit de SDD");
const skillRoots = (config.sdd.skillRoots ?? []).map((r) => (r.startsWith("~") ? path.join(os.homedir(), r.slice(1)) : abs(r)));
const missingSkills = config.sdd.phases.filter((phase) => !skillRoots.some((root) => fs.existsSync(path.join(root, phase))));
if (!missingSkills.length) ok(`las ${config.sdd.phases.length} fases del kit \`${config.sdd.kit}\` están instaladas`);
else if (process.env.CI) skip("kit de SDD instalado", `faltan ${missingSkills.length} fases; el kit no se versiona en el repo`);
else bad("kit de SDD instalado", `faltan: ${missingSkills.join(", ")}. Instalá el kit o corregí \`sdd.skillRoots\` en la config.`);

// El puntero de feature activa no puede quedar colgado.
const pointer = abs(config.sdd.activeFeaturePointer);
if (fs.existsSync(pointer)) {
  const active = fs.readFileSync(pointer, "utf8").trim();
  if (!active) ok("puntero de feature activa vacío (sin SDD en curso)");
  else if (fs.existsSync(abs(path.join(config.sdd.specsDir, active)))) ok(`feature activa: ${active}`);
  else bad("puntero de feature activa", `apunta a \`${config.sdd.specsDir}/${active}\`, que no existe`);
} else {
  ok("sin puntero de feature activa");
}

// ── Veredicto ────────────────────────────────────────────────────────────────
console.log("");
if (failures) {
  console.error(`harness-selftest: ${failures} problema(s). El arnés no está vivo.`);
  process.exit(1);
}
console.log("harness-selftest: ok");
