/**
 * @fileOverview Especificación de un elemento: qué debe hacer y cómo se sabe (PURO).
 *
 * Una caja del lienzo dice **qué es** (nombre, tipo, tecnologías) y —con los
 * metadatos— **dónde vive** (`element-metadata.ts`). Lo que no decía es **qué
 * debe hacer y cómo se verifica**: ese contrato terminaba en un documento
 * aparte, en una issue o en la cabeza de alguien, y al llegar al equipo que
 * construye ya no se podía rastrear a la caja que lo originó.
 *
 * Acá vive TODO lo que decide sobre esa especificación: qué cuenta como "vacía"
 * (y por lo tanto no se persiste), cómo se numeran los requisitos visibles, cómo
 * se normaliza lo que llega de un archivo viejo o de la IA, cómo se fusiona al
 * unir dos grafos, y cómo se serializa al markdown de la plantilla. La ficha del
 * diseñador orquesta; este módulo decide.
 *
 * Dos cosas que ya confundieron una vez y conviene no volver a mezclar:
 *
 *  - Los `id` de las piezas son INTERNOS: sirven de `key` de React y de ancla al
 *    reordenar. Los identificadores que se VEN (`FR-001`, `SC-003`) se derivan
 *    de la posición con `etiqueta()`; por eso borrar el del medio nunca deja un
 *    hueco, y por eso no hay que renumerar nada al guardar.
 *  - `isSpecEmpty` es lo que mantiene los proyectos existentes intactos: una
 *    spec sin datos se guarda como `undefined`, así abrir una ficha no le agrega
 *    un objeto a cada elemento del archivo.
 */

/** Estado de la especificación. `borrador` es el punto de partida. */
export type SpecStatus = "borrador" | "revision" | "aprobada" | "obsoleta";

/** Estados, con su etiqueta para la UI y el markdown. */
export const SPEC_STATUSES: readonly { value: SpecStatus; label: string }[] = [
  { value: "borrador", label: "Borrador" },
  { value: "revision", label: "En revisión" },
  { value: "aprobada", label: "Aprobada" },
  { value: "obsoleta", label: "Obsoleta" },
] as const;

/** Condición verificable: estado inicial, acción, resultado esperado. */
export interface SpecScenario {
  id: string;
  given: string;
  when: string;
  then: string;
}

/** Historia de usuario: la unidad que se prioriza y se entrega. */
export interface SpecStory {
  id: string;
  titulo: string;
  /** `P1`, `P2`, … Es texto libre a propósito: el usuario manda sobre su tablero. */
  prioridad: string;
  porQue: string;
  pruebaIndependiente: string;
  escenarios: SpecScenario[];
}

/** Requisito funcional. El `FR-00N` que se ve lo da la posición, no este objeto. */
export interface SpecRequirement {
  id: string;
  texto: string;
  /** El requisito está escrito pero falta una decisión: se marca, no se borra. */
  needsClarification?: boolean;
}

/** Entidad clave: qué representa, sin detalles de implementación. */
export interface SpecEntity {
  id: string;
  nombre: string;
  descripcion: string;
}

/** Criterio de éxito medible. El `SC-00N` que se ve lo da la posición. */
export interface SpecCriterion {
  id: string;
  texto: string;
}

/** La especificación de UN elemento del diagrama. No existe suelta. */
export interface ElementSpec {
  featureName: string;
  /** ISO corto (`YYYY-MM-DD`). Se siembra al primer dato y se puede corregir. */
  createdAt?: string;
  status: SpecStatus;
  /** La entrada original del usuario, tal como la escribió. */
  input: string;
  stories: SpecStory[];
  edgeCases: string[];
  requirements: SpecRequirement[];
  entities: SpecEntity[];
  criteria: SpecCriterion[];
}

/**
 * Topes. Existen para que un agente equivocado no convierta una caja en un
 * libro: al normalizar se RECORTA (no se rechaza) porque lo que llega de afuera
 * puede ser un archivo ya guardado, y perder el archivo entero por una lista
 * larga sería peor que quedarse con las primeras.
 */
export const MAX_HISTORIAS = 50;
export const MAX_ESCENARIOS_POR_HISTORIA = 20;
export const MAX_ITEMS_LISTA = 200;
export const MAX_TEXTO_CHARS = 2000;

// Contador de ids: sólo tiene que ser único DENTRO del proceso, porque el id no
// se persiste con significado (es `key` de React y ancla de reordenamiento).
let secuencia = 0;
const nuevoId = (prefijo: string): string => `${prefijo}-${++secuencia}`;

/** Historia nueva, vacía, con la prioridad que se le pida. */
export const nuevaHistoria = (prioridad: string): SpecStory => ({
  id: nuevoId("st"),
  titulo: "",
  prioridad,
  porQue: "",
  pruebaIndependiente: "",
  escenarios: [],
});

export const nuevoEscenario = (): SpecScenario => ({ id: nuevoId("sc"), given: "", when: "", then: "" });
export const nuevoRequisito = (): SpecRequirement => ({ id: nuevoId("fr"), texto: "" });
export const nuevaEntidad = (): SpecEntity => ({ id: nuevoId("en"), nombre: "", descripcion: "" });
export const nuevoCriterio = (): SpecCriterion => ({ id: nuevoId("cr"), texto: "" });

/** Especificación vacía canónica. */
export const emptySpec = (): ElementSpec => ({
  featureName: "",
  status: "borrador",
  input: "",
  stories: [],
  edgeCases: [],
  requirements: [],
  entities: [],
  criteria: [],
});

const hayTexto = (s?: string): boolean => !!s && s.trim().length > 0;

/**
 * `true` si la especificación no tiene NADA escrito. El estado por defecto y los
 * ids no cuentan: si contaran, abrir la ficha de un elemento le agregaría una
 * spec al archivo del proyecto sin que el usuario escribiera una letra.
 */
export function isSpecEmpty(spec?: ElementSpec | null): boolean {
  if (!spec) return true;
  if (hayTexto(spec.featureName) || hayTexto(spec.input) || hayTexto(spec.createdAt)) return false;
  if (spec.status && spec.status !== "borrador") return false;
  if (spec.edgeCases?.some(hayTexto)) return false;
  if (spec.requirements?.some((r) => hayTexto(r.texto))) return false;
  if (spec.entities?.some((e) => hayTexto(e.nombre) || hayTexto(e.descripcion))) return false;
  if (spec.criteria?.some((c) => hayTexto(c.texto))) return false;
  return !spec.stories?.some(
    (h) =>
      hayTexto(h.titulo) ||
      hayTexto(h.porQue) ||
      hayTexto(h.pruebaIndependiente) ||
      h.escenarios?.some((e) => hayTexto(e.given) || hayTexto(e.when) || hayTexto(e.then))
  );
}

/**
 * Siembra `createdAt` la primera vez que la spec tiene datos. No pisa una fecha
 * ya puesta (el usuario la puede corregir) y no siembra sobre una spec vacía
 * (sembrar ahí sería justamente lo que `isSpecEmpty` evita).
 */
export function specWithSeededDate(spec: ElementSpec, hoy: string): ElementSpec {
  if (spec.createdAt || isSpecEmpty(spec)) return spec;
  return { ...spec, createdAt: hoy };
}

/**
 * Siguiente `P{n}` libre. Rellena huecos (borrar la P2 la vuelve a proponer) y
 * no prohíbe repetir: sólo propone. Una prioridad escrita a mano que no tenga la
 * forma `P<n>` simplemente no ocupa número.
 */
export function nextPriority(stories: readonly SpecStory[]): string {
  const usados = new Set<number>();
  for (const h of stories) {
    const m = /^P(\d+)$/i.exec((h.prioridad ?? "").trim());
    if (m) usados.add(Number(m[1]));
  }
  let n = 1;
  while (usados.has(n)) n++;
  return `P${n}`;
}

/** Identificador visible de un ítem por su POSICIÓN: `FR-001`, `SC-010`. */
export const etiqueta = (prefijo: string, indice: number): string =>
  `${prefijo}-${String(indice + 1).padStart(3, "0")}`;

/** Mueve un ítem de posición. Fuera de rango devuelve la lista tal cual. */
export function moveItem<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  const actual = [...lista];
  if (desde < 0 || hasta < 0 || desde >= actual.length || hasta >= actual.length) return actual;
  const [movido] = actual.splice(desde, 1);
  actual.splice(hasta, 0, movido);
  return actual;
}

// --- Normalización de lo que llega de AFUERA (archivo guardado, MCP, IA) ------

const texto = (v: unknown): string =>
  typeof v === "string" ? v.slice(0, MAX_TEXTO_CHARS) : "";

const listaDeTextos = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.slice(0, MAX_TEXTO_CHARS))
        .slice(0, MAX_ITEMS_LISTA)
    : [];

const objetos = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v.filter((x) => !!x && typeof x === "object") as Record<string, unknown>[]) : [];

const estadoValido = (v: unknown): SpecStatus =>
  SPEC_STATUSES.some((s) => s.value === v) ? (v as SpecStatus) : "borrador";

/**
 * Normaliza lo que llega de afuera: completa ids, descarta lo que no tiene nada
 * escrito, cae al estado por defecto si el que viene es inventado y recorta a
 * los topes. Devuelve `undefined` cuando no queda nada — igual que
 * `normalizarLista` de los metadatos, para que el diff del borrador de la ficha
 * no vea un cambio donde no hubo ninguno.
 */
export function sanitizeSpec(valor: unknown): ElementSpec | undefined {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  const cruda = valor as Record<string, unknown>;

  const stories: SpecStory[] = objetos(cruda.stories)
    .map((h) => ({
      id: typeof h.id === "string" && h.id ? h.id : nuevoId("st"),
      titulo: texto(h.titulo),
      prioridad: texto(h.prioridad) || "P1",
      porQue: texto(h.porQue),
      pruebaIndependiente: texto(h.pruebaIndependiente),
      escenarios: objetos(h.escenarios)
        .map((e) => ({
          id: typeof e.id === "string" && e.id ? e.id : nuevoId("sc"),
          given: texto(e.given),
          when: texto(e.when),
          then: texto(e.then),
        }))
        .filter((e) => hayTexto(e.given) || hayTexto(e.when) || hayTexto(e.then))
        .slice(0, MAX_ESCENARIOS_POR_HISTORIA),
    }))
    .filter(
      (h) =>
        hayTexto(h.titulo) || hayTexto(h.porQue) || hayTexto(h.pruebaIndependiente) || h.escenarios.length > 0
    )
    .slice(0, MAX_HISTORIAS);

  const requirements: SpecRequirement[] = objetos(cruda.requirements)
    .map((r) => ({
      id: typeof r.id === "string" && r.id ? r.id : nuevoId("fr"),
      texto: texto(r.texto),
      ...(r.needsClarification === true ? { needsClarification: true } : {}),
    }))
    .filter((r) => hayTexto(r.texto))
    .slice(0, MAX_ITEMS_LISTA);

  const entities: SpecEntity[] = objetos(cruda.entities)
    .map((e) => ({
      id: typeof e.id === "string" && e.id ? e.id : nuevoId("en"),
      nombre: texto(e.nombre),
      descripcion: texto(e.descripcion),
    }))
    .filter((e) => hayTexto(e.nombre) || hayTexto(e.descripcion))
    .slice(0, MAX_ITEMS_LISTA);

  const criteria: SpecCriterion[] = objetos(cruda.criteria)
    .map((c) => ({
      id: typeof c.id === "string" && c.id ? c.id : nuevoId("cr"),
      texto: texto(c.texto),
    }))
    .filter((c) => hayTexto(c.texto))
    .slice(0, MAX_ITEMS_LISTA);

  const spec: ElementSpec = {
    featureName: texto(cruda.featureName),
    status: estadoValido(cruda.status),
    input: texto(cruda.input),
    stories,
    edgeCases: listaDeTextos(cruda.edgeCases),
    requirements,
    entities,
    criteria,
  };
  if (typeof cruda.createdAt === "string" && cruda.createdAt.trim()) spec.createdAt = cruda.createdAt.trim();
  return isSpecEmpty(spec) ? undefined : spec;
}

/**
 * Unión al fusionar elementos (el merger de nodos). Misma regla que los
 * metadatos: manda el PRINCIPAL, y sólo si su spec está vacía se hereda la
 * primera secundaria que tenga datos. Fusionar campo por campo produciría una
 * especificación que nadie escribió, y perder la del principal en silencio es
 * perder el contrato de la caja que sobrevive.
 */
export function mergeSpec(
  principal: ElementSpec | undefined,
  secundarias: readonly (ElementSpec | undefined)[] = []
): ElementSpec | undefined {
  if (!isSpecEmpty(principal)) return principal;
  for (const s of secundarias) if (!isSpecEmpty(s)) return s;
  return undefined;
}

// --- Salida: el markdown de la plantilla -------------------------------------

const etiquetaEstado = (s: SpecStatus): string =>
  SPEC_STATUSES.find((x) => x.value === s)?.label ?? "Borrador";

/**
 * Ítem de lista con el texto del usuario LITERAL. No se escapa nada (un `|` o un
 * `#` se escribieron a propósito) y las líneas siguientes se sangran dos
 * espacios, que es lo único que hace falta para que la lista no se parta.
 */
const item = (marca: string, texto: string): string =>
  `${marca}${texto.split("\n").join("\n  ")}`;

/**
 * Serializa a la forma de la plantilla de referencia. Las secciones sin datos se
 * OMITEN: un documento lleno de encabezados vacíos se lee como si faltara
 * trabajo cuando lo que falta es contenido. Una spec vacía devuelve `""`.
 */
export function specToMarkdown(spec: ElementSpec, fallbackName: string): string {
  if (isSpecEmpty(spec)) return "";
  const nombre = spec.featureName.trim() || fallbackName.trim() || "(sin nombre)";
  const bloques: string[] = [];

  const cabecera = [`# Feature Specification: ${nombre}`, ""];
  if (spec.createdAt?.trim()) cabecera.push(`**Created**: ${spec.createdAt.trim()}`);
  cabecera.push(`**Status**: ${etiquetaEstado(spec.status)}`);
  if (spec.input.trim()) cabecera.push(`**Input**: User description: "${spec.input.trim()}"`);
  bloques.push(cabecera.join("\n"));

  const historias = spec.stories.filter(
    (h) =>
      hayTexto(h.titulo) ||
      hayTexto(h.porQue) ||
      hayTexto(h.pruebaIndependiente) ||
      h.escenarios.some((e) => hayTexto(e.given) || hayTexto(e.when) || hayTexto(e.then))
  );
  if (historias.length) {
    const partes = ["## User Stories *(mandatory)*"];
    historias.forEach((h, i) => {
      const titulo = h.titulo.trim() || "(sin título)";
      const cuerpo = [`### User Story ${i + 1} - ${titulo} (Priority: ${h.prioridad.trim() || "P?"})`];
      if (h.porQue.trim()) cuerpo.push("", `**Why this priority**: ${h.porQue.trim()}`);
      if (h.pruebaIndependiente.trim())
        cuerpo.push("", `**Independent Test**: ${h.pruebaIndependiente.trim()}`);
      const escenarios = h.escenarios.filter(
        (e) => hayTexto(e.given) || hayTexto(e.when) || hayTexto(e.then)
      );
      if (escenarios.length) {
        cuerpo.push("", "**Acceptance Scenarios**:", "");
        escenarios.forEach((e, j) => {
          cuerpo.push(
            item(
              `${j + 1}. `,
              `**Given** ${e.given.trim()}, **When** ${e.when.trim()}, **Then** ${e.then.trim()}`
            )
          );
        });
      }
      partes.push(cuerpo.join("\n"));
    });
    bloques.push(partes.join("\n\n"));
  }

  const casos = spec.edgeCases.filter(hayTexto);
  if (casos.length) {
    bloques.push(["### Edge Cases", "", ...casos.map((c) => item("- ", c.trim()))].join("\n"));
  }

  const requisitos = spec.requirements.filter((r) => hayTexto(r.texto));
  const entidades = spec.entities.filter((e) => hayTexto(e.nombre) || hayTexto(e.descripcion));
  if (requisitos.length || entidades.length) {
    const partes = ["## Requirements *(mandatory)*"];
    if (requisitos.length) {
      partes.push(
        [
          "### Functional Requirements",
          "",
          ...requisitos.map((r, i) =>
            item(
              "- ",
              `**${etiqueta("FR", i)}**: ${r.texto.trim()}${r.needsClarification ? " [NEEDS CLARIFICATION]" : ""}`
            )
          ),
        ].join("\n")
      );
    }
    if (entidades.length) {
      partes.push(
        [
          "### Key Entities",
          "",
          ...entidades.map((e) =>
            item("- ", `**${e.nombre.trim() || "(sin nombre)"}**: ${e.descripcion.trim()}`)
          ),
        ].join("\n")
      );
    }
    bloques.push(partes.join("\n\n"));
  }

  const criterios = spec.criteria.filter((c) => hayTexto(c.texto));
  if (criterios.length) {
    bloques.push(
      [
        "## Success Criteria *(mandatory)*",
        "",
        "### Measurable Outcomes",
        "",
        ...criterios.map((c, i) => item("- ", `**${etiqueta("SC", i)}**: ${c.texto.trim()}`)),
      ].join("\n")
    );
  }

  return `${bloques.join("\n\n")}\n`;
}

/**
 * Nombre del `.md` exportado. Sale del nombre de la feature, o del elemento si
 * la feature no tiene nombre; los acentos y los caracteres de ruta se van (un
 * `/` en el nombre convertiría la descarga en una carpeta inexistente).
 */
export function specFileName(spec: ElementSpec, fallbackName: string): string {
  const base = (spec.featureName.trim() || fallbackName.trim())
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `${base}-spec.md` : "spec.md";
}

// --- Entrada: el borrador que devuelve la IA -----------------------------------

/**
 * Lee el borrador que devuelve la IA. El formato es de LÍNEAS ETIQUETADAS
 * (`REQUISITO | texto`) y no JSON a propósito: el motor local es un modelo
 * pequeño y un JSON con comas y llaves se rompe cada dos por tres, mientras que
 * una línea mal formada acá sólo se descarta y el resto del borrador sobrevive.
 *
 * Un `ESCENARIO` se cuelga de la última `HISTORIA` leída; si llega antes de
 * cualquier historia, se descarta (no hay a qué colgarlo). La salida pasa por
 * `sanitizeSpec`, así que una respuesta basura devuelve `undefined` en vez de
 * reventar.
 */
export function specFromLines(raw: string): ElementSpec | undefined {
  const spec = emptySpec();
  let ultima: SpecStory | undefined;

  for (const linea of (raw ?? "").split("\n")) {
    const partes = linea.split("|").map((p) => p.trim());
    const marca = (partes[0] ?? "").toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g, "");
    const campos = partes.slice(1);
    if (!campos.some((c) => c.length > 0)) continue;

    switch (marca) {
      case "FEATURE":
        spec.featureName = campos[0] ?? "";
        break;
      case "HISTORIA":
        ultima = {
          ...nuevaHistoria(campos[1] || nextPriority(spec.stories)),
          titulo: campos[0] ?? "",
          porQue: campos[2] ?? "",
          pruebaIndependiente: campos[3] ?? "",
        };
        spec.stories.push(ultima);
        break;
      case "ESCENARIO":
        if (!ultima) break;
        ultima.escenarios.push({
          ...nuevoEscenario(),
          given: campos[0] ?? "",
          when: campos[1] ?? "",
          then: campos[2] ?? "",
        });
        break;
      case "CASO":
        spec.edgeCases.push(campos[0] ?? "");
        break;
      case "REQUISITO":
        spec.requirements.push({ ...nuevoRequisito(), texto: campos[0] ?? "" });
        break;
      case "ENTIDAD":
        spec.entities.push({ ...nuevaEntidad(), nombre: campos[0] ?? "", descripcion: campos[1] ?? "" });
        break;
      case "CRITERIO":
        spec.criteria.push({ ...nuevoCriterio(), texto: campos[0] ?? "" });
        break;
      default:
        break; // prosa del modelo: se ignora sin ensuciar el borrador
    }
  }

  return sanitizeSpec(spec);
}
