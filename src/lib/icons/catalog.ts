/**
 * @fileOverview Catálogo de iconos de tecnología (PURO, spec 025).
 *
 * Una caja puede llevar, además del icono de su TIPO, el logo de su
 * TECNOLOGÍA: PostgreSQL, Slack, Google Cloud, Android, OpenAI. El catálogo es un
 * conjunto CURADO y VERSIONADO (`catalog.generated.ts`, que escribe
 * `scripts/build-icon-catalog.ts` a partir de `scripts/icon-catalog.manifest.json`):
 * sin dependencia de ejecución, sin red en la app y con la licencia de cada
 * icono declarada. Acá viven la búsqueda y la resolución por id, que es lo
 * que el lienzo, la ficha y el MCP comparten; el saneado está en
 * `sanitize.ts` porque el script lo necesita antes de que exista el catálogo.
 */

import { ICON_CATALOG, MANIFEST_HASH } from "./catalog.generated";

export { sanearSvg, fallasDeIcono, type SvgSaneado } from "./sanitize";

export type FuenteDeIcono = "simple-icons" | "devicon" | "lobe-icons" | "lucide";

export interface IconoDeCatalogo {
  /** `si-<slug>`, `dv-<nombre>`, `lb-<nombre>` o `lu-<NombreLucide>`. Estable: es lo que guarda el proyecto. */
  id: string;
  nombre: string;
  categoria: string;
  /** Palabras con que también se encuentra («postgres», «base de datos»). */
  alias: string[];
  fuente: FuenteDeIcono;
  licencia: string;
  /** Color de marca (hex sin `#`), si la fuente o el manifiesto lo da. Sólo se usa en la skin canónica. */
  color?: string;
  /** Dibujo: `viewBox` + marcado interno saneado (Simple Icons, Devicon)… */
  viewBox?: string;
  svg?: string;
  /** …o el nombre del icono de lucide, que el lienzo ya tiene (genéricos). */
  lucide?: string;
}

export interface CategoriaDeIcono {
  id: string;
  label: string;
}

export const CATEGORIAS: readonly CategoriaDeIcono[] = [
  { id: "nube", label: "Nube y plataformas" },
  { id: "infraestructura", label: "Contenedores e infraestructura" },
  { id: "bases-de-datos", label: "Bases de datos" },
  { id: "datos-y-mensajeria", label: "Datos y mensajería" },
  { id: "lenguajes", label: "Lenguajes" },
  { id: "frameworks", label: "Frameworks" },
  { id: "movil-y-sistemas", label: "Móvil y sistemas" },
  { id: "devops", label: "DevOps y CI/CD" },
  { id: "observabilidad", label: "Observabilidad" },
  { id: "colaboracion-y-saas", label: "Colaboración y SaaS" },
  { id: "pagos", label: "Pagos" },
  { id: "identidad-y-seguridad", label: "Identidad y seguridad" },
  { id: "ia", label: "IA" },
  { id: "genericos", label: "Genéricos" },
];

export const ICONOS: readonly IconoDeCatalogo[] = ICON_CATALOG;
export { MANIFEST_HASH };

const porId = new Map(ICONOS.map((i) => [i.id, i]));

/** Sin acentos ni mayúsculas: «Móvil» y «movil» son lo mismo al buscar. */
export const normalizarTexto = (s: string): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function iconoDeCatalogo(id: string | undefined | null): IconoDeCatalogo | undefined {
  return id ? porId.get(id) : undefined;
}

export const esIconoValido = (id: string | undefined | null): boolean => !!iconoDeCatalogo(id);

/**
 * Búsqueda por nombre, alias e id, opcionalmente dentro de una categoría. Sin
 * consulta devuelve el catálogo entero (filtrado por categoría si la hay). El
 * orden: primero los que coinciden exacto, después los que empiezan por la
 * consulta, después los que la contienen; dentro de cada grupo, por nombre.
 */
export function buscarIconos(consulta = "", categoria?: string): IconoDeCatalogo[] {
  const q = normalizarTexto(consulta);
  const base = categoria ? ICONOS.filter((i) => i.categoria === categoria) : [...ICONOS];
  if (!q) return base.sort((a, b) => a.nombre.localeCompare(b.nombre));
  // El NOMBRE pesa más que un alias, incluso como prefijo: «nube» tiene que
  // dar primero «Nube / Internet», no AWS, Azure y GCP (que llevan «nube»
  // como alias). Lo que se escribe suele ser el nombre.
  const puntaje = (i: IconoDeCatalogo): number => {
    const nombre = normalizarTexto(i.nombre);
    const id = normalizarTexto(i.id);
    const alias = i.alias.map(normalizarTexto);
    if (nombre === q || id === q) return 0;
    if (nombre.startsWith(q)) return 1;
    if (alias.some((a) => a === q)) return 2;
    if (alias.some((a) => a.startsWith(q))) return 3;
    if ([nombre, id, ...alias].some((c) => c.includes(q))) return 4;
    return -1;
  };
  return base
    .map((i) => ({ i, p: puntaje(i) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || a.i.nombre.localeCompare(b.i.nombre))
    .map((x) => x.i);
}

/** Clave de cotejo: sin acentos, mayúsculas ni signos («Node.js» = «nodejs»). */
const claveDeCotejo = (s: string): string => normalizarTexto(s).replace(/[^a-z0-9]+/g, "");

/**
 * Una etiqueta de tecnología sin su versión: «Node 20» → «node», «Python 3.11+»
 * → «python», «PostgreSQL 16» → «postgresql». La versión es del proyecto, no
 * de la marca, y con ella ninguna etiqueta real coincidía con el catálogo.
 */
const sinVersion = (tag: string): string =>
  normalizarTexto(tag)
    .replace(/\s+v?\d[\w.+-]*\+?$/g, "")
    .replace(/\s*\(.*\)$/, "")
    .trim();

// Los GENÉRICOS (nube, servidor, reloj) no entran: el icono del tipo ya dice
// eso mismo, y una etiqueta «cron» no es una tecnología con logo.
const porNombre = new Map<string, IconoDeCatalogo>();
const porAlias = new Map<string, IconoDeCatalogo[]>();
for (const i of ICONOS.filter((x) => x.categoria !== "genericos")) {
  porNombre.set(claveDeCotejo(i.nombre), i);
  for (const a of i.alias) {
    const k = claveDeCotejo(a);
    porAlias.set(k, [...(porAlias.get(k) ?? []), i]);
  }
}

/** El icono de UNA etiqueta, o `undefined` si no hay uno inequívoco. */
export function iconoDeTecnologia(tag: string): IconoDeCatalogo | undefined {
  const k = claveDeCotejo(sinVersion(tag));
  if (!k) return undefined;
  const exacto = porNombre.get(k);
  if (exacto) return exacto;
  const candidatos = porAlias.get(k) ?? [];
  if (candidatos.length === 1) return candidatos[0];
  // «postgres» es alias de PostgreSQL y de Supabase: gana aquel cuyo NOMBRE
  // empieza por la etiqueta. Si sigue habiendo empate («nube»), no se elige.
  const porPrefijo = candidatos.filter((i) => claveDeCotejo(i.nombre).startsWith(k));
  return porPrefijo.length === 1 ? porPrefijo[0] : undefined;
}

/**
 * El icono que le corresponde a una caja por sus TECNOLOGÍAS: el de la primera
 * etiqueta que el catálogo reconoce sin ambigüedad. Es lo que el MCP pone solo
 * cuando el agente no eligió icono (#643) y lo que la ficha ofrece como
 * sugerencia; nunca pisa uno elegido.
 */
export function iconoPorTecnologia(tags: readonly string[] | null | undefined): string | undefined {
  for (const t of tags ?? []) {
    const i = iconoDeTecnologia(t);
    if (i) return i.id;
  }
  return undefined;
}
