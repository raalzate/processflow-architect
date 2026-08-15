// =============================================================================
// Geometría PURA del minimapa (sin React) — así se puede probar la traducción
// entre coordenadas del lienzo, del minimapa y del scroll, que es donde es fácil
// equivocarse (dividir por el zoom, escalar, etc.).
// =============================================================================

/** Escala lienzo→minimapa: el factor que hace caber CANVAS_SIZE en la caja mini. */
export function minimapScale(canvasSize: number, miniW: number, miniH: number): number {
  return Math.min(miniW / canvasSize, miniH / canvasSize);
}

/**
 * Rectángulo visible (viewport) en coordenadas del minimapa. El viewport llega en
 * píxeles de scroll; se divide por el zoom para pasar a coordenadas del lienzo y
 * luego se multiplica por la escala del mini.
 */
export function viewportRect(
  viewport: { left: number; top: number; w: number; h: number },
  zoom: number,
  scale: number
): { x: number; y: number; w: number; h: number } {
  return {
    x: (viewport.left / zoom) * scale,
    y: (viewport.top / zoom) * scale,
    w: (viewport.w / zoom) * scale,
    h: (viewport.h / zoom) * scale,
  };
}

/**
 * Lado lógico del lienzo: el mundo por el que se puede desplazar y soltar.
 *
 * Era una constante (2000) y eso recortaba los diagramas grandes: lo que caía
 * más allá quedaba dibujado pero fuera del área scrolleable, así que no había
 * forma de llegar hasta el final. Ahora el mundo CRECE con el contenido —el
 * mínimo se conserva para que un lienzo vacío no quede diminuto— y se deja un
 * margen para poder arrastrar elementos más allá del último.
 */
export function canvasWorldSize(
  bounds: { maxX: number; maxY: number } | null,
  minSize: number,
  pad = 400
): { width: number; height: number } {
  if (!bounds) return { width: minSize, height: minSize };
  return {
    width: Math.max(minSize, Math.ceil(bounds.maxX + pad)),
    height: Math.max(minSize, Math.ceil(bounds.maxY + pad)),
  };
}

/** Punto del minimapa (px) → coordenadas del lienzo (deshace la escala). */
export function miniPointToCanvas(
  mx: number,
  my: number,
  scale: number
): { x: number; y: number } {
  return { x: mx / scale, y: my / scale };
}
