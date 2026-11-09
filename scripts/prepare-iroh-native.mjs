#!/usr/bin/env node
/** La versión 1.2.0 no publica binario Darwin x64: compilar el mismo binding original. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://github.com/n0-computer/iroh-ffi.git";
const REVISION = "66a8d619a4d791d458d582f312df6e0ab42bc541";
try {
  if (process.platform !== "darwin" || process.arch !== "x64") {
    console.log("Iroh: esta plataforma utiliza su paquete nativo publicado.");
  } else {
    let installed = false;
    try { require("@number0/iroh"); installed = true; } catch { /* Comprobar herramientas y compilar la versión fijada. */ }
    if (!installed) {
      const packageDir = path.dirname(require.resolve("@number0/iroh/package.json"));
      if (JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")).version !== "1.2.0") throw new Error("Actualizar y revisar el pin de Iroh antes de compilar otra versión.");
      const cache = path.resolve(process.env.PROCESSFLOW_NATIVE_BUILD_DIR || path.join(repo, "..", "iroh-macos-intel-build"));
      const run = (command, args, cwd = repo) => execFileSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, CARGO_TARGET_DIR: path.join(cache, "target") } });
      run("cargo", ["--version"]);
      if (!fs.existsSync(cache)) {
        fs.mkdirSync(path.dirname(cache), { recursive: true });
        run("git", ["clone", "--filter=blob:none", "--no-checkout", SOURCE, cache]);
        run("git", ["checkout", "--detach", REVISION], cache);
      }
      const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: cache, encoding: "utf8" }).trim();
      if (actual !== REVISION) throw new Error("La carpeta de compilación contiene otra revisión; utiliza una carpeta nueva. No se modificó su contenido.");
      if (execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: cache, encoding: "utf8" }).trim()) throw new Error("La fuente de Iroh tiene cambios locales; utiliza una carpeta nueva para compilar la revisión fijada.");
      run("cargo", ["build", "--locked", "--release", "--manifest-path", path.join(cache, "iroh-js", "Cargo.toml"), "--target", "x86_64-apple-darwin"], cache);
      fs.copyFileSync(path.join(cache, "target", "x86_64-apple-darwin", "release", "libnumber0_iroh.dylib"), path.join(packageDir, "iroh.darwin-x64.node"));
      require("@number0/iroh");
    }
    console.log("Iroh: binding de Mac Intel preparado y cargado correctamente.");
  }
} catch (error) {
  console.error("No se pudo preparar Iroh para Mac Intel. Se requieren Git, Rust >=1.91, CMake y las herramientas de línea de comandos de Xcode.");
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
