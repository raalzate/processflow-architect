#!/usr/bin/env node
/**
 * ¿El release publicado se puede instalar por el botón «Actualizar»?
 *
 * Usa la RED (API de GitHub + los `latest*.yml` del release), así que no está en
 * el gate: es una señal que se corre a mano después de publicar, y su veredicto
 * va a STATUS.md.
 *
 * Lo que comprueba, por plataforma:
 *
 *  - el `latest*.yml` existe y se puede leer;
 *  - la versión que declara es la del release;
 *  - el archivo al que apunta ESTÁ entre los assets (el 404 de #235: en Windows
 *    el yml decía `…-Setup-0.8.5.exe` y el asset era `….Setup.0.8.5.exe`);
 *  - el tamaño declarado coincide con el del asset (si no, `electron-updater`
 *    aborta al verificar, después de bajar 200 MB).
 *
 * Lo que NO comprueba: que la instalación efectivamente corra en la máquina. Eso
 * sigue siendo un humano con Windows delante (#217).
 *
 * Uso: `npm run release:updater-check [-- <tag>]` (por defecto, el último publicado).
 */

import { execFileSync } from "node:child_process";

const REPO = "raalzate/processflow-architect";
/** Los tres metadatos que escribe electron-builder, uno por plataforma. */
const METADATOS = [
  ["latest.yml", "Windows"],
  ["latest-mac.yml", "macOS"],
  ["latest-linux.yml", "Linux"],
];

const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });

/**
 * Mismo criterio que `src/lib/release-metadata.ts`, reescrito acá porque este
 * script es `.mjs` y aquel es TypeScript del renderer. Lo que decide está
 * probado allá (`__tests__/release-metadata.test.ts`); esto es el mensajero.
 */
function parsear(yml) {
  const limpiar = (v) => v.trim().replace(/^['"]|['"]$/g, "");
  const version = yml.match(/^version:\s*(.+)$/m)?.[1];
  const path = yml.match(/^path:\s*(.+)$/m)?.[1];
  if (!version || !path) return undefined;
  const files = [];
  for (const entrada of (yml.split(/^files:\s*$/m)[1] ?? "").split(/^\s*-\s+/m).slice(1)) {
    const url = entrada.match(/url:\s*(.+)/)?.[1];
    if (!url) continue;
    const size = entrada.match(/size:\s*(\d+)/)?.[1];
    files.push({ url: limpiar(url), size: size ? Number(size) : undefined });
  }
  return { version: limpiar(version), path: limpiar(path), files };
}

function problemas(meta, assets, versionDelRelease) {
  const salida = [];
  if (meta.version !== versionDelRelease) {
    salida.push(
      `el yml declara ${meta.version} y el release es ${versionDelRelease}: el updater ofrecería otra cosa`
    );
  }
  const nombres = new Map(assets.map((a) => [a.name, a.size]));
  for (const archivo of [meta.path, ...meta.files.map((f) => f.url)]) {
    if (!nombres.has(archivo)) {
      salida.push(`«${archivo}» no está entre los assets: el updater se comería un 404`);
    }
  }
  for (const f of meta.files) {
    const size = nombres.get(f.url);
    if (size === undefined || f.size === undefined) continue;
    if (size !== f.size) {
      salida.push(`«${f.url}»: el yml dice ${f.size} bytes y el asset tiene ${size}`);
    }
  }
  return [...new Set(salida)];
}

const tagPedido = process.argv[2];
let release;
try {
  release = JSON.parse(
    tagPedido
      ? gh("release", "view", tagPedido, "--repo", REPO, "--json", "tagName,isDraft,assets")
      : gh("api", `repos/${REPO}/releases/latest`)
  );
} catch (e) {
  console.error(`No se pudo consultar el release: ${e.message}`);
  process.exit(2);
}

const tag = release.tagName ?? release.tag_name;
const version = String(tag).replace(/^v/i, "");
const assets = (release.assets ?? []).map((a) => ({ name: a.name, size: a.size }));
console.log(`release ${tag} · ${assets.length} artefactos`);

let fallos = 0;
for (const [archivo, plataforma] of METADATOS) {
  if (!assets.some((a) => a.name === archivo)) {
    console.error(`  ✗ ${plataforma}: falta ${archivo}; sin metadatos no hay actualización automática`);
    fallos++;
    continue;
  }
  const url = `https://github.com/${REPO}/releases/download/${tag}/${archivo}`;
  let meta;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    meta = parsear(await res.text());
  } catch (e) {
    console.error(`  ✗ ${plataforma}: no se pudo leer ${archivo} (${e.message})`);
    fallos++;
    continue;
  }
  if (!meta) {
    console.error(`  ✗ ${plataforma}: ${archivo} no tiene los campos que lee el updater`);
    fallos++;
    continue;
  }
  const encontrados = problemas(meta, assets, version);
  if (encontrados.length) {
    fallos += encontrados.length;
    for (const p of encontrados) console.error(`  ✗ ${plataforma}: ${p}`);
  } else {
    console.log(`  ✓ ${plataforma}: ${meta.path} (${meta.files[0]?.size ?? "?"} bytes)`);
  }
}

if (fallos) {
  console.error(`\nrelease-updater-check: ${fallos} problema(s). El botón «Actualizar» no funciona en ese sistema.`);
  process.exit(1);
}
console.log("\nrelease-updater-check: ok — los metadatos apuntan a artefactos que existen.");
