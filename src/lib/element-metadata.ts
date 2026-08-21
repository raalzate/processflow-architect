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

/** Referencia o dato externo de una caja: dónde vive, quién la mantiene, qué la explica. */
export interface ElementMetadata {
  /** Clave corta: `repo`, `wiki`, `owner`, `SLA`. Única por caja. */
  clave: string;
  /** Valor legible: `acme/pagos-svc`, `Equipo Pagos`. */
  valor: string;
  /** Dónde vive. Sólo `http(s)` se vuelve enlace (ver `esEnlaceExterno`). */
  url?: string;
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
  return null;
}

/** Metadato listo para guardar: clave y valor recortados, url sólo si hay. */
function saneado(entrada: ElementMetadata): ElementMetadata {
  const url = (entrada.url ?? "").trim();
  const salida: ElementMetadata = { clave: entrada.clave.trim(), valor: entrada.valor.trim() };
  if (url) salida.url = url;
  return salida;
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
    const { clave, valor: v, url } = cruda as Record<string, unknown>;
    if (typeof clave !== "string" || typeof v !== "string") continue;
    const entrada: ElementMetadata = { clave, valor: v };
    if (typeof url === "string") entrada.url = url;
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
