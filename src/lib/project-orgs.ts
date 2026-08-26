/**
 * @fileOverview Organizaciones del lado app: agrupar y filtrar los proyectos guardados.
 *
 * El header listaba TODOS los proyectos en un solo `<Select>`. Con varios clientes eso
 * es una lista que no se lee. Una organización agrupa proyectos; el chip del header
 * filtra la vista y el `<Select>` los muestra agrupados.
 *
 * Filtrar es una decisión de VISTA: no mueve nada, no renombra nada. Y el vacío no es
 * un estado muerto —si el filtro deja la lista en cero, quien llame a esto tiene que
 * ofrecer la salida (`ORG_TODAS`), igual que el lienzo nunca queda en blanco.
 */

import type { SavedFile } from "./types";

/** Valor del filtro: un slug · `null` (sin organización) · `"*"` (todas). */
export type OrgFilter = string | null | typeof ORG_TODAS;

/** Filtro que no filtra: muestra los proyectos de todas las organizaciones. */
export const ORG_TODAS = "*";

/** Etiqueta de los proyectos que no fueron agrupados. */
export const SIN_ORG_LABEL = "Sin organización";

export interface OrgGroup {
  /** `null` = el grupo de los proyectos sin organización. */
  slug: string | null;
  /** Nombre para mostrar (el legible si se conoce, si no el slug). */
  label: string;
  files: SavedFile[];
}

/** La organización de un proyecto, normalizada: lo que no es un slug es «sin org». */
export function orgOf(file: Pick<SavedFile, "orgId">): string | null {
  const raw = file.orgId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Agrupa los proyectos por organización. Los grupos van alfabéticos y el de «sin
 * organización» SIEMPRE al final: es el cajón heredado, no una organización más.
 */
export function groupByOrg(files: SavedFile[], names: Record<string, string> = {}): OrgGroup[] {
  const porSlug = new Map<string | null, SavedFile[]>();
  for (const f of files) {
    const slug = orgOf(f);
    const actual = porSlug.get(slug);
    if (actual) actual.push(f);
    else porSlug.set(slug, [f]);
  }
  const conOrg = [...porSlug.entries()]
    .filter((e): e is [string, SavedFile[]] => e[0] !== null)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([slug, archivos]) => ({ slug, label: names[slug] ?? slug, files: archivos }));

  const sinOrg = porSlug.get(null);
  return sinOrg ? [...conOrg, { slug: null, label: SIN_ORG_LABEL, files: sinOrg }] : conOrg;
}

/** Los proyectos que el filtro deja ver. */
export function filterByOrg(files: SavedFile[], filtro: OrgFilter): SavedFile[] {
  if (filtro === ORG_TODAS) return files;
  return files.filter((f) => orgOf(f) === filtro);
}

/** Texto del chip del header. */
export function orgChipLabel(filtro: OrgFilter, names: Record<string, string> = {}): string {
  if (filtro === ORG_TODAS) return "Todas";
  if (filtro === null) return SIN_ORG_LABEL;
  return names[filtro] ?? filtro;
}

/**
 * Qué decir cuando el filtro dejó la lista vacía. Devuelve `null` si hay proyectos:
 * el vacío se anuncia CON su salida, nunca con un desplegable mudo.
 */
export function emptyOrgHint(visibles: number, filtro: OrgFilter, names: Record<string, string> = {}): string | null {
  if (visibles > 0) return null;
  if (filtro === ORG_TODAS) return "Sin proyectos guardados";
  return `Sin proyectos en ${orgChipLabel(filtro, names)}`;
}

/**
 * Organizaciones a ofrecer en el chip: las que tienen proyectos, más las que existen
 * en el workspace del MCP aunque todavía no tengan ninguno. Sin esto, una organización
 * recién creada por el agente sería invisible hasta que alguien le ponga algo adentro.
 */
export function orgOptions(files: SavedFile[], desdeMcp: string[] = []): (string | null)[] {
  const slugs = new Set<string>();
  let hayHuerfanos = false;
  for (const f of files) {
    const slug = orgOf(f);
    if (slug) slugs.add(slug);
    else hayHuerfanos = true;
  }
  for (const s of desdeMcp) slugs.add(s);
  const ordenados: (string | null)[] = [...slugs].sort((a, b) => a.localeCompare(b));
  // «Sin organización» sólo se ofrece si hay algo ahí: un filtro que garantiza vacío
  // es una trampa.
  if (hayHuerfanos) ordenados.push(null);
  return ordenados;
}
