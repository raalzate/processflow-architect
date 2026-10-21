/**
 * @fileOverview Rotulado de relaciones (PURO).
 *
 * La convención del repo —y la de C4— es escribir la relación como
 * `qué hace [con qué]`: "consume [HTTPS/JSON]", "lee y escribe [JDBC]". Sobre la
 * línea, todo junto en un renglón se lee como una mancha; separado en dos —la
 * acción arriba, la tecnología abajo y más tenue— se lee de un vistazo.
 *
 * Vive en `lib/` porque es la única parte de la etiqueta que se puede probar sin
 * lienzo: el corchete puede faltar, venir sin cerrar o ser todo el texto.
 */

/** Etiqueta de una relación partida en acción y nota técnica. */
export interface EdgeLabelParts {
  /** Lo que hace la relación. Nunca incluye el corchete. */
  texto: string;
  /** Contenido del corchete final, sin corchetes. Ausente si no hay. */
  nota?: string;
}

/**
 * Parte `acción [nota]` en sus dos mitades. Sólo reconoce el corchete que CIERRA
 * la etiqueta: un `[...]` en el medio es parte de la frase y se deja donde está.
 */
export function splitEdgeLabel(label: string | undefined | null): EdgeLabelParts {
  const limpio = (label ?? "").trim();
  if (!limpio.endsWith("]")) return { texto: limpio };

  const abre = limpio.lastIndexOf("[");
  if (abre < 0) return { texto: limpio };

  const nota = limpio.slice(abre + 1, -1).trim();
  const texto = limpio.slice(0, abre).trim();
  // `[JDBC]` sin acción es una etiqueta legítima: se muestra como nota sola.
  if (!nota) return { texto };
  return texto ? { texto, nota } : { texto: "", nota };
}

/**
 * Ancho mínimo del halo. Un enlace sin etiqueta no pinta texto, pero el halo es
 * el único blanco del doble clic que abre su ficha (el de la línea añade un
 * quiebre): sin un mínimo, el enlace se selecciona y no se puede editar (#619).
 */
export const EDGE_LABEL_MIN_HIT = 24;

/**
 * Caja del halo de la etiqueta: se ajusta al renglón más largo y, con nota, crece
 * a dos renglones. Nunca baja de `EDGE_LABEL_MIN_HIT` de ancho.
 */
export function edgeLabelBox(
  texto: string,
  nota: string,
  charPx: number
): { width: number; height: number } {
  const width = Math.max(
    Math.max(texto.length, nota.length) * charPx + 10,
    EDGE_LABEL_MIN_HIT
  );
  return { width, height: texto && nota ? 30 : 20 };
}
