#!/usr/bin/env node
/**
 * Paso final de `npm run build`: el export estático de Next (`out/`) pasa a
 * `build/out`, que es de donde lo sirve electron-serve (main/config.ts).
 *
 * Antes era `rimraf build/out && mv out build/out || move out build\out`.
 * `rimraf` nunca estuvo declarado: llegaba de rebote por @electron/rebuild 3, y al
 * subir a la 4 el build murió con «rimraf: not found» (#489). Y el `|| move` era un
 * plan B para Windows que también corría cuando fallaba el `rimraf`. Node hace las
 * dos cosas en todas las plataformas, sin dependencias.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Mueve `<raiz>/out` a `<raiz>/build/out`, reemplazando lo que hubiera. */
export function moverSalida(raiz) {
  const origen = path.join(raiz, "out");
  const destino = path.join(raiz, "build", "out");
  if (!fs.existsSync(origen)) {
    throw new Error(`No existe ${origen}: ¿corrió \`next build\` con output: "export"?`);
  }
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try {
    fs.renameSync(origen, destino);
  } catch (err) {
    // Otro volumen (EXDEV) o un antivirus con el directorio tomado en Windows:
    // copiar y borrar llega al mismo lugar.
    if (err?.code !== "EXDEV" && err?.code !== "EPERM") throw err;
    fs.cpSync(origen, destino, { recursive: true });
    fs.rmSync(origen, { recursive: true, force: true });
  }
  return destino;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const raiz = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
  console.log(`move-out: ${path.relative(raiz, moverSalida(raiz))}`);
}
