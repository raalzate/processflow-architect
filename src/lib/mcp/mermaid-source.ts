/**
 * @fileOverview Qué bloques Mermaid trae un archivo (PURO, #540).
 *
 * El usuario trae Mermaid de dos formas: un `.mmd`/`.mermaid` con un solo
 * diagrama, o un Markdown (README, ADR, wiki) con uno o varios bloques
 * ```mermaid. Acá se separan, se les lee la gramática de la primera línea y se
 * devuelven en orden, para que el import elija uno por índice. No se evalúa ni
 * se renderiza nada: es texto acotado, y lo que diga una etiqueta es dato.
 */

export type MermaidGrammar = "flowchart" | "sequenceDiagram" | "otro";

export interface BloqueMermaid {
  /** Posición entre los bloques del archivo (desde 0). */
  indice: number;
  grammar: MermaidGrammar;
  /** La primera palabra del bloque, tal cual (para decir qué no se soporta). */
  cabecera: string;
  codigo: string;
}

const FENCE = /```\s*mermaid[^\n]*\n([\s\S]*?)```/gi;

/** La primera línea con contenido, saltando frontmatter `---` y comentarios. */
function cabeceraDe(codigo: string): string {
  const lineas = codigo.split("\n").map((l) => l.trim());
  let i = 0;
  if (lineas[0] === "---") {
    i = lineas.indexOf("---", 1) + 1;
    if (i === 0) i = lineas.length;
  }
  for (; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l || l.startsWith("%%")) continue;
    return l.split(/\s+/)[0];
  }
  return "";
}

function gramaticaDe(cabecera: string): MermaidGrammar {
  if (/^(flowchart|graph)$/i.test(cabecera)) return "flowchart";
  if (/^sequenceDiagram$/i.test(cabecera)) return "sequenceDiagram";
  return "otro";
}

/**
 * Bloques Mermaid de un texto. Con fences, uno por fence; sin fences, el texto
 * entero es un bloque si su cabecera es una gramática Mermaid (un `.mmd`).
 */
export function bloquesMermaid(texto: string): BloqueMermaid[] {
  const bloques: BloqueMermaid[] = [];
  for (const m of texto.matchAll(FENCE)) {
    const codigo = m[1].trim();
    if (!codigo) continue;
    const cabecera = cabeceraDe(codigo);
    bloques.push({ indice: bloques.length, grammar: gramaticaDe(cabecera), cabecera, codigo });
  }
  if (bloques.length) return bloques;

  const cabecera = cabeceraDe(texto);
  if (!cabecera) return [];
  // Un .mmd sin fence: vale cualquier cabecera Mermaid, incluso una que no se
  // soporte (así el error dice «no soporto pie», no «no hay bloques»).
  if (!/^[A-Za-z]+(-v\d+)?$/.test(cabecera)) return [];
  return [{ indice: 0, grammar: gramaticaDe(cabecera), cabecera, codigo: texto.trim() }];
}

export const GRAMATICAS_SOPORTADAS = "flowchart / graph y sequenceDiagram";
