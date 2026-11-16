/**
 * @fileOverview Puntuación del banco de evaluación del agente (spec 027 · T28, SC-002) — PURO.
 *
 * SC-002 pide medir dos cosas con y sin consulta al grafo: cuántas preguntas se
 * contestan bien (EXACTITUD) y cuántas respuestas nombran elementos que no
 * existen en el modelo (ALUCINACIÓN). Acá vive el criterio, para que sea el
 * mismo en cada corrida y tenga prueba; el script (`scripts/eval-ontology-agent.ts`)
 * sólo junta preguntas, llama al modelo y suma.
 */

import { notationTypes } from "../notations";
import type { Conocimiento } from "../ontology/conocimiento";
import { tboxDe } from "../ontology/tbox";
import { plana } from "../ontology/validate";

export interface PuntajeRespuesta {
  acierto: boolean;
  /** Esperados que la respuesta no nombra. */
  faltan: string[];
  /** Nombres que la respuesta da por elementos del modelo y no lo son. */
  inexistentes: string[];
}

/** Marcas de «no se sabe»: la respuesta correcta cuando el grafo no lo afirma. */
const DESCONOCE = /\b(desconocid[oa]|no (lo )?(se sabe|sabe|conoce|afirma|aparece|figura|hay)|ningun[oa]?|nada)\b/;

/**
 * ¿La respuesta nombra al elemento? Por palabras completas y sin separadores:
 * «FacturarPedido», «Facturar Pedido» y el id «facturar-pedido» son el mismo
 * nombre, pero «Pagos» no aparece dentro de «PagosDB».
 */
function contiene(texto: string, nombre: string): boolean {
  const buscado = plana(nombre).replace(/ /g, "");
  const palabras = plana(texto).split(" ");
  for (let i = 0; i < palabras.length; i++)
    for (let n = 1; n <= 4 && i + n <= palabras.length; n++) if (palabras.slice(i, i + n).join("") === buscado) return true;
  return false;
}

/**
 * Lo que la respuesta presenta como nombre propio de un elemento: lo citado
 * entre comillas o «angulares» y las palabras en CamelCase (PagoRealizado).
 * Es una heurística a propósito estrecha: contar de más una alucinación
 * castiga al modelo por escribir en español.
 */
export function nombresCitados(respuesta: string): string[] {
  const out = new Set<string>();
  for (const m of respuesta.matchAll(/[«"“*]{1,2}([^»"”*\n]{2,40})[»"”*]{1,2}/g)) out.add(m[1].trim());
  for (const m of respuesta.matchAll(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+\b/g)) out.add(m[0]);
  return [...out];
}

/**
 * Lo citado que NO es un nombre inventado aunque no esté en el vocabulario
 * (#742): la propia respuesta «desconocido en el modelo» puesta en negrita, y la
 * cita de una flecha («Pagar emite PagoRealizado», «pagar → pago-realizado»),
 * que nombra dos ELEMENTOS que existen. Contarlas como alucinación castigaba
 * justo las respuestas correctas y subestimaba la exactitud en 25–40 puntos.
 * Se cuentan sólo elementos, no predicados ni tipos: si no, «Pagar emite
 * Facturita» pasaría por tener «Pagar» y «emite».
 */
function esCitaLegitima(cita: string, elementos: string[]): boolean {
  if (/^desconocid[oa]\b/.test(plana(cita))) return true;
  return new Set(elementos.filter((v) => contiene(cita, v)).map(plana)).size >= 2;
}

/**
 * Las palabras que una respuesta correcta puede citar además de los nombres de
 * los elementos: predicados del reglamento (id, etiqueta y sinónimos), clases y
 * tipos de las notaciones presentes y las etiquetas tal como están dibujadas
 * («Escribe en [SQL]», «Sí»). Sin esto, decir «Facturar «reacciona a»
 * PagoRealizado» contaba como inventar un elemento.
 */
export function vocabularioEvaluacion(k: Pick<Conocimiento, "elementos" | "aristas" | "notaciones">): string[] {
  const out = new Set<string>(k.elementos.map((e) => e.nombre));
  for (const a of k.aristas) if (a.etiqueta) out.add(a.etiqueta);
  for (const n of k.notaciones) {
    const t = tboxDe(n);
    for (const p of t.predicados) [p.id, p.id.replace(/_/g, " "), p.etiqueta, ...p.sinonimos].forEach((x) => out.add(x));
    for (const c of t.clases) out.add(c.etiqueta);
    for (const tipo of notationTypes(n)) out.add(tipo);
  }
  return [...out];
}

/**
 * Acierto: nombra TODOS los esperados (o, si no se espera nada, dice que el
 * modelo no lo sabe) y no inventa elementos. `vocabulario` son los nombres que
 * existen en el modelo (y los términos del reglamento, que se pueden citar);
 * `elementos`, sólo los nombres de las cajas. Con el vocabulario extendido de
 * `vocabularioEvaluacion` es OBLIGATORIO pasarlo: el valor por defecto
 * (todo el vocabulario) dejaría pasar «Pagar emite Facturita» como cita legítima.
 */
export function puntuar(respuesta: string, esperado: string[], vocabulario: string[], elementos = vocabulario): PuntajeRespuesta {
  const conocidos = new Set(vocabulario.map(plana));
  const inexistentes = nombresCitados(respuesta).filter((n) => !conocidos.has(plana(n)) && !esCitaLegitima(n, elementos));
  const faltan = esperado.filter((e) => !contiene(respuesta, e));
  const contesta = esperado.length ? faltan.length === 0 : DESCONOCE.test(plana(respuesta));
  return { acierto: contesta && inexistentes.length === 0, faltan, inexistentes };
}

export interface Resumen {
  preguntas: number;
  exactitud: number;
  /** Respuestas con al menos un elemento inexistente. */
  conInexistentes: number;
}

export function resumir(puntajes: PuntajeRespuesta[]): Resumen {
  const n = puntajes.length;
  return {
    preguntas: n,
    exactitud: n ? puntajes.filter((p) => p.acierto).length / n : 0,
    conInexistentes: puntajes.filter((p) => p.inexistentes.length > 0).length,
  };
}

/**
 * Prueba de McNemar EXACTA (binomial bilateral) entre dos modos que
 * contestaron las mismas preguntas (#765). Sólo informan los pares
 * discordantes: una pregunta que ambos aciertan o ambos fallan no dice nada de
 * cuál es mejor. Con 30 preguntas, «4 a 0» da p = 0,125: la mejora de la
 * corrida de #697 no se distinguía del azar, y por eso hacía falta medirla así.
 */
export function mcnemarExacto(a: boolean[], b: boolean[]): { soloA: number; soloB: number; p: number } {
  if (a.length !== b.length) throw new Error(`McNemar necesita pares: ${a.length} ≠ ${b.length}.`);
  let soloA = 0;
  let soloB = 0;
  a.forEach((x, i) => {
    if (x && !b[i]) soloA++;
    else if (!x && b[i]) soloB++;
  });
  const n = soloA + soloB;
  if (n === 0) return { soloA, soloB, p: 1 };
  const k = Math.min(soloA, soloB);
  // Σ C(n,i)·0,5^n para i ≤ k, acumulando el coeficiente para no desbordar.
  let coef = 1;
  let cola = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) coef = (coef * (n - i + 1)) / i;
    cola += coef;
  }
  return { soloA, soloB, p: Math.min(1, 2 * cola * 0.5 ** n) };
}

export interface ResumenCorridas {
  corridas: number;
  exactitudMedia: number;
  exactitudMin: number;
  exactitudMax: number;
  /** Respuestas con algún elemento inexistente, promedio por corrida. */
  inexistentesMedia: number;
}

/** Varias corridas del mismo modo: el rango muestra cuánto varía el modelo consigo mismo. */
export function resumirCorridas(corridas: PuntajeRespuesta[][]): ResumenCorridas {
  if (!corridas.length) return { corridas: 0, exactitudMedia: 0, exactitudMin: 0, exactitudMax: 0, inexistentesMedia: 0 };
  const rs = corridas.map(resumir);
  const ex = rs.map((r) => r.exactitud);
  return {
    corridas: rs.length,
    exactitudMedia: ex.reduce((s, x) => s + x, 0) / rs.length,
    exactitudMin: Math.min(...ex),
    exactitudMax: Math.max(...ex),
    inexistentesMedia: rs.reduce((s, r) => s + r.conInexistentes, 0) / rs.length,
  };
}

/** Media, mediana y p95 (rango más cercano) de tokens o latencias. */
export function describirNumeros(xs: number[]): { n: number; media: number; p50: number; p95: number } {
  if (!xs.length) return { n: 0, media: 0, p50: 0, p95: 0 };
  const o = [...xs].sort((a, b) => a - b);
  const rango = (q: number) => o[Math.max(0, Math.ceil(q * o.length) - 1)];
  return { n: o.length, media: o.reduce((s, x) => s + x, 0) / o.length, p50: rango(0.5), p95: rango(0.95) };
}
