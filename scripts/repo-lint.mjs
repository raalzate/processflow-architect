#!/usr/bin/env node
/**
 * Lint de convenciones del repo — sin dependencias nuevas (el bundle ya es pesado).
 *
 * No reemplaza al type-checker: verifica las reglas de CLAUDE.md que un compilador no ve,
 * y las verifica con un COMANDO QUE FALLA. Una regla en markdown sin esto es una sugerencia.
 *
 *   node scripts/repo-lint.mjs                 # todo el repo (señal del gate)
 *   node scripts/repo-lint.mjs --file <ruta>   # sólo ese archivo (hook PostToolUse)
 *   node scripts/repo-lint.mjs --file <ruta> --stdin   # contenido por stdin; la ruta sólo elige reglas
 *
 * Reglas:
 *   PUREZA    src/lib/** es lógica pura: sin React, sin Electron, sin Next, sin UI.
 *   NOTACION  los tipos de componente sólo se cablean en src/lib/notations.ts (+ allowlist de deuda).
 *   ONLY      nada de .only( en tests: apaga la suite entera en silencio.
 *   DEPSHOOK  un useMemo/useCallback que lee `notationId` lo declara en sus dependencias.
 *   TOKENS    la UI usa los tokens del tema, no colores crudos de Tailwind ni tamaños en px.
 *   SVGFILL   un <text> de SVG pinta con `fill`: sin él, una clase text-* cae a negro.
 *   ENRUTADO  el enrutado efectivo de una arista se resuelve con `routingOf`, sin fallback a mano.
 *   PLATAFORMA  detectar el sistema operativo sólo en src/lib/platform.ts (y sin API deprecada).
 *   DEPS      sin SDKs de nube en package.json (las llamadas van con fetch desde el main).
 *   RELEASE   la versión de package.json tiene sus notas en docs/releases/<versión>.md.
 *   IATASK    el router y los proveedores no conocen tareas de IA por nombre (P5).
 *   WEBGPU    main.ts conserva los switches de WebGPU y no reactiva disableHardwareAcceleration.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude", "harness.config.json"), "utf8"));

const problems = [];
const fail = (file, line, rule, message) => problems.push({ file, line, rule, message });

const rel = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");
const read = (relPath) => fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8");

/** Archivos fuente del repo (sin derivados). */
function sourceFiles(root) {
  const out = [];
  const skip = new Set(["node_modules", ".next", ".git", "build", "dist", "out", "coverage", ".processflow"]);
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel(abs));
    }
  };
  walk(path.join(REPO_ROOT, root));
  return out;
}

/**
 * Texto de una llamada a hook desde su paréntesis de apertura hasta el cierre,
 * contando el balance. Sin AST (no hay dependencias nuevas): alcanza porque sólo
 * se busca si un identificador aparece en el cuerpo y en la lista de deps.
 */
function hookBody(content, start) {
  let nivel = 0;
  for (let i = start; i < content.length; i++) {
    const c = content[i];
    if (c === "(") nivel++;
    else if (c === ")") {
      nivel--;
      if (nivel === 0) {
        // Incluye lo que sigue hasta el fin de la sentencia: ahí está `, [deps])`.
        const fin = content.indexOf("\n", i);
        return { texto: content.slice(start, fin === -1 ? content.length : fin + 1) };
      }
    }
  }
  return null;
}

const isTest = (relPath) => /(^|\/)__tests__\//.test(relPath) || /\.(test|spec)\.tsx?$/.test(relPath);
const lineOf = (content, index) => content.slice(0, index).split("\n").length;

// ── Reglas por archivo ────────────────────────────────────────────────────────

const NOTATION_TYPES = (() => {
  const src = read(config.notation.source);
  return [...new Set([...src.matchAll(/type:\s*"([^"]+)"/g)].map((m) => m[1]))];
})();

/** Ids de las `AiTask` declaradas. La superficie de extensión de la IA es esa lista. */
const AI_TASK_IDS = (() => {
  try {
    const src = read(config.aiSurface.extensionPoint);
    return [...new Set([...src.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]))];
  } catch {
    return [];
  }
})();

function checkFile(relPath, contenidoDado = null) {
  let content = contenidoDado;
  if (content === null) {
    try {
      content = read(relPath);
    } catch {
      return; // el archivo pudo borrarse entre la edición y el chequeo
    }
  }

  // PUREZA — src/lib/ no conoce React, Electron ni la UI.
  if (relPath.startsWith(`${config.purity.dir}/`) && !isTest(relPath)) {
    const importRe = /(?:^|\n)\s*(?:import[^;]*?from\s*|import\s*|(?:const|let|var)[^=]*=\s*require\s*\()\s*["']([^"']+)["']/g;
    for (const m of content.matchAll(importRe)) {
      const spec = m[1];
      const bad = config.purity.forbiddenImports.find((f) => (f.endsWith("/") ? spec.startsWith(f) : spec === f || spec.startsWith(`${f}/`)));
      if (bad) {
        fail(
          relPath,
          lineOf(content, m.index),
          "PUREZA",
          `\`${config.purity.dir}/\` es lógica pura y testeable: no puede importar \`${spec}\`. Los componentes orquestan; lib/ decide.`,
        );
      }
    }
  }

  // NOTACION — el registro es la única fuente de verdad de los tipos.
  if (relPath.startsWith("src/") && !isTest(relPath) && !config.notation.allow.includes(relPath)) {
    for (const type of NOTATION_TYPES) {
      const idx = content.indexOf(`"${type}"`);
      if (idx !== -1) {
        fail(
          relPath,
          lineOf(content, idx),
          "NOTACION",
          `literal de tipo de notación (\`"${type}"\`) cableado fuera de \`${config.notation.source}\`. Derivalo del registro (notaciones, elementos, contenedores) — el arnés es agnóstico de notación.`,
        );
        break;
      }
    }
  }

  // IATASK — el router y los proveedores no conocen tareas por nombre.
  //
  // P5 dice que añadir una función de IA es declarar una `AiTask`. La forma en que
  // ese principio se rompe siempre es la misma: un `if (task.id === "…")` en el
  // router para resolver un caso particular. A partir de ahí cada tarea nueva toca
  // el router y la superficie de extensión deja de existir.
  if ((config.aiSurface?.closedFiles ?? []).includes(relPath)) {
    for (const id of AI_TASK_IDS) {
      const idx = content.indexOf(`"${id}"`);
      if (idx !== -1) {
        fail(
          relPath,
          lineOf(content, idx),
          "IATASK",
          `\`"${id}"\` es el id de una AiTask: el router/los proveedores no deben conocer tareas por nombre. Poné el caso particular en su entrada de \`${config.aiSurface.extensionPoint}\` (tier, structured, maxLocalChars, remoteFlow).`,
        );
        break;
      }
    }
  }

  // DEPSHOOK — un hook que MIDE con la notación tiene que reaccionar a ella.
  // Sin ESLint en el repo, `react-hooks/exhaustive-deps` no existe como
  // mecanismo; esta regla cubre el caso que ya falló: al pasar una vista a C4 en
  // caliente, el encuadre, el drop y el SVG exportado seguían midiendo con la
  // caja de la notación anterior porque `notationId` no estaba en las deps.
  if (relPath.startsWith("src/components/") && !isTest(relPath)) {
    for (const m of content.matchAll(/\buse(?:Memo|Callback)\s*\(/g)) {
      const cuerpo = hookBody(content, m.index);
      if (!cuerpo) continue;
      const deps = /\)\s*,\s*\[([^\]]*)\]\s*\)\s*;?\s*$/.exec(cuerpo.texto);
      if (!deps) continue;
      const usa = /\bnotationId\b/.test(cuerpo.texto.slice(0, deps.index));
      const declara = /\bnotationId\b/.test(deps[1]);
      if (usa && !declara) {
        fail(
          relPath,
          lineOf(content, m.index),
          "DEPSHOOK",
          "el hook usa `notationId` pero no lo declara en sus dependencias: al cambiar la notación de la vista seguiría midiendo los nodos con la caja anterior.",
        );
      }
    }
  }

  // TOKENS — el color y la escala salen del tema, no de la paleta de Tailwind.
  // Sin esto, cada pantalla reinventa su verde de "salió bien" y el modo oscuro
  // se rompe de a un archivo por vez (spec 003, FR-007/FR-008).
  if (relPath.startsWith("src/") && !isTest(relPath) && !config.tokens.allow.includes(relPath)) {
    const crudo = new RegExp(
      `\\b(?:bg|text|border|stroke|fill|ring|from|to|via|divide|outline|shadow|decoration|accent|caret)-(?:${config.tokens.palettes.join("|")})-\\d{2,3}\\b`,
    );
    const m = crudo.exec(content);
    if (m) {
      fail(
        relPath,
        lineOf(content, m.index),
        "TOKENS",
        `color crudo de Tailwind (\`${m[0]}\`). Usá el token del tema: \`success\`/\`warning\`/\`info\`/\`destructive\` para estado, \`muted\`/\`primary\`/\`card\` para superficie. La paleta del DIAGRAMA vive en \`${config.notation.source}\`.`,
      );
    }
    const px = /text-\[\d+px\]/.exec(content);
    if (px) {
      fail(
        relPath,
        lineOf(content, px.index),
        "TOKENS",
        `tamaño de letra arbitrario (\`${px[0]}\`). La escala del sistema es \`text-2xs\` … \`text-base\`: tres tamaños sueltos indistinguibles no son una jerarquía.`,
      );
    }
  }

  // SVGFILL — en SVG el color de un `<text>` lo da `fill`, no `color`. Una clase
  // `text-*` sólo fija `color`, así que el texto cae a NEGRO: los títulos de los
  // contenedores del lienzo se dibujaban negros sobre el fondo oscuro y nada lo
  // detectaba, porque compila, pasa los tests y sólo se ve mirando la pantalla.
  if (relPath.endsWith(".tsx") && !isTest(relPath)) {
    for (const m of content.matchAll(/<text\b[\s\S]{0,600}?>/g)) {
      const etiqueta = m[0];
      if (/\bfill[=:]/.test(etiqueta)) continue;
      if (!/className/.test(etiqueta)) continue;
      fail(
        relPath,
        lineOf(content, m.index),
        "SVGFILL",
        "`<text>` de SVG sin `fill`: una clase `text-*` no pinta el texto y el navegador cae a negro. Poné `fill=\"currentColor\"` (el color lo sigue dando la clase) o un `fill-*` explícito.",
      );
    }
  }

  // ENRUTADO — el enrutado EFECTIVO de una arista sale de `routingOf(link, notation)`
  // y de ningún otro lado. La ficha «Editar enlace» tenía tres respuestas para la
  // misma pregunta (`?? "straight"` para el resaltado, `?? defaultRoutingFor(...)`
  // para los controles de curva, y la geometría con la suya): en C4 marcaba «Recta»
  // sobre un enlace que el lienzo dibujaba curvo. El fallback a mano es lo que se
  // desalinea del registro de notaciones (P6), así que se prohíbe fuera de `link-geom`.
  if (relPath.startsWith("src/components/") && !isTest(relPath) && !relPath.endsWith("/link-geom.ts")) {
    const m = /\brouting\s*\?\?/.exec(content);
    if (m) {
      fail(
        relPath,
        lineOf(content, m.index),
        "ENRUTADO",
        "`routing ??` resuelve el enrutado por su cuenta: usá `routingOf(link, notation)` de `link-geom` — es la única función que lo resuelve, y la misma que usa el lienzo.",
      );
    }
  }

  // PLATAFORMA — `navigator.platform` está DEPRECADO y los navegadores lo van
  // congelando; además la detección estaba duplicada y desalineada, así que un
  // atajo nuevo no tenía de dónde tomar el criterio. Vive en un solo módulo.
  if (relPath.startsWith("src/") && !isTest(relPath) && relPath !== "src/lib/platform.ts") {
    const m = /navigator\s*\.\s*(platform|userAgent)\b/.exec(content);
    if (m) {
      fail(
        relPath,
        lineOf(content, m.index),
        "PLATAFORMA",
        `\`navigator.${m[1]}\` está deprecado y la detección de plataforma vive en \`src/lib/platform.ts\`. Usá \`isMacPlatform()\`, \`modifierLabel()\` o \`hasPlatformModifier()\`.`,
      );
    }
  }

  // ONLY — un .only olvidado deja la suite verde sin haber corrido nada.
  if (isTest(relPath)) {
    const m = /(?:describe|it|test)\.only\s*\(/.exec(content);
    if (m) {
      fail(relPath, lineOf(content, m.index), "ONLY", "`.only(` apaga el resto de la suite: el verde deja de significar nada. Quitalo antes de entregar.");
    }
  }
}

// ── Reglas globales ───────────────────────────────────────────────────────────

function checkDeps() {
  const pkg = JSON.parse(read("package.json"));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of config.forbiddenDeps.packages) {
    if (declared[forbidden]) {
      fail("package.json", 1, "DEPS", `\`${forbidden}\` es un SDK de nube: las peticiones a proveedores se hacen con \`fetch\` nativo desde el proceso main.`);
    }
  }
}

/**
 * RELEASE — la versión que se va a empaquetar tiene sus notas EN EL REPO.
 *
 * `release-build.yml` usa `docs/releases/<versión>.md` como cuerpo del release
 * (`body_path`): sin el archivo, el borrador sale vacío y las notas terminan
 * escritas a mano en la web, donde nadie las revisa ni las versiona. Subir
 * `version` en package.json sin ese archivo es gate rojo.
 *
 * `versionDada` existe para el self-test: prueba el freno con una versión que no
 * tiene notas, sin tocar package.json ni escribir archivos.
 */
function checkRelease(versionDada = null) {
  const version = versionDada ?? JSON.parse(read("package.json")).version;
  const notes = `${config.release.notesDir}/${version}.md`;
  const abs = path.join(REPO_ROOT, notes);
  if (!fs.existsSync(abs)) {
    fail("package.json", 1, "RELEASE", `falta \`${notes}\`: es el cuerpo del release que publica release-build.yml (ver docs/RELEASE.md).`);
    return;
  }
  const content = fs.readFileSync(abs, "utf8");
  for (const section of config.release.requiredSections) {
    if (!content.includes(section)) {
      fail(notes, 1, "RELEASE", `falta la sección \`${section}\`: quien descarga necesita qué cambió, qué archivo bajar y qué máquina hace falta.`);
    }
  }
  if (!content.includes(version)) {
    fail(notes, 1, "RELEASE", `las notas no nombran la versión \`${version}\`: se copió el archivo de otra release y quedó desfasado.`);
  }
  for (const forbidden of config.release.forbiddenText) {
    const idx = content.indexOf(forbidden);
    if (idx !== -1) {
      fail(notes, lineOf(content, idx), "RELEASE", `\`${forbidden}\` es del crédito anterior: la autoría es del autor (ver src/lib/credits.ts).`);
    }
  }
}

/**
 * INCIDENTE — P12: un incidente que costó tiempo deja infraestructura.
 *
 * Lo que una máquina puede verificar de ese principio es que el registro no se
 * degrade a anécdota: cada gotcha dice qué se VIO (síntoma), por qué pasó (causa),
 * qué regla queda y —lo que importa— QUÉ MECANISMO la hace cumplir. Un gotcha sin
 * la línea `Mecanismo:` es prosa que se va a volver a pagar.
 */
function checkIncidents(contenidoDado = null) {
  const file = config.incidents.file;
  let content = contenidoDado;
  if (content === null) {
    try {
      content = read(file);
    } catch {
      fail(file, 1, "INCIDENTE", `no existe el registro de incidentes declarado en la config.`);
      return;
    }
  }
  const heading = config.incidents.heading;
  const bloques = content.split(new RegExp(`^${heading}`, "m")).slice(1);
  if (!bloques.length) {
    fail(file, 1, "INCIDENTE", `no hay ningún bloque \`${heading}\`: el registro quedó vacío o cambió de formato.`);
    return;
  }
  bloques.forEach((bloque, i) => {
    const titulo = bloque.split("\n")[0].trim().slice(0, 60);
    for (const requerida of config.incidents.requiredLines) {
      if (!new RegExp(`^${requerida}`, "m").test(bloque)) {
        fail(
          file,
          lineOf(content, content.indexOf(bloque)),
          "INCIDENTE",
          `el gotcha «${titulo}» no tiene línea \`${requerida}\`. Un incidente sin mecanismo se vuelve a pagar (P12): test > hook/lint > comando > markdown.`,
        );
      }
    }
    void i;
  });
}

function checkWebgpu() {
  const file = config.webgpu.file;
  const content = read(file);
  for (const needle of config.webgpu.required) {
    if (!content.includes(needle)) {
      fail(file, 1, "WEBGPU", `falta \`${needle}\`: LiteRT-LM no arranca sin GPU y WebGPU viene deshabilitado en Electron.`);
    }
  }
  for (const needle of config.webgpu.forbidden) {
    const idx = content.indexOf(needle);
    if (idx !== -1 && !/^\s*(\/\/|\*)/.test(content.split("\n")[lineOf(content, idx) - 1])) {
      fail(file, lineOf(content, idx), "WEBGPU", `\`${needle}\` mata la aceleración por hardware y con ella el motor local.`);
    }
  }
}

// ── Ejecución ─────────────────────────────────────────────────────────────────

const fileFlagIndex = process.argv.indexOf("--file");
const single = fileFlagIndex !== -1 ? process.argv[fileFlagIndex + 1] : null;
// `--stdin`: el contenido llega por la entrada estándar y la ruta sólo elige las
// reglas. Es lo que usa el self-test para probar los frenos SIN escribir archivos
// temporales dentro de `src/`: con `next dev` vivo, el watcher los veía aparecer
// y desaparecer y el build moría con ENOENT (ver docs/harness/gotchas.md).
const desdeStdin = process.argv.includes("--stdin");
const contenidoStdin = desdeStdin ? fs.readFileSync(0, "utf8") : null;

// `--release-check <versión>`: sólo la regla RELEASE, contra la versión dada. Lo
// usa el self-test para probar que el freno muerde sin tocar package.json.
const releaseFlagIndex = process.argv.indexOf("--release-check");
const releaseVersion = releaseFlagIndex !== -1 ? process.argv[releaseFlagIndex + 1] : null;

if (releaseVersion) {
  checkRelease(releaseVersion);
} else if (single) {
  if (/\.(ts|tsx)$/.test(single)) checkFile(single, contenidoStdin);
  if (single === "package.json") { checkDeps(); checkRelease(); }
  if (single === config.webgpu.file) checkWebgpu();
  if (single === config.incidents.file) checkIncidents(contenidoStdin);
} else {
  for (const relPath of [...sourceFiles("src"), ...sourceFiles("main"), ...sourceFiles("mcp-server")]) checkFile(relPath);
  checkDeps();
  checkRelease();
  checkIncidents();
  checkWebgpu();
}

if (problems.length) {
  for (const p of problems) console.error(`${p.file}:${p.line}  [${p.rule}] ${p.message}`);
  console.error(`\nrepo-lint: ${problems.length} problema(s).`);
  process.exit(1);
}

console.log(single ? `repo-lint: ok (${single})` : "repo-lint: ok");
