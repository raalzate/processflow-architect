/**
 * @fileOverview Catálogo de iconos de tecnología (PURO, spec 025).
 *
 * Una caja puede llevar, además del icono de su TIPO, el logo de su
 * TECNOLOGÍA: PostgreSQL, Slack, Google Cloud, Android. El catálogo es un
 * conjunto CURADO y VERSIONADO (`catalog.generated.ts`, que escribe
 * `scripts/build-icon-catalog.ts` a partir de `scripts/icon-catalog.manifest.json`):
 * sin dependencia de ejecución, sin red en la app y con la licencia de cada
 * icono declarada. Acá viven la búsqueda y la resolución por id, que es lo
 * que el lienzo, la ficha y el MCP comparten; el saneado está en
 * `sanitize.ts` porque el script lo necesita antes de que exista el catálogo.
 */

import { ICON_CATALOG, MANIFEST_HASH } from "./catalog.generated";

export { sanearSvg, fallasDeIcono, type SvgSaneado } from "./sanitize";

export type FuenteDeIcono = "simple-icons" | "devicon" | "lucide";

export interface IconoDeCatalogo {
  /** `si-<slug>`, `dv-<nombre>` o `lu-<NombreLucide>`. Estable: es lo que guarda el proyecto. */
  id: string;
  nombre: string;
  categoria: string;
  /** Palabras con que también se encuentra («postgres», «base de datos»). */
  alias: string[];
  fuente: FuenteDeIcono;
  licencia: string;
  /** Color de marca (hex sin `#`), si la fuente lo da. Sólo se usa en la skin canónica. */
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
