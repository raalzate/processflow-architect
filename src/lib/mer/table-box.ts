/**
 * @fileOverview Caja de TABLA del modelo entidad-relación físico (PURO).
 *
 * Un MER conceptual se dibuja con rombos y elipses (notación de Chen), pero el
 * modelo con el que se construye la base se dibuja como una CAJA con
 * compartimentos: el nombre arriba, «column» con sus columnas y su tipo, y
 * debajo los compartimentos derivados —«FK», «index», «PK»— que son las
 * restricciones que el motor va a crear.
 *
 * Acá vive TODO lo que decide sobre esa caja: qué cuenta como columna válida,
 * cómo se normaliza lo que llega de un archivo o del MCP, cómo se rotula cada
 * fila y —lo que más se duplica si no está en un solo lugar— CUÁNTO MIDE la
 * caja. El lienzo, el minimapa, el recorte de las aristas y el layout preguntan
 * acá: cuando cada uno medía por su cuenta, la línea nacía en el aire.
 *
 * Los compartimentos NO son un segundo modelo: se derivan de las columnas. Una
 * FK declarada en dos sitios (la columna y una lista aparte) se desincroniza sin
 * que nadie se entere, y el diagrama termina mintiendo sobre la base.
 */

/** Columna de una tabla: el dato y las restricciones que lo acompañan. */
export interface TableColumn {
  /** Nombre de la columna (`id`, `fecha_inicio`). */
  nombre: string;
  /** Tipo del motor tal como se escribe (`integer`, `varchar(50)`, `money`). */
  tipo?: string;
  /** Forma parte de la clave primaria. */
  pk?: boolean;
  /** Es clave foránea: apunta a la PK de otra tabla (ver `referencia`). */
  fk?: boolean;
  /** Tabla (o `tabla.columna`) a la que apunta la FK. */
  referencia?: string;
  /**
   * Admite nulos. El valor por defecto es OBLIGATORIA: en el dibujo clásico el
   * `*` marca lo que no puede faltar, y casi toda columna modelada a mano lo es.
   */
  nulo?: boolean;
  /** Tiene restricción de unicidad. */
  unico?: boolean;
  /** Se le crea un índice. */
  indice?: boolean;
}

// Topes. Pasados, se RECHAZA con mensaje (ver `validarColumna`) en vez de
// recortar en silencio: una columna recortada miente sobre lo que se guardó.
export const MAX_COLUMNA_NOMBRE_CHARS = 60;
export const MAX_COLUMNA_TIPO_CHARS = 40;
export const MAX_COLUMNA_REFERENCIA_CHARS = 80;
export const MAX_COLUMNAS_POR_TABLA = 60;

/** Nombre comparable de una columna (única por tabla, sin importar la caja). */
export const nombreColumnaNormalizado = (nombre: string): string =>
  nombre.trim().toLowerCase();

/** Problema de una columna, o `null` si está bien. Mensaje para mostrar tal cual. */
export function validarColumna(c: TableColumn): string | null {
  const nombre = (c.nombre ?? "").trim();
  if (!nombre) return "la columna necesita nombre";
  if (nombre.length > MAX_COLUMNA_NOMBRE_CHARS)
    return `el nombre de la columna no puede pasar de ${MAX_COLUMNA_NOMBRE_CHARS} caracteres`;
  if ((c.tipo ?? "").trim().length > MAX_COLUMNA_TIPO_CHARS)
    return `el tipo no puede pasar de ${MAX_COLUMNA_TIPO_CHARS} caracteres`;
  if ((c.referencia ?? "").trim().length > MAX_COLUMNA_REFERENCIA_CHARS)
    return `la referencia no puede pasar de ${MAX_COLUMNA_REFERENCIA_CHARS} caracteres`;
  // Una FK sin referencia es una columna suelta: no se puede dibujar el
  // compartimento «FK» ni saber a qué tabla apunta.
  if (c.fk && !(c.referencia ?? "").trim())
    return `la clave foránea "${nombre}" tiene que declarar a qué tabla apunta (referencia)`;
  return null;
}

/** Problemas de una lista completa (topes y nombres repetidos). */
export function validarColumnas(lista: readonly TableColumn[]): string[] {
  const problemas: string[] = [];
  if (lista.length > MAX_COLUMNAS_POR_TABLA)
    problemas.push(
      `una tabla no puede declarar más de ${MAX_COLUMNAS_POR_TABLA} columnas (llegaron ${lista.length})`
    );
  const vistos = new Set<string>();
  for (const c of lista) {
    const problema = validarColumna(c);
    if (problema) problemas.push(problema);
    const clave = nombreColumnaNormalizado(c.nombre ?? "");
    if (!clave) continue;
    if (vistos.has(clave)) problemas.push(`la columna "${c.nombre.trim()}" está repetida`);
    vistos.add(clave);
  }
  return problemas;
}

/**
 * Normaliza lo que viene de un archivo guardado o de un agente: descarta lo que
 * no es columna, recorta espacios, deduplica por nombre y respeta el tope.
 * Devuelve `undefined` cuando no queda nada, para no agregarle un array vacío a
 * cada nodo de un proyecto existente (misma regla que `spec` y `metadata`).
 */
export function normalizarColumnas(valor: unknown): TableColumn[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  const salida: TableColumn[] = [];
  const vistos = new Set<string>();
  for (const bruto of valor) {
    if (!bruto || typeof bruto !== "object") continue;
    const c = bruto as Record<string, unknown>;
    const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
    if (!nombre) continue;
    const clave = nombreColumnaNormalizado(nombre);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const tipo = typeof c.tipo === "string" ? c.tipo.trim() : "";
    const referencia = typeof c.referencia === "string" ? c.referencia.trim() : "";
    const columna: TableColumn = { nombre: nombre.slice(0, MAX_COLUMNA_NOMBRE_CHARS) };
    if (tipo) columna.tipo = tipo.slice(0, MAX_COLUMNA_TIPO_CHARS);
    if (referencia) columna.referencia = referencia.slice(0, MAX_COLUMNA_REFERENCIA_CHARS);
    // Los booleanos se guardan sólo si son `true`: `pk: false` en cada columna
    // engorda el archivo sin decir nada que el valor por defecto no diga ya.
    if (c.pk === true) columna.pk = true;
    if (c.fk === true) columna.fk = true;
    if (c.nulo === true) columna.nulo = true;
    if (c.unico === true) columna.unico = true;
    if (c.indice === true) columna.indice = true;
    salida.push(columna);
    if (salida.length >= MAX_COLUMNAS_POR_TABLA) break;
  }
  return salida.length ? salida : undefined;
}

/**
 * Mueve una columna de posición. El ORDEN importa: es el que se ve en la caja y
 * el que se escribe en el `CREATE TABLE`, así que la lista es ordenada y no un
 * conjunto. Fuera de rango devuelve la lista intacta.
 */
export function moverColumna(
  lista: readonly TableColumn[],
  de: number,
  a: number
): TableColumn[] {
  if (de === a || de < 0 || a < 0 || de >= lista.length || a >= lista.length) return [...lista];
  const salida = [...lista];
  const [movida] = salida.splice(de, 1);
  salida.splice(a, 0, movida);
  return salida;
}

/**
 * Columna nueva para agregar a una tabla, con un nombre LIBRE (`columna_3` si
 * `columna_2` ya está). El nombre lo decide acá y no el menú del lienzo: dos
 * columnas con el mismo nombre no son dos columnas, y quien agrega desde el
 * lienzo no ve la lista para elegir uno.
 */
export function nuevaColumna(
  lista: readonly TableColumn[] | undefined,
  base: Partial<TableColumn> = {}
): TableColumn {
  const usados = new Set((lista ?? []).map((c) => nombreColumnaNormalizado(c.nombre)));
  const raiz = base.nombre?.trim() || "columna";
  let nombre = raiz;
  let i = 1;
  while (usados.has(nombreColumnaNormalizado(nombre))) nombre = `${raiz}_${++i}`;
  return { tipo: "varchar(50)", ...base, nombre };
}

/** Agrega una columna al final de la lista (la lista ordenada es el modelo). */
export function agregarColumna(
  lista: readonly TableColumn[] | undefined,
  base: Partial<TableColumn> = {}
): TableColumn[] {
  return [...(lista ?? []), nuevaColumna(lista, base)];
}

/** Marca de la fila: `PK`, `FK`, `PFK` (las dos) o vacío. */
export function marcaColumna(c: TableColumn): string {
  if (c.pk && c.fk) return "PFK";
  if (c.pk) return "PK";
  if (c.fk) return "FK";
  return "";
}

/**
 * Fila de la columna tal como se lee en el dibujo: `* PK id: integer`. El `*`
 * dice OBLIGATORIA (no admite nulos) y es la convención de las herramientas de
 * modelado de datos; el tipo va después de los dos puntos.
 */
export function filaColumna(c: TableColumn): string {
  const obligatoria = c.nulo ? " " : "*";
  const marca = marcaColumna(c);
  const izquierda = `${obligatoria}${marca ? ` ${marca}` : ""} ${c.nombre}`.trimStart();
  return c.tipo ? `${izquierda}: ${c.tipo}` : izquierda;
}

/** Nombre de la restricción de clave primaria de una tabla. */
export function nombrePk(tabla: string, columnas: readonly TableColumn[]): string {
  const pks = columnas.filter((c) => c.pk);
  const tipos = pks.map((c) => c.tipo ?? "?").join(", ");
  return `PK_${slugTabla(tabla)}(${tipos})`;
}

/** Nombre de la restricción de una clave foránea. */
export function nombreFk(tabla: string, c: TableColumn): string {
  const destino = slugTabla((c.referencia ?? "").split(".")[0] ?? "");
  return `FK_${slugTabla(tabla)}_${destino || "ref"}(${c.tipo ?? "?"})`;
}

/** Nombre del índice que acompaña a una columna (el de una FK lleva `IXFK`). */
export function nombreIndice(tabla: string, c: TableColumn): string {
  const base = `${slugTabla(tabla)}_${slugTabla(c.nombre)}`;
  return c.fk ? `IXFK_${base}` : `IX_${base}`;
}

/** Identificador legible de una tabla para nombrar restricciones. */
function slugTabla(nombre: string): string {
  return (nombre || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "");
}

/** Compartimento de la caja: su estereotipo y las filas que lleva dentro. */
export interface TableCompartment {
  /** Estereotipo que lo rotula (`column`, `FK`, `index`, `PK`). */
  estereotipo: string;
  /** Filas ya formateadas, en orden. */
  filas: string[];
}

/**
 * Compartimentos de la caja, DERIVADOS de las columnas: «column» siempre, y
 * «FK», «index» y «PK» sólo si hay algo que declarar. Ese orden es el de las
 * herramientas de modelado: primero los datos, después las restricciones.
 */
export function compartimentos(
  tabla: string,
  columnas: readonly TableColumn[]
): TableCompartment[] {
  const salida: TableCompartment[] = [
    { estereotipo: "column", filas: columnas.map(filaColumna) },
  ];
  const fks = columnas.filter((c) => c.fk);
  if (fks.length)
    salida.push({ estereotipo: "FK", filas: fks.map((c) => `+ ${nombreFk(tabla, c)}`) });
  // El índice se declara a mano (`indice`) y también viene de regalo con cada
  // FK: el motor la busca por ahí en cada join.
  const indexados = columnas.filter((c) => c.indice || c.fk);
  if (indexados.length)
    salida.push({
      estereotipo: "index",
      filas: indexados.map((c) => `+ ${nombreIndice(tabla, c)}`),
    });
  const pks = columnas.filter((c) => c.pk);
  if (pks.length)
    salida.push({ estereotipo: "PK", filas: [`+ ${nombrePk(tabla, columnas)}`] });
  const unicos = columnas.filter((c) => c.unico && !c.pk);
  if (unicos.length)
    salida.push({
      estereotipo: "unique",
      filas: unicos.map((c) => `+ UQ_${slugTabla(tabla)}_${slugTabla(c.nombre)}`),
    });
  return salida;
}

// Medidas del dibujo. Están acá —y no en el componente— porque el alto de la
// caja lo necesita también quien NO dibuja: el recorte de las aristas, el
// minimapa y el layout. Son px del lienzo.
export const TABLE_BOX = {
  /** Ancho mínimo y máximo de la caja. */
  minAncho: 200,
  maxAncho: 340,
  /** Alto de la banda del nombre. */
  altoTitulo: 26,
  /** Alto del rótulo «estereotipo» de cada compartimento. */
  altoEstereotipo: 15,
  /** Alto de una fila de texto. */
  altoFila: 13,
  /** Relleno vertical de cada compartimento. */
  padCompartimento: 4,
  /** Relleno horizontal del texto. */
  padX: 8,
  /** Ancho aproximado de un carácter a 9px (monoespaciado del dibujo). */
  anchoChar: 5.4,
} as const;

/** Geometría resuelta de la caja: su tamaño y dónde arranca cada compartimento. */
export interface TableBoxLayout {
  w: number;
  h: number;
  /** Compartimentos con su `y` de arranque y su alto. */
  bloques: Array<TableCompartment & { y: number; h: number }>;
}

/**
 * Resuelve la caja completa: alto por filas y ancho por el texto más largo,
 * acotado. Una tabla de 20 columnas mide más que una de 3 — dibujarlas iguales
 * era esconder la mitad de las filas o dejar la caja medio vacía.
 */
export function tableBoxLayout(
  tabla: string,
  columnas: readonly TableColumn[]
): TableBoxLayout {
  const bloquesBase = compartimentos(tabla, columnas);
  const bloques: TableBoxLayout["bloques"] = [];
  let y = TABLE_BOX.altoTitulo;
  for (const b of bloquesBase) {
    const h =
      TABLE_BOX.altoEstereotipo +
      b.filas.length * TABLE_BOX.altoFila +
      TABLE_BOX.padCompartimento * 2;
    bloques.push({ ...b, y, h });
    y += h;
  }
  const textos = [tabla, ...bloquesBase.flatMap((b) => b.filas)];
  const largo = textos.reduce((max, t) => Math.max(max, t.length), 0);
  const w = Math.min(
    TABLE_BOX.maxAncho,
    Math.max(TABLE_BOX.minAncho, Math.round(largo * TABLE_BOX.anchoChar + TABLE_BOX.padX * 2))
  );
  // Sin columnas la caja sigue siendo una caja: el compartimento «column» vacío
  // se dibuja igual, y así se ve que falta declararlas.
  return { w, h: y, bloques };
}

/** Tamaño de la caja (lo que necesita quien mide sin dibujar). */
export function tableBoxSize(
  tabla: string,
  columnas: readonly TableColumn[] | undefined
): { w: number; h: number } {
  const { w, h } = tableBoxLayout(tabla, columnas ?? []);
  return { w, h };
}
