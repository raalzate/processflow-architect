/**
 * @fileOverview Registro de carpetas elegidas con el selector nativo (proceso main). #462.
 *
 * El chat manda por IPC las carpetas adjuntas, y antes se aceptaba cualquier
 * ruta absoluta: un renderer comprometido, o un `localStorage` manipulado, podía
 * adjuntar `/` o `~` y darle al agente acceso de lectura a todo el disco. Ahora
 * sólo valen las que salieron del diálogo del sistema (`agent-cli-pick-dir`),
 * que el main anota acá. Se guardan en disco porque el chat las recuerda entre
 * sesiones: sin persistir, al reiniciar la app todas quedarían «no elegidas».
 */

import { promises as fsp } from "node:fs";
import path from "node:path";

const ARCHIVO = "agent-cli-dirs.json";
/** Tope de carpetas recordadas: el registro no crece sin límite. */
const MAX = 200;

let permitidas: Set<string> | null = null;
let dirDatos = "";

/** Carga el registro desde `userData` (una vez). Un archivo roto vale como vacío. */
export async function initRegistroCarpetas(userData: string): Promise<void> {
  dirDatos = userData;
  try {
    const crudo = JSON.parse(await fsp.readFile(path.join(userData, ARCHIVO), "utf8"));
    permitidas = new Set(Array.isArray(crudo) ? crudo.filter((x: unknown): x is string => typeof x === "string") : []);
  } catch {
    permitidas = new Set();
  }
}

/** Las carpetas que el humano eligió con el selector (vacío si no se cargó). */
export const carpetasPermitidas = (): ReadonlySet<string> => permitidas ?? new Set();

/** Anota una carpeta elegida en el diálogo nativo y persiste el registro. */
export async function registrarCarpeta(ruta: string): Promise<void> {
  if (!permitidas) permitidas = new Set();
  permitidas.delete(ruta);
  permitidas.add(ruta); // al final: la más reciente
  while (permitidas.size > MAX) permitidas.delete(permitidas.values().next().value as string);
  if (!dirDatos) return;
  try {
    await fsp.writeFile(path.join(dirDatos, ARCHIVO), JSON.stringify([...permitidas], null, 2), "utf8");
  } catch {
    /* sin disco el registro vale para esta sesión */
  }
}
