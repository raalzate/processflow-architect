/**
 * Genera `src/lib/icons/catalog.generated.ts` a partir de
 * `scripts/icon-catalog.manifest.json` (spec 025).
 *
 * Por qué un script y no una dependencia: Simple Icons pesa 16 MB y trae 3466
 * marcas; el lienzo necesita ~130. Acá se bajan SÓLO las del manifiesto, se
 * sanean con el mismo `sanearSvg` que prueba el gate y se escriben como datos
 * TypeScript versionados. La app no toca la red; el gate tampoco: el test
 * compara el hash del manifiesto con el que queda escrito en el generado.
 *
 * Uso: `npm run icons:build` (requiere red). Corre con tsx, así importa el
 * saneador de `src/lib` sin duplicarlo.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { sanearSvg, fallasDeIcono } from "../src/lib/icons/sanitize";
import type { IconoDeCatalogo } from "../src/lib/icons/catalog";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MANIFEST = path.join(REPO_ROOT, "scripts", "icon-catalog.manifest.json");
const SALIDA = path.join(REPO_ROOT, "src", "lib", "icons", "catalog.generated.ts");

interface Entrada {
  id: string;
  nombre: string;
  categoria: string;
  alias: string[];
  si?: string;
  dv?: string;
  variante?: string;
  /** Nombre en lobe-icons (`@lobehub/icons-static-svg`): logos de IA y nube. */
  lb?: string;
  /** Color de marca (hex sin `#`) para las fuentes que no lo traen (lobe-icons). */
  color?: string;
  lucide?: string;
}

interface Manifiesto {
  fuentes: Record<string, { version?: string; url?: string; licencia: string }>;
  iconos: Entrada[];
}

/** Hash del manifiesto: lo que el test compara para saber si el generado está al día. */
export function hashDelManifiesto(texto: string): string {
  return crypto.createHash("sha256").update(texto).digest("hex").slice(0, 16);
}

async function bajar(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

async function main() {
  const texto = fs.readFileSync(MANIFEST, "utf8");
  const m: Manifiesto = JSON.parse(texto);
  const si = m.fuentes["simple-icons"];
  const dv = m.fuentes["devicon"];
  const lb = m.fuentes["lobe-icons"];
  const lu = m.fuentes["lucide"];

  // Colores de marca de Simple Icons (hex), desde su índice.
  const indiceSi = JSON.parse(
    await bajar(`https://cdn.jsdelivr.net/npm/simple-icons@${si.version}/data/simple-icons.json`)
  ) as { slug: string; hex: string; title: string }[];
  const hexDe = new Map(indiceSi.map((i) => [i.slug, i.hex]));
  const indiceDv = JSON.parse(await bajar(`https://cdn.jsdelivr.net/gh/devicons/devicon@${dv.version}/devicon.json`)) as {
    name: string;
    color: string;
  }[];
  const colorDv = new Map(indiceDv.map((i) => [i.name, i.color.replace(/^#/, "")]));

  const salida: IconoDeCatalogo[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const e of m.iconos) {
    if (vistos.has(e.id)) errores.push(`id repetido: ${e.id}`);
    vistos.add(e.id);
    try {
      if (e.lucide) {
        salida.push({ id: e.id, nombre: e.nombre, categoria: e.categoria, alias: e.alias, fuente: "lucide", licencia: lu.licencia, lucide: e.lucide });
        continue;
      }
      let markup: string;
      let fuente: IconoDeCatalogo["fuente"];
      let color: string | undefined;
      let licencia: string;
      if (e.si) {
        markup = await bajar(si.url!.replace("<slug>", e.si));
        fuente = "simple-icons";
        color = hexDe.get(e.si);
        licencia = si.licencia;
      } else if (e.dv) {
        markup = await bajar(dv.url!.replace(/<nombre>/g, e.dv).replace("<variante>", e.variante ?? "original"));
        fuente = "devicon";
        color = colorDv.get(e.dv);
        licencia = dv.licencia;
      } else if (e.lb) {
        markup = await bajar(lb.url!.replace("<nombre>", e.lb));
        fuente = "lobe-icons";
        color = e.color;
        licencia = lb.licencia;
      } else {
        throw new Error("sin fuente (si | dv | lb | lucide)");
      }
      const saneado = sanearSvg(markup, e.id);
      if (!saneado) throw new Error("el SVG no se pudo sanear (sin viewBox o sin dibujo)");
      // Simple Icons no trae `fill`: hereda `currentColor` y así se tiñe por skin.
      const icono: IconoDeCatalogo = {
        id: e.id,
        nombre: e.nombre,
        categoria: e.categoria,
        alias: e.alias,
        fuente,
        licencia,
        ...(color ? { color: color.toUpperCase() } : {}),
        viewBox: saneado.viewBox,
        svg: saneado.inner,
      };
      const fallas = fallasDeIcono(icono);
      if (fallas.length) throw new Error(fallas.join("; "));
      salida.push(icono);
      process.stdout.write(`✓ ${e.id}\n`);
    } catch (err: any) {
      errores.push(`${e.id}: ${err?.message ?? err}`);
    }
  }
  if (errores.length) {
    console.error(`\n${errores.length} icono(s) no entraron:\n- ${errores.join("\n- ")}`);
    process.exit(1);
  }

  const cabecera = [
    "// GENERADO por scripts/build-icon-catalog.ts a partir de scripts/icon-catalog.manifest.json.",
    "// No editar a mano: corré `npm run icons:build`. El test del gate compara MANIFEST_HASH",
    "// con el hash del manifiesto actual.",
    "// Fuentes: Simple Icons (CC0-1.0), Devicon (MIT), Lobe Icons (MIT), lucide (ISC). Ver THIRD_PARTY_LICENSES.md.",
    "",
    'import type { IconoDeCatalogo } from "./catalog";',
    "",
    `export const MANIFEST_HASH = "${hashDelManifiesto(texto)}";`,
    "",
    "export const ICON_CATALOG: readonly IconoDeCatalogo[] = ",
  ].join("\n");
  fs.writeFileSync(SALIDA, `${cabecera}${JSON.stringify(salida, null, 2)};\n`);
  console.log(`\n${salida.length} iconos → ${path.relative(REPO_ROOT, SALIDA)}`);
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
