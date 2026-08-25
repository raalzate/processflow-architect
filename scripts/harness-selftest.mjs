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
  config.aiSurface.extensionPoint,
  config.incidents.file,
  ...config.aiSurface.closedFiles,
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
 * `.githooks/pre-push`: el trabajo entra a main por PR, no de un empujón. Se prueba con
 * la entrada que git le pasa de verdad al hook. El freno fuerte es la protección de rama
 * de GitHub (activada a mano, anotada en STATUS): esto avisa antes de la red.
 */
{
  const empujar = (rama) =>
    spawnSync("bash", [abs(".githooks/pre-push")], {
      cwd: REPO_ROOT,
      input: `refs/heads/${rama} aaa refs/heads/${rama} bbb\n`,
      encoding: "utf8",
    });
  for (const rama of config.branches?.protected ?? []) {
    const r = empujar(rama);
    if (r.status === 1) ok(`pre-push frena el empujón directo a \`${rama}\``);
    else bad(`pre-push frena \`${rama}\``, `exit ${r.status}: el push directo pasa`);
  }
  const libre = empujar("feat/rama-de-prueba");
  if (libre.status === 0) ok("pre-push deja pasar una rama de feature");
  else bad("pre-push deja pasar una rama de feature", `exit ${libre.status}: bloquea de más`);
}

/**
 * «Una pregunta se contesta; una acción se pide». El freno que faltaba: el usuario
 * preguntaba y el agente se iba a editar archivos. El clasificador es lo único que lo
 * separa de un estorbo, así que se prueba con pedidos REALES en las dos direcciones.
 */
{
  const marker = abs(config.askFirst?.marker ?? ".git/agent-answer-first");
  const habia = fs.existsSync(marker);
  const previo = habia ? fs.readFileSync(marker, "utf8") : null;
  const edicion = {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    cwd: REPO_ROOT,
    tool_input: { file_path: abs("src/lib/ejemplo-selftest.ts"), content: "x" },
  };
  const tras = (prompt) => {
    runHook("ask-first.mjs", { hook_event_name: "UserPromptSubmit", prompt });
    return runHook("action-guard.mjs", edicion).status === 2;
  };
  const casos = [
    ["¿por qué el lienzo queda vacío?", true],
    ["qué hace graph-processor", true],
    ["cómo se agrega una notación", true],
    ["pero lo probaste en el binario empaquetado?", true],
    ["arreglá el filtro de notación", false],
    ["dale, hacelo", false],
    ["¿podés arreglar el lienzo?", false],
  ];
  for (const [prompt, debe] of casos) {
    const frena = tras(prompt);
    if (frena === debe) ok(`ask-first: «${prompt.slice(0, 34)}» ${debe ? "frena" : "deja actuar"}`);
    else bad(`ask-first: «${prompt.slice(0, 34)}»`, `esperaba ${debe ? "bloqueo" : "paso libre"}`);
  }
  if (previo !== null) fs.writeFileSync(marker, previo);
  else fs.rmSync(marker, { force: true });
}

/**
 * `.githooks/commit-msg` en un repo git DE VERDAD (temporal, fuera del árbol):
 * el hook lee `git diff --cached`, así que probarlo con payloads falsos no
 * probaría nada. Es el freno que faltaba cuando cuatro arreglos de una sesión
 * llegaron a estar listos sin una sola issue abierta.
 */
{
  const hook = abs(".githooks/commit-msg");

  /**
   * Repo git NUEVO por caso: los archivos staged de un caso anterior seguían
   * ahí (nada se commitea) y el caso "sólo documentación" veía código staged.
   */
  const correr = (archivos, mensaje, configOverride = null) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "harness-commitmsg-"));
    try {
      const git = (...args) => spawnSync("git", args, { cwd: tmp, encoding: "utf8" });
      git("init", "-q");
      git("config", "user.email", "selftest@example.com");
      git("config", "user.name", "selftest");
      // El hook lee `tracker` y `commitMsg` del config del CWD: los patrones ya no
      // están cableados en el bash. `configOverride` es lo que permite probar que
      // el freno sirve con otra forja sin tocar el config del repo.
      fs.mkdirSync(path.join(tmp, ".claude"), { recursive: true });
      const cfg = JSON.parse(fs.readFileSync(abs(".claude/harness.config.json"), "utf8"));
      if (configOverride) Object.assign(cfg, configOverride);
      fs.writeFileSync(path.join(tmp, ".claude/harness.config.json"), JSON.stringify(cfg));
      for (const [rel, contenido] of Object.entries(archivos)) {
        const dest = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, contenido);
      }
      // Sólo los archivos del caso: un `git add -A` staged también el config copiado
      // acá arriba, que cae bajo `codePattern` y ensuciaba el caso de documentación.
      for (const rel of Object.keys(archivos)) git("add", rel);
      const msgFile = path.join(tmp, "MSG");
      fs.writeFileSync(msgFile, mensaje);
      const res = spawnSync("bash", [hook, msgFile], { cwd: tmp, encoding: "utf8" });
      return { status: res.status, stderr: res.stderr ?? "" };
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  };

  const casos = [
    ["código sin issue ni declaración", { "src/lib/x.ts": "export const x = 1;\n" }, "fix(lienzo): algo", 1],
    ["código con issue referenciada", { "src/lib/y.ts": "export const y = 2;\n" }, "fix(lienzo): algo\n\nRefs #130", 0],
    ["código con `sin-issue:` y motivo", { "src/lib/z.ts": "export const z = 3;\n" }, "chore: renombrar\n\nsin-issue: renombre interno, sin cambio de comportamiento", 0],
    ["`sin-issue:` sin motivo NO alcanza", { "src/lib/w.ts": "export const w = 4;\n" }, "chore: algo\n\nsin-issue:", 1],
    ["sólo documentación no pide issue", { "docs/algo.md": "# hola\n" }, "docs: notas", 0],
    ["merge lo escribe git, no pide issue", { "src/lib/m.ts": "export const m = 5;\n" }, "Merge branch 'main'", 0],
    ["un hook del arnés también cuenta como código", { ".claude/hooks/x.mjs": "// x\n" }, "chore: hook nuevo", 1],
  ];
  for (const [nombre, archivos, mensaje, esperado] of casos) {
    const res = correr(archivos, mensaje);
    if (res.status === esperado) ok(`commit-msg: ${nombre}`);
    else bad(`commit-msg: ${nombre}`, `esperaba exit ${esperado}, salió ${res.status}. stderr: ${res.stderr.trim().slice(0, 160)}`);
  }

  /**
   * El freno no conoce GitHub: lee `tracker.issuePattern`. Con la config de otra
   * forja (Azure Boards, `AB#123`) tiene que aceptar SU referencia y rechazar la
   * de acá. Es lo que separa un mecanismo portable de uno cableado, y sin este
   * caso el config podría dejar de leerse sin que nada se ponga rojo.
   */
  const otraForja = { tracker: { kind: "azure-devops", issuePattern: "\\bAB#[0-9]+\\b", issueExample: "AB#123" } };
  const conAB = correr({ "src/lib/a.ts": "export const a = 1;\n" }, "fix: algo\n\nFixes AB#77", otraForja);
  if (conAB.status === 0) ok("commit-msg: acepta la referencia de otra forja (AB#77)");
  else bad("commit-msg: acepta la referencia de otra forja", `exit ${conAB.status}: ${conAB.stderr.trim().slice(0, 160)}`);

  const conGH = correr({ "src/lib/b.ts": "export const b = 2;\n" }, "fix: algo\n\nRefs #77", otraForja);
  if (conGH.status === 1) ok("commit-msg: con otra forja, `#77` ya no alcanza");
  else bad("commit-msg: con otra forja, `#77` ya no alcanza", `exit ${conGH.status}: el patrón del config no se está leyendo`);
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

// BOTONMUDO: un botón sólo-icono sin nombre accesible es mudo para el lector de
// pantalla. Compila, se ve bien y sólo lo nota quien no puede ver el icono.
frenoDelLint(
  "repo-lint: detecta un botón sólo-icono sin nombre accesible",
  "src/components/__selftest-boton.tsx",
  'export const X = () => <Button variant="ghost" size="icon" onClick={f}><Trash2 /></Button>;\n',
  "BOTONMUDO",
);

// INCIDENTE: P12 medible en lo que una máquina puede ver — un gotcha sin la línea
// `Mecanismo:` es prosa que se va a volver a pagar.
frenoDelLint(
  "repo-lint: detecta un gotcha sin mecanismo",
  config.incidents.file,
  "### GOTCHA: algo se rompió\n\nSíntoma: x\nCausa: y\nRegla: z\n",
  "INCIDENTE",
);

// IATASK: P5 deja de ser sólo REVIEW. Un `task.id === "…"` en el router mata la
// superficie de extensión: desde ahí, cada tarea nueva toca el router.
frenoDelLint(
  "repo-lint: detecta el router conociendo una tarea de IA por nombre",
  config.aiSurface.closedFiles[0],
  'import type { AiTask } from "./router";\nexport const x = (t: AiTask) => t.id === "describe-node";\n',
  "IATASK",
);

// RELEASEJOB: el release 0.6.3 salió VERDE y sin instaladores porque el checkout
// corría después de bajar los artefactos y limpiaba el workspace. El freno lee el
// orden de los pasos del YAML; con el orden malo tiene que morder.
frenoDelLint(
  "repo-lint: detecta el checkout que borra los instaladores",
  ".github/workflows/release-build.yml",
  "jobs:\n  release:\n    steps:\n      - uses: actions/download-artifact@v4\n      - uses: actions/checkout@v4\n      - uses: softprops/action-gh-release@v2\n",
  "RELEASEJOB",
);

// ENRUTADO: el enrutado efectivo de una arista tiene UNA respuesta. Tres defaults
// distintos para el mismo campo dieron una ficha que marcaba «Recta» sobre un
// enlace curvo (issue #112) — compila y pasa los tests, sólo se ve en pantalla.
frenoDelLint(
  "repo-lint: detecta un enrutado resuelto a mano en la UI",
  "src/components/__selftest-routing.tsx",
  'export const X = (link) => (link.routing ?? "straight") === "curved";\n',
  "ENRUTADO",
);

// PLATAFORMA: la detección del SO vive en un solo módulo y sin API deprecada.
frenoDelLint(
  "repo-lint: detecta navigator.platform fuera de lib/platform",
  "src/components/__selftest-plat.tsx",
  'export const esMac = () => navigator.platform.includes("Mac");\n',
  "PLATAFORMA",
);

// SDD en GitHub: un spec/plan/tasks dentro del repo tiene que poner el gate en rojo.
// Sin este freno, la próxima feature nace en `specs/` por costumbre y volvemos a un
// tablero que sólo lee quien clonó. El cebo va fuera de `src/` y se borra siempre.
{
  const cebo = abs(`${config.sdd.specsDir}/__selftest-spec.md`);
  try {
    fs.writeFileSync(cebo, "# spec · 999 — cebo del self-test\n");
    const res = spawnSync("node", [abs("scripts/sdd-github.mjs"), "check"], { cwd: REPO_ROOT, encoding: "utf8" });
    const salida = `${res.stdout}${res.stderr}`;
    if (res.status === 1 && /artefacto\(s\) SDD dentro del repo/.test(salida)) {
      ok("sdd-github: caza un artefacto SDD dentro del repo");
    } else {
      bad("sdd-github: artefacto SDD en el repo", `exit ${res.status}: ${salida.trim().slice(0, 240)}`);
    }
  } finally {
    fs.rmSync(cebo, { force: true });
  }
  const limpio = spawnSync("node", [abs("scripts/sdd-github.mjs"), "check"], { cwd: REPO_ROOT, encoding: "utf8" });
  if (limpio.status === 0) ok("sdd-github: verde con el repo limpio de artefactos SDD");
  else bad("sdd-github: repo limpio", `${limpio.stdout}${limpio.stderr}`.trim().slice(0, 240));
}

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

  // El sello es lo que hace verificable la frescura. Este caso existe por un falso
  // rojo real: se medía por mtime contra la fecha de HEAD y `graphify update` no
  // reescribe graph.json cuando no hay nada nuevo, así que un commit sin cambios
  // indexables daba «atrasado 0 minutos» y ponía el gate en rojo sin causa.
  if (grafoPresente) {
    const sello = abs(config.graph.stampFile);
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).stdout?.trim();
    const actual = fs.existsSync(sello) ? fs.readFileSync(sello, "utf8").trim() : "";
    if (actual === head) ok("graph-check: el índice está sellado para HEAD (frescura por contenido, no por reloj)");
    else bad("graph-check: sello del índice", `sello=${actual.slice(0, 7) || "(ninguno)"} HEAD=${head?.slice(0, 7)}: corré \`npm run graph:update\``);
  }

  // Un índice ENCOGIDO contesta igual, con menos verdad: el freno tiene que morder.
  // El grafo de mentira va fuera de `src/` y se borra siempre (el watcher de Next no
  // debe ver aparecer y desaparecer archivos: ver el ENOENT de docs/harness/gotchas.md).
  const enano = abs(".claude/__selftest-grafo-enano.json");
  try {
    fs.writeFileSync(enano, JSON.stringify({ nodes: [{ id: "a" }], edges: [] }));
    const chico = spawnSync("node", [abs("scripts/graph-check.mjs"), "--graph", enano], { cwd: REPO_ROOT, encoding: "utf8" });
    const salida = `${chico.stdout}${chico.stderr}`;
    if (chico.status === 1 && /se encogió/.test(salida)) ok("graph-check: caza un índice encogido (reindexado a medias)");
    else bad("graph-check: índice encogido", `exit ${chico.status}: ${salida.trim().slice(0, 240)}`);
  } finally {
    fs.rmSync(enano, { force: true });
  }
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
  // Ruta `issue`: cualquier intención de cambiar código que no cae en una ruta
  // más específica tiene que recordar PREGUNTAR si se registra la issue. Es el
  // caso que se escapó: un pedido en prosa, sin la palabra "bug" ni "feature".
  ["se vuelve dificil mover las flechas", "issue"],
  ["agregá un botón para exportar a CSV", "issue"],
  ["falta que el panel muestre los nodos sueltos", "issue"],
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

// El puntero de feature activa no puede quedar colgado. Desde que los artefactos
// viven en GitHub el puntero guarda el NÚMERO DE LA ISSUE MADRE (`#113`), no una
// carpeta: validarlo contra `specs/<n>` era imposible de satisfacer —el freno de
// `sdd-github check` prohíbe justamente esas carpetas—, así que se valida la
// FORMA. Resolver la issue exigiría red, y este paso corre en el gate y en CI.
const pointer = abs(config.sdd.activeFeaturePointer);
if (fs.existsSync(pointer)) {
  const active = fs.readFileSync(pointer, "utf8").trim();
  if (!active) ok("puntero de feature activa vacío (sin SDD en curso)");
  else if (/^#\d+$/.test(active)) ok(`feature activa: issue ${active}`);
  else
    bad(
      "puntero de feature activa",
      `\`${active}\` no es una issue madre: el puntero guarda \`#<número>\` (ver docs/harness/sdd.md) o queda vacío.`,
    );
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
