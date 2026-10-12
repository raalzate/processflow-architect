/**
 * Leer la página de un cliente para proponerle una marca (spec 023, P4).
 *
 * La petición HTTP sale SÓLO de acá (proceso principal): el renderer tiene CSP
 * y no habla con sitios ajenos. Lo que vuelve es TEXTO acotado —el HTML y hasta
 * tres hojas de estilo del mismo origen— que `src/lib/brand/extract.ts` lee
 * sin ejecutar nada. Reglas: `https` únicamente, una sola redirección, 1 MB por
 * documento, 256 KB por hoja, 10 s en total. Lo que no cumpla es un error con
 * causa, nunca una lectura a medias que parezca completa.
 */

export interface SitioLeido {
  url: string;
  urlFinal: string;
  html: string;
  css: string[];
  /** Hojas que no se pudieron traer (otro origen, tamaño, error), para el recibo. */
  omitidas: string[];
}

export interface DepsSitio {
  fetch: typeof fetch;
  /** Reloj inyectable para el tope de tiempo (tests). */
  ahora?: () => number;
}

export const MAX_HTML_BYTES = 1024 * 1024;
export const MAX_CSS_BYTES = 256 * 1024;
export const MAX_HOJAS = 3;
export const TIMEOUT_MS = 10_000;

function validarUrl(entrada: string): URL {
  let u: URL;
  try {
    u = new URL(entrada.trim());
  } catch {
    throw new Error(`"${entrada}" no es una URL válida.`);
  }
  if (u.protocol !== "https:") throw new Error("Sólo se leen sitios https: la paleta de un sitio sin cifrar no se puede confiar.");
  if (u.username || u.password) throw new Error("La URL no puede llevar credenciales.");
  const host = u.hostname;
  if (host === "localhost" || /^(127\.|10\.|192\.168\.|0\.|\[?::1)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error("No se leen direcciones locales ni privadas.");
  }
  return u;
}

/** Lee como texto con tope de bytes; corta y avisa si se pasa. */
async function leerTexto(res: Response, tope: number, que: string): Promise<string> {
  const declarado = Number(res.headers.get("content-length") ?? "0");
  if (declarado > tope) throw new Error(`${que} pesa ${(declarado / 1024).toFixed(0)} KB y el tope es ${(tope / 1024).toFixed(0)} KB.`);
  const texto = await res.text();
  if (texto.length > tope) throw new Error(`${que} pesa más de ${(tope / 1024).toFixed(0)} KB.`);
  return texto;
}

/** `href` de cada `<link rel="stylesheet">`, resuelto contra la página. */
export function hojasDe(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    try {
      out.push(new URL(href, base).toString());
    } catch {
      /* href roto: se ignora */
    }
  }
  return out;
}

export async function leerSitio(entrada: string, deps: DepsSitio): Promise<SitioLeido> {
  const url = validarUrl(entrada);
  const ahora = deps.ahora ?? (() => Date.now());
  const t0 = ahora();
  const restante = () => Math.max(0, TIMEOUT_MS - (ahora() - t0));
  const conTope = (): RequestInit => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), restante()).unref?.();
    return { signal: ac.signal, redirect: "manual", headers: { accept: "text/html,text/css;q=0.9,*/*;q=0.1", "user-agent": "ProcessflowArchitect/brand (+local)" } };
  };

  // Una sola redirección, y sólo a https.
  let res = await deps.fetch(url.toString(), conTope());
  let urlFinal = url.toString();
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) throw new Error(`El sitio redirige (${res.status}) sin decir a dónde.`);
    const destino = validarUrl(new URL(loc, url).toString());
    urlFinal = destino.toString();
    res = await deps.fetch(urlFinal, conTope());
    if (res.status >= 300 && res.status < 400) throw new Error("El sitio redirige más de una vez; se sigue una sola.");
  }
  if (!res.ok) throw new Error(`El sitio respondió ${res.status}.`);
  const tipo = res.headers.get("content-type") ?? "";
  if (tipo && !/text\/html|application\/xhtml/i.test(tipo)) throw new Error(`La URL no es una página HTML (${tipo.split(";")[0]}).`);
  const html = await leerTexto(res, MAX_HTML_BYTES, "La página");

  const css: string[] = [];
  const omitidas: string[] = [];
  const origen = new URL(urlFinal).origin;
  for (const hoja of hojasDe(html, urlFinal)) {
    // Primero el origen: una hoja ajena no cuenta para el cupo ni se pide.
    if (!hoja.startsWith(origen)) {
      omitidas.push(`${hoja}: otro origen`);
      continue;
    }
    if (css.length >= MAX_HOJAS) {
      omitidas.push(`${hoja}: más de ${MAX_HOJAS} hojas`);
      continue;
    }
    if (restante() <= 0) {
      omitidas.push(`${hoja}: se agotó el tiempo`);
      continue;
    }
    try {
      const r = await deps.fetch(hoja, conTope());
      if (!r.ok) {
        omitidas.push(`${hoja}: respondió ${r.status}`);
        continue;
      }
      css.push(await leerTexto(r, MAX_CSS_BYTES, "La hoja de estilos"));
    } catch (e: any) {
      omitidas.push(`${hoja}: ${e?.message ?? e}`);
    }
  }
  return { url: url.toString(), urlFinal, html, css, omitidas };
}
