/**
 * @fileOverview Documentos FUENTE de un diagrama: el texto del que salió, y cómo
 * una cita resuelve al fragmento que la sostiene (PURO).
 *
 * Cada caja de un diagrama construido por MCP lleva su cita —`Fuente:
 * docs/contratos/07-pagos.md:1,36,127`— y eso, hasta acá, servía sólo a quien
 * tuviera el repo delante: el `.md` vive en la máquina de quien corrió el agente
 * externo, el renderer no tiene sistema de archivos y la app no podía abrirlo. La
 * cita nombraba algo que la app no tenía. Lo único que quedaba del documento eran
 * las dos líneas que cupieron en la descripción, y sobre eso contestaba el agente
 * (feature 012).
 *
 * Acá vive TODO lo que decide sobre esas fuentes: qué se guarda (y qué se
 * recorta), cómo se lee una cita, y qué fragmento devuelve. El documento viaja
 * DENTRO del proyecto —no en una carpeta aparte— por dos razones: se exporta y se
 * abre en otra máquina sin nada más, y queda aislado por organización sin ninguna
 * regla nueva, igual que los diagramas.
 *
 * Lo que NO hace: inyectar documentos en el contexto. Un documento entero no cabe
 * en la ventana del motor local (4 096 tokens); el agente PIDE el trozo que la
 * caja cita, con el mismo tope que cualquier otra lectura.
 */

/** Un documento del que salió parte del diagrama. */
export interface SourceDoc {
  /** Nombre con el que se cita: la ruta o el archivo (`docs/contratos/07-pagos.md`). */
  nombre: string;
  /** De dónde salió, para el humano ("PDF del cliente", "repo acme/pagos"). */
  origen?: string;
  /** El texto. Es lo único que hace útil al resto. */
  texto: string;
  /** `true` si se recortó al guardarlo (el tope se avisa, no se esconde). */
  truncado?: boolean;
}

/**
 * Topes. Un documento fuente es material de consulta, no un almacén: sin tope,
 * pegar un PDF de 400 páginas hace ilegible el archivo del proyecto y lo vuelve
 * lento de abrir. Se RECORTA y se avisa —nunca se rechaza— por lo mismo que
 * `sanitizeSpec`: lo que llega puede ser un proyecto ya guardado, y perderlo
 * entero por un tope sería peor que quedarse con el principio.
 */
export const MAX_DOC_CHARS = 60_000;
export const MAX_DOCS = 20;
/** Tope de un fragmento devuelto por una cita (el mismo orden que una lectura del agente). */
export const MAX_FRAGMENTO_CHARS = 2_000;
/** Líneas de contexto alrededor de cada línea citada. */
export const CONTEXTO_LINEAS = 2;

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Normaliza lo que llega de afuera (archivo guardado, MCP, import). Descarta lo
 * que no tiene nombre o no tiene texto —un documento vacío no es una fuente, es
 * ruido— y recorta al tope marcando `truncado`.
 */
export function sanitizeSourceDocs(valor: unknown): SourceDoc[] {
  if (!Array.isArray(valor)) return [];
  const salida: SourceDoc[] = [];
  const vistos = new Set<string>();
  for (const bruto of valor) {
    if (!bruto || typeof bruto !== "object") continue;
    const d = bruto as Record<string, unknown>;
    const nombre = texto(d.nombre).trim();
    const cuerpo = texto(d.texto);
    if (!nombre || !cuerpo.trim()) continue;
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const recortado = cuerpo.length > MAX_DOC_CHARS;
    const doc: SourceDoc = {
      nombre,
      texto: recortado ? cuerpo.slice(0, MAX_DOC_CHARS) : cuerpo,
    };
    const origen = texto(d.origen).trim();
    if (origen) doc.origen = origen;
    if (recortado || d.truncado === true) doc.truncado = true;
    salida.push(doc);
    if (salida.length >= MAX_DOCS) break;
  }
  return salida;
}

/**
 * Adjunta (o REEMPLAZA por nombre) un documento. Reemplazar en vez de duplicar
 * es lo que hace que volver a correr el mismo análisis sobre un documento
 * corregido no deje dos versiones peleando por la misma cita.
 *
 * @throws si ya hay `MAX_DOCS` documentos y el que llega es uno nuevo.
 */
export function attachSourceDoc(
  docs: readonly SourceDoc[],
  entrada: { nombre: string; texto: string; origen?: string }
): SourceDoc[] {
  const [normalizado] = sanitizeSourceDocs([entrada]);
  if (!normalizado)
    throw new Error("Un documento fuente necesita un nombre y un texto con contenido.");
  const clave = normalizado.nombre.toLowerCase();
  const i = docs.findIndex((d) => d.nombre.toLowerCase() === clave);
  if (i >= 0) {
    const copia = [...docs];
    copia[i] = normalizado;
    return copia;
  }
  if (docs.length >= MAX_DOCS)
    throw new Error(
      `El proyecto ya tiene ${MAX_DOCS} documentos fuente (el tope). Quitá uno antes de adjuntar "${normalizado.nombre}".`
    );
  return [...docs, normalizado];
}

/** Quita un documento por nombre. Las citas que lo nombraban quedan como texto. */
export function removeSourceDoc(docs: readonly SourceDoc[], nombre: string): SourceDoc[] {
  const clave = nombre.trim().toLowerCase();
  return docs.filter((d) => d.nombre.toLowerCase() !== clave);
}

/**
 * La cita que el MCP anexa a la descripción («Fuente: docs/pagos.md:36»). Se lee
 * de ahí y no de un campo propio porque es donde vive hoy, en todos los proyectos
 * ya guardados: un campo nuevo dejaría fuera justo a los diagramas que la tienen
 * (ver `toDomainNode` en `mcp/diagram-builder.ts`).
 */
export function citaDe(descripcion: string | undefined): string | undefined {
  const m = /(?:^|\n)\s*Fuente:\s*(.+)\s*$/.exec(descripcion ?? "");
  return m ? m[1].trim() : undefined;
}

/** Una cita leída: qué documento nombra y qué líneas. */
export interface Cita {
  doc: string;
  /** Líneas citadas (1-based). Vacío = la cita nombra el documento entero. */
  lineas: number[];
}

/**
 * Lee una cita. Las formas que produce hoy el agente externo:
 *
 *   `docs/contratos/07-pagos.md:1,36,127`   líneas sueltas
 *   `docs/contratos/07-pagos.md:36-48`      un rango
 *   `docs/contratos/07-pagos.md`            el documento entero
 *
 * Una cita en prosa («acta del 12-mar», «PRD §3.2») NO es un error: devuelve
 * `null` y la app la muestra como el texto que es. Forzar una forma rompería
 * todos los diagramas que ya existen.
 */
export function parseCita(source: unknown): Cita | null {
  const raw = texto(source).trim();
  if (!raw) return null;
  const m = /^([^\s:]+?\.[A-Za-z0-9]{1,8})(?::([\d,\s-]+))?$/.exec(raw);
  if (!m) return null;
  const doc = m[1];
  const lineas: number[] = [];
  for (const parte of (m[2] ?? "").split(",")) {
    const t = parte.trim();
    if (!t) continue;
    const rango = /^(\d+)\s*-\s*(\d+)$/.exec(t);
    if (rango) {
      const desde = Number(rango[1]);
      const hasta = Number(rango[2]);
      for (let i = Math.min(desde, hasta); i <= Math.max(desde, hasta); i++) lineas.push(i);
      continue;
    }
    if (/^\d+$/.test(t)) lineas.push(Number(t));
  }
  return { doc, lineas: Array.from(new Set(lineas)).sort((a, b) => a - b) };
}

/** Busca un documento por nombre: exacto, y si no, por el final de la ruta. */
export function findSourceDoc(docs: readonly SourceDoc[], nombre: string): SourceDoc | undefined {
  const t = nombre.trim().toLowerCase();
  if (!t) return undefined;
  return (
    docs.find((d) => d.nombre.toLowerCase() === t) ??
    // La cita puede traer la ruta y el adjunto sólo el archivo (o al revés).
    docs.find((d) => {
      const n = d.nombre.toLowerCase();
      return n.endsWith(`/${t}`) || t.endsWith(`/${n}`);
    })
  );
}

/** Lo que devuelve resolver una cita. */
export type CitaResuelta =
  | { estado: "sin-cita" }
  | { estado: "falta"; doc: string }
  | { estado: "ok"; doc: string; fragmento: string; lineas: number[]; truncado: boolean };

/**
 * Resuelve una cita al fragmento del documento que la sostiene.
 *
 * Los tres desenlaces son deliberados: sin cita legible no se inventa nada; con
 * una cita cuyo documento no está adjunto se DICE que falta (nunca un fragmento
 * de otro documento, que es peor que ninguno); y con el documento presente se
 * devuelven las líneas citadas con dos de contexto, unidas cuando se solapan.
 * Un número de línea que se pasa del final no rompe: no aporta líneas.
 */
export function resolveCita(
  docs: readonly SourceDoc[],
  source: unknown,
  limite = MAX_FRAGMENTO_CHARS
): CitaResuelta {
  const cita = parseCita(source);
  if (!cita) return { estado: "sin-cita" };
  const doc = findSourceDoc(docs, cita.doc);
  if (!doc) return { estado: "falta", doc: cita.doc };

  const lineas = doc.texto.split("\n");
  const pedidas = cita.lineas.filter((n) => n >= 1 && n <= lineas.length);
  let cuerpo: string;
  if (!pedidas.length) {
    // Sin líneas (o todas fuera de rango): el principio del documento es la
    // respuesta honesta — dice de qué habla sin fingir precisión que no hay.
    cuerpo = doc.texto;
  } else {
    const incluidas = new Set<number>();
    for (const n of pedidas)
      for (let i = Math.max(1, n - CONTEXTO_LINEAS); i <= Math.min(lineas.length, n + CONTEXTO_LINEAS); i++)
        incluidas.add(i);
    const ordenadas = [...incluidas].sort((a, b) => a - b);
    const partes: string[] = [];
    let previa = 0;
    for (const n of ordenadas) {
      if (previa && n > previa + 1) partes.push("…");
      partes.push(`${n}: ${lineas[n - 1]}`);
      previa = n;
    }
    cuerpo = partes.join("\n");
  }
  const truncado = cuerpo.length > limite;
  return {
    estado: "ok",
    doc: doc.nombre,
    fragmento: truncado ? `${cuerpo.slice(0, limite)}\n…(recortado)` : cuerpo,
    lineas: pedidas,
    truncado,
  };
}

/**
 * Lee un trozo de un documento por líneas, para la herramienta del agente. Sin
 * rango devuelve el principio: es lo que sirve para saber de qué habla antes de
 * pedir el detalle.
 */
export function readSourceRange(
  docs: readonly SourceDoc[],
  nombre: string,
  desde?: number,
  hasta?: number,
  limite = MAX_FRAGMENTO_CHARS
): { ok: false; error: string; disponibles: string[] } | { ok: true; doc: string; texto: string; truncado: boolean } {
  const doc = findSourceDoc(docs, nombre);
  if (!doc)
    return {
      ok: false,
      error: `No hay ningún documento fuente llamado "${nombre}" en el proyecto.`,
      disponibles: docs.map((d) => d.nombre),
    };
  const lineas = doc.texto.split("\n");
  const inicio = Math.max(1, Math.floor(desde ?? 1));
  const fin = Math.min(lineas.length, Math.floor(hasta ?? lineas.length));
  const trozo = inicio > lineas.length ? "" : lineas.slice(inicio - 1, Math.max(inicio, fin)).join("\n");
  const truncado = trozo.length > limite;
  return {
    ok: true,
    doc: doc.nombre,
    texto: truncado ? `${trozo.slice(0, limite)}\n…(recortado)` : trozo || "(no hay texto en ese rango)",
    truncado,
  };
}

/** Inventario para el agente: qué documentos hay y cuánto pesan, SIN su texto. */
export function formatSourceInventory(docs: readonly SourceDoc[]): string {
  if (!docs.length) return "";
  return docs
    .map((d) => {
      const lineas = d.texto.split("\n").length;
      return `- "${d.nombre}" (${lineas} líneas${d.origen ? `, ${d.origen}` : ""}${
        d.truncado ? ", recortado al adjuntar" : ""
      })`;
    })
    .join("\n");
}
