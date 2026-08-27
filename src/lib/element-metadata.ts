/**
 * @fileOverview Metadatos de una caja: dónde vive de verdad (PURO).
 *
 * Una caja del lienzo dice qué es, cómo se llama y —si la puso un agente— de
 * dónde salió (`source`, la cita de la fuente). Lo que no decía es **dónde vive
 * el artefacto real**: el repositorio del componente, la wiki que lo explica, el
 * equipo dueño. Eso terminaba escrito como prosa dentro de la descripción, donde
 * no se puede abrir con un clic ni leer de vuelta como dato.
 *
 * Acá vive TODO lo que decide sobre esa lista: validar, deduplicar por clave,
 * mover, y —lo único con filo de seguridad— qué url se convierte en enlace. Los
 * componentes y las tools del MCP orquestan; este módulo decide.
 *
 * Ojo con la diferencia, que ya confundió una vez: `source` justifica el
 * MODELADO (por qué existe esta caja) y es prosa para el revisor; un metadato
 * apunta al artefacto VIVO y es un campo con ida y vuelta garantizado. No se
 * fusionan ni se reemplazan entre sí.
 */

/**
 * Tipo del valor de un metadato. Existe porque la tabla de propiedades de una
 * caja era todo texto libre: «24» no se distinguía de «veinticuatro» y «crítico»
 * podía decir «quizás». El tipo hace que el valor se VALIDE y que la fila se
 * pueda dibujar como lo que es (casilla, enlace, fecha).
 */
export type MetadataTipo = "texto" | "numero" | "booleano" | "url" | "fecha";

/** Catálogo de tipos con su rótulo. El primero es el de partida. */
export const METADATA_TIPOS: readonly { value: MetadataTipo; label: string }[] = [
  { value: "texto", label: "Texto" },
  { value: "numero", label: "Número" },
  { value: "booleano", label: "Sí / No" },
  { value: "url", label: "URL" },
  { value: "fecha", label: "Fecha" },
] as const;

/** Referencia o dato externo de una caja: dónde vive, quién la mantiene, qué la explica. */
export interface ElementMetadata {
  /** Clave corta: `repo`, `wiki`, `owner`, `SLA`. Única por caja. */
  clave: string;
  /** Valor legible: `acme/pagos-svc`, `Equipo Pagos`. */
  valor: string;
  /**
   * Dónde vive. **Heredado**: antes la url era una columna aparte del valor. Se
   * conserva porque hay modelos guardados con ella y perderla sería perder el
   * enlace al código; lo nuevo se escribe con `tipo: "url"` y el valor ES la
   * url. Sólo `http(s)` se vuelve enlace (ver `esEnlaceExterno` y `enlaceDe`).
   */
  url?: string;
  /** Tipo del valor. Si falta, vale como `texto`. */
  tipo?: MetadataTipo;
}

/**
 * Topes. Existen para que un agente equivocado no convierta una caja en un
 * documento: pasados, se RECHAZA con mensaje en vez de recortar en silencio (un
 * valor recortado a la mitad miente sobre lo que se guardó).
 */
export const MAX_CLAVE_CHARS = 40;
export const MAX_VALOR_CHARS = 200;
export const MAX_URL_CHARS = 500;
export const MAX_METADATA_POR_CAJA = 20;

/**
 * Cotejo de claves: sin distinguir mayúsculas ni espacios de borde. `repo`,
 * `Repo` y ` REPO ` son la misma referencia; tratarlas como distintas dejaba la
 * caja con tres repositorios y ninguno confiable.
 */
export const claveNormalizada = (clave: string): string => clave.trim().toLowerCase();

/**
 * Qué url se puede poner en un `href`. Un metadato lo escribe un agente, así que
 * este predicado es la frontera: `javascript:` y `data:` son ejecución, `file://`
 * es el disco del usuario, y una url sin scheme no es una url —inventarle
 * `https://` sería decidir por el usuario a dónde va el clic.
 */
export function esEnlaceExterno(url?: string | null): boolean {
  if (typeof url !== "string" || !url) return false;
  // Sin `trim`: un espacio al frente ya salió de la normalización, y aceptarlo
  // acá abriría la puerta a ` javascript:` colándose por el costado.
  return /^https?:\/\/[^\s]+$/i.test(url);
}

/** Formas escritas que cuentan como booleano (en las dos lenguas del repo). */
export const VALORES_BOOLEANOS: readonly string[] = ["true", "false", "sí", "si", "no"];

/**
 * La url que se puede poner en un `href` para este metadato, o `null`. Manda el
 * campo `url` heredado (es el dato que el usuario ya tenía escrito) y si no está,
 * el propio valor cuando el metadato es de tipo `url`.
 */
export function enlaceDe(m: ElementMetadata): string | null {
  if (esEnlaceExterno(m.url)) return m.url!;
  if (m.tipo === "url" && esEnlaceExterno(m.valor.trim())) return m.valor.trim();
  return null;
}

/** Mensaje de por qué NO se puede guardar el metadato, o `null` si está bien. */
export function validarMetadata(entrada: ElementMetadata): string | null {
  const clave = (entrada.clave ?? "").trim();
  const valor = (entrada.valor ?? "").trim();
  const url = (entrada.url ?? "").trim();
  if (!clave) return "La clave es obligatoria: una clave vacía no identifica nada.";
  if (!valor) return `El valor es obligatorio: "${clave}" sin valor no dice dónde vive nada.`;
  if (clave.length > MAX_CLAVE_CHARS)
    return `La clave pasa el tope de ${MAX_CLAVE_CHARS} caracteres (tiene ${clave.length}). Una clave es una etiqueta corta: "repo", "wiki", "owner".`;
  if (valor.length > MAX_VALOR_CHARS)
    return `El valor pasa el tope de ${MAX_VALOR_CHARS} caracteres (tiene ${valor.length}). El detalle largo va en la descripción del elemento.`;
  if (url.length > MAX_URL_CHARS)
    return `La url pasa el tope de ${MAX_URL_CHARS} caracteres (tiene ${url.length}).`;
  return validarValorSegunTipo(valor, entrada.tipo, entrada.url);
}

/**
 * El valor tiene que ser lo que su tipo promete. Se RECHAZA con mensaje en vez
 * de convertir en silencio: una tabla que dice «número» y guarda
 * «veinticuatro» miente sobre lo que contiene, y quien la lea después
 * (un export, el agente, un reporte) va a tratarla como número.
 */
export function validarValorSegunTipo(
  valor: string,
  tipo?: MetadataTipo,
  /**
   * Url heredada de la fila. Con ella un metadato viejo —valor legible
   * («acme/pagos-svc») + url aparte— sigue siendo un `url` VÁLIDO: exigir que el
   * valor fuera la url descartaba al abrir justo los metadatos que ya existían,
   * que es la referencia al código de la caja.
   */
  urlHeredada?: string
): string | null {
  switch (tipo) {
    case "numero":
      return Number.isFinite(Number(valor))
        ? null
        : `"${valor}" no es un número. Cambiá el tipo a Texto o escribí un número.`;
    case "booleano":
      return VALORES_BOOLEANOS.includes(valor.trim().toLowerCase())
        ? null
        : `"${valor}" no es un booleano: escribí ${VALORES_BOOLEANOS.join(" · ")}.`;
    case "fecha":
      return /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())
        ? null
        : `"${valor}" no es una fecha con formato YYYY-MM-DD (es el único que se ordena y se compara).`;
    case "url":
      return esEnlaceExterno(urlHeredada?.trim()) || esEnlaceExterno(valor.trim())
        ? null
        : `"${valor}" no es una url http(s). Un enlace que no es http(s) no se puede abrir desde la app.`;
    default:
      return null;
  }
}

/** Metadato listo para guardar: clave y valor recortados, url sólo si hay. */
function saneado(entrada: ElementMetadata): ElementMetadata {
  const url = (entrada.url ?? "").trim();
  const salida: ElementMetadata = { clave: entrada.clave.trim(), valor: entrada.valor.trim() };
  if (url) salida.url = url;
  salida.tipo = entrada.tipo ?? tipoInferido(salida);
  return salida;
}

/**
 * Tipo de un metadato que no lo declara: lo guardado ANTES de que el tipo
 * existiera. Sólo se infiere `url` (por el campo heredado o porque el valor es
 * una url); todo lo demás es texto, que es lo que era.
 */
function tipoInferido(m: { valor: string; url?: string }): MetadataTipo {
  if (esEnlaceExterno(m.url) || esEnlaceExterno(m.valor.trim())) return "url";
  return "texto";
}

/**
 * Agrega el metadato al final, o REEMPLAZA el que ya tiene esa clave **en su
 * posición**. Reemplazar no renombra la clave: la grafía original se conserva
 * para que `REPO` no reescriba el `repo` que el usuario venía viendo.
 *
 * @throws si el metadato no valida o si la caja ya está en el tope (reemplazar
 * una clave existente siempre se puede: no hace crecer la lista).
 */
export function upsertMetadata(
  lista: readonly ElementMetadata[] | undefined,
  entrada: ElementMetadata
): ElementMetadata[] {
  const error = validarMetadata(entrada);
  if (error) throw new Error(error);
  const actual = [...(lista ?? [])];
  const nuevo = saneado(entrada);
  const idx = actual.findIndex((x) => claveNormalizada(x.clave) === claveNormalizada(nuevo.clave));
  if (idx >= 0) {
    actual[idx] = { ...nuevo, clave: actual[idx].clave };
    return actual;
  }
  if (actual.length >= MAX_METADATA_POR_CAJA)
    throw new Error(
      `La caja ya tiene ${MAX_METADATA_POR_CAJA} metadatos, que es el tope. Quitá uno antes de agregar "${nuevo.clave}".`
    );
  actual.push(nuevo);
  return actual;
}

/** Aplica varios metadatos en orden (upsert por clave). @throws igual que `upsertMetadata`. */
export function upsertVarios(
  lista: readonly ElementMetadata[] | undefined,
  entradas: readonly ElementMetadata[]
): ElementMetadata[] {
  let salida = [...(lista ?? [])];
  for (const e of entradas) salida = upsertMetadata(salida, e);
  return salida;
}

/** Quita por clave (sin distinguir mayúsculas). Las que no están se ignoran. */
export function quitarMetadata(
  lista: readonly ElementMetadata[] | undefined,
  claves: readonly string[]
): ElementMetadata[] {
  const fuera = new Set(claves.map(claveNormalizada));
  return (lista ?? []).filter((x) => !fuera.has(claveNormalizada(x.clave)));
}

/** Mueve un metadato de posición. Fuera de rango devuelve la lista tal cual. */
export function moverMetadata(
  lista: readonly ElementMetadata[] | undefined,
  desde: number,
  hasta: number
): ElementMetadata[] {
  const actual = [...(lista ?? [])];
  if (desde < 0 || hasta < 0 || desde >= actual.length || hasta >= actual.length) return actual;
  const [movido] = actual.splice(desde, 1);
  actual.splice(hasta, 0, movido);
  return actual;
}

/**
 * Normaliza lo que llega de AFUERA (un modelo guardado, un import, el MCP):
 * descarta lo que no valida, deduplica por clave —gana el último valor, en la
 * primera posición— y recorta al tope. Devuelve `undefined` cuando no queda
 * nada: un modelo sin la propiedad no debe ganar una lista vacía, o el diff del
 * borrador de la ficha vería un cambio donde no hubo ninguno.
 */
export function normalizarLista(valor: unknown): ElementMetadata[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  const salida: ElementMetadata[] = [];
  for (const cruda of valor) {
    if (!cruda || typeof cruda !== "object") continue;
    const { clave, valor: v, url, tipo } = cruda as Record<string, unknown>;
    if (typeof clave !== "string" || typeof v !== "string") continue;
    const entrada: ElementMetadata = { clave, valor: v };
    if (typeof url === "string") entrada.url = url;
    // Un tipo inventado (o escrito por un agente) no viaja: se cae al inferido
    // en vez de descartar el metadato, que es el dato que sí importa.
    if (METADATA_TIPOS.some((t) => t.value === tipo)) entrada.tipo = tipo as MetadataTipo;
    // El valor no cumple el tipo que declara (la fila quedó a medio corregir, o
    // lo escribió un agente): se DEGRADA a texto en vez de descartarse. Perder
    // el dato del usuario para castigar una etiqueta equivocada es el peor de
    // los dos males; la tabla lo muestra en rojo mientras está mal.
    if (entrada.tipo && validarValorSegunTipo(entrada.valor, entrada.tipo, entrada.url))
      entrada.tipo = "texto";
    if (validarMetadata(entrada)) continue;
    const limpio = saneado(entrada);
    const idx = salida.findIndex((x) => claveNormalizada(x.clave) === claveNormalizada(limpio.clave));
    if (idx >= 0) salida[idx] = { ...limpio, clave: salida[idx].clave };
    else if (salida.length < MAX_METADATA_POR_CAJA) salida.push(limpio);
  }
  return salida.length ? salida : undefined;
}

/**
 * Nombres de las cajas SIN metadatos. Es un aviso que se pide, no un error del
 * diagrama: un Evento no necesita repositorio.
 */
export function metadataFaltantes(
  cajas: readonly { nombre: string; metadata?: readonly ElementMetadata[] }[]
): string[] {
  return cajas.filter((c) => !(c.metadata?.length)).map((c) => c.nombre);
}

/** Una línea por metadato, para los reportes de texto del MCP. */
export function formatMetadata(lista: readonly ElementMetadata[] | undefined): string {
  return (lista ?? [])
    .map((x) => `${x.clave}: ${x.valor}${x.url ? ` (${x.url})` : ""}`)
    .join(" · ");
}
