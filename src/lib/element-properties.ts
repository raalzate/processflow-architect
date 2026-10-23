/**
 * @fileOverview Propiedades canónicas de una caja: dónde vive y por dónde se le habla (PURO).
 *
 * Los metadatos de una caja (`element-metadata.ts`) son libres a propósito: el
 * usuario pone las claves que quiera. Pero hay un puñado de datos que, cuando
 * faltan, hacen que el diagrama no le sirva a quien construye: **el repositorio**
 * (dónde está el código) y **el puerto** (por dónde se le habla). Se buscaban a
 * mano cada vez, y cada quien los escribía con una clave distinta —`repo`,
 * `repositorio`, `repo_url`, `git`—, así que ni buscarlos era posible.
 *
 * Acá viven las claves CANÓNICAS: su nombre, el tipo que se espera de su valor,
 * los alias que se reconocen, y a qué elementos se les exige. `validate` las
 * convierte en un freno; `reviewPacket` las lista sin bloquear.
 *
 * Dos cosas que no son obvias:
 *
 *  - **A qué elementos aplica NO es una lista de tipos.** `CONSTITUTION.md` §P6:
 *    `notations.ts` es la única fuente de verdad de los tipos, y nada cablea
 *    literales fuera de ese registro. Acá se declara la CAPACIDAD
 *    (`aplicaA: "desplegables"`) y quién se despliega lo dice el flag
 *    `deployable` de ese registro (`isDeployableType`). Una notación nueva marca
 *    sus tipos y hereda la regla sola.
 *  - **`pendiente` es una respuesta.** Un boceto donde todavía nadie sabe el
 *    repositorio tiene que poder avanzar; lo que no se acepta es el silencio. El
 *    valor explícito `pendiente` cuenta como declarado, la ausencia no.
 */

import { esEnlaceExterno, validarValorSegunTipo, type ElementMetadata, type MetadataTipo } from "./element-metadata";
import { isDatastoreType, isDeployableType } from "./notations";

/** Valor con el que se declara que el dato todavía no se sabe. */
export const VALOR_PENDIENTE = "pendiente";

/**
 * A qué elementos se les pide una propiedad. Es una CAPACIDAD, no una lista de
 * tipos: `desplegables` son los que se despliegan (`deployable` en
 * `notations.ts`); `almacenes`, los que juegan el rol `datastore`; `servicios`,
 * lo desplegable que NO es almacén. La distinción existe porque a una base de
 * datos se le preguntaba por su repositorio, que no tiene: lo que quien la opera
 * busca es el motor y el esquema.
 */
export type AplicaA = "desplegables" | "servicios" | "almacenes" | "todos";

/** Qué es un elemento a efectos de sus propiedades. Lo decide `notations.ts`. */
export interface PerfilDePropiedades {
  desplegable: boolean;
  almacen: boolean;
}

/** El perfil de un tipo, leído del registro de notaciones (nunca de un literal). */
export function perfilDeTipo(tipo: string | undefined): PerfilDePropiedades {
  return { desplegable: isDeployableType(tipo ?? ""), almacen: isDatastoreType(tipo ?? "") };
}

/** Compatibilidad: quien sólo sabe si es desplegable pasa un booleano. */
const comoPerfil = (p: PerfilDePropiedades | boolean): PerfilDePropiedades =>
  typeof p === "boolean" ? { desplegable: p, almacen: false } : p;

export interface PropiedadCanonica {
  /** Nombre canónico, el que se guarda y el que se busca. */
  clave: string;
  /** Tipo esperado del valor (se valida con las reglas de `element-metadata`). */
  tipo: MetadataTipo;
  /** Grafías que se reconocen como esta clave. Nunca compartidas con otra entrada. */
  alias: readonly string[];
  /** `true` → su ausencia hace FALLAR la validación del diagrama. */
  obligatoria: boolean;
  aplicaA: AplicaA;
  /** Para qué sirve el dato. Sale en el mensaje de error: un freno explica por qué frena. */
  porQue: string;
}

/**
 * El registro. Obligatorias sólo `repo` y `puerto`: el puerto en todo lo
 * DESPLEGABLE, el repositorio sólo en los SERVICIOS —una base de datos no tiene
 * código propio—. `endpoint` no es obligatoria a propósito: exigirla haría
 * fallar los diagramas de dominio, que no exponen API y no por eso están
 * incompletos. El orden es el de las sugerencias de la ficha.
 */
export const PROPIEDADES_CANONICAS: readonly PropiedadCanonica[] = [
  {
    clave: "repo",
    tipo: "url",
    alias: ["repositorio", "repo_url", "repourl", "git", "codigo", "código"],
    obligatoria: true,
    aplicaA: "servicios",
    porQue: "sin el repositorio, quien va a construir no sabe dónde está el código de esta caja",
  },
  {
    clave: "puerto",
    tipo: "numero",
    alias: ["port", "puerto_http", "puertohttp"],
    obligatoria: true,
    aplicaA: "desplegables",
    porQue: "sin el puerto no se sabe por dónde se le habla al servicio",
  },
  {
    clave: "endpoint",
    tipo: "url",
    alias: ["url_base", "urlbase", "base_url", "baseurl", "api"],
    obligatoria: false,
    aplicaA: "servicios",
    porQue: "es la dirección pública por la que se consume esta caja",
  },
  {
    clave: "motor",
    tipo: "texto",
    alias: ["engine", "dbms", "gestor", "motor_bd"],
    obligatoria: false,
    aplicaA: "almacenes",
    porQue: "qué motor y versión corre (PostgreSQL 16, SQLite WAL): decide drivers, backups y límites",
  },
  {
    clave: "esquema",
    tipo: "texto",
    alias: ["schema", "base", "database", "base_de_datos", "nombre_bd"],
    obligatoria: false,
    aplicaA: "almacenes",
    porQue: "qué base o esquema concreto usa esta caja dentro del motor",
  },
  {
    clave: "respaldo",
    tipo: "texto",
    alias: ["backup", "backups", "retencion", "retención"],
    obligatoria: false,
    aplicaA: "almacenes",
    porQue: "cada cuánto se respalda y cuánto se retiene: sin esto nadie sabe qué se pierde ante una falla",
  },
  {
    clave: "owner",
    tipo: "texto",
    alias: ["dueño", "dueno", "equipo", "responsable"],
    obligatoria: false,
    aplicaA: "todos",
    porQue: "a quién se le pregunta cuando algo de esta caja no se entiende",
  },
  {
    clave: "wiki",
    tipo: "url",
    alias: ["doc", "docs", "documentacion", "documentación"],
    obligatoria: false,
    aplicaA: "todos",
    porQue: "dónde está explicado con más detalle",
  },
] as const;

/**
 * Cotejo de claves: sin distinguir mayúsculas, espacios, guiones ni guiones
 * bajos. `repo_url`, `Repo URL` y `repo-url` son la misma intención, y tratarlas
 * como distintas era justamente lo que hacía imposible buscar el repositorio.
 */
const cotejo = (clave: string): string =>
  (clave ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

/** Índice alias → canónica, armado una sola vez. */
const PORS_ALIAS = new Map<string, PropiedadCanonica>();
for (const p of PROPIEDADES_CANONICAS) {
  PORS_ALIAS.set(cotejo(p.clave), p);
  for (const a of p.alias) PORS_ALIAS.set(cotejo(a), p);
}

/** La clave canónica de una grafía cualquiera, o `null` si es una clave del usuario. */
export function claveCanonica(clave: string): string | null {
  return PORS_ALIAS.get(cotejo(clave))?.clave ?? null;
}

/** La definición canónica de una grafía, o `undefined`. */
export function propiedadCanonica(clave: string): PropiedadCanonica | undefined {
  return PORS_ALIAS.get(cotejo(clave));
}

const declarado = (m: ElementMetadata): boolean => (m.valor ?? "").trim().length > 0;
const esPendiente = (m: ElementMetadata): boolean =>
  (m.valor ?? "").trim().toLowerCase() === VALOR_PENDIENTE;

/** ¿A este elemento le aplica esta propiedad? */
export function aplicaPropiedad(p: PropiedadCanonica, perfil: PerfilDePropiedades | boolean): boolean {
  const { desplegable, almacen } = comoPerfil(perfil);
  switch (p.aplicaA) {
    case "todos":
      return true;
    case "desplegables":
      return desplegable;
    case "servicios":
      return desplegable && !almacen;
    case "almacenes":
      return almacen;
  }
}

/** Claves canónicas que el elemento ya declara (por su clave o por un alias). */
function canonicasDeclaradas(metadata: readonly ElementMetadata[] | undefined, conValor: boolean): Set<string> {
  const declaradas = new Set<string>();
  for (const m of metadata ?? []) {
    if (conValor && !declarado(m)) continue;
    const canonica = claveCanonica(m.clave);
    if (canonica) declaradas.add(canonica);
  }
  return declaradas;
}

/**
 * Propiedades OBLIGATORIAS que este elemento no declara. Un alias cuenta como
 * declarada y `pendiente` también; un valor en blanco, no.
 */
export function propiedadesFaltantes(
  metadata: readonly ElementMetadata[] | undefined,
  perfil: PerfilDePropiedades | boolean
): PropiedadCanonica[] {
  const declaradas = canonicasDeclaradas(metadata, true);
  return PROPIEDADES_CANONICAS.filter(
    (p) => p.obligatoria && aplicaPropiedad(p, perfil) && !declaradas.has(p.clave)
  );
}

/**
 * Lo que la ficha SUGIERE agregar: las canónicas que le aplican al elemento y
 * todavía no tiene (ni con un alias, ni a medio llenar), obligatorias primero.
 * Antes la fila de alta proponía siempre `repo`, aunque ya estuviera y aunque la
 * caja fuera una base de datos.
 */
export function propiedadesSugeridas(
  metadata: readonly ElementMetadata[] | undefined,
  perfil: PerfilDePropiedades | boolean
): PropiedadCanonica[] {
  const declaradas = canonicasDeclaradas(metadata, false);
  const libres = PROPIEDADES_CANONICAS.filter((p) => aplicaPropiedad(p, perfil) && !declaradas.has(p.clave));
  return [...libres.filter((p) => p.obligatoria), ...libres.filter((p) => !p.obligatoria)];
}

/** Un problema de tipo en una propiedad canónica. */
export interface ProblemaDeTipo {
  clave: string;
  valor: string;
  tipoEsperado: MetadataTipo;
  /** Por qué no vale, con las mismas palabras que la ficha. */
  detalle: string;
}

/**
 * Propiedades canónicas declaradas con un valor que NO es del tipo esperado. Es
 * un problema distinto de la ausencia: `puerto: "ocho mil"` está escrito, pero
 * quien lea el diagrama como dato va a tratarlo como número.
 */
export function propiedadesConTipoErrado(
  metadata: readonly ElementMetadata[] | undefined
): ProblemaDeTipo[] {
  const out: ProblemaDeTipo[] = [];
  for (const m of metadata ?? []) {
    const p = propiedadCanonica(m.clave);
    if (!p || !declarado(m) || esPendiente(m)) continue;
    const valor = m.valor.trim();
    // El `url` heredado sigue valiendo: la caja puede tener el valor legible y la
    // url en su campo, como antes de que el tipo existiera.
    if (p.tipo === "url" && esEnlaceExterno(m.url?.trim())) continue;
    const detalle = validarValorSegunTipo(valor, p.tipo, m.url);
    if (detalle) out.push({ clave: p.clave, valor, tipoEsperado: p.tipo, detalle });
  }
  return out;
}

/** Un problema de propiedades, listo para un mensaje de validación o de revisión. */
export interface ProblemaDePropiedad {
  /** Nombre del elemento (es lo que el humano reconoce, no el id). */
  elemento: string;
  /** Id del elemento, para que un agente pueda arreglarlo sin buscar. */
  id: string;
  clave: string;
  tipoEsperado: MetadataTipo;
  /** `falta` → no está declarada; `tipo` → está, con el valor equivocado. */
  motivo: "falta" | "tipo";
  /** Frase lista para leer: qué pasa y por qué importa. */
  detalle: string;
}

/** Forma mínima que necesita este módulo de un elemento del modelo. */
interface ElementoConPropiedades {
  id?: string;
  nombre?: string;
  tipo_elemento?: string;
  metadata?: ElementMetadata[];
}

/**
 * Todos los problemas de propiedades canónicas del modelo, en el orden de sus
 * elementos: primero las que faltan, después las que están con el tipo
 * equivocado. Es lo que consumen `validate` (como freno) y `reviewPacket` (como
 * informe).
 */
export function problemasDePropiedades(model: {
  nodes?: readonly ElementoConPropiedades[];
}): ProblemaDePropiedad[] {
  const out: ProblemaDePropiedad[] = [];
  for (const n of model?.nodes ?? []) {
    const nombre = n.nombre || n.id || "(sin nombre)";
    const id = n.id || "";
    for (const p of propiedadesFaltantes(n.metadata, perfilDeTipo(n.tipo_elemento))) {
      out.push({
        elemento: nombre,
        id,
        clave: p.clave,
        tipoEsperado: p.tipo,
        motivo: "falta",
        detalle: `"${nombre}" no declara "${p.clave}" (${p.tipo}): ${p.porQue}. Si todavía no se sabe, poné "${VALOR_PENDIENTE}".`,
      });
    }
    for (const t of propiedadesConTipoErrado(n.metadata)) {
      out.push({
        elemento: nombre,
        id,
        clave: t.clave,
        tipoEsperado: t.tipoEsperado,
        motivo: "tipo",
        detalle: `"${nombre}" declara "${t.clave}" con un valor que no corresponde: ${t.detalle}`,
      });
    }
  }
  return out;
}

/**
 * Alias encontrados en el modelo: la clave que escribió alguien y la canónica que
 * representa. La revisión lo informa para poder normalizar el diagrama sabiendo
 * qué se va a renombrar; nada se reescribe solo.
 */
export function aliasEncontrados(model: {
  nodes?: readonly ElementoConPropiedades[];
}): { elemento: string; escrita: string; canonica: string }[] {
  const out: { elemento: string; escrita: string; canonica: string }[] = [];
  for (const n of model?.nodes ?? []) {
    for (const m of n.metadata ?? []) {
      const canonica = claveCanonica(m.clave);
      if (canonica && cotejo(m.clave) !== cotejo(canonica)) {
        out.push({ elemento: n.nombre || n.id || "(sin nombre)", escrita: m.clave, canonica });
      }
    }
  }
  return out;
}
