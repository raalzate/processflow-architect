/**
 * @fileOverview Puntuación del banco de evaluación del agente (spec 027 · T28, SC-002) — PURO.
 *
 * SC-002 pide medir dos cosas con y sin consulta al grafo: cuántas preguntas se
 * contestan bien (EXACTITUD) y cuántas respuestas nombran elementos que no
 * existen en el modelo (ALUCINACIÓN). Acá vive el criterio, para que sea el
 * mismo en cada corrida y tenga prueba; el script (`scripts/eval-ontology-agent.ts`)
 * sólo junta preguntas, llama al modelo y suma.
 */

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
 * Acierto: nombra TODOS los esperados (o, si no se espera nada, dice que el
 * modelo no lo sabe) y no inventa elementos. `vocabulario` son los nombres que
 * existen en el modelo (y los términos del reglamento, que se pueden citar).
 */
export function puntuar(respuesta: string, esperado: string[], vocabulario: string[]): PuntajeRespuesta {
  const conocidos = new Set(vocabulario.map(plana));
  const inexistentes = nombresCitados(respuesta).filter((n) => !conocidos.has(plana(n)));
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
