/**
 * @fileOverview Ruta base de las fuentes, por proyecto (PURO). #670.
 *
 * El campo «Fuente» de una caja cita archivos con rutas RELATIVAS
 * (`src/lib/a.ts · docs/b.md:36`). Un agente que recibe la caja no sabe contra
 * qué carpeta resolverlas; la ruta base se lo dice.
 *
 * Vive en localStorage y no en el archivo del proyecto a propósito: la ruta es
 * de ESTA máquina (`/Users/ana/repo`), y guardada en el proyecto viajaría a la
 * de un compañero apuntando a una carpeta que allí no existe.
 */

/** localStorage: `{ [projectId]: rutaBase }`. */
export const SOURCE_BASE_KEY = "source_base_by_project";

/** Recorta espacios y la barra final; vacía → sin ruta. La raíz sola queda. */
export function normalizarRutaBase(valor?: string | null): string | undefined {
  const v = (valor ?? "").trim();
  if (!v) return undefined;
  const sinBarra = v.replace(/[\\/]+$/, "");
  return sinBarra || v.charAt(0);
}

function leerMapa(storage: Pick<Storage, "getItem">): Record<string, string> {
  try {
    const v = JSON.parse(storage.getItem(SOURCE_BASE_KEY) || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string")
    );
  } catch {
    return {};
  }
}

export function leerRutaBase(
  storage: Pick<Storage, "getItem">,
  projectId: string | null | undefined
): string | undefined {
  if (!projectId) return undefined;
  return normalizarRutaBase(leerMapa(storage)[projectId]);
}

/** Guarda (o borra, si viene vacía) la ruta base de un proyecto. */
export function guardarRutaBase(
  storage: Pick<Storage, "getItem" | "setItem">,
  projectId: string,
  ruta: string | undefined
): void {
  const mapa = leerMapa(storage);
  const v = normalizarRutaBase(ruta);
  if (v) mapa[projectId] = v;
  else delete mapa[projectId];
  storage.setItem(SOURCE_BASE_KEY, JSON.stringify(mapa));
}

/** Absoluta en Unix o Windows, o una URL: no se resuelve contra la base. */
const esAbsoluta = (p: string): boolean => /^([\\/]|[A-Za-z]:[\\/]|[a-z][a-z0-9+.-]*:\/\/)/i.test(p);

/**
 * La cita con cada archivo resuelto contra la ruta base. Las citas se separan
 * con « · » (como las escribe el humano en la ficha); la línea (`:36`) se conserva.
 */
export function citaConRutaBase(cita: string, base: string | undefined): string {
  if (!base || !cita.trim()) return cita;
  const sep = /[\\]/.test(base) && !base.includes("/") ? "\\" : "/";
  return cita
    .split(" · ")
    .map((parte) => {
      const p = parte.trim();
      if (!p || esAbsoluta(p)) return parte;
      return `${base}${base.endsWith(sep) ? "" : sep}${p.replace(/^\.[\\/]/, "")}`;
    })
    .join(" · ");
}

/** La línea que se suma al contexto de un agente; vacía si no hay ruta. */
export function lineaRutaBase(base: string | undefined): string {
  if (!base) return "";
  return `Las rutas del campo «Fuente» de cada caja son relativas a "${base}" (ruta base de las fuentes del proyecto): abrí los archivos desde ahí.`;
}
