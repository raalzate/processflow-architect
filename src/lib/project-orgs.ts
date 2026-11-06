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
import { getNotation } from "./notations";

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

/**
 * Organización con la que nace un proyecto creado en la app (#691). Quien está
 * mirando una organización y crea un proyecto lo quiere AHÍ: si naciera sin
 * `orgId`, el propio filtro lo escondería en el mismo instante en que se abre.
 * «Todas» y «Sin organización» no eligen ninguna, así que no se inventa.
 */
export function orgForNewProject(filtro: OrgFilter, explicita?: string | null): string | undefined {
  // Quien NOMBRA la organización (el MCP) decide, incluso `null` = «ninguna»; sólo
  // cuando nadie la nombra se toma la que está mirando el humano.
  if (explicita !== undefined) return explicita?.trim() || undefined;
  if (filtro === ORG_TODAS || filtro === null) return undefined;
  return filtro;
}

/**
 * Proyectos que ofrece el selector del header: los que deja el filtro MÁS el activo
 * si el filtro lo dejó afuera (#691). El selector anuncia dónde está parado el
 * humano; decir «Sin proyectos en X» con un proyecto abierto en el lienzo es mentir
 * sobre el estado, y hace creer que el trabajo se perdió.
 */
export function selectorFiles(files: SavedFile[], filtro: OrgFilter, currentFileId: string | null): SavedFile[] {
  const visibles = filterByOrg(files, filtro);
  if (!currentFileId || visibles.some((f) => f.id === currentFileId)) return visibles;
  const activo = files.find((f) => f.id === currentFileId);
  return activo ? [...visibles, activo] : visibles;
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
 * Qué valor debe tener el selector de proyectos con este filtro puesto.
 *
 * El proyecto activo puede quedar FUERA de lo visible (se filtró su organización).
 * Pasarle igual su id al selector lo deja en blanco: no toma el placeholder —porque el
 * valor no está vacío— y tampoco encuentra el item para pintar su texto. Devolver `""`
 * es lo que hace aparecer el aviso con la salida.
 */
export function visibleSelection(
  currentFileId: string | null,
  visibles: Pick<SavedFile, "id">[]
): string {
  if (!currentFileId) return "";
  return visibles.some((f) => f.id === currentFileId) ? currentFileId : "";
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

/** Dónde está parado el humano: organización › proyecto, y en qué notación. */
export interface ProjectContext {
  org: string;
  proyecto: string;
  notacion: string;
}

/**
 * Contexto del proyecto activo para pantallas fuera del lienzo (el Agrupador, #662).
 * Una acción sin deshacer tiene que decir sobre QUÉ proyecto opera; «el proyecto
 * activo» no lo dice. El proyecto sin organización lo declara, no lo calla.
 */
export function projectContext(
  file: Pick<SavedFile, "orgId" | "name"> & { content?: { nombre_proyecto?: string; notation?: string } },
  names: Record<string, string> = {}
): ProjectContext {
  const slug = orgOf(file);
  return {
    org: slug === null ? SIN_ORG_LABEL : orgChipLabel(slug, names),
    proyecto: file.content?.nombre_proyecto?.trim() || file.name,
    notacion: getNotation(file.content?.notation).label,
  };
}
