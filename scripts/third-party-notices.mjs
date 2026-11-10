#!/usr/bin/env node
/**
 * Avisos de licencias de terceros para los instaladores (#753).
 *
 *   npm run licenses:notices          # escribe build/THIRD_PARTY_NOTICES.txt
 *
 * MIT, BSD e ISC piden conservar el aviso de copyright al redistribuir, y Apache 2.0 pide
 * propagar su NOTICE. Los instaladores empaquetan cientos de paquetes de npm, así que este
 * script junta, por cada dependencia de PRODUCCIÓN del package-lock.json, su nombre,
 * versión, licencia y los textos de LICENSE/NOTICE que trae. electron-builder lo copia a
 * los recursos de la app (`extraResources`). No usa la red ni dependencias nuevas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARCHIVOS_DE_LICENCIA = /^(licen[cs]e|copying|notice)(\.[a-z]+)?$/i;

/** Texto completo de avisos a partir del lock y node_modules de `raiz`. */
export function armarAvisos(raiz) {
  const lock = JSON.parse(fs.readFileSync(path.join(raiz, "package-lock.json"), "utf8"));
  const vistos = new Set();
  const bloques = [];
  const entradas = Object.entries(lock.packages ?? {})
    .filter(([ruta, pkg]) => ruta && !pkg.dev && !pkg.devOptional)
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [ruta, pkg] of entradas) {
    const nombre = pkg.name ?? ruta.replace(/^.*node_modules\//, "");
    const clave = `${nombre}@${pkg.version ?? "?"}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const dir = path.join(raiz, ruta);
    const textos = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => ARCHIVOS_DE_LICENCIA.test(f))
          .sort()
          .map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim())
      : [];
    bloques.push(
      [
        `${clave}`,
        `Licencia: ${typeof pkg.license === "string" && pkg.license ? pkg.license : "(ver texto)"}`,
        textos.length ? textos.join("\n\n") : "(el paquete no incluye archivo de licencia; ver su repositorio)",
      ].join("\n")
    );
  }
  const cabecera = [
    "Processflow Architect — avisos de licencias de terceros",
    "",
    "Este archivo se genera en cada build (scripts/third-party-notices.mjs) con las",
    `dependencias de producción incluidas en la app (${bloques.length} paquetes).`,
    "Los modelos y bibliotecas que la app descarga aparte están en THIRD_PARTY_LICENSES.md.",
  ].join("\n");
  return `${cabecera}\n\n${bloques.join(`\n\n${"=".repeat(78)}\n\n`)}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const destino = path.join(raiz, "build", "THIRD_PARTY_NOTICES.txt");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, armarAvisos(raiz));
  console.log(`Avisos de terceros: ${path.relative(raiz, destino)}`);
}
