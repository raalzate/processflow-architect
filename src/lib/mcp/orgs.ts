/**
 * @fileOverview Organizaciones: a qué grupo de diagramas se refiere una llamada MCP. PURO.
 *
 * El workspace guardaba todos los modelos en curso en una sola carpeta plana
 * (`.processflow/diagrams/`), así que un humano que trabaja para varios clientes —y el
 * agente externo que le diseña— los veía mezclados: `list_diagrams` devolvía el
 * vocabulario de todo. Una organización agrupa N diagramas y aísla lo que el agente ve.
 *
 * La agrupación es una CARPETA, no una etiqueta: `orgs/<slug>/diagrams/`. Así el filtro
 * es estructural (se lee un solo directorio) en vez de disciplinado (cada herramienta
 * acordándose de filtrar), que es la forma en que este tipo de aislamiento se rompe.
 *
 * Este módulo no toca disco: devuelve rutas RELATIVAS y recibe la lista de orgs que
 * existen. Quien las lee es `main/services/mcp-tools.ts`.
 */

import { slugify } from "./diagram-builder";

/** Una organización, tal como la ve el agente. */
export interface OrgRef {
  /** Nombre de la carpeta (`orgs/<slug>/`). */
  slug: string;
  /** Nombre para leer, el que puso el humano. */
  nombre: string;
  /** Cuántos diagramas tiene. */
  diagramas: number;
}

/** Org resuelta para una llamada. `null` = «sin organización» (la carpeta plana). */
export interface ResolucionOrg {
  slug: string | null;
  /** De dónde salió, para poder decirlo cuando no fue explícita. */
  origen: "parametro" | "fijada" | "configuracion" | "ninguna";
}

export interface EntradaResolucionOrg {
  /** La que trae la llamada. */
  explicit?: string | null;
  /** La fijada con `use_org` (persistida en el workspace). */
  pinned?: string;
  /** La de la configuración del servidor (`--org` / `PROCESSFLOW_ORG`). */
  configured?: string;
  /** Los slugs que existen hoy en el workspace. */
  disponibles: string[];
}

/** Carpeta plana heredada: los diagramas de antes de que existieran las orgs. */
export const SIN_ORG = "(sin organización)";

/**
 * Slug de una organización a partir del nombre que escribió el humano. Reusa el
 * `slugify` del builder (mismas reglas de acentos y separadores) y recorta: el slug es
 * un nombre de directorio y los sistemas de archivos tienen límites.
 */
export function orgSlug(nombre: string): string {
  const base = slugify(nombre).slice(0, 48).replace(/-+$/g, "");
  // `slugify` cae a "nodo" con la entrada vacía; acá eso sería una org fantasma.
  return base === "nodo" && !/nodo/i.test(nombre || "") ? "" : base;
}

/**
 * ¿Es un slug seguro para usar como directorio? El nombre entra a un `path.join`, así
 * que esto NO es cosmética: `..` o un separador saldrían del workspace y escribirían
 * donde no corresponde. Sólo minúsculas, dígitos y guiones intermedios.
 */
export function isValidOrgSlug(slug: string | null | undefined): boolean {
  if (typeof slug !== "string") return false;
  // Empieza y termina en alfanumérico: un guion al borde es un directorio incómodo de
  // escribir a mano y una diferencia invisible entre "acme" y "acme-".
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) && !slug.includes("--") && slug.length <= 48;
}

/**
 * Carpeta de diagramas RELATIVA a `.processflow/`, para la org dada. Sin org devuelve
 * la carpeta plana de siempre: un workspace de hoy sigue funcionando sin tocar nada.
 */
export function diagramsDirRel(org?: string | null): string {
  if (!org) return "diagrams";
  if (!isValidOrgSlug(org)) throw new Error(slugInvalido(org));
  return `orgs/${org}/diagrams`;
}

/** Carpeta de la org (donde vive su `org.json`), relativa a `.processflow/`. */
export function orgDirRel(org: string): string {
  if (!isValidOrgSlug(org)) throw new Error(slugInvalido(org));
  return `orgs/${org}`;
}

/**
 * A qué organización se refiere esta llamada. Misma precedencia que
 * `resolveDiagramId`, con una diferencia deliberada: no adivina cuando hay una sola
 * org. Aislar es el punto; caer solo en la única org existente convertiría el
 * aislamiento en una sorpresa.
 *
 * Precedencia: 1) el parámetro de la llamada · 2) la fijada con `use_org` ·
 * 3) la de la configuración del servidor · 4) sin organización (carpeta plana).
 */
export function resolveOrg(entrada: EntradaResolucionOrg): ResolucionOrg {
  const { disponibles } = entrada;

  // `null` explícito es una decisión, no un "no sé": pide la carpeta plana.
  if (entrada.explicit === null) return { slug: null, origen: "parametro" };

  const explicito = entrada.explicit?.trim();
  if (explicito) {
    // Un slug explícito que no existe NO cae a la fijada: taparlo con otra org haría
    // que el agente escriba en el cliente equivocado, y eso se descubre tarde.
    if (!disponibles.includes(explicito)) throw new Error(noExisteOrg(explicito, disponibles));
    return { slug: explicito, origen: "parametro" };
  }
  if (entrada.pinned && disponibles.includes(entrada.pinned)) {
    return { slug: entrada.pinned, origen: "fijada" };
  }
  if (entrada.configured && disponibles.includes(entrada.configured)) {
    return { slug: entrada.configured, origen: "configuracion" };
  }

  // Una fijada o configurada que ya no existe es un error, no un silencio: el agente
  // creería estar aislado y estaría escribiendo en la carpeta plana de todos.
  const huerfana = entrada.pinned ?? entrada.configured;
  if (huerfana) throw new Error(orgHuerfana(huerfana, disponibles));

  return { slug: null, origen: "ninguna" };
}

/** Qué hay que hacer para eliminar una organización sin perder nada. */
export interface PlanBorrado {
  /** Diagramas que vuelven a la carpeta plana. */
  aMover: string[];
  /** Ids que YA existen en la carpeta plana: moverlos pisaría trabajo ajeno. */
  conflictos: string[];
}

/**
 * Eliminar una organización SUELTA su contenido, no lo borra: los diagramas vuelven a
 * la carpeta plana. Quitar una etiqueta no puede costar trabajo.
 *
 * El único caso que se niega es el choque de ids —los ids son únicos por organización,
 * así que dos carpetas pueden tener «enrollment»—: mover encima sería exactamente la
 * pérdida que esta regla existe para evitar.
 */
export function planOrgDeletion(enLaOrg: string[], enLaPlana: string[]): PlanBorrado {
  const plana = new Set(enLaPlana);
  const conflictos = enLaOrg.filter((id) => plana.has(id));
  return { aMover: enLaOrg.filter((id) => !plana.has(id)), conflictos };
}

/** Mensaje del borrado que se niega, con lo que el humano tiene que resolver. */
export function conflictoBorrado(slug: string, conflictos: string[]): string {
  return `No se puede eliminar "${slug}": ${conflictos.length} diagrama(s) tienen el mismo id que uno de ${SIN_ORG} (${conflictos
    .map((c) => `"${c}"`)
    .join(", ")}). Al soltarlos se pisarían. Movelos con move_diagram a otra organización, o renombrá el que estorba, y volvé a intentar.`;
}

/** Listado legible de organizaciones, con la activa marcada. */
export function formatOrgList(orgs: OrgRef[], activa: string | null): string {
  if (!orgs.length) {
    return `No hay organizaciones. Los diagramas viven en ${SIN_ORG}. Crea una con create_org.`;
  }
  const lineas = orgs.map(
    (o) =>
      `- ${o.slug}${o.slug === activa ? " ← activa" : ""} · ${o.nombre} · ${o.diagramas} diagrama(s)`
  );
  if (activa === null) lineas.push(`- ${SIN_ORG} ← activa (carpeta plana heredada)`);
  return `${lineas.join("\n")}\n\nFijá una con use_org para no repetir \`org\` en cada llamada; use_org(null) vuelve a ${SIN_ORG}.`;
}

function lista(slugs: string[]): string {
  return slugs.length ? slugs.map((s) => `"${s}"`).join(", ") : "(ninguna)";
}

function slugInvalido(slug: string): string {
  return `"${slug}" no es un slug de organización válido: sólo minúsculas, dígitos y guiones intermedios (ej. "acme-salud"). Se usa como nombre de carpeta.`;
}

function noExisteOrg(slug: string, disponibles: string[]): string {
  return `No existe la organización "${slug}". Las que hay: ${lista(
    disponibles
  )}. Crea una con create_org, o mirá list_orgs.`;
}

function orgHuerfana(slug: string, disponibles: string[]): string {
  return `La organización fijada ("${slug}") ya no está en el workspace. Las que hay: ${lista(
    disponibles
  )}. Fijá otra con use_org, o use_org(null) para trabajar en ${SIN_ORG}.`;
}
